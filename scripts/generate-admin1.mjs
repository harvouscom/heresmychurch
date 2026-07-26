#!/usr/bin/env node
/**
 * Generates admin-1 (province / region) boundaries and a region table for
 * non-US countries, from Natural Earth — public domain, worldwide, free.
 *
 * us-atlas covers only the US, so every other country needs a boundary source.
 * Natural Earth ships one file for the whole world at 10m; this pulls it once
 * and writes out just the countries we serve, so the app ships kilobytes rather
 * than the 40 MB source.
 *
 * Natural Earth's admin-1 granularity differs by country, so each needs a rule:
 *   Canada  — 13 features, already one per province with clean CA-XX codes.
 *   UK      — 232 *council* features, far too granular to browse. Each carries a
 *             `region` property holding its ITL1/NUTS1 region ("North West",
 *             "Scotland"), so councils are grouped into those ~12 regions.
 *   Ireland — 34 features where codes repeat (IE-D is both Dublin and Dún
 *             Laoghaire–Rathdown; IE-CO is Cork county and Cork city), so
 *             features are grouped by ISO code.
 *
 * Grouping concatenates polygons into one MultiPolygon per region. That is not a
 * true geometric union — shared internal edges remain — which is fine for fills
 * and reads like county lines inside a state.
 *
 * Usage: node scripts/generate-admin1.mjs
 * Outputs: public/regions-{cc}.geojson  +  src/app/config/regions-generated.ts
 */

import { writeFile, mkdir } from "fs/promises";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
// Two resolutions. 10m covers every country but carries very dense coastlines;
// 50m is far lighter but only includes nine large countries. Prefer 50m where a
// country appears in it — Canada's Arctic islands alone are 1.4 MB at 10m and
// 141 KB at 50m, for shapes only ever drawn at region zoom.
const SRC = {
  "10m": "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_admin_1_states_provinces.geojson",
  "50m": "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_admin_1_states_provinces.geojson",
};

/** England browses by ITL1 region; the other three nations stay whole. */
const gbKey = (p) => (p.geonunit === "England" ? p.region : p.geonunit);

/**
 * `admin` is Natural Earth's country name. `groupBy` returns the key features
 * are merged on; `code`/`name` derive the region's identity from one member.
 */
const COUNTRIES = {
  CA: {
    admin: "Canada",
    source: "50m",
    groupBy: (p) => p.iso_3166_2,
    code: (p) => p.iso_3166_2, // CA-ON
    abbrev: (p) => p.iso_3166_2.split("-")[1], // ON
    name: (p) => p.name,
  },
  GB: {
    admin: "United Kingdom",
    source: "10m", // not present at 50m
    // Neither ISO nor Natural Earth's `region` works alone here. ISO 3166-2:GB
    // lists ~200 councils (far too granular), while the four nations leave
    // England as one enormous browse region. And grouping purely on `region`
    // mixes English ITL1 with Scottish/Welsh NUTS2, producing names that read
    // as near-duplicates — "North East" (England) beside "Northeastern"
    // (Scotland).
    //
    // So: split England into its ITL1 regions, keep Scotland, Wales and
    // Northern Ireland whole. Twelve regions, all names people recognise.
    groupBy: gbKey,
    code: (p) => `GB-${slug(gbKey(p))}`,
    abbrev: (p) => slug(gbKey(p)),
    name: gbKey,
  },
  IE: {
    admin: "Ireland",
    source: "10m", // not present at 50m
    groupBy: (p) => p.iso_3166_2,
    code: (p) => p.iso_3166_2,
    abbrev: (p) => p.iso_3166_2.split("-")[1],
    name: (p) => p.name,
  },
};

/** "North West" -> "NORTHWEST"; stable, uppercase, URL-safe. */
function slug(s) {
  return (s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** Bounding box [south, west, north, east] — the order the app's registry uses. */
function boundsOf(geometry) {
  let s = 90, w = 180, n = -90, e = -180;
  const visit = (coords) => {
    if (typeof coords[0] === "number") {
      const [lng, lat] = coords;
      if (lat < s) s = lat;
      if (lat > n) n = lat;
      if (lng < w) w = lng;
      if (lng > e) e = lng;
      return;
    }
    for (const c of coords) visit(c);
  };
  visit(geometry.coordinates);
  return [round(s), round(w), round(n), round(e)];
}
const round = (v) => Math.round(v * 100) / 100;

// Natural Earth carries ~15 significant digits, which is meaningless for a
// region outline and dominates file size — Canada's coastline alone was 1.7 MB
// at full precision. 4 decimal places is ~11 m, far finer than these shapes are
// ever rendered.
const COORD_DP = 4;
const snap = (v) => Math.round(v * 10 ** COORD_DP) / 10 ** COORD_DP;

function snapCoords(coords) {
  return typeof coords[0] === "number"
    ? [snap(coords[0]), snap(coords[1])]
    : coords.map(snapCoords);
}

/** Concatenate polygons into a single MultiPolygon. */
function mergeGeometries(features) {
  const polys = [];
  for (const f of features) {
    const g = f.geometry;
    if (!g) continue;
    if (g.type === "Polygon") polys.push(snapCoords(g.coordinates));
    else if (g.type === "MultiPolygon") polys.push(...snapCoords(g.coordinates));
  }
  return { type: "MultiPolygon", coordinates: polys };
}

async function main() {
  const cache = new Map();
  const load = async (res) => {
    if (cache.has(res)) return cache.get(res);
    console.log(`Fetching Natural Earth admin-1 ${res}…`);
    const r = await fetch(SRC[res]);
    if (!r.ok) throw new Error(`Natural Earth ${res} fetch failed: ${r.status}`);
    const j = await r.json();
    console.log(`  ${j.features.length} features`);
    cache.set(res, j);
    return j;
  };

  const registry = {};

  for (const [cc, cfg] of Object.entries(COUNTRIES)) {
    const world = await load(cfg.source);
    const mine = world.features.filter((f) => f.properties.admin === cfg.admin);
    if (!mine.length) {
      console.warn(`${cc}: no features for admin "${cfg.admin}" — skipped`);
      continue;
    }

    const groups = new Map();
    let skipped = 0;
    for (const f of mine) {
      const key = cfg.groupBy(f.properties);
      if (!key) { skipped++; continue; }
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(f);
    }

    const features = [];
    const regions = [];
    for (const [, members] of [...groups].sort((a, b) => String(a[0]).localeCompare(String(b[0])))) {
      const p = members[0].properties;
      const geometry = mergeGeometries(members);
      const abbrev = cfg.abbrev(p);
      const region = { code: cfg.code(p), abbrev, name: cfg.name(p), bounds: boundsOf(geometry) };
      regions.push(region);
      features.push({
        type: "Feature",
        id: abbrev,
        properties: { code: region.code, abbrev, name: region.name },
        geometry,
      });
    }

    const outGeo = join(__dirname, "..", "public", `regions-${cc.toLowerCase()}.geojson`);
    await mkdir(dirname(outGeo), { recursive: true });
    const body = JSON.stringify({ type: "FeatureCollection", features });
    await writeFile(outGeo, body);
    registry[cc] = regions;

    const kb = (Buffer.byteLength(body) / 1024).toFixed(0);
    console.log(
      `${cc}: ${mine.length} source features -> ${regions.length} regions (${kb} KB)` +
        (skipped ? `  [${skipped} without a group key]` : ""),
    );
    console.log(`    ${regions.map((r) => r.abbrev).join(", ")}\n`);
  }

  const ts = `// GENERATED by scripts/generate-admin1.mjs — do not edit by hand.
// Admin-1 regions from Natural Earth (public domain). Boundaries for these are
// served from public/regions-{cc}.geojson.
import type { RegionConfig } from "./countries";

export const GENERATED_REGIONS: Record<string, Record<string, RegionConfig>> = ${JSON.stringify(
    Object.fromEntries(
      Object.entries(registry).map(([cc, list]) => [
        cc,
        Object.fromEntries(list.map((r) => [r.abbrev, r])),
      ]),
    ),
    null,
    2,
  )};
`;
  const outTs = join(__dirname, "..", "src", "app", "config", "regions-generated.ts");
  await writeFile(outTs, ts);
  console.log(`Wrote ${outTs}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

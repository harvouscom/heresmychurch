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
 *             Overpass uses nation ISO codes (GB-ENG / GB-SCT / …); English ITL1
 *             regions share GB-ENG and are clipped by bounds in parse().
 *   Ireland — 34 features where codes repeat; grouped by ISO. Abbrevs are the
 *             full ISO without the hyphen (IECO) so they never collide with US
 *             state codes (CO, KY, …).
 *   Europe  — same hyphenless-ISO abbrev pattern as Ireland (FRIDF, DENW, …)
 *             so short tails never collide with US states or other countries.
 *
 * Grouping concatenates polygons into a single MultiPolygon per region. That is not a
 * true geometric union — shared internal edges remain — which is fine for fills
 * and reads like county lines inside a state.
 *
 * Usage: node scripts/generate-admin1.mjs
 * Outputs:
 *   public/regions-{cc}.geojson
 *   src/app/config/regions-generated.ts
 *   supabase/functions/make-server-283d8046/regions-intl.ts
 *   scripts/intl-region-bounds.generated.json
 *   netlify/edge-functions/intl-country-meta.generated.ts
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

/** Map Natural Earth GB group key → real Overpass ISO 3166-2 nation area. */
function gbOverpassIso(p) {
  const unit = p.geonunit;
  if (unit === "Scotland") return "GB-SCT";
  if (unit === "Wales") return "GB-WLS";
  if (unit === "Northern Ireland") return "GB-NIR";
  // English ITL1 regions share England's area; parse() clips by bounds.
  return "GB-ENG";
}

/** Hyphenless ISO abbrev: FR-IDF → FRIDF (collision-safe with US states). */
const isoAbbrev = (p) => {
  const raw = (p.iso_3166_2 || "").replace(/-/g, "").toUpperCase();
  // Drop Natural Earth quirks (e.g. NOX01~) — must be URL/KV-safe.
  if (!/^[A-Z][A-Z0-9]{1,31}$/.test(raw)) return "";
  return raw;
};

/**
 * Natural Earth still carries retired ISO codes. Overpass areas follow current
 * ISO 3166-2 (Paris FR-75→FR-75C, Lyon métropole FR-69→FR-69M, …).
 */
const OVERPASS_ISO_REMAP = {
  "FR-75": "FR-75C",
  "FR-69": "FR-69M",
};

function overpassIsoFromProps(p) {
  const iso = p.iso_3166_2;
  if (!iso) return null;
  return OVERPASS_ISO_REMAP[iso] || iso;
}

/** Standard EU/ISO admin-1: group by real ISO 3166-2, hyphenless abbrev. */
function isoCountry(admin, source = "10m", opts = {}) {
  return {
    admin,
    source,
    overpassIso: overpassIsoFromProps,
    groupBy: (p) => p.iso_3166_2,
    code: (p) => p.iso_3166_2,
    abbrev: isoAbbrev,
    name: (p) => p.name,
    // ISO 3166-2 codes to drop (e.g. overseas territories far from the mainland map).
    excludeIso: opts.excludeIso || [],
  };
}

/**
 * `admin` is Natural Earth's country name. `groupBy` returns the key features
 * are merged on; `code`/`name` derive the region's identity from one member.
 *
 * Abbrev rules:
 * - CA keeps short ISO tails (ON, QC) — no US collisions.
 * - GB uses recognisable slugs (SCOTLAND, GREATERLONDON).
 * - IE + all new Europe use hyphenless full ISO (IECO, FRIDF, NLNH) so short
 *   tails never collide with US states (UT, FL, ST, …) or other countries (NB).
 */
const COUNTRIES = {
  CA: {
    admin: "Canada",
    source: "50m",
    overpassIso: (p) => p.iso_3166_2,
    groupBy: (p) => p.iso_3166_2,
    code: (p) => p.iso_3166_2, // CA-ON
    abbrev: (p) => p.iso_3166_2.split("-")[1], // ON
    name: (p) => p.name,
  },
  GB: {
    admin: "United Kingdom",
    source: "10m",
    // Split England into ITL1 regions; keep Scotland, Wales, NI whole.
    // Overpass areas are the four nations; English ITL1 share GB-ENG + bbox clip.
    overpassIso: gbOverpassIso,
    groupBy: gbKey,
    code: (p) => `GB-${slug(gbKey(p))}`,
    abbrev: (p) => slug(gbKey(p)),
    name: gbKey,
  },
  IE: {
    admin: "Ireland",
    source: "10m",
    overpassIso: (p) => p.iso_3166_2,
    groupBy: (p) => p.iso_3166_2,
    code: (p) => p.iso_3166_2,
    abbrev: isoAbbrev,
    name: (p) => p.name,
  },
  // ── First-wave Europe (admin-1, GB/IE depth) ─────────────────────────────
  // France: keep metropolitan + Corsica départements; drop DROM (Guyane, Antilles, …)
  // so the France map isn't pulled to South America / Indian Ocean.
  FR: isoCountry("France", "50m", {
    excludeIso: ["FR-GF", "FR-GP", "FR-MQ", "FR-RE", "FR-YT"],
  }),
  DE: isoCountry("Germany", "50m"),
  // Netherlands Caribbean municipalities sit in the Caribbean Sea — exclude.
  NL: isoCountry("Netherlands", "10m", {
    excludeIso: ["NL-BQ1", "NL-BQ2", "NL-BQ3"],
  }),
  BE: isoCountry("Belgium", "10m"),
  ES: isoCountry("Spain", "50m"),
  IT: isoCountry("Italy", "50m"),
  PT: isoCountry("Portugal", "10m"),
  AT: isoCountry("Austria", "10m"),
  CH: isoCountry("Switzerland", "10m"),
  SE: isoCountry("Sweden", "10m"),
  NO: isoCountry("Norway", "10m"),
  DK: isoCountry("Denmark", "10m"),
  FI: isoCountry("Finland", "10m"),
  PL: isoCountry("Poland", "10m"),
  // Australia — hyphenless ISO (AUWA) so AU-WA never collides with US Washington.
  AU: isoCountry("Australia", "50m"),
};

/** Display names for countries (SEO / OG). */
const COUNTRY_NAMES = {
  CA: "Canada",
  GB: "United Kingdom",
  IE: "Ireland",
  FR: "France",
  DE: "Germany",
  NL: "Netherlands",
  BE: "Belgium",
  ES: "Spain",
  IT: "Italy",
  PT: "Portugal",
  AT: "Austria",
  CH: "Switzerland",
  SE: "Sweden",
  NO: "Norway",
  DK: "Denmark",
  FI: "Finland",
  PL: "Poland",
  AU: "Australia",
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
  const ingestable = [];
  const boundsByAbbrev = {};
  const countryMeta = {};

  for (const [cc, cfg] of Object.entries(COUNTRIES)) {
    let world = await load(cfg.source);
    let mine = world.features.filter((f) => f.properties.admin === cfg.admin);
    // Fall back to 10m when a "50m" country isn't in that extract.
    if (!mine.length && cfg.source === "50m") {
      console.warn(`${cc}: not in 50m — falling back to 10m`);
      world = await load("10m");
      mine = world.features.filter((f) => f.properties.admin === cfg.admin);
    }
    if (!mine.length) {
      console.warn(`${cc}: no features for admin "${cfg.admin}" — skipped`);
      continue;
    }

    const excludeIso = new Set(cfg.excludeIso || []);
    const groups = new Map();
    let skipped = 0;
    let excluded = 0;
    for (const f of mine) {
      const iso = f.properties.iso_3166_2;
      if (iso && excludeIso.has(iso)) { excluded++; continue; }
      const key = cfg.groupBy(f.properties);
      if (!key) { skipped++; continue; }
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(f);
    }

    const features = [];
    const regions = [];
    const metaRegions = {};
    for (const [, members] of [...groups].sort((a, b) => String(a[0]).localeCompare(String(b[0])))) {
      const p = members[0].properties;
      const geometry = mergeGeometries(members);
      const abbrev = cfg.abbrev(p);
      if (!abbrev) { skipped++; continue; }
      const bounds = boundsOf(geometry);
      const region = { code: cfg.code(p), abbrev, name: cfg.name(p), bounds };
      regions.push(region);
      boundsByAbbrev[abbrev] = bounds;
      metaRegions[abbrev] = region.name;
      const iso = cfg.overpassIso ? cfg.overpassIso(p) : null;
      if (iso) {
        ingestable.push({
          cc,
          abbrev,
          name: region.name,
          iso,
          bounds,
          // Centroid of the bbox — only used to centre the map before data loads.
          la: round((bounds[0] + bounds[2]) / 2),
          lo: round((bounds[1] + bounds[3]) / 2),
        });
      }
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
    countryMeta[cc] = { name: COUNTRY_NAMES[cc] || cc, regions: metaRegions };

    const kb = (Buffer.byteLength(body) / 1024).toFixed(0);
    console.log(
      `${cc}: ${mine.length} source features -> ${regions.length} regions (${kb} KB)` +
        (skipped ? `  [${skipped} without a group key]` : "") +
        (excluded ? `  [${excluded} overseas/excluded]` : ""),
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

  // Server-side table: only regions whose code Overpass can resolve as an area.
  // GB English ITL1 regions share iso GB-ENG and are clipped by bounds in parse().
  const serverTs = `// GENERATED by scripts/generate-admin1.mjs — do not edit by hand.
// Non-US regions the ingest can query, keyed by the abbrev used in KV keys and
// URLs. \`iso\` is a real ISO 3166-2 code that Overpass resolves as an area.
// GB English ITL1 regions share iso GB-ENG and are clipped by bounds in parse().
export interface IntlRegion{cc:string;a:string;n:string;iso:string;la:number;lo:number;b:[number,number,number,number];}
export const INTL_REGIONS:Record<string,IntlRegion>=${JSON.stringify(
    Object.fromEntries(
      ingestable.map((r) => [
        r.abbrev,
        { cc: r.cc, a: r.abbrev, n: r.name, iso: r.iso, la: r.la, lo: r.lo, b: r.bounds },
      ]),
    ),
    null,
    2,
  )};
`;
  const outServer = join(__dirname, "..", "supabase", "functions", "make-server-283d8046", "regions-intl.ts");
  await writeFile(outServer, serverTs);
  console.log(`Wrote ${outServer} (${ingestable.length} ingestable regions)`);

  const boundsPath = join(__dirname, "intl-region-bounds.generated.json");
  await writeFile(boundsPath, JSON.stringify(boundsByAbbrev, null, 2) + "\n");
  console.log(`Wrote ${boundsPath}`);

  const metaTs = `// GENERATED by scripts/generate-admin1.mjs — do not edit by hand.
export const INTL_COUNTRY_META: Record<string, { name: string; regions: Record<string, string> }> = ${JSON.stringify(
    countryMeta,
    null,
    2,
  )};
`;
  const outMeta = join(__dirname, "..", "netlify", "edge-functions", "intl-country-meta.generated.ts");
  await writeFile(outMeta, metaTs);
  console.log(`Wrote ${outMeta}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

#!/usr/bin/env node
/**
 * Generates Australia Local Government Area (admin-2) boundaries.
 *
 * Boundaries: ABS ASGS 2021 LGA_GEN (generalised) via ArcGIS REST.
 *   https://geo.abs.gov.au/arcgis/rest/services/ASGS2021/LGA/MapServer/1
 *
 * Usage: node scripts/generate-admin2-au.mjs
 * Outputs:
 *   public/admin2-au.geojson
 */

import { writeFile, mkdir, mkdtemp, rm, readFile } from "fs/promises";
import { tmpdir } from "os";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);
const __dirname = dirname(fileURLToPath(import.meta.url));

/** ABS STE_CODE → hyphenless ISO abbrev used in app URLs (AUNSW, …). */
const STE_TO_ABBREV = {
  "1": "AUNSW",
  "2": "AUVIC",
  "3": "AUQLD",
  "4": "AUSA",
  "5": "AUWA",
  "6": "AUTAS",
  "7": "AUNT",
  "8": "AUACT",
};

const LGA_LAYER =
  "https://geo.abs.gov.au/arcgis/rest/services/ASGS2021/LGA/MapServer/1/query";
const PAGE = 100;
const COORD_DP = 3; // ~100 m — enough at state zoom for LGA outlines
const snap = (v) => Math.round(v * 10 ** COORD_DP) / 10 ** COORD_DP;

function snapCoords(coords) {
  return typeof coords[0] === "number"
    ? [snap(coords[0]), snap(coords[1])]
    : coords.map(snapCoords);
}

async function fetchStateLgas(ste) {
  const features = [];
  let offset = 0;
  for (;;) {
    const url =
      `${LGA_LAYER}?where=state_code_2021%3D%27${ste}%27` +
      `&outFields=lga_code_2021%2Clga_name_2021%2Cstate_code_2021%2Cstate_name_2021` +
      `&outSR=4326&f=geojson` +
      `&resultRecordCount=${PAGE}&resultOffset=${offset}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`LGA fetch failed for STE ${ste}: ${res.status}`);
    const json = await res.json();
    const batch = json.features ?? [];
    if (!batch.length) break;
    features.push(...batch);
    if (!json.exceededTransferLimit && batch.length < PAGE) break;
    offset += batch.length;
  }
  return features;
}

async function fetchAllLgas() {
  const features = [];
  for (const ste of Object.keys(STE_TO_ABBREV)) {
    const abbrev = STE_TO_ABBREV[ste];
    console.log(`Fetching LGAs for STE ${ste} (${abbrev})…`);
    const batch = await fetchStateLgas(ste);
    console.log(`  ${batch.length} features`);
    features.push(...batch);
  }
  return features;
}

function normalizeFeatures(raw) {
  const out = [];
  for (const f of raw) {
    const p = f.properties ?? {};
    const id = String(p.lga_code_2021 ?? "").padStart(5, "0");
    const ste = String(p.state_code_2021 ?? "");
    const regionAbbrev = STE_TO_ABBREV[ste];
    if (!/^\d{5}$/.test(id) || !regionAbbrev || !f.geometry) {
      console.warn(`Skipping LGA with incomplete data:`, p);
      continue;
    }
    const name = String(p.lga_name_2021 ?? id).replace(/\s+/g, " ").trim();
    out.push({
      type: "Feature",
      id,
      properties: {
        id,
        name,
        regionAbbrev,
        ste,
      },
      geometry: {
        ...f.geometry,
        coordinates: snapCoords(f.geometry.coordinates),
      },
    });
  }
  out.sort((a, b) => String(a.id).localeCompare(String(b.id)));
  return out;
}

async function simplifyWithMapshaper(features) {
  const dir = await mkdtemp(join(tmpdir(), "admin2-au-"));
  const input = join(dir, "in.geojson");
  const output = join(dir, "out.geojson");
  await writeFile(input, JSON.stringify({ type: "FeatureCollection", features }));
  await execFileAsync(
    "npx",
    [
      "--yes", "mapshaper", input,
      // Keep click targets; ~1% lands near Canada CD file size (~200 KB).
      "-simplify", "dp", "1%", "keep-shapes",
      "-clean",
      "-o", output, "precision=0.002", "geojson-type=FeatureCollection",
    ],
    { maxBuffer: 128 * 1024 * 1024 },
  );
  const simplified = JSON.parse(await readFile(output, "utf8"));
  await rm(dir, { recursive: true, force: true });
  return simplified.features ?? simplified;
}

async function main() {
  const raw = await fetchAllLgas();
  console.log(`Fetched ${raw.length} raw LGA features`);
  let features = normalizeFeatures(raw);
  console.log(`Normalized ${features.length} features — simplifying…`);
  features = await simplifyWithMapshaper(features);
  features = features.map((f) => {
    const id = String(f.properties?.id ?? f.id ?? "").padStart(5, "0");
    return {
      type: "Feature",
      id,
      properties: {
        id,
        name: f.properties?.name ?? id,
        regionAbbrev: f.properties?.regionAbbrev ?? "",
        ste: f.properties?.ste ?? "",
      },
      geometry: f.geometry,
    };
  });

  const geoPath = join(__dirname, "..", "public", "admin2-au.geojson");
  await mkdir(dirname(geoPath), { recursive: true });
  const body = JSON.stringify({ type: "FeatureCollection", features });
  await writeFile(geoPath, body);
  const kb = (Buffer.byteLength(body) / 1024).toFixed(0);
  console.log(`Wrote ${geoPath} (${features.length} LGAs, ${kb} KB)`);

  const byRegion = {};
  for (const f of features) {
    const r = f.properties.regionAbbrev;
    byRegion[r] = (byRegion[r] || 0) + 1;
  }
  console.log("Per state:", byRegion);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

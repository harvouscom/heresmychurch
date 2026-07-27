#!/usr/bin/env node
/**
 * Generates Canada census-division (admin-2) boundaries + populations.
 *
 * Boundaries: Statistics Canada 2021 cartographic CD layer (ArcGIS REST).
 * Populations: StatCan table 98-10-0002 (Population and dwelling counts by CD).
 *
 * Usage: node scripts/generate-admin2-ca.mjs
 * Outputs:
 *   public/admin2-ca.geojson
 *   src/app/components/data/ca-cd-populations.ts
 */

import { writeFile, mkdir, mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { createWriteStream } from "fs";
import { execFile } from "child_process";
import { promisify } from "util";
const execFileAsync = promisify(execFile);
const __dirname = dirname(fileURLToPath(import.meta.url));

const CD_LAYER =
  "https://geo.statcan.gc.ca/geo_wa/rest/services/2021/Cartographic_boundary_files/MapServer/4/query";
const POP_ZIP = "https://www150.statcan.gc.ca/n1/tbl/csv/98100002-eng.zip";

/** PRUID (2-digit) → ISO 3166-2 Canada abbrev used in app URLs. */
const PRUID_TO_ABBREV = {
  "10": "NL",
  "11": "PE",
  "12": "NS",
  "13": "NB",
  "24": "QC",
  "35": "ON",
  "46": "MB",
  "47": "SK",
  "48": "AB",
  "59": "BC",
  "60": "YT",
  "61": "NT",
  "62": "NU",
};

const PAGE = 25;
/** Degrees — server-side generalize so QC coastal CDs don't 500 the bulk query. */
const MAX_OFFSET = 0.04;
const COORD_DP = 3; // ~100 m — enough at province zoom for CD outlines
const snap = (v) => Math.round(v * 10 ** COORD_DP) / 10 ** COORD_DP;

function snapCoords(coords) {
  return typeof coords[0] === "number"
    ? [snap(coords[0]), snap(coords[1])]
    : coords.map(snapCoords);
}

async function fetchProvinceCds(pruid) {
  const features = [];
  let offset = 0;
  for (;;) {
    const url =
      `${CD_LAYER}?where=PRUID%3D%27${pruid}%27` +
      `&outFields=CDUID%2CCDNAME%2CCDTYPE%2CPRUID` +
      `&outSR=4326&f=geojson` +
      `&maxAllowableOffset=${MAX_OFFSET}` +
      `&resultRecordCount=${PAGE}&resultOffset=${offset}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`CD layer fetch failed for PRUID ${pruid}: ${res.status}`);
    const json = await res.json();
    const batch = json.features ?? [];
    if (!batch.length) break;
    features.push(...batch);
    if (!json.exceededTransferLimit && batch.length < PAGE) break;
    offset += batch.length;
  }
  return features;
}

async function fetchAllCds() {
  const features = [];
  for (const pruid of Object.keys(PRUID_TO_ABBREV)) {
    console.log(`Fetching CDs for PRUID ${pruid} (${PRUID_TO_ABBREV[pruid]})…`);
    const batch = await fetchProvinceCds(pruid);
    console.log(`  ${batch.length} features`);
    features.push(...batch);
  }
  return features;
}

function normalizeFeatures(raw) {
  const out = [];
  for (const f of raw) {
    const p = f.properties ?? {};
    const id = String(p.CDUID ?? "").padStart(4, "0");
    const pruid = String(p.PRUID ?? "").padStart(2, "0");
    const regionAbbrev = PRUID_TO_ABBREV[pruid];
    if (!id || id.length !== 4 || !regionAbbrev || !f.geometry) {
      console.warn(`Skipping CD with incomplete data:`, p);
      continue;
    }
    const name = String(p.CDNAME ?? id).replace(/\s+/g, " ").trim();
    out.push({
      type: "Feature",
      id,
      properties: {
        id,
        name,
        regionAbbrev,
        pruid,
        cdtype: String(p.CDTYPE ?? ""),
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
  const dir = await mkdtemp(join(tmpdir(), "admin2-ca-"));
  const input = join(dir, "in.geojson");
  const output = join(dir, "out.geojson");
  await writeFile(input, JSON.stringify({ type: "FeatureCollection", features }));
  // Visvalingam + clean: plain %-simplify left degenerate MultiPolygon rings
  // that broke d3-geo bounds (whole-globe) and hollowed out click targets.
  await execFileAsync(
    "npx",
    [
      "--yes", "mapshaper", input,
      "-simplify", "dp", "12%", "keep-shapes",
      "-clean",
      "-o", output, "precision=0.001", "geojson-type=FeatureCollection",
    ],
    { maxBuffer: 64 * 1024 * 1024 },
  );
  const simplified = JSON.parse(await (await import("fs/promises")).readFile(output, "utf8"));
  await rm(dir, { recursive: true, force: true });
  return simplified.features;
}

async function fetchPopulations() {
  console.log("Fetching CD populations (98-10-0002)…");
  const res = await fetch(POP_ZIP);
  if (!res.ok) throw new Error(`Population zip fetch failed: ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());

  // Prefer unzipped via system unzip if available; else parse with JS.
  const { unzipSync } = await import("node:zlib").catch(() => ({}));
  void unzipSync;

  const dir = await mkdtemp(join(tmpdir(), "cd-pop-"));
  const zipPath = join(dir, "pop.zip");
  await writeFile(zipPath, buf);
  try {
    await execFileAsync("unzip", ["-o", zipPath, "-d", dir]);
  } catch {
    // Node 22+ may have experimental zip; fall back to python
    await execFileAsync("python3", [
      "-c",
      `import zipfile; zipfile.ZipFile(${JSON.stringify(zipPath)}).extractall(${JSON.stringify(dir)})`,
    ]);
  }
  const csvPath = join(dir, "98100002.csv");
  const text = await (await import("fs/promises")).readFile(csvPath, "utf8");
  await rm(dir, { recursive: true, force: true });

  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/);
  const header = parseCsvLine(lines[0]);
  const iDguid = header.indexOf("DGUID");
  const iPop = header.findIndex((h) => /Population, 2021/i.test(h));
  if (iDguid < 0 || iPop < 0) {
    throw new Error(`Unexpected population CSV columns: ${header.slice(0, 8).join(", ")}`);
  }

  const out = {};
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const row = parseCsvLine(lines[i]);
    const dguid = row[iDguid] ?? "";
    const m = /^2021A0003(\d{4})$/.exec(dguid);
    if (!m) continue;
    const pop = parseInt(String(row[iPop]).replace(/,/g, ""), 10);
    if (Number.isNaN(pop)) continue;
    out[m[1]] = pop;
  }
  return out;
}

/** Minimal CSV line parser (handles quoted fields). */
function parseCsvLine(line) {
  const out = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQ) {
      if (c === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') {
        inQ = false;
      } else {
        cur += c;
      }
    } else if (c === '"') {
      inQ = true;
    } else if (c === ",") {
      out.push(cur);
      cur = "";
    } else {
      cur += c;
    }
  }
  out.push(cur);
  return out;
}

async function main() {
  const raw = await fetchAllCds();
  console.log(`Fetched ${raw.length} raw CD features`);
  let features = normalizeFeatures(raw);
  console.log(`Normalized ${features.length} features — simplifying…`);
  features = await simplifyWithMapshaper(features);
  // Re-apply snapped ids/props in case mapshaper dropped feature.id
  features = features.map((f) => {
    const id = String(f.properties?.id ?? f.id ?? "").padStart(4, "0");
    return {
      type: "Feature",
      id,
      properties: {
        id,
        name: f.properties?.name ?? id,
        regionAbbrev: f.properties?.regionAbbrev ?? "",
        pruid: f.properties?.pruid ?? "",
        cdtype: f.properties?.cdtype ?? "",
      },
      geometry: f.geometry,
    };
  });

  const geoPath = join(__dirname, "..", "public", "admin2-ca.geojson");
  await mkdir(dirname(geoPath), { recursive: true });
  const body = JSON.stringify({ type: "FeatureCollection", features });
  await writeFile(geoPath, body);
  const kb = (Buffer.byteLength(body) / 1024).toFixed(0);
  console.log(`Wrote ${geoPath} (${features.length} CDs, ${kb} KB)`);

  const pops = await fetchPopulations();
  const missing = features.filter((f) => pops[f.id] == null).map((f) => f.id);
  if (missing.length) {
    console.warn(`No population for ${missing.length} CDs: ${missing.slice(0, 10).join(", ")}…`);
  }

  const outPath = join(__dirname, "..", "src", "app", "components", "data", "ca-cd-populations.ts");
  await mkdir(dirname(outPath), { recursive: true });
  const stream = createWriteStream(outPath, "utf8");
  stream.write(
    "// Canada census-division populations (StatCan 2021, table 98-10-0002).\n",
  );
  stream.write("// 4-digit CDUID → population. Generated by scripts/generate-admin2-ca.mjs\n\n");
  stream.write("export const CA_CD_POPULATIONS: Record<string, number> = {\n");
  const entries = Object.entries(pops).sort(([a], [b]) => a.localeCompare(b));
  for (const [id, pop] of entries) {
    stream.write(`  "${id}": ${pop},\n`);
  }
  stream.write("};\n");
  stream.end();
  await new Promise((r) => stream.on("finish", r));
  console.log(`Wrote ${outPath} with ${entries.length} census divisions.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

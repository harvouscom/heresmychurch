#!/usr/bin/env node
/**
 * Populate one region by walking it in cells, so no single request has to
 * finish inside Supabase's 150s function limit.
 *
 * The server exposes `populate-cell` (fetch exactly one bbox, stage the result,
 * report whether the response looked truncated) and `populate-finalize` (apply
 * the staged churches to the live state). This script owns the recursion: it
 * asks for a cell, and if the server says the response was near the Overpass
 * cap it splits that cell into quarters and asks again, until every cell comes
 * back complete. Then it finalises once.
 *
 * Nothing is visible to readers until finalise, so a failed or interrupted run
 * leaves the existing state untouched.
 *
 * Usage:
 *   node scripts/populate-region.mjs TX
 *   node scripts/populate-region.mjs TX --dry-run   # walk + count, never write
 *   node scripts/populate-region.mjs TX --resume    # keep staging from a failed run
 *   node scripts/populate-region.mjs --list-intl    # print intl abbrevs
 *   node scripts/populate-country.mjs FR            # see sibling script
 *
 * Env: SUPABASE_PROJECT_ID, SUPABASE_ANON_KEY (both default to the app's).
 */

import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const PROJECT_ID = process.env.SUPABASE_PROJECT_ID ?? "epufchwxofsyuictfufy";
const ANON_KEY =
  process.env.SUPABASE_ANON_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVwdWZjaHd4b2ZzeXVpY3RmdWZ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI5NzcxMTUsImV4cCI6MjA4ODU1MzExNX0.v11kHHpM1IsK6q81909CYkWgX5TdV8kJhCkNqSEs5QM";
const BASE = `https://${PROJECT_ID}.supabase.co/functions/v1/make-server-283d8046`;

/** US state bounding boxes [south, west, north, east]. */
const US_BOUNDS = {
  AL: [30.22, -88.47, 35.01, -84.89], AK: [51.21, -179.15, 71.39, -129.98],
  AZ: [31.33, -114.81, 37.0, -109.04], AR: [33.0, -94.62, 36.5, -89.64],
  CA: [32.53, -124.41, 42.01, -114.13], CO: [36.99, -109.06, 41.0, -102.04],
  CT: [40.95, -73.73, 42.05, -71.79], DE: [38.45, -75.79, 39.84, -75.05],
  FL: [24.4, -87.63, 31.0, -79.97], GA: [30.36, -85.61, 35.0, -80.84],
  HI: [18.91, -160.24, 22.24, -154.81], ID: [42.0, -117.24, 49.0, -111.04],
  IL: [36.97, -91.51, 42.51, -87.02], IN: [37.77, -88.1, 41.76, -84.78],
  IA: [40.38, -96.64, 43.5, -90.14], KS: [36.99, -102.05, 40.0, -94.59],
  KY: [36.5, -89.57, 39.15, -81.96], LA: [28.93, -94.04, 33.02, -88.82],
  ME: [42.98, -71.08, 47.46, -66.95], MD: [37.91, -79.49, 39.72, -75.05],
  MA: [41.24, -73.5, 42.89, -69.93], MI: [41.7, -90.42, 48.31, -82.12],
  MN: [43.5, -97.24, 49.38, -89.49], MS: [30.17, -91.66, 34.99, -88.1],
  MO: [35.99, -95.77, 40.61, -89.1], MT: [44.36, -116.05, 49.0, -104.04],
  NE: [39.99, -104.05, 43.0, -95.31], NV: [35.0, -120.01, 42.0, -114.04],
  NH: [42.7, -72.56, 45.31, -70.7], NJ: [38.93, -75.56, 41.36, -73.89],
  NM: [31.33, -109.05, 37.0, -103.0], NY: [40.5, -79.76, 45.02, -71.86],
  NC: [33.84, -84.32, 36.59, -75.46], ND: [45.94, -104.05, 49.0, -96.55],
  OH: [38.4, -84.82, 42.33, -80.52], OK: [33.62, -103.0, 37.0, -94.43],
  OR: [41.99, -124.57, 46.29, -116.46], PA: [39.72, -80.52, 42.27, -74.69],
  RI: [41.15, -71.86, 42.02, -71.12], SC: [32.03, -83.35, 35.22, -78.54],
  SD: [42.48, -104.06, 45.95, -96.44], TN: [34.98, -90.31, 36.68, -81.65],
  TX: [25.84, -106.65, 36.5, -93.51], UT: [36.99, -114.05, 42.0, -109.04],
  VT: [42.73, -73.44, 45.02, -71.46], VA: [36.54, -83.68, 39.47, -75.24],
  WA: [45.54, -124.85, 49.0, -116.92], WV: [37.2, -82.64, 40.64, -77.72],
  WI: [42.49, -92.89, 47.08, -86.25], WY: [40.99, -111.06, 45.01, -104.05],
  DC: [38.79, -77.12, 38.99, -76.91],
};

function loadIntlBounds() {
  const path = join(__dirname, "intl-region-bounds.generated.json");
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (e) {
    console.warn(`Could not load ${path}: ${e.message}`);
    return {};
  }
}

const INTL_BOUNDS = loadIntlBounds();
const BOUNDS = { ...US_BOUNDS, ...INTL_BOUNDS };

const listIntl = process.argv.includes("--list-intl");
if (listIntl) {
  console.log(Object.keys(INTL_BOUNDS).sort().join("\n"));
  process.exit(0);
}

const region = (process.argv[2] || "").toUpperCase();
const dryRun = process.argv.includes("--dry-run");
const resume = process.argv.includes("--resume");
if (!/^[A-Z][A-Z0-9]{1,30}$/.test(region)) {
  console.error("Usage: node scripts/populate-region.mjs <REGION> [--dry-run] [--resume]");
  process.exit(1);
}

const MAX_DEPTH = 6; // 4^6 cells; far more headroom than the server's one-shot path
const PACE_MS = 600; // be a good citizen to a free shared Overpass

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const split = ([s, w, n, e]) => {
  const mLat = (s + n) / 2, mLng = (w + e) / 2;
  return [[s, w, mLat, mLng], [s, mLng, mLat, e], [mLat, w, n, mLng], [mLat, mLng, n, e]];
};

async function post(path) {
  // Edge wall is ~150s; fail the client a bit sooner so retries can kick in
  // instead of hanging forever when the function idle-times out.
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${ANON_KEY}` },
    signal: AbortSignal.timeout(145_000),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || body.message || `${res.status}`);
  return body;
}

let cells = 0, staged = 0;

/**
 * Overpass is free and rate-limited, and a dense cell can trip 429/504 even
 * when the request is reasonable. Give a cell several attempts with a long,
 * growing pause before treating it as fatal — abandoning the run would throw
 * away every cell already staged.
 */
async function postCellWithRetry(path, label) {
  const waits = [20000, 60000, 120000];
  for (let attempt = 0; ; attempt++) {
    try {
      return await post(path);
    } catch (e) {
      if (attempt >= waits.length) throw e;
      const wait = waits[attempt];
      console.log(`  ${label}: ${e.message || "failed"} — retrying in ${wait / 1000}s`);
      await sleep(wait);
    }
  }
}

async function walk(bbox, label, depth, reset) {
  const q = `bbox=${bbox.join(",")}${reset ? "&reset=true" : ""}`;
  const r = await postCellWithRetry(`/churches/populate-cell/${region}?${q}`, label);
  cells++;

  if (r.truncated) {
    if (depth >= MAX_DEPTH) {
      console.warn(`  ${label}: still truncated at max depth — data may be incomplete`);
      return;
    }
    console.log(`  ${label}: ${r.fetched} elements, near cap — splitting`);
    const quarters = split(bbox);
    for (let i = 0; i < quarters.length; i++) {
      await sleep(PACE_MS);
      await walk(quarters[i], `${label}.${i + 1}`, depth + 1, false);
    }
    return;
  }

  staged = r.staged;
  console.log(`  ${label}: ${r.fetched} elements, +${r.added} new (staged ${r.staged})`);
}

async function main() {
  const bbox = BOUNDS[region];
  if (!bbox) {
    console.error(`No bounds for ${region}`);
    console.error("Run: node scripts/generate-admin1.mjs");
    process.exit(1);
  }

  console.log(`\nWalking ${region} in cells${dryRun ? " (dry run — will not finalize)" : ""}…\n`);
  const started = Date.now();

  // `reset` on the first cell clears staging from an interrupted run. --resume
  // keeps it instead, so a run that died partway does not start from nothing
  // (cells already staged are deduped by id on the way back in).
  await walk(bbox, region, 0, !resume);

  const secs = ((Date.now() - started) / 1000).toFixed(1);
  console.log(`\n${cells} cell(s), ${staged} churches staged in ${secs}s`);

  if (dryRun) {
    console.log("Dry run — staged data left in place, live state untouched.");
    return;
  }

  const r = await post(`/churches/populate-finalize/${region}`);
  console.log(`\n${r.message}`);
  console.log(`  community preserved: ${r.communityPreserved}`);
}

main().catch((e) => {
  console.error(`\nFailed: ${e.message}`);
  console.error("Live state is unchanged. Re-run with --resume to keep staged progress.");
  process.exit(1);
});

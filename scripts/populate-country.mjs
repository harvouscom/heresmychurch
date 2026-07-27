#!/usr/bin/env node
/**
 * Populate every admin-1 region in a country (sequentially).
 *
 * Usage:
 *   node scripts/populate-country.mjs BE
 *   node scripts/populate-country.mjs NL --dry-run
 *   node scripts/populate-country.mjs FR --resume
 *   node scripts/populate-country.mjs BE --only=BEBRU,BEVAN
 *
 * Env: same as populate-region.mjs
 */

import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { spawn } from "child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const cc = (process.argv[2] || "").toUpperCase();
const dryRun = process.argv.includes("--dry-run");
const resume = process.argv.includes("--resume");
const onlyArg = process.argv.find((a) => a.startsWith("--only="));
const only = onlyArg
  ? onlyArg.slice("--only=".length).split(",").map((s) => s.trim().toUpperCase()).filter(Boolean)
  : null;

if (!/^[A-Z]{2}$/.test(cc)) {
  console.error("Usage: node scripts/populate-country.mjs <CC> [--dry-run] [--resume] [--only=A,B]");
  process.exit(1);
}

function regionsForCountry(country) {
  const metaPath = join(__dirname, "..", "netlify", "edge-functions", "intl-country-meta.generated.ts");
  const src = readFileSync(metaPath, "utf8");
  const jsonMatch = src.match(/INTL_COUNTRY_META[\s\S]*?=\s*(\{[\s\S]*\});?\s*$/);
  if (!jsonMatch) throw new Error("Could not parse intl-country-meta.generated.ts");
  const meta = JSON.parse(jsonMatch[1]);
  const entry = meta[country];
  if (!entry?.regions) throw new Error(`No generated regions for ${country}`);
  return Object.keys(entry.regions).sort();
}

function runRegion(abbrev) {
  return new Promise((resolve, reject) => {
    const args = [join(__dirname, "populate-region.mjs"), abbrev];
    if (dryRun) args.push("--dry-run");
    if (resume) args.push("--resume");
    const child = spawn(process.execPath, args, { stdio: "inherit" });
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${abbrev} exited ${code}`));
    });
  });
}

async function main() {
  let regions = regionsForCountry(cc);
  if (only?.length) {
    const set = new Set(only);
    regions = regions.filter((r) => set.has(r));
  }
  if (!regions.length) {
    console.error(`No regions to populate for ${cc}`);
    process.exit(1);
  }
  console.log(`\nPopulating ${cc}: ${regions.length} region(s)\n  ${regions.join(", ")}\n`);
  for (let i = 0; i < regions.length; i++) {
    const r = regions[i];
    console.log(`\n═══ [${i + 1}/${regions.length}] ${cc}/${r} ═══`);
    await runRegion(r);
  }
  console.log(`\nDone — ${cc} (${regions.length} regions).`);
}

main().catch((e) => {
  console.error(`\nFailed: ${e.message}`);
  process.exit(1);
});

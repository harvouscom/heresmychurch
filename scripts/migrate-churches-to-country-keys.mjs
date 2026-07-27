#!/usr/bin/env node
/**
 * Phase 1 data migration: namespace church KV storage by country.
 *
 * WHAT IT DOES
 *   - Rekeys primary arrays:  churches:{ST}       -> churches:{CC}:{ST}
 *   - Rekeys search indexes:  churches:sidx:{ST}  -> churches:sidx:{CC}:{ST}
 *   - Rekeys pending:         pending-churches:{ST} -> pending-churches:{CC}:{ST}
 *   - Rekeys review-stats:    churches:review-stats:{ST} -> churches:review-stats:{CC}:{ST}
 *   - Rewrites churches:meta.stateCounts bare keys ("TX","PE") -> "US:TX","CA:PE"
 *   - Backfills country/region on church records
 *
 * US church `id` values are NOT rewritten (see plan).
 *
 * SAFETY: dry-run by default; --execute + SUPABASE_SERVICE_ROLE_KEY required to write.
 *
 * USAGE
 *   SUPABASE_SERVICE_ROLE_KEY=... node scripts/migrate-churches-to-country-keys.mjs
 *   SUPABASE_SERVICE_ROLE_KEY=... node scripts/migrate-churches-to-country-keys.mjs --execute
 */
import { createClient } from "@supabase/supabase-js";

const TABLE = "kv_store_283d8046";
const PROJECT_ID = process.env.SUPABASE_PROJECT_ID ?? "epufchwxofsyuictfufy";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const EXECUTE = process.argv.includes("--execute");

const US_STATES = new Set([
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "DC", "FL", "GA", "HI", "ID",
  "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD", "MA", "MI", "MN", "MS", "MO",
  "MT", "NE", "NV", "NH", "NJ", "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA",
  "RI", "SC", "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY",
]);

const CA_REGIONS = new Set([
  "AB", "BC", "MB", "NB", "NL", "NS", "NT", "NU", "ON", "PE", "QC", "SK", "YT",
]);

function countryFor(abbrev) {
  if (CA_REGIONS.has(abbrev)) return "CA";
  if (US_STATES.has(abbrev)) return "US";
  return null;
}

function fail(msg) {
  console.error(`\n✖ ${msg}\n`);
  process.exit(1);
}

if (!SERVICE_ROLE_KEY) {
  fail(
    "SUPABASE_SERVICE_ROLE_KEY is required (the anon key cannot read the KV " +
      "table). Set it in the environment. Without it this script does nothing.",
  );
}

const supabase = createClient(
  `https://${PROJECT_ID}.supabase.co`,
  SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

async function fetchByLike(pattern) {
  const rows = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from(TABLE)
      .select("key, value")
      .like("key", pattern)
      .range(from, from + pageSize - 1);
    if (error) fail(`Query failed (${pattern}): ${error.message}`);
    rows.push(...data);
    if (data.length < pageSize) break;
  }
  return rows;
}

function classifyChurchKey(key) {
  const sidx = key.match(/^churches:sidx:([A-Z]{2})$/);
  if (sidx) {
    const cc = countryFor(sidx[1]);
    if (cc) return { kind: "sidx", st: sidx[1], cc, newKey: `churches:sidx:${cc}:${sidx[1]}` };
  }
  const prim = key.match(/^churches:([A-Z]{2})$/);
  if (prim) {
    const cc = countryFor(prim[1]);
    if (cc) return { kind: "primary", st: prim[1], cc, newKey: `churches:${cc}:${prim[1]}` };
  }
  const rev = key.match(/^churches:review-stats:([A-Z]{2})$/);
  if (rev) {
    const cc = countryFor(rev[1]);
    if (cc) return { kind: "review-stats", st: rev[1], cc, newKey: `churches:review-stats:${cc}:${rev[1]}` };
  }
  if (
    /^churches:[A-Z]{2}:[A-Z]{2}$/.test(key) ||
    /^churches:sidx:[A-Z]{2}:[A-Z]{2}$/.test(key) ||
    /^churches:review-stats:[A-Z]{2}:[A-Z]{2}$/.test(key)
  ) {
    return { kind: "already-migrated" };
  }
  return { kind: "other" };
}

function classifyPending(key) {
  const m = key.match(/^pending-churches:([A-Z]{2})$/);
  if (m) {
    const cc = countryFor(m[1]);
    if (cc) return { kind: "pending", st: m[1], cc, newKey: `pending-churches:${cc}:${m[1]}` };
  }
  if (/^pending-churches:[A-Z]{2}:[A-Z]{2}$/.test(key)) return { kind: "already-migrated" };
  return { kind: "other" };
}

function backfillRecords(value, st, cc) {
  if (!Array.isArray(value)) return { value, changed: 0 };
  let changed = 0;
  const region = `${cc}-${st}`;
  const next = value.map((ch) => {
    if (ch && typeof ch === "object" && (ch.country !== cc || ch.region !== region)) {
      changed++;
      return { ...ch, country: cc, region };
    }
    return ch;
  });
  return { value: next, changed };
}

function migrateMetaCounts(meta) {
  if (!meta || typeof meta !== "object") return { meta, changed: 0 };
  const sc = { ...(meta.stateCounts || {}) };
  let changed = 0;
  const next = {};
  for (const [k, v] of Object.entries(sc)) {
    if (/^[A-Z]{2}:[A-Z]{2}$/.test(k)) {
      next[k] = v;
      continue;
    }
    if (/^[A-Z]{2}$/.test(k)) {
      const cc = countryFor(k);
      if (cc) {
        const nk = `${cc}:${k}`;
        next[nk] = (next[nk] || 0) + (v || 0);
        changed++;
        continue;
      }
    }
    next[k] = v;
  }
  return { meta: { ...meta, stateCounts: next }, changed };
}

async function upsertThenDelete(oldKey, newKey, value) {
  const up = await supabase.from(TABLE).upsert({ key: newKey, value });
  if (up.error) fail(`Write ${newKey} failed: ${up.error.message}`);
  const del = await supabase.from(TABLE).delete().eq("key", oldKey);
  if (del.error) fail(`Delete ${oldKey} failed: ${del.error.message}`);
  console.log(`  ✓ ${oldKey} -> ${newKey}`);
}

async function main() {
  console.log(`\nProject:   ${PROJECT_ID}`);
  console.log(`Mode:      ${EXECUTE ? "EXECUTE (will write)" : "DRY RUN (no writes)"}`);
  console.log(`Table:     ${TABLE}\n`);

  const churchRows = await fetchByLike("churches:%");
  const pendingRows = await fetchByLike("pending-churches:%");
  console.log(`Fetched ${churchRows.length} churches:* and ${pendingRows.length} pending-churches:* key(s).\n`);

  const plan = {
    primary: [],
    sidx: [],
    reviewStats: [],
    pending: [],
    other: [],
    alreadyMigrated: 0,
  };
  let totalRecords = 0;
  let recordsToBackfill = 0;

  for (const row of churchRows) {
    if (row.key === "churches:meta") continue;
    const c = classifyChurchKey(row.key);
    if (c.kind === "primary") {
      const { value, changed } = backfillRecords(row.value, c.st, c.cc);
      const count = Array.isArray(row.value) ? row.value.length : 0;
      totalRecords += count;
      recordsToBackfill += changed;
      plan.primary.push({ oldKey: row.key, newKey: c.newKey, count, backfill: changed, value, cc: c.cc });
    } else if (c.kind === "sidx") {
      plan.sidx.push({ oldKey: row.key, newKey: c.newKey, value: row.value });
    } else if (c.kind === "review-stats") {
      plan.reviewStats.push({ oldKey: row.key, newKey: c.newKey, value: row.value });
    } else if (c.kind === "already-migrated") {
      plan.alreadyMigrated++;
    } else if (row.key !== "churches:review-stats") {
      plan.other.push(row.key);
    }
  }

  for (const row of pendingRows) {
    const c = classifyPending(row.key);
    if (c.kind === "pending") {
      plan.pending.push({ oldKey: row.key, newKey: c.newKey, value: row.value });
    } else if (c.kind === "already-migrated") {
      plan.alreadyMigrated++;
    } else {
      plan.other.push(row.key);
    }
  }

  const metaRow = churchRows.find((r) => r.key === "churches:meta");
  const metaPlan = metaRow ? migrateMetaCounts(metaRow.value) : { meta: null, changed: 0 };

  console.log("── Primary church arrays ──");
  for (const p of plan.primary.sort((a, b) => a.oldKey.localeCompare(b.oldKey))) {
    console.log(
      `  ${p.oldKey.padEnd(16)} -> ${p.newKey.padEnd(20)}  ${p.count} churches, ${p.backfill} to backfill`,
    );
  }
  console.log(
    `\n  ${plan.primary.length} array(s), ${totalRecords} total churches, ${recordsToBackfill} records need country/region.\n`,
  );

  console.log("── Search indexes ──");
  for (const s of plan.sidx.sort((a, b) => a.oldKey.localeCompare(b.oldKey))) {
    console.log(`  ${s.oldKey.padEnd(22)} -> ${s.newKey}`);
  }
  console.log(`\n  ${plan.sidx.length} index key(s).\n`);

  console.log("── Review-stats (per-region) ──");
  for (const s of plan.reviewStats.sort((a, b) => a.oldKey.localeCompare(b.oldKey))) {
    console.log(`  ${s.oldKey.padEnd(30)} -> ${s.newKey}`);
  }
  console.log(`\n  ${plan.reviewStats.length} review-stats key(s).\n`);

  console.log("── Pending churches ──");
  for (const s of plan.pending.sort((a, b) => a.oldKey.localeCompare(b.oldKey))) {
    console.log(`  ${s.oldKey.padEnd(26)} -> ${s.newKey}`);
  }
  console.log(`\n  ${plan.pending.length} pending key(s).\n`);

  console.log(`── churches:meta stateCounts: ${metaPlan.changed} key(s) to rename ──\n`);

  if (plan.alreadyMigrated > 0) {
    console.log(`── Already migrated: ${plan.alreadyMigrated} key(s) skipped. ──\n`);
  }

  if (plan.other.length) {
    console.log("── Left alone (other churches:* / pending families) ──");
    for (const k of plan.other.slice(0, 40)) console.log(`  ${k}`);
    if (plan.other.length > 40) console.log(`  … +${plan.other.length - 40} more`);
    console.log("");
  }

  if (!EXECUTE) {
    console.log("DRY RUN complete. No changes written.");
    console.log("Re-run with --execute after the server dual-read deploy.\n");
    return;
  }

  console.log("EXECUTING migration…\n");
  for (const p of plan.primary) await upsertThenDelete(p.oldKey, p.newKey, p.value);
  for (const s of plan.sidx) await upsertThenDelete(s.oldKey, s.newKey, s.value);
  for (const s of plan.reviewStats) await upsertThenDelete(s.oldKey, s.newKey, s.value);
  for (const s of plan.pending) await upsertThenDelete(s.oldKey, s.newKey, s.value);

  if (metaPlan.meta && metaPlan.changed) {
    const up = await supabase.from(TABLE).upsert({ key: "churches:meta", value: metaPlan.meta });
    if (up.error) fail(`Write churches:meta failed: ${up.error.message}`);
    console.log(`  ✓ churches:meta stateCounts renamed (${metaPlan.changed})`);
  }

  console.log("\nMigration complete. National review-stats cache will recompute on next request.\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

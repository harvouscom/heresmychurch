#!/usr/bin/env node
/**
 * Drives the /admin/migrate/* routes for the move from Postgres to D1, looping each step until it's
 * done. Safe to re-run: steps resume and skip rows already identical.
 *
 *   node scripts/migrate-to-d1.mjs <base-url> copy     Copy KV, audit and monthly rows, prune deleted keys
 *   node scripts/migrate-to-d1.mjs <base-url> verify   Compare with Postgres; exits 1 on any difference
 *   node scripts/migrate-to-d1.mjs <base-url> mark     Record the cutover; copying is refused after this
 *   node scripts/migrate-to-d1.mjs <base-url> replay   ROLLBACK: write D1 changes back to Postgres
 *
 * Env: MODERATOR_KEY (required). Search isn't copied: run scripts/backfill-church-search.mjs after.
 * There's no default base URL, so production can't be hit by accident.
 */
const [base, command] = process.argv.slice(2);
const key = process.env.MODERATOR_KEY || "";
if (!base || !["copy", "verify", "mark", "replay"].includes(command) || !key) {
  console.error("Usage: MODERATOR_KEY=... node scripts/migrate-to-d1.mjs <base-url> copy|verify|mark|replay");
  process.exit(2);
}

async function post(step, params = {}) {
  const url = `${base.replace(/\/$/, "")}/admin/migrate/${step}?${new URLSearchParams(params)}`;
  for (let attempt = 1; ; attempt++) {
    let res, body;
    try {
      res = await fetch(url, { method: "POST", headers: { "x-moderator-key": key }, signal: AbortSignal.timeout(120_000) });
      body = await res.json().catch(() => ({}));
      if (res.ok) return body;
      // A 4xx is a decision, not a blip, so stop rather than retry.
      if (res.status < 500) throw Object.assign(new Error(`${step}: HTTP ${res.status} ${body.error ?? ""}`), { fatal: true });
    } catch (e) {
      if (e.fatal) throw e;
      body = { error: String(e) };
    }
    if (attempt >= 5) throw new Error(`${step}: failed after ${attempt} attempts: ${body?.error ?? res?.status}`);
    console.warn(`  ${step}: ${body?.error ?? res?.status}, retrying (${attempt})`);
    await new Promise((r) => setTimeout(r, 2000 * attempt));
  }
}

/** Calls a step until it reports no next page. */
async function loop(step, cursorName, params, onPage) {
  let cursor = "";
  for (;;) {
    const body = await post(step, { ...params, ...(cursor ? { [cursorName]: cursor } : {}) });
    onPage(body);
    if (body.next === null || body.next === undefined) return;
    cursor = String(body.next);
  }
}

const started = Date.now();
const elapsed = () => `${((Date.now() - started) / 1000).toFixed(1)}s`;

if (command === "copy") {
  const t = { copied: 0, unchanged: 0, bytes: 0 };
  await loop("kv", "cursor", {}, (b) => {
    t.copied += b.copied; t.unchanged += b.unchanged; t.bytes += b.bytes;
    console.log(`kv: ${t.copied} copied, ${t.unchanged} unchanged, ${(t.bytes / 1e6).toFixed(1)} MB (${elapsed()})`);
  });
  let audit = 0;
  await loop("audit", "afterId", {}, (b) => { audit += b.copied; console.log(`audit: ${audit} rows (${elapsed()})`); });
  await loop("monthly", "cursor", {}, (b) => console.log(`monthly: ${b.copied} rows`));
  let pruned = 0;
  await loop("prune", "cursor", {}, (b) => { pruned += b.extra.length; for (const k of b.extra) console.log(`pruned ${k}`); });
  console.log(`Copy finished in ${elapsed()}, ${pruned} key(s) pruned.`);
}

if (command === "verify") {
  const mismatched = [], missing = [], extra = [], families = {};
  let checked = 0;
  await loop("verify", "cursor", {}, (b) => {
    checked += b.checked; mismatched.push(...b.mismatched); missing.push(...b.missing);
    for (const [f, n] of Object.entries(b.families)) families[f] = (families[f] ?? 0) + n;
    console.log(`verify: ${checked} keys checked (${elapsed()})`);
  });
  await loop("prune", "cursor", { dryRun: "1" }, (b) => extra.push(...b.extra));
  const counts = await post("counts");
  const familyDiffs = [...new Set([...Object.keys(families), ...Object.keys(counts.d1.families)])]
    .filter((f) => (families[f] ?? 0) !== (counts.d1.families[f] ?? 0))
    .map((f) => `${f}: postgres ${families[f] ?? 0}, d1 ${counts.d1.families[f] ?? 0}`);
  const tableDiffs = ["audit", "auditMaxId", "monthly"]
    .filter((k) => counts.postgres[k] !== counts.d1[k])
    .map((k) => `${k}: postgres ${counts.postgres[k]}, d1 ${counts.d1[k]}`);
  console.log("Families:", families);
  console.log("Tables:", counts.postgres);
  const report = { mismatched, missing, extra, familyDiffs, tableDiffs };
  const problems = Object.values(report).reduce((n, list) => n + list.length, 0);
  if (problems) {
    for (const [name, list] of Object.entries(report)) if (list.length) console.error(`${name} (${list.length}):`, list.slice(0, 50));
    console.error(`Verify FAILED with ${problems} difference(s) in ${elapsed()}.`);
    process.exit(1);
  }
  console.log(`Verify passed: 0 differences across ${checked} keys in ${elapsed()}.`);
}

if (command === "mark") console.log("Cutover recorded:", await post("mark-cutover"));

if (command === "replay") {
  for (const section of ["kv", "tombstones", "audit", "monthly"]) {
    let replayed = 0;
    await loop("replay", "cursor", { section, confirm: "write-postgres" }, (b) => { replayed += b.replayed; });
    console.log(`replay ${section}: ${replayed} (${elapsed()})`);
  }
}

#!/usr/bin/env node
/**
 * Read-only: counts the live listings two consensus changes would affect.
 *
 *  - Ties: fields with 2+ distinct values sharing the top vote count. Today the
 *    first-seen value wins; with newest-wins some of these flip on the next read
 *    or replay. This is an upper bound (the route doesn't expose timestamps).
 *  - Unmoderated overlays: sensitive fields that consensus marks approved, which
 *    the map and public R2 files show today before a moderator has seen them.
 *
 * Usage: node scripts/count-consensus-impact.mjs [base]
 */
const BASE = (process.argv[2] || process.env.API_BASE || "https://api.heresmychurch.com").replace(/\/$/, "");
const SENSITIVE = new Set(["name", "website", "address", "reportClosed", "reportDuplicate", "reportOutOfScope", "reportRelocated", "homeCampusId"]);

async function getJson(path) {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(BASE + path);
    if (res.ok) return res.json();
    if (attempt >= 3) throw new Error(`${path}: ${res.status}`);
    await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
  }
}

async function pool(items, size, fn) {
  let i = 0;
  await Promise.all(Array.from({ length: size }, async () => {
    while (i < items.length) await fn(items[i++]);
  }));
}

const { countries } = await getJson("/churches/countries");
const regions = [];
for (const c of countries.filter((x) => x.isPopulated)) {
  // /churches/regions serves international countries; US states have their own route.
  const body = await getJson(c.code === "US" ? "/churches/states" : `/churches/regions/${c.code}`);
  for (const s of body.regions ?? body.states ?? []) if (s.isPopulated !== false) regions.push(s.abbrev);
}
const unique = [...new Set(regions)];
console.log(`Scanning ${unique.length} regions at ${BASE}`);

const overlay = {};
const churchIds = [];
const failed = [];
await pool(unique, 4, async (r) => {
  try {
    const { corrections } = await getJson(`/suggestions/approved/${r}`);
    for (const [id, fields] of Object.entries(corrections ?? {})) {
      churchIds.push(id);
      for (const f of Object.keys(fields)) if (SENSITIVE.has(f)) overlay[f] = (overlay[f] || 0) + 1;
    }
  } catch (e) { failed.push(`${r}: ${e.message}`); }
});

const ties = {};
const tieChurches = new Set();
await pool([...new Set(churchIds)], 4, async (id) => {
  try {
    const data = await getJson(`/suggestions/${encodeURIComponent(id)}`);
    for (const [field, d] of Object.entries(data.consensus ?? data.fields ?? data)) {
      const subs = d?.submissions;
      if (!Array.isArray(subs) || subs.length < 2 || field === "attendance") continue;
      const top = Math.max(...subs.map((s) => s.count));
      if (subs.filter((s) => s.count === top).length > 1) {
        ties[field] = (ties[field] || 0) + 1;
        tieChurches.add(id);
      }
    }
  } catch (e) { failed.push(`${id}: ${e.message}`); }
});

const sum = (o) => Object.values(o).reduce((a, b) => a + b, 0);
console.log(JSON.stringify({
  churchesWithCorrections: new Set(churchIds).size,
  tiedFields: sum(ties), tiedChurches: tieChurches.size, tiesByField: ties,
  unmoderatedOverlayFields: sum(overlay), overlayByField: overlay,
  failed,
}, null, 2));

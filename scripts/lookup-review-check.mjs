#!/usr/bin/env node
/**
 * End-to-end check of Lookup's write paths against a live API. This WRITES to the
 * church you name, so use one you control and whose details you know.
 *
 *  1. Website suggestion (moderated): must stay out of every public read, appear in
 *     the moderation queue with its tool name, and be gone after rejecting.
 *  2. Service times suggestion (goes live on one vote): must report applied and be
 *     stored, then the original value is restored. The church needs existing service
 *     times, because a blank value can't be restored.
 *
 * Usage: node scripts/lookup-review-check.mjs <churchId>
 * Env:   LOOKUP_INTERNAL_KEY, MODERATOR_KEY (required)
 *        API_BASE (default https://api.heresmychurch.com)
 *        HMC_PARTNER_KEY (optional, also checks the /v1 profile)
 */
const churchId = process.argv[2];
const BASE = (process.env.API_BASE || "https://api.heresmychurch.com").replace(/\/$/, "");
const DATA = "https://data.heresmychurch.com";
const { LOOKUP_INTERNAL_KEY, MODERATOR_KEY, HMC_PARTNER_KEY } = process.env;
if (!churchId || !LOOKUP_INTERNAL_KEY || !MODERATOR_KEY) {
  console.error("Usage: LOOKUP_INTERNAL_KEY=… MODERATOR_KEY=… node scripts/lookup-review-check.mjs <churchId>");
  process.exit(2);
}

const CLIENT = "lookup-review-check";
const IP_HASH = "0123456789abcdef";
const PROBE = `https://lookup-review-check-${Date.now()}.example.com/`;
let failures = 0;
const check = (ok, label) => { console.log(`${ok ? "ok  " : "FAIL"} ${label}`); if (!ok) failures++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function req(path, init = {}, base = BASE) {
  const res = await fetch(base + path, init);
  const text = await res.text();
  let body = null;
  try { body = JSON.parse(text); } catch { /* keep text */ }
  return { status: res.status, body, text };
}
const lookupHeaders = { "content-type": "application/json", "x-lookup-key": LOOKUP_INTERNAL_KEY };
const modHeaders = { "content-type": "application/json", "x-moderator-key": MODERATOR_KEY };
const suggest = (field, value) => req("/internal/lookup/suggestions", {
  method: "POST", headers: lookupHeaders,
  body: JSON.stringify({ churchId, field, value, client: CLIENT, ipHash: IP_HASH }),
});
const queue = async () => (await req("/moderate/pending", { headers: modHeaders })).body?.pendingSuggestions ?? [];

const parts = churchId.split("-");
const region = parts[0] === "community" ? (parts[1].length === 2 && parts[2]?.match(/^[A-Z]/) ? parts[2] : parts[1]) : (parts.length > 2 ? parts[1] : parts[0]);
const regions = (await req("/internal/lookup/regions", { headers: lookupHeaders })).body?.regions ?? [];
const cc = regions.find((r) => r.abbrev === region)?.cc;
if (!cc) { console.error(`Can't resolve region ${region} for ${churchId}`); process.exit(2); }
const stored = async () => {
  const { body } = await req(`/internal/lookup/region/${cc}/${region}`, { headers: lookupHeaders });
  return (body?.churches ?? []).find((x) => x.id === churchId);
};

const before = await stored();
if (!before) { console.error(`${churchId} not found in stored data`); process.exit(2); }
if (!before.serviceTimes) { console.error(`${churchId} has no service times, so step 2 couldn't restore. Pick another church.`); process.exit(2); }
if ((await queue()).some((s) => s.churchId === churchId && s.field === "website")) {
  console.error(`${churchId} already has a pending website suggestion. Rejecting it here would lose it, so stopping.`);
  process.exit(2);
}

console.log(`\n1. Moderated field (website) on ${churchId}`);
const sent = await suggest("website", PROBE);
check(sent.status === 200 && sent.body?.needsModeration === true && sent.body?.applied === false, "reported as waiting for review");
await sleep(5000);
const value = PROBE.replace(/\/$/, "");
try {
  check(!(await req(`/churches/church/${encodeURIComponent(churchId)}`)).text.includes(value), "absent from the single-church read");
  check(!(await req(`/churches/${region}`)).text.includes(value), "absent from the region read");
  check(!(await req(`/churches/${region}.json`, {}, DATA)).text.includes(value), "absent from the public R2 file");
  check(!(await req(`/suggestions/approved/${region}`)).text.includes(value), "absent from /suggestions/approved");
  check((await stored())?.website !== PROBE, "absent from the Lookup export");
  if (HMC_PARTNER_KEY) {
    check(!(await req(`/v1/churches/${encodeURIComponent(churchId)}/profile`, { headers: { "x-partner-key": HMC_PARTNER_KEY } })).text.includes(value), "absent from the /v1 profile");
  }
  const item = (await queue()).find((s) => s.churchId === churchId && s.field === "website");
  check(!!item && item.clients?.includes(CLIENT), "in the moderation queue with its tool name");
} finally {
  const rej = await req("/moderate/reject/suggestion", { method: "POST", headers: modHeaders, body: JSON.stringify({ churchId, field: "website" }) });
  check(rej.status === 200, "rejected");
}
check(!(await queue()).some((s) => s.churchId === churchId && s.field === "website"), "gone from the queue after rejecting");

console.log(`\n2. Live field (serviceTimes) on ${churchId}`);
const original = before.serviceTimes;
const probeTimes = original.includes("6:17 AM") ? "Sun 6:43 AM" : "Sun 6:17 AM";
try {
  const live = await suggest("serviceTimes", probeTimes);
  check(live.status === 200 && live.body?.applied === true, "reported as applied");
  await sleep(1000);
  check((await stored())?.serviceTimes === probeTimes, "stored value matches what was sent");
} finally {
  const back = await suggest("serviceTimes", original);
  check(back.status === 200, "restore accepted");
  await sleep(1000);
  check((await stored())?.serviceTimes === original, "original value restored");
}

console.log(failures ? `\n${failures} check(s) failed.` : "\nAll checks passed.");
process.exit(failures ? 1 : 0);

#!/usr/bin/env node
/**
 * End-to-end check of Lookup's write paths against a live API. This WRITES to the
 * church you name, so use one you control and whose details you know.
 *
 *  1. Website suggestion (moderated): must stay out of every public read, appear in
 *     the moderation queue with its tool name, and be gone after rejecting.
 *  2. Service-time replacement stays pending and leaves the accepted value intact.
 *     Approving the original value exercises the write/audit/publish path without
 *     publishing the probe time.
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

// Stored row, in Lookup's export shape (country, state and shortId included).
const stored = async () => (await req(`/internal/lookup/church/${encodeURIComponent(churchId)}`, { headers: lookupHeaders })).body?.church;

const before = await stored();
if (!before) { console.error(`${churchId} not found in stored data`); process.exit(2); }
const region = before.state;
if (!before.serviceTimes) { console.error(`${churchId} has no service times, so step 2 couldn't restore. Pick another church.`); process.exit(2); }
if ((await queue()).some((s) => s.churchId === churchId && ["website", "serviceTimes"].includes(s.field))) {
  console.error(`${churchId} already has a pending website or service-time suggestion. Rejecting it here would lose it, so stopping.`);
  process.exit(2);
}

console.log(`\n1. Moderated field (website) on ${churchId}`);
const sent = await suggest("website", PROBE);
check(sent.status === 200 && sent.body?.needsModeration === true && sent.body?.applied === false, "reported as waiting for review");
await sleep(5000);
const value = PROBE.replace(/\/$/, "");
try {
  const single = await req(`/churches/${region}/church/${encodeURIComponent(before.shortId)}`);
  check(single.status === 200 && !single.text.includes(value), "absent from the single-church read");
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

console.log(`\n2. Service-time replacement on ${churchId}`);
const original = before.serviceTimes;
const probeTimes = original.includes("6:17 AM") ? "Sun 6:43 AM" : "Sun 6:17 AM";
try {
  const proposed = await suggest("serviceTimes", probeTimes);
  check(proposed.status === 200 && proposed.body?.applied === false && proposed.body?.needsModeration === true, "replacement waits for review");
  check((await stored())?.serviceTimes === original, "accepted value stays unchanged");
  check((await queue()).some((s) => s.churchId === churchId && s.field === "serviceTimes" && s.proposedValue === probeTimes), "replacement appears in the review queue");
  const approved = await req("/moderate/approve/suggestion", { method: "POST", headers: modHeaders, body: JSON.stringify({ churchId, field: "serviceTimes", value: original }) });
  check(approved.status === 200 && approved.body?.applied === true, "moderator can retain and publish the original value");
  await sleep(1000);
  check((await stored())?.serviceTimes === original, "original value retained");
} finally {
  const item = (await queue()).find((s) => s.churchId === churchId && s.field === "serviceTimes");
  if (item) await req("/moderate/reject/suggestion", { method: "POST", headers: modHeaders, body: JSON.stringify({ churchId, field: "serviceTimes" }) });
}

console.log(failures ? `\n${failures} check(s) failed.` : "\nAll checks passed.");
process.exit(failures ? 1 : 0);

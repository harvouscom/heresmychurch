#!/usr/bin/env node
/**
 * API contract checks: bad input must get a clean 4xx JSON error, never a 500 or
 * leaked internals. Every request here is invalid on purpose, so no church data is
 * written (two suggestion cases do count toward the caller's IP rate limit, 60/hour).
 *
 * Usage:
 *   node scripts/api-contract.mjs [base]
 *   API_BASE=https://api.heresmychurch.com node scripts/api-contract.mjs
 *
 * Env:
 *   API_BASE          default: https://api.heresmychurch.com
 *   HMC_PARTNER_KEY   optional. When set, also checks the shape of keyed /v1 reads (read-only;
 *                     each counts toward the partner's 120/min limit).
 *   HMC_PROFILE_ID    optional church id for the profile shape check (default: first search hit)
 */
const BASE = (process.argv[2] || process.env.API_BASE || "https://api.heresmychurch.com").replace(/\/$/, "");

const json = (body) => ({
  method: "POST",
  headers: { "content-type": "application/json" },
  body: typeof body === "string" ? body : JSON.stringify(body),
});

/** [label, path, init, expected status] */
const CASES = [
  ["unknown route", "/no-such-route", {}, 404],
  ["missing church", "/churches/church/TX-does-not-exist", {}, 404],
  ["/v1 without partner key", "/v1/churches/search?q=grace", {}, 401],
  ["/v1 profile without key", "/v1/churches/TX-1/profile", {}, 401],
  ["add: malformed JSON", "/churches/add", json("{bad"), 400],
  ["add: array body", "/churches/add", json([]), 400],
  ["add: missing name", "/churches/add", json({ state: "TX" }), 400],
  ["add: javascript: website", "/churches/add", json({ name: "x", website: "javascript:alert(1)" }), 400],
  ["add: invalid email", "/churches/add", json({ name: "x", email: "nope" }), 400],
  ["suggest: malformed JSON", "/suggestions", json("{bad"), 400],
  ["suggest: empty body", "/suggestions", json({}), 400],
  ["suggest: bad church id", "/suggestions", json({ churchId: "ZZ-1", field: "name", value: "x" }), 400],
  ["suggest: javascript: website", "/suggestions", json({ churchId: "TX-does-not-exist", field: "website", value: "javascript:x" }), 400],
];

// Text that should never reach a client.
const LEAK = /(TypeError|SyntaxError|ReferenceError|supabaseKey|stack|at \w+ \(|\.ts:\d+|PGRST|postgres)/i;

let failures = 0;
console.log(`API: ${BASE}\n`);
for (const [label, path, init, expected] of CASES) {
  let status = "ERR";
  let text = "";
  try {
    const res = await fetch(BASE + path, { ...init, signal: AbortSignal.timeout(30_000) });
    status = res.status;
    text = await res.text();
  } catch (e) {
    text = String(e);
  }
  let body = null;
  try { body = JSON.parse(text); } catch { /* not JSON */ }
  const problems = [];
  if (status !== expected) problems.push(`status ${status}, expected ${expected}`);
  if (!body || typeof body.error !== "string") problems.push("no JSON {error} body");
  if (LEAK.test(text)) problems.push("response leaks internal error text");
  if (problems.length) failures++;
  console.log(`${problems.length ? "FAIL" : "ok  "}  ${label.padEnd(30)} ${status}  ${body?.error ?? text.slice(0, 80)}${problems.length ? `\n      ${problems.join("; ")}` : ""}`);
}
// ── Keyed /v1 shape checks (optional) ──────────────────────────────────────
const PARTNER_KEY = (process.env.HMC_PARTNER_KEY || "").trim();
if (PARTNER_KEY) {
  const keyed = async (path) => {
    const res = await fetch(BASE + path, { headers: { "x-partner-key": PARTNER_KEY }, signal: AbortSignal.timeout(30_000) });
    const text = await res.text();
    let body = null;
    try { body = JSON.parse(text); } catch { /* not JSON */ }
    return { status: res.status, body, text };
  };
  const check = (label, problems) => {
    if (problems.length) failures++;
    console.log(`${problems.length ? "FAIL" : "ok  "}  ${label.padEnd(30)}${problems.length ? `\n      ${problems.join("; ")}` : ""}`);
  };

  const missing = await keyed("/v1/churches/TX-does-not-exist/profile");
  check("profile: unknown id", [
    ...(missing.status === 404 ? [] : [`status ${missing.status}, expected 404`]),
    ...(typeof missing.body?.error === "string" ? [] : ["no JSON {error} body"]),
    ...(LEAK.test(missing.text) ? ["response leaks internal error text"] : []),
  ]);

  let id = (process.env.HMC_PROFILE_ID || "").trim();
  if (!id) id = (await keyed("/v1/churches/search?q=church&state=TX&limit=1")).body?.results?.[0]?.id || "";
  if (!id) {
    check("profile: shape", ["no church id to check (set HMC_PROFILE_ID)"]);
  } else {
    const { status, body } = await keyed(`/v1/churches/${encodeURIComponent(id)}/profile`);
    const ch = body?.church;
    const problems = [];
    if (status !== 200 || !ch) problems.push(`status ${status}`);
    else {
      for (const k of ["id", "shortId", "name", "city", "state", "lat", "lng"]) if (!(k in ch)) problems.push(`missing ${k}`);
      for (const k of ["serviceTimes", "website", "phone", "email", "pastorName", "attendanceEstimate", "homeCampus", "listingStatus"]) if (!(k in ch)) problems.push(`missing ${k} (null, not absent)`);
      for (const k of ["languages", "ministries", "campuses"]) if (!Array.isArray(ch[k])) problems.push(`${k} not an array`);
      const st = ch.serviceTimes;
      if (st !== null) {
        if (typeof st?.raw !== "string" || !Array.isArray(st?.slots) || typeof st?.parsed !== "boolean") problems.push("serviceTimes shape");
        for (const slot of st?.slots ?? []) {
          if (!(Number.isInteger(slot.dayOfWeek) && slot.dayOfWeek >= 0 && slot.dayOfWeek <= 6)) problems.push("slot.dayOfWeek");
          if (!/^\d{2}:\d{2}$/.test(slot.startTime ?? "")) problems.push("slot.startTime");
        }
      }
    }
    check(`profile: shape (${id})`, problems);
  }
}

console.log(`\n${failures ? `${failures} failure(s)` : "All contract checks passed."}`);
process.exit(failures ? 1 : 0);

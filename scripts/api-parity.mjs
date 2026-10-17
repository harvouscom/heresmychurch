#!/usr/bin/env node
/**
 * Compare read-only API responses between the Supabase edge function and the
 * Cloudflare Worker (or any two bases). Exits non-zero when bodies differ.
 *
 * Usage:
 *   node scripts/api-parity.mjs [workerBase]
 *   WORKER_BASE=https://hmc-api.harvous.workers.dev node scripts/api-parity.mjs
 *
 * Env:
 *   SUPABASE_BASE      default: production make-server-283d8046 function
 *   WORKER_BASE        default: https://api.heresmychurch.com
 *   PARTNER_API_KEY    optional: also compares /v1 partner search
 */
const ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVwdWZjaHd4b2ZzeXVpY3RmdWZ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI5NzcxMTUsImV4cCI6MjA4ODU1MzExNX0.v11kHHpM1IsK6q81909CYkWgX5TdV8kJhCkNqSEs5QM";
const SUPABASE_BASE = (process.env.SUPABASE_BASE ||
  "https://epufchwxofsyuictfufy.supabase.co/functions/v1/make-server-283d8046").replace(/\/$/, "");
const WORKER_BASE = (process.argv[2] || process.env.WORKER_BASE || "https://api.heresmychurch.com").replace(/\/$/, "");
const PARTNER_API_KEY = process.env.PARTNER_API_KEY || "";

const PATHS = [
  "/health",
  "/churches/states",
  "/population",
  "/churches/TX",
  "/churches/search?q=grace&limit=10",
  "/churches/search?q=first%20baptist%20austin&limit=10",
  "/reports",
  "/churches/review-stats?country=US",
];
const PARTNER_PATHS = ["/v1/churches/search?q=grace&state=TX&limit=5"];

// Fields that legitimately differ between two calls (timestamps, cache bookkeeping).
const VOLATILE = new Set(["_cachedAt", "cachedAt", "fetchedAt", "generatedAt", "updatedAt", "fromCache", "source", "pending", "now", "timestamp"]);

function normalize(v) {
  if (Array.isArray(v)) return v.map(normalize);
  if (v && typeof v === "object") {
    const out = {};
    for (const k of Object.keys(v).sort()) if (!VOLATILE.has(k)) out[k] = normalize(v[k]);
    return out;
  }
  return v;
}

async function get(base, path, headers) {
  const t = Date.now();
  const res = await fetch(base + path, { headers, signal: AbortSignal.timeout(90_000) });
  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch { body = text.slice(0, 200); }
  return { status: res.status, ms: Date.now() - t, body };
}

function firstDiff(a, b, path = "") {
  if (JSON.stringify(a) === JSON.stringify(b)) return null;
  if (a && b && typeof a === "object" && typeof b === "object") {
    if (Array.isArray(a) && Array.isArray(b) && a.length !== b.length) return `${path || "/"}: length ${a.length} vs ${b.length}`;
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
      const d = firstDiff(a[k], b[k], `${path}/${k}`);
      if (d) return d;
    }
  }
  return `${path || "/"}: ${JSON.stringify(a)?.slice(0, 80)} vs ${JSON.stringify(b)?.slice(0, 80)}`;
}

let failures = 0;
const supaHeaders = { Authorization: `Bearer ${ANON_KEY}`, apikey: ANON_KEY };
const checks = PATHS.map((p) => [p, {}]);
if (PARTNER_API_KEY) checks.push(...PARTNER_PATHS.map((p) => [p, { "x-partner-key": PARTNER_API_KEY }]));

console.log(`Supabase: ${SUPABASE_BASE}\nWorker:   ${WORKER_BASE}\n`);
for (const [path, extra] of checks) {
  const [a, b] = await Promise.all([
    get(SUPABASE_BASE, path, { ...supaHeaders, ...extra }).catch((e) => ({ status: "ERR", ms: 0, body: String(e) })),
    get(WORKER_BASE, path, extra).catch((e) => ({ status: "ERR", ms: 0, body: String(e) })),
  ]);
  const diff = a.status !== b.status ? `status ${a.status} vs ${b.status}` : firstDiff(normalize(a.body), normalize(b.body));
  if (diff) failures++;
  console.log(`${diff ? "DIFF" : "same"}  ${path}  (supabase ${a.status} ${a.ms}ms, worker ${b.status} ${b.ms}ms)${diff ? `\n      ${diff}` : ""}`);
}
console.log(`\n${failures ? `${failures} difference(s)` : "All responses match."}`);
process.exit(failures ? 1 : 0);

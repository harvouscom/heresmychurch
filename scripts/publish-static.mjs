#!/usr/bin/env node
/**
 * Republish every static file on R2 (states.json + churches/{REGION}.json) by
 * looping POST /admin/publish-static until it reports no next offset.
 *
 * Writes already republish the files they touch; run this for the initial
 * backfill and (via .github/workflows/publish-static.yml) daily, to catch
 * cross-region changes such as home-campus summaries.
 *
 * Env:
 *   MODERATOR_KEY            — required
 *   HMC_FUNCTIONS_BASE_URL   — default: production make-server-283d8046
 *   HMC_SUPABASE_ANON_KEY    — default: the public anon key
 *   HMC_PUBLISH_BATCH        — regions per request (default 3, max 10)
 */
const DEFAULT_API_BASE =
  "https://epufchwxofsyuictfufy.supabase.co/functions/v1/make-server-283d8046";
const DEFAULT_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVwdWZjaHd4b2ZzeXVpY3RmdWZ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI5NzcxMTUsImV4cCI6MjA4ODU1MzExNX0.v11kHHpM1IsK6q81909CYkWgX5TdV8kJhCkNqSEs5QM";

const apiBase = (process.env.HMC_FUNCTIONS_BASE_URL || DEFAULT_API_BASE).replace(/\/$/, "");
const anonKey = process.env.HMC_SUPABASE_ANON_KEY || DEFAULT_ANON_KEY;
const modKey = process.env.MODERATOR_KEY || "";
const batch = process.env.HMC_PUBLISH_BATCH || "3";

if (!modKey) {
  console.error("publish-static: MODERATOR_KEY is required");
  process.exit(1);
}

let offset = 0;
let failures = 0;
for (;;) {
  const res = await fetch(`${apiBase}/admin/publish-static?offset=${offset}&limit=${batch}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${anonKey}`,
      apikey: anonKey,
      "x-moderator-key": modKey,
    },
    signal: AbortSignal.timeout(140_000),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error(`publish-static: ${res.status}`, body);
    process.exit(1);
  }
  for (const f of body.failed || []) console.error(`  failed ${f.target}: ${f.error}`);
  failures += (body.failed || []).length;
  console.log(`published ${body.published.join(", ") || "(none)"} [${Math.min(body.next ?? body.total, body.total)}/${body.total}]`);
  if (body.next == null) break;
  offset = body.next;
}
if (failures) {
  console.error(`publish-static: done with ${failures} failure(s)`);
  process.exit(1);
}
console.log("publish-static: done");

#!/usr/bin/env node
/**
 * Backfills the church_search Postgres table from the KV search indexes,
 * a few regions per request, then marks it ready so /churches/search uses it.
 * Safe to re-run; each region is replaced atomically.
 *
 * Usage: MODERATOR_KEY=... node scripts/backfill-church-search.mjs
 *
 * Uses SUPABASE_PROJECT_ID and SUPABASE_ANON_KEY from env if set;
 * otherwise uses the same values as the app (utils/supabase/info).
 */
const PROJECT_ID =
  process.env.SUPABASE_PROJECT_ID ?? "epufchwxofsyuictfufy";
const ANON_KEY =
  process.env.SUPABASE_ANON_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVwdWZjaHd4b2ZzeXVpY3RmdWZ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI5NzcxMTUsImV4cCI6MjA4ODU1MzExNX0.v11kHHpM1IsK6q81909CYkWgX5TdV8kJhCkNqSEs5QM";
const MODERATOR_KEY = process.env.MODERATOR_KEY;
const COUNT = Number(process.env.BACKFILL_COUNT ?? 8);

const BASE_URL = `https://${PROJECT_ID}.supabase.co/functions/v1/make-server-283d8046`;

async function main() {
  if (!MODERATOR_KEY) {
    console.error("Set MODERATOR_KEY (same value as the edge function secret).");
    process.exit(1);
  }
  let offset = 0;
  let startedAt = "";
  const failed = [];
  for (;;) {
    const params = new URLSearchParams({ offset: String(offset), count: String(COUNT) });
    if (startedAt) params.set("startedAt", startedAt);
    const res = await fetch(`${BASE_URL}/churches/search/backfill?${params}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${ANON_KEY}`,
        "x-moderator-key": MODERATOR_KEY,
      },
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.error(`Backfill failed at offset ${offset}: HTTP ${res.status}`, body);
      process.exit(1);
    }
    startedAt = body.startedAt;
    failed.push(...(body.failed ?? []));
    console.log(`Synced ${body.synced?.length ?? 0} regions (${Math.min(offset + COUNT, body.total)}/${body.total})${body.failed?.length ? `, failed: ${body.failed.join(", ")}` : ""}`);
    if (body.next == null) {
      if (body.ready) console.log("Done. church_search is ready and search will use it.");
      else console.log(`Done, but NOT marked ready${failed.length ? ` (failed: ${failed.join(", ")})` : " (a sync failed during the backfill)"}. Re-run to retry.`);
      return;
    }
    offset = body.next;
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

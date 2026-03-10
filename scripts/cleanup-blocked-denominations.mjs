#!/usr/bin/env node
/**
 * Calls the admin endpoint to remove churches with blocked denominations
 * (Unitarian, Christian Science, Jehovah's Witnesses, Latter-day Saints)
 * from the KV store. Updates per-state data, search indexes, and meta counts.
 *
 * Usage: node scripts/cleanup-blocked-denominations.mjs
 *   Or:  npm run cleanup-blocked
 *
 * Uses SUPABASE_PROJECT_ID and SUPABASE_ANON_KEY from env if set;
 * otherwise uses the same values as the app (utils/supabase/info).
 */
const PROJECT_ID =
  process.env.SUPABASE_PROJECT_ID ?? "epufchwxofsyuictfufy";
const ANON_KEY =
  process.env.SUPABASE_ANON_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVwdWZjaHd4b2ZzeXVpY3RmdWZ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI5NzcxMTUsImV4cCI6MjA4ODU1MzExNX0.v11kHHpM1IsK6q81909CYkWgX5TdV8kJhCkNqSEs5QM";

const BASE_URL = `https://${PROJECT_ID}.supabase.co/functions/v1/make-server-283d8046`;
const CLEANUP_PATH = "/admin/cleanup-blocked-denominations";

async function main() {
  const url = `${BASE_URL}${CLEANUP_PATH}`;
  console.log("Calling cleanup endpoint...", url);

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${ANON_KEY}`,
    },
  });

  const text = await res.text();
  if (!res.ok) {
    console.error("Cleanup failed:", res.status, text);
    process.exit(1);
  }

  let data;
  try {
    data = JSON.parse(text);
  } catch {
    console.log("Response (non-JSON):", text);
    process.exit(0);
  }

  console.log(data.message ?? "Done.");
  if (data.removed != null) console.log("Removed:", data.removed);
  if (data.states != null) console.log("States updated:", data.states);
}

main();

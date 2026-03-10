#!/usr/bin/env node
/**
 * One-off: fetch Iowa churches from the API and check whether
 * "Eternity Church" and "New Hope Assembly of God" have serviceTimes.
 *
 * Usage: node scripts/check-ia-churches.mjs
 *
 * Requires: API reachable (same as frontend). Uses public anon key from repo.
 */
const PROJECT_ID = "epufchwxofsyuictfufy";
const ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVwdWZjaHd4b2ZzeXVpY3RmdWZ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI5NzcxMTUsImV4cCI6MjA4ODU1MzExNX0.v11kHHpM1IsK6q81909CYkWgX5TdV8kJhCkNqSEs5QM";
const BASE = `https://${PROJECT_ID}.supabase.co/functions/v1/make-server-283d8046`;

const NAMES_TO_CHECK = [
  "Eternity Church",
  "New Hope Assembly of God",
  "New Hope Assembly of God Church",
];

async function main() {
  console.log("Fetching Iowa churches from API...\n");

  const res = await fetch(`${BASE}/churches/IA`, {
    headers: { Accept: "application/json", Authorization: `Bearer ${ANON_KEY}` },
  });
  if (!res.ok) {
    console.error("Churches API error:", res.status, await res.text());
    process.exit(1);
  }
  const data = await res.json();
  const churches = data.churches || [];
  console.log(`Total Iowa churches in response: ${churches.length}\n`);

  const approvedRes = await fetch(`${BASE}/suggestions/approved/IA`, {
    headers: { Accept: "application/json", Authorization: `Bearer ${ANON_KEY}` },
  });
  const approved = approvedRes.ok ? (await approvedRes.json()).corrections || {} : {};
  const approvedIds = Object.keys(approved);
  console.log(`Approved suggestions (IA) church IDs: ${approvedIds.length}\n`);

  function norm(s) {
    return (s || "").toLowerCase().replace(/\s+/g, " ").trim();
  }
  const wantSet = new Set(NAMES_TO_CHECK.map(norm));

  const found = churches.filter((c) => {
    const n = norm(c.name);
    return NAMES_TO_CHECK.some((w) => n.includes(norm(w)) || norm(w).includes(n));
  });

  if (found.length === 0) {
    const byName = churches.filter((c) =>
      wantSet.has(norm(c.name)) ||
      NAMES_TO_CHECK.some((w) => norm(c.name).includes(norm(w)) || norm(w).includes(norm(c.name)))
    );
    const partial = churches.filter((c) => {
      const n = norm(c.name);
      return n.includes("eternity") || n.includes("new hope");
    });
    console.log("No exact matches. Churches with 'eternity' or 'new hope' in name:");
    partial.forEach((c) => {
      console.log(`  - id: ${c.id}, name: "${c.name}", serviceTimes: ${JSON.stringify(c.serviceTimes ?? null)}`);
    });
    if (partial.length === 0) {
      console.log("  (none found)");
      console.log("\nSample of first 5 Iowa church names:");
      churches.slice(0, 5).forEach((c) => console.log(`  - "${c.name}"`));
    }
  } else {
    found.forEach((c) => {
      const hasServiceTimes = c.serviceTimes != null && String(c.serviceTimes).trim() !== "";
      const suggestionServiceTimes = approved[c.id]?.serviceTimes;
      console.log(`Church: "${c.name}"`);
      console.log(`  id: ${c.id}`);
      console.log(`  serviceTimes (in list): ${JSON.stringify(c.serviceTimes ?? null)} ${hasServiceTimes ? "(present)" : "(missing)"}`);
      console.log(`  approved suggestion serviceTimes: ${suggestionServiceTimes != null ? JSON.stringify(suggestionServiceTimes) : "(none)"}`);
      console.log("");
    });
  }

  console.log("Done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

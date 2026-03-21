#!/usr/bin/env node
/**
 * Generates public/sitemap.xml with homepage, state URLs, reports hub,
 * national report URLs, section URLs for the latest report only, and
 * state-scoped report URLs for the latest slug × all states.
 *
 * Uses GET /reports at build time when the API is reachable; otherwise
 * logs a warning and omits report URLs (homepage + states still emitted).
 *
 * Env (optional):
 *   HMC_FUNCTIONS_BASE_URL — e.g. https://PROJECT.supabase.co/functions/v1/make-server-283d8046
 *   HMC_SUPABASE_ANON_KEY — Supabase anon key (same as client; public)
 */
import { writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const BASE = "https://heresmychurch.com";

const DEFAULT_API_BASE =
  "https://epufchwxofsyuictfufy.supabase.co/functions/v1/make-server-283d8046";
const DEFAULT_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVwdWZjaHd4b2ZzeXVpY3RmdWZ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI5NzcxMTUsImV4cCI6MjA4ODU1MzExNX0.v11kHHpM1IsK6q81909CYkWgX5TdV8kJhCkNqSEs5QM";

/** Must stay in sync with REPORT_SECTIONS ids in src/app/components/report/useReportScrollspy.ts */
const REPORT_SECTION_IDS = [
  "big-picture",
  "trending",
  "data-quality",
  "geo-density",
  "denominations",
  "diversity",
  "spotlights",
  "takeaways",
  "state-rankings",
  "state-summaries",
  "how-we-compare",
  "contribute",
  "common-questions",
];

// State abbreviations matching map-constants STATE_BOUNDS (50 states + DC)
const STATE_ABBREVS = [
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA",
  "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD",
  "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ",
  "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC",
  "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY",
  "DC",
];

function pickLatestSlug(reports) {
  if (!reports.length) return null;
  const sorted = [...reports].sort(
    (a, b) => new Date(b.generatedAt).getTime() - new Date(a.generatedAt).getTime(),
  );
  return sorted[0]?.slug ?? null;
}

async function fetchReportList(apiBase, headers) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 20000);
  try {
    const res = await fetch(`${apiBase}/reports`, { headers, signal: controller.signal });
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [];
  } finally {
    clearTimeout(t);
  }
}

async function main() {
  const apiBase = (process.env.HMC_FUNCTIONS_BASE_URL ?? DEFAULT_API_BASE).replace(/\/$/, "");
  const anonKey = process.env.HMC_SUPABASE_ANON_KEY ?? DEFAULT_ANON_KEY;
  const headers = {
    Authorization: `Bearer ${anonKey}`,
    apikey: anonKey,
    "Content-Type": "application/json",
  };

  const now = new Date().toISOString().slice(0, 10);

  const urls = [
    { loc: `${BASE}/`, changefreq: "weekly", priority: "1.0" },
    { loc: `${BASE}/llms.txt`, changefreq: "monthly", priority: "0.3" },
    { loc: `${BASE}/reports`, changefreq: "weekly", priority: "0.85" },
    ...STATE_ABBREVS.map((abbrev) => ({
      loc: `${BASE}/state/${abbrev}`,
      changefreq: "weekly",
      priority: "0.8",
    })),
  ];

  const reports = await fetchReportList(apiBase, headers);
  if (!Array.isArray(reports) || reports.length === 0) {
    console.warn(
      "generate-sitemap: could not load /reports (network or empty). Sitemap will omit report URLs.",
    );
  } else {
    const slugs = [...new Set(reports.map((r) => r?.slug).filter(Boolean))];
    for (const slug of slugs) {
      urls.push({
        loc: `${BASE}/report/${encodeURIComponent(slug)}`,
        changefreq: "monthly",
        priority: "0.9",
      });
    }

    const latestSlug = pickLatestSlug(reports);
    if (latestSlug) {
      for (const sectionId of REPORT_SECTION_IDS) {
        urls.push({
          loc: `${BASE}/report/${encodeURIComponent(latestSlug)}/${encodeURIComponent(sectionId)}`,
          changefreq: "monthly",
          priority: "0.75",
        });
      }
      for (const abbrev of STATE_ABBREVS) {
        urls.push({
          loc: `${BASE}/report/state/${abbrev}/${encodeURIComponent(latestSlug)}`,
          changefreq: "monthly",
          priority: "0.7",
        });
      }
    }
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
  .map(
    (u) => `  <url>
    <loc>${u.loc}</loc>
    <lastmod>${now}</lastmod>
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>
  </url>`,
  )
  .join("\n")}
</urlset>
`;

  const outPath = join(__dirname, "..", "public", "sitemap.xml");
  writeFileSync(outPath, xml, "utf8");
  console.log("Wrote", outPath, `(${urls.length} URLs)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

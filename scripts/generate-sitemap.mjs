#!/usr/bin/env node
/**
 * Generates sitemap index + core/metro/church sitemaps under public/.
 *
 * - public/sitemap.xml — sitemap index
 * - public/sitemaps/core.xml — homepage, countries, regions, reports, privacy
 * - public/sitemaps/metros.xml — /metro + /metro/{slug}
 * - public/sitemaps/churches-{CC}-{REGION}.xml — church deep links (US by default)
 *
 * Also syncs netlify/edge-functions/lib/us-metros.generated.ts from src/app/data/us-metros.json.
 *
 * Env (optional):
 *   HMC_FUNCTIONS_BASE_URL — e.g. https://PROJECT.supabase.co/functions/v1/make-server-283d8046
 *   HMC_SUPABASE_ANON_KEY — Supabase anon key (same as client; public)
 *   HMC_SITEMAP_CHURCHES=all — include non-US region church URLs (slower builds)
 */
import { writeFileSync, readFileSync, mkdirSync, rmSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const BASE = "https://heresmychurch.com";
const PUBLIC = join(__dirname, "..", "public");
const SITEMAPS_DIR = join(PUBLIC, "sitemaps");

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

const STATE_ABBREVS = [
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA",
  "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD",
  "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ",
  "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC",
  "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY",
  "DC",
];

const FETCH_CONCURRENCY = 10;

function loadIntlCountries() {
  const src = readFileSync(
    join(__dirname, "..", "netlify", "edge-functions", "lib", "intl-country-meta.generated.ts"),
    "utf8",
  );
  const m = src.match(/INTL_COUNTRY_META[\s\S]*?=\s*(\{[\s\S]*\});?\s*$/);
  if (!m) throw new Error("Could not parse intl-country-meta.generated.ts");
  const meta = JSON.parse(m[1]);
  return Object.fromEntries(
    Object.entries(meta).map(([cc, v]) => [cc, Object.keys(v.regions || {})]),
  );
}

function loadUsMetros() {
  return JSON.parse(
    readFileSync(join(__dirname, "..", "src", "app", "data", "us-metros.json"), "utf8"),
  );
}

/** Keep Netlify edge og-rewrite metro list in sync with src/app/data/us-metros.json */
function syncEdgeUsMetros(metros) {
  const edgeLib = join(__dirname, "..", "netlify", "edge-functions", "lib");
  writeFileSync(join(edgeLib, "us-metros.json"), JSON.stringify(metros, null, 2) + "\n", "utf8");
  writeFileSync(
    join(edgeLib, "us-metros.generated.ts"),
    `// GENERATED from src/app/data/us-metros.json — do not edit by hand.
export type UsMetroSeo = {
  id: string;
  name: string;
  region: string;
  lat: number;
  lng: number;
  radiusKm: number;
};
export const US_METROS_FOR_SEO: UsMetroSeo[] = ${JSON.stringify(metros, null, 2)};
`,
    "utf8",
  );
}

function metroSlug(id) {
  return String(id).replace(/^us-/, "");
}

function pickLatestSlug(reports) {
  if (!reports.length) return null;
  const sorted = [...reports].sort(
    (a, b) => new Date(b.generatedAt).getTime() - new Date(a.generatedAt).getTime(),
  );
  return sorted[0]?.slug ?? null;
}

async function fetchReportList(apiBase, headers, country = "US") {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 20000);
  try {
    const q = country ? `?country=${encodeURIComponent(country)}` : "";
    const res = await fetch(`${apiBase}/reports${q}`, { headers, signal: controller.signal });
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [];
  } finally {
    clearTimeout(t);
  }
}

async function fetchJson(apiBase, headers, path, timeoutMs = 20000) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${apiBase}${path}`, { headers, signal: controller.signal });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

async function fetchRegionChurches(apiBase, headers, region) {
  const data = await fetchJson(apiBase, headers, `/churches/${encodeURIComponent(region)}`, 45000);
  return Array.isArray(data?.churches) ? data.churches : [];
}

/**
 * Regions to include in church URL sitemaps.
 * Default: US only (build-time + crawl budget). Set HMC_SITEMAP_CHURCHES=all for intl too.
 */
async function listPopulatedRegions(apiBase, headers, intlCountries) {
  /** @type {{ cc: string, region: string }[]} */
  const out = [];
  const statesData = await fetchJson(apiBase, headers, "/churches/states");
  const states = Array.isArray(statesData?.states) ? statesData.states : [];
  for (const s of states) {
    if (s?.isPopulated && s?.abbrev) out.push({ cc: "US", region: String(s.abbrev).toUpperCase() });
  }
  // Fallback if states endpoint failed: try all US abbrevs
  if (!out.length) {
    for (const region of STATE_ABBREVS) out.push({ cc: "US", region });
  }

  const includeIntl = (process.env.HMC_SITEMAP_CHURCHES || "us").toLowerCase() === "all";
  if (!includeIntl) return out;

  const countriesData = await fetchJson(apiBase, headers, "/churches/countries");
  const countries = Array.isArray(countriesData?.countries) ? countriesData.countries : [];
  const populatedCc = new Set(
    countries.filter((c) => c?.isPopulated && c?.code && c.code !== "US").map((c) => String(c.code).toUpperCase()),
  );
  for (const cc of Object.keys(intlCountries)) {
    if (populatedCc.size > 0 && !populatedCc.has(cc)) continue;
    const data = await fetchJson(apiBase, headers, `/churches/regions/${encodeURIComponent(cc)}`);
    const regions = Array.isArray(data?.regions) ? data.regions : [];
    for (const r of regions) {
      if (r?.isPopulated && r?.abbrev) out.push({ cc, region: String(r.abbrev).toUpperCase() });
    }
  }
  return out;
}

async function mapPool(items, concurrency, fn) {
  const results = new Array(items.length);
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      results[idx] = await fn(items[idx], idx);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()));
  return results;
}

function urlsetXml(urls, now) {
  return `<?xml version="1.0" encoding="UTF-8"?>
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
}

function sitemapIndexXml(entries, now) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries
  .map(
    (loc) => `  <sitemap>
    <loc>${loc}</loc>
    <lastmod>${now}</lastmod>
  </sitemap>`,
  )
  .join("\n")}
</sitemapindex>
`;
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
  const INTL_COUNTRIES = loadIntlCountries();
  const US_METROS = loadUsMetros();
  syncEdgeUsMetros(US_METROS);

  mkdirSync(SITEMAPS_DIR, { recursive: true });
  // Clear previous church sitemaps so stale regions disappear
  try {
    rmSync(SITEMAPS_DIR, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
  mkdirSync(SITEMAPS_DIR, { recursive: true });

  const coreUrls = [
    { loc: `${BASE}/`, changefreq: "weekly", priority: "1.0" },
    { loc: `${BASE}/world`, changefreq: "weekly", priority: "0.9" },
    { loc: `${BASE}/US`, changefreq: "weekly", priority: "0.95" },
    { loc: `${BASE}/llms.txt`, changefreq: "monthly", priority: "0.3" },
    { loc: `${BASE}/reports`, changefreq: "weekly", priority: "0.85" },
    { loc: `${BASE}/privacy`, changefreq: "yearly", priority: "0.4" },
    ...STATE_ABBREVS.map((abbrev) => ({
      loc: `${BASE}/US/${abbrev}`,
      changefreq: "weekly",
      priority: "0.8",
    })),
    ...Object.entries(INTL_COUNTRIES).flatMap(([cc, regions]) => [
      { loc: `${BASE}/${cc}`, changefreq: "weekly", priority: "0.85" },
      ...regions.map((abbrev) => ({
        loc: `${BASE}/${cc}/${abbrev}`,
        changefreq: "weekly",
        priority: "0.75",
      })),
    ]),
  ];

  const reports = await fetchReportList(apiBase, headers, "US");
  if (!Array.isArray(reports) || reports.length === 0) {
    console.warn(
      "generate-sitemap: could not load /reports (network or empty). Sitemap will omit report URLs.",
    );
  } else {
    const slugs = [...new Set(reports.map((r) => r?.slug).filter(Boolean))];
    for (const slug of slugs) {
      coreUrls.push({
        loc: `${BASE}/report/${encodeURIComponent(slug)}`,
        changefreq: "monthly",
        priority: "0.9",
      });
    }
    const latestSlug = pickLatestSlug(reports);
    if (latestSlug) {
      for (const sectionId of REPORT_SECTION_IDS) {
        coreUrls.push({
          loc: `${BASE}/report/${encodeURIComponent(latestSlug)}/${encodeURIComponent(sectionId)}`,
          changefreq: "monthly",
          priority: "0.75",
        });
      }
      for (const abbrev of STATE_ABBREVS) {
        coreUrls.push({
          loc: `${BASE}/report/state/${abbrev}/${encodeURIComponent(latestSlug)}`,
          changefreq: "monthly",
          priority: "0.7",
        });
      }
    }
  }

  const worldReports = await fetchReportList(apiBase, headers, "WORLD");
  if (Array.isArray(worldReports)) {
    for (const r of worldReports) {
      if (!r?.slug) continue;
      coreUrls.push({
        loc: `${BASE}/report/WORLD/${encodeURIComponent(r.slug)}`,
        changefreq: "monthly",
        priority: "0.88",
      });
    }
  }
  for (const cc of Object.keys(INTL_COUNTRIES)) {
    const countryReports = await fetchReportList(apiBase, headers, cc);
    if (!Array.isArray(countryReports)) continue;
    for (const r of countryReports) {
      if (!r?.slug) continue;
      coreUrls.push({
        loc: `${BASE}/report/${cc}/${encodeURIComponent(r.slug)}`,
        changefreq: "monthly",
        priority: "0.85",
      });
    }
  }

  writeFileSync(join(SITEMAPS_DIR, "core.xml"), urlsetXml(coreUrls, now), "utf8");

  const metroUrls = [
    { loc: `${BASE}/metro`, changefreq: "weekly", priority: "0.85" },
    ...US_METROS.map((m) => ({
      loc: `${BASE}/metro/${metroSlug(m.id)}`,
      changefreq: "weekly",
      priority: "0.8",
    })),
  ];
  writeFileSync(join(SITEMAPS_DIR, "metros.xml"), urlsetXml(metroUrls, now), "utf8");

  const regionsToFetch = await listPopulatedRegions(apiBase, headers, INTL_COUNTRIES);

  console.log(`generate-sitemap: fetching churches for ${regionsToFetch.length} populated regions…`);
  const churchSitemapFiles = [];
  let churchUrlCount = 0;

  await mapPool(regionsToFetch, FETCH_CONCURRENCY, async ({ cc, region }) => {
    const churches = await fetchRegionChurches(apiBase, headers, region);
    const urls = churches
      .filter((c) => c?.shortId != null && /^\d+$/.test(String(c.shortId)))
      .map((c) => ({
        loc: `${BASE}/${cc}/${region}/${c.shortId}`,
        changefreq: "monthly",
        priority: "0.5",
      }));
    if (!urls.length) return;
    const fileName = `churches-${cc}-${region}.xml`;
    writeFileSync(join(SITEMAPS_DIR, fileName), urlsetXml(urls, now), "utf8");
    churchSitemapFiles.push(fileName);
    churchUrlCount += urls.length;
  });

  churchSitemapFiles.sort();

  const indexEntries = [
    `${BASE}/sitemaps/core.xml`,
    `${BASE}/sitemaps/metros.xml`,
    ...churchSitemapFiles.map((f) => `${BASE}/sitemaps/${f}`),
  ];
  writeFileSync(join(PUBLIC, "sitemap.xml"), sitemapIndexXml(indexEntries, now), "utf8");

  console.log(
    `Wrote sitemap index (${indexEntries.length} sitemaps): core=${coreUrls.length}, metros=${metroUrls.length}, churches=${churchUrlCount}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

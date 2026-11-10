/**
 * Rewrite HTML meta tags for social crawlers so map pages and church deep links have initial HTML,
 * structured data, and correct og:image/title/url for every visitor. Legacy /state/* and /country/*
 * paths are still recognized.
 *
 * Called by the site Worker (worker/index.ts).
 *
 * Optional env:
 *   HMC_API_BASE_URL - API base, e.g. https://api.heresmychurch.com
 */
import { INTL_COUNTRY_META } from "./lib/intl-country-meta.generated.ts";
import { US_METROS_FOR_SEO } from "./lib/us-metros.generated.ts";

import { MAP_STARTUP_HEAD, MAP_STARTUP_BODY } from "./map-startup";
import { churchMarkdown, churchTitle, churchDescription, churchSchema, schemaJson, verifiedDate, webUrl, PROFILE_SCHEMA_ID, type ChurchProfile, type ChurchPlace } from "../shared/church-profile";

export type OgRewriteEnv = {
  HMC_API_BASE_URL?: string;
};

const DEFAULT_API_BASE_URL = "https://api.heresmychurch.com";

/** Search, social, preview, and AI/answer-engine crawlers — match og:image + crawlable HTML for bots only. */
const BOT_UA_PATTERNS = [
  "Twitterbot",
  "facebookexternalhit",
  "LinkedInBot",
  "Slackbot",
  "Discordbot",
  "WhatsApp",
  "TelegramBot",
  "Pinterest",
  "Applebot",
  "Googlebot",
  "bingbot",
  "Slurp",
  "DuckDuckBot",
  "Baiduspider",
  "YandexBot",
  "facebot",
  "ia_archiver",
  // LLM / AI crawlers & answer engines (AEO)
  "GPTBot",
  "ChatGPT-User",
  "OAI-SearchBot",
  "Claude-Web",
  "ClaudeBot",
  "Claude-SearchBot",
  "Claude-User",
  "anthropic-ai",
  "PerplexityBot",
  "Google-Extended",
  "Amazonbot",
  "Bytespider",
  "CCBot",
  "cohere-ai",
  "Meta-ExternalAgent",
  "FacebookBot",
];

const STATE_NAMES: Record<string, string> = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California",
  CO: "Colorado", CT: "Connecticut", DE: "Delaware", FL: "Florida", GA: "Georgia",
  HI: "Hawaii", ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa", KS: "Kansas",
  KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland", MA: "Massachusetts",
  MI: "Michigan", MN: "Minnesota", MS: "Mississippi", MO: "Missouri", MT: "Montana",
  NE: "Nebraska", NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey", NM: "New Mexico",
  NY: "New York", NC: "North Carolina", ND: "North Dakota", OH: "Ohio", OK: "Oklahoma",
  OR: "Oregon", PA: "Pennsylvania", RI: "Rhode Island", SC: "South Carolina", SD: "South Dakota",
  TN: "Tennessee", TX: "Texas", UT: "Utah", VT: "Vermont", VA: "Virginia", WA: "Washington",
  WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming", DC: "District of Columbia",
};

const COUNTRY_META: Record<string, { name: string; regions: Record<string, string> }> = {
  US: { name: "United States", regions: STATE_NAMES },
  ...INTL_COUNTRY_META,
};

const SITE_URL = "https://heresmychurch.com";
const DEFAULT_DESCRIPTION = "An interactive map of Christian churches worldwide. Find your church or find a new church. 100% free and crowd-sourced.";
const REPORT_SECTION_LABELS: Record<string, string> = {
  "big-picture": "The Big Picture",
  trending: "Trending",
  "data-quality": "Data Quality",
  "geo-density": "Where Are the Churches?",
  denominations: "Denomination Landscape",
  diversity: "Language & Diversity",
  spotlights: "Church Spotlights",
  takeaways: "Takeaways",
  "state-rankings": "State Rankings",
  "how-we-compare": "How We Compare",
  "state-summaries": "State Summaries",
  contribute: "Contribute",
  "common-questions": "Common Questions",
};

function isBot(userAgent: string): boolean {
  const ua = userAgent || "";
  return BOT_UA_PATTERNS.some((p) => ua.includes(p));
}

function getStateName(abbrev: string): string {
  return STATE_NAMES[abbrev.toUpperCase()] ?? abbrev;
}

interface OgMeta {
  title: string;
  description: string;
  image: string;
  url: string;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Crawlable HTML inside #root for bots only (no-JS). Mirrors key report copy for SEO/AEO. */
function buildReportSeoArticle(
  data: {
    title?: string;
    subtitle?: string;
    stateName?: string;
    countryCode?: string;
    bigPicture?: { totalChurches?: number; statesPopulated?: number };
  },
  pageUrl: string,
  isStateReport: boolean,
  stateAbbrev?: string,
  countryCode?: string,
): string {
  const title = data.title ?? "Seasonal report";
  const subtitle = (data.subtitle ?? "").trim();
  const total = data.bigPicture?.totalChurches ?? 0;
  const statesPopulated = data.bigPicture?.statesPopulated ?? 0;
  const stateName = (data.stateName ?? stateAbbrev ?? "").trim();
  const cc = String(countryCode || data.countryCode || "US").toUpperCase();
  const heading =
    isStateReport && stateName ? `Churches in ${stateName}: ${title}` : title;
  const totalStr = total.toLocaleString("en-US");
  const unitLabel =
    cc === "WORLD" ? "countries" : isStateReport ? "counties" : cc === "US" ? "states" : "regions";
  const scopeLead =
    cc === "WORLD"
      ? "Worldwide"
      : cc === "US"
        ? "Nationwide"
        : subtitle
          ? "On this map"
          : "Across this map";
  const lead = isStateReport
    ? `${subtitle ? `${subtitle} ` : ""}This snapshot covers ${totalStr} churches mapped on Here's My Church${
        stateName ? ` in ${stateName}` : ""
      }.`
    : `${subtitle ? `${subtitle} ` : ""}${scopeLead}, ${totalStr} churches across ${statesPopulated} ${unitLabel} are represented on the map.`;
  return `<article class="hmc-report-seo-summary" style="padding:1.5rem;font-family:system-ui,sans-serif;max-width:42rem;line-height:1.5;color:#1c1917">
<h1 style="font-size:1.375rem;margin:0 0 0.75rem;line-height:1.25">${escapeHtml(heading)}</h1>
<p style="margin:0 0 1rem;color:#44403c;font-size:0.9375rem">${escapeHtml(lead)}</p>
<p style="margin:0;font-size:0.9375rem"><a href="${escapeAttr(pageUrl)}">Open the full interactive report on Here's My Church</a></p>
</article>`;
}

function buildReportsHubSeoArticle(
  list: Array<{ slug?: string; title?: string; totalChurches?: number; generatedAt?: string }>,
): string {
  const sorted = [...list].sort(
    (a, b) =>
      new Date(b.generatedAt ?? 0).getTime() - new Date(a.generatedAt ?? 0).getTime(),
  );
  const items = sorted
    .filter((r) => r.slug)
    .map((r) => {
      const href = `${SITE_URL}/report/${encodeURIComponent(String(r.slug))}`;
      const count =
        typeof r.totalChurches === "number" ? r.totalChurches.toLocaleString("en-US") : "—";
      return `<li style="margin:0.35rem 0"><a href="${escapeAttr(href)}">${escapeHtml(
        String(r.title ?? r.slug),
      )}</a> — ${count} churches mapped</li>`;
    })
    .join("");
  return `<article class="hmc-reports-hub-seo" style="padding:1.5rem;font-family:system-ui,sans-serif;max-width:42rem;line-height:1.5;color:#1c1917">
<h1 style="font-size:1.375rem;margin:0 0 0.75rem">Here's My Church — seasonal reports</h1>
<p style="margin:0 0 1rem;color:#44403c;font-size:0.9375rem">Data snapshots from the crowd-sourced church map: coverage, denominations, geography, and more.</p>
<ul style="margin:0;padding-left:1.25rem">${items}</ul>
<p style="margin:1rem 0 0;font-size:0.875rem;color:#78716c">Open this site in a browser for interactive maps, state-level reports, and charts.</p>
</article>`;
}

type SeoChurch = ChurchProfile;

const REGION_SEO_LIST_LIMIT = 40;

function churchPath(cc: string, region: string, shortId: string | number): string {
  return `${SITE_URL}/${cc}/${region}/${shortId}`;
}

/** Crawlable HTML for a region map page (bots / no-JS). */
function buildRegionSeoArticle(
  regionName: string,
  countryName: string,
  mapCc: string,
  mapRegion: string,
  churches: SeoChurch[],
  pageUrl: string,
): string {
  const sorted = [...churches]
    .filter((c) => c.shortId != null && /^\d+$/.test(String(c.shortId)))
    .sort((a, b) => (Number(b.attendance) || 0) - (Number(a.attendance) || 0))
    .slice(0, REGION_SEO_LIST_LIMIT);
  const total = churches.length;
  const placeLabel = mapCc === "US" ? regionName : `${regionName}, ${countryName}`;
  const items = sorted
    .map((c) => {
      const href = churchPath(mapCc, mapRegion, String(c.shortId));
      const bits = [c.city, c.denomination].filter(Boolean).join(" · ");
      return `<li style="margin:0.35rem 0"><a href="${escapeAttr(href)}">${escapeHtml(
        String(c.name ?? "Church"),
      )}</a>${bits ? ` — ${escapeHtml(bits)}` : ""}</li>`;
    })
    .join("");
  const more =
    total > sorted.length
      ? `<p style="margin:0.75rem 0 0;font-size:0.875rem;color:#78716c">Showing ${sorted.length} of ${total.toLocaleString("en-US")} churches. Open the map for the full list.</p>`
      : "";
  return `<article class="hmc-region-seo" style="padding:1.5rem;font-family:system-ui,sans-serif;max-width:42rem;line-height:1.5;color:#1c1917">
<h1 style="font-size:1.375rem;margin:0 0 0.75rem;line-height:1.25">Churches in ${escapeHtml(placeLabel)}</h1>
<p style="margin:0 0 1rem;color:#44403c;font-size:0.9375rem">${total.toLocaleString("en-US")} Christian churches mapped on Here's My Church${
    total ? " — a free, crowd-sourced directory." : "."
  }</p>
${items ? `<ul style="margin:0;padding-left:1.25rem">${items}</ul>${more}` : ""}
<p style="margin:1rem 0 0;font-size:0.9375rem"><a href="${escapeAttr(pageUrl)}">Open the interactive map for ${escapeHtml(placeLabel)}</a></p>
</article>`;
}

/** The same readable initial profile is delivered to visitors and crawlers. */
export function buildChurchSeoArticle(church: SeoChurch, regionName: string, countryName: string,
  mapCc: string, mapRegion: string, pageUrl: string): string {
  const p: ChurchPlace = { cc: mapCc, region: mapRegion, regionName, countryName, url: pageUrl };
  const name = church.name || "Church";
  const section = (title: string, text?: string) => text ? `<section><h2>${escapeHtml(title)}</h2><p>${escapeHtml(text)}</p></section>` : "";
  const website = webUrl(church.website);
  const date = verifiedDate(church);
  const location = [church.address, church.city, regionName, countryName].filter(Boolean).join(", ");
  const maps = Number.isFinite(church.lat) && Number.isFinite(church.lng)
    ? `https://www.google.com/maps/search/?api=1&query=${church.lat},${church.lng}` : null;
  return `<article class="hmc-church-seo">
<nav aria-label="Breadcrumb"><a href="/world">World</a> / <a href="/${mapCc}">${escapeHtml(countryName)}</a> / <a href="/${mapCc}/${mapRegion}">${escapeHtml(regionName)}</a></nav>
<h1>${escapeHtml(name)}</h1><p>${escapeHtml(churchDescription(church, p))}</p>
${church.listingStatus === "pending_reverify" ? '<p role="status">This location needs re-verification following a reported relocation. Confirm the current location before visiting.</p>' : ""}
${section(`Where is ${name}?`, location)}
${maps ? `<p><a href="${escapeAttr(maps)}">Get directions</a></p>` : ""}
${section("When are the services?", church.serviceTimes || "Service times have not been listed. Check with the church before visiting.")}
${section("Tradition", church.denomination)}
${section("Languages", church.languages?.join(", "))}
${section("Ministries", church.ministries?.join(", "))}
${section("Pastor", church.pastorName)}
${section("Phone", church.phone)}${section("Email", church.email)}
${website ? `<p><a href="${escapeAttr(website)}" rel="noopener noreferrer">Visit the church website</a></p>` : ""}
${section("Estimated attendance", Number.isFinite(church.attendance) && church.attendance! > 0 ? "Attendance figures on the interactive map are estimates, not verified attendance counts." : undefined)}
<footer><p>Source: <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> and community contributions. Details may change; confirm service times with the church.${date ? ` Last community verification or correction: <time datetime="${date}">${date}</time>.` : " No community verification date is recorded."}</p>
<a href="/${mapCc}/${mapRegion}">More churches in ${escapeHtml(regionName)}</a> · <a href="/${mapCc}">Churches in ${escapeHtml(countryName)}</a></footer></article>`;
}

export async function rewriteForBots(
  request: Request,
  next: () => Promise<Response>,
  env: OgRewriteEnv = {},
): Promise<Response> {
  const userAgent = request.headers.get("user-agent") ?? "";
  const url = new URL(request.url);
  // Map landing pages and profiles render initial HTML for everyone, without UA-dependent content.
  const isMapPage = /^\/[A-Z]{2}(?:\/|$)/.test(url.pathname) && !!COUNTRY_META[url.pathname.split("/")[1]];
  if (!isMapPage && !isBot(userAgent)) return next();
  const markdownProfile = /\/[A-Z]{2}\/[^/]+\/[^/]+\.md$/.test(url.pathname);
  const path = markdownProfile ? url.pathname.slice(0, -3) : url.pathname;
  const pathParts = path.split("/").filter(Boolean); // ["state", "CA"] or ["state", "CA", "16692500"]

  const apiBase = (env.HMC_API_BASE_URL || DEFAULT_API_BASE_URL).replace(
    /\/$/,
    "",
  );
  const apiHeaders: Record<string, string> = { "Content-Type": "application/json" };

  let meta: OgMeta = {
    title: "Here's My Church",
    description: DEFAULT_DESCRIPTION,
    image: `${SITE_URL}/og-image.png?v=20261110-about`,
    url: SITE_URL,
  };

  let seoRootArticle: string | null = null;
  let profileSchema: Record<string, unknown> | null = null;
  let pageStatus: number | undefined;

  // Reports hub — /reports
  if (pathParts[0] === "reports" && pathParts.length === 1) {
    meta = {
      title: "Reports & data — Here's My Church",
      description:
        "Seasonal snapshots of mapped churches, denominations, geography, and data quality on Here's My Church — free and crowd-sourced.",
      image: `${SITE_URL}/og-report.png`,
      url: `${SITE_URL}/reports`,
    };
    try {
      const res = await fetch(`${apiBase}/reports`, { headers: apiHeaders });
      if (res.ok) {
        const list = await res.json();
        if (Array.isArray(list) && list.length) {
          seoRootArticle = buildReportsHubSeoArticle(list);
        }
      }
    } catch (_) {
      // keep meta; optional article omitted
    }
  }

  // Report pages — US national, country/WORLD, and US state
  if (pathParts[0] === "report" && pathParts[1]) {
    const isStateReport = pathParts[1] === "state" && !!pathParts[2] && !!pathParts[3];
    const stateAbbrev = isStateReport ? pathParts[2].toUpperCase() : undefined;
    const seasonSlugRe = /^[a-z]+-\d{4}$/;
    const countryParam = !isStateReport ? pathParts[1].toUpperCase() : undefined;
    const isCountryReport =
      !isStateReport &&
      !!countryParam &&
      (countryParam === "WORLD" || /^[A-Z]{2}$/.test(countryParam)) &&
      !!pathParts[2] &&
      seasonSlugRe.test(pathParts[2]);
    const slug = isStateReport
      ? pathParts[3]
      : isCountryReport
        ? pathParts[2]
        : pathParts[1];
    const sectionId = isStateReport
      ? pathParts[4]
      : isCountryReport
        ? pathParts[3]
        : pathParts[2];
    const sectionLabel = sectionId ? REPORT_SECTION_LABELS[sectionId] : undefined;
    try {
      const apiPath = isStateReport
        ? `${apiBase}/report/state/${encodeURIComponent(stateAbbrev!)}/${slug}`
        : isCountryReport
          ? `${apiBase}/report/${encodeURIComponent(countryParam!)}/${slug}`
          : `${apiBase}/report/${slug}`;
      const res = await fetch(apiPath, { headers: apiHeaders });
      if (res.ok) {
        const data = await res.json();
        const reportName = data.title ?? "Report";
        const cc = String(data.countryCode || (isCountryReport ? countryParam : "US")).toUpperCase();
        const isUsNational =
          !isStateReport &&
          cc === "US" &&
          (data.season === "launch" || String(slug).startsWith("launch-"));
        let title = sectionLabel
          ? `${sectionLabel} — ${reportName} — Here's My Church`
          : `${reportName} — Here's My Church`;
        if (isUsNational) title = `U.S. ${title}`;
        const unitLabel =
          cc === "WORLD" ? "countries" : isStateReport ? "counties" : "regions";
        const desc = sectionLabel
          ? `${sectionLabel} — from ${data.title ?? "Report"}.`
          : data.subtitle
            ? `${data.subtitle} — ${(data.bigPicture?.totalChurches ?? 0).toLocaleString()} churches across ${data.bigPicture?.statesPopulated ?? 0} ${unitLabel}.`
            : DEFAULT_DESCRIPTION;
        const pageUrl = isStateReport
          ? (sectionLabel
              ? `${SITE_URL}/report/state/${stateAbbrev}/${slug}/${sectionId}`
              : `${SITE_URL}/report/state/${stateAbbrev}/${slug}`)
          : isCountryReport && cc !== "US"
            ? (sectionLabel
                ? `${SITE_URL}/report/${cc}/${slug}/${sectionId}`
                : `${SITE_URL}/report/${cc}/${slug}`)
            : (sectionLabel
                ? `${SITE_URL}/report/${slug}/${sectionId}`
                : `${SITE_URL}/report/${slug}`);
        meta = {
          title,
          description: desc,
          image: `${SITE_URL}/og-report.png`,
          url: pageUrl,
        };
        seoRootArticle = buildReportSeoArticle(data, meta.url, !!isStateReport, stateAbbrev, cc);
      }
    } catch (_) {
      // keep default meta
    }
  }

  if (pathParts[0] === "world") {
    meta = {
      title: "Churches worldwide — Here's My Church",
      description: "Browse Christian churches by country. Explore the United States, Canada, and more as they come online.",
      image: `${SITE_URL}/og-default.png`,
      url: `${SITE_URL}/world`,
    };
  }

  // Metro directory pages — /metro and /metro/{slug}
  if (pathParts[0] === "metro") {
    const metros = US_METROS_FOR_SEO;
    if (pathParts.length === 1) {
      meta = {
        title: "Churches by metro area — Here's My Church",
        description:
          "Browse Christian churches in major U.S. metro areas. Free, crowd-sourced directory with filters for denomination and size.",
        image: `${SITE_URL}/og-default.png`,
        url: `${SITE_URL}/metro`,
      };
      const items = metros
        .map((m) => {
          const slug = m.id.replace(/^us-/, "");
          return `<li style="margin:0.35rem 0"><a href="${SITE_URL}/metro/${escapeAttr(slug)}">${escapeHtml(m.name)}, ${escapeHtml(m.region)}</a></li>`;
        })
        .join("");
      seoRootArticle = `<article class="hmc-metro-index-seo" style="padding:1.5rem;font-family:system-ui,sans-serif;max-width:42rem;line-height:1.5;color:#1c1917">
<h1 style="font-size:1.375rem;margin:0 0 0.75rem">Churches by metro area</h1>
<p style="margin:0 0 1rem;color:#44403c;font-size:0.9375rem">${escapeHtml(meta.description)}</p>
<ul style="margin:0;padding-left:1.25rem">${items}</ul>
</article>`;
    } else if (pathParts[1]) {
      const slug = pathParts[1].toLowerCase();
      const metro = metros.find((m) => m.id.replace(/^us-/, "") === slug || m.id === slug);
      if (metro) {
        const regionName = getStateName(metro.region);
        const pageUrl = `${SITE_URL}/metro/${metro.id.replace(/^us-/, "")}`;
        meta = {
          title: `Churches in ${metro.name}, ${metro.region} — Here's My Church`,
          description: `Find Christian churches near ${metro.name}, ${regionName}. Free and crowd-sourced on Here's My Church.`,
          image: `${apiBase}/og-image?type=state&state=${encodeURIComponent(metro.region)}`,
          url: pageUrl,
        };
        try {
          const res = await fetch(`${apiBase}/churches/${metro.region}`, { headers: apiHeaders });
          let churches: SeoChurch[] = [];
          if (res.ok) {
            const data = await res.json();
            const all: Array<SeoChurch & { lat?: number; lng?: number }> = Array.isArray(data.churches)
              ? data.churches
              : [];
            churches = all.filter((c) => {
              if (c.lat == null || c.lng == null) return false;
              return haversineKm(metro.lat, metro.lng, Number(c.lat), Number(c.lng)) <= metro.radiusKm;
            });
          }
          if (churches.length) {
            meta.description = `${churches.length.toLocaleString("en-US")} Christian churches mapped near ${metro.name}, ${regionName}. Free and crowd-sourced.`;
          }
          const sorted = [...churches]
            .filter((c) => c.shortId != null && /^\d+$/.test(String(c.shortId)))
            .sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")))
            .slice(0, REGION_SEO_LIST_LIMIT);
          const items = sorted
            .map((c) => {
              const href = `${SITE_URL}/US/${metro.region}/${c.shortId}`;
              const bits = [c.city, c.denomination].filter(Boolean).join(" · ");
              return `<li style="margin:0.35rem 0"><a href="${escapeAttr(href)}">${escapeHtml(String(c.name ?? "Church"))}</a>${
                bits ? ` — ${escapeHtml(bits)}` : ""
              }</li>`;
            })
            .join("");
          seoRootArticle = `<article class="hmc-metro-seo" style="padding:1.5rem;font-family:system-ui,sans-serif;max-width:42rem;line-height:1.5;color:#1c1917">
<h1 style="font-size:1.375rem;margin:0 0 0.75rem">Churches in ${escapeHtml(metro.name)}, ${escapeHtml(metro.region)}</h1>
<p style="margin:0 0 1rem;color:#44403c;font-size:0.9375rem">${escapeHtml(meta.description)}</p>
${items ? `<ul style="margin:0;padding-left:1.25rem">${items}</ul>` : ""}
<p style="margin:1rem 0 0;font-size:0.9375rem"><a href="${escapeAttr(pageUrl)}">Open interactive directory</a> · <a href="${SITE_URL}/US/${metro.region}">${escapeHtml(regionName)} map</a></p>
</article>`;
        } catch (_) {
          seoRootArticle = `<article class="hmc-metro-seo" style="padding:1.5rem;font-family:system-ui,sans-serif;max-width:42rem;line-height:1.5;color:#1c1917">
<h1 style="font-size:1.375rem;margin:0 0 0.75rem">Churches in ${escapeHtml(metro.name)}, ${escapeHtml(metro.region)}</h1>
<p style="margin:0;font-size:0.9375rem"><a href="${escapeAttr(pageUrl)}">Open interactive directory</a></p>
</article>`;
        }
      }
    }
  }

  // Normalize legacy + canonical map paths into { cc, region, shortId }.
  let mapCc: string | null = null;
  let mapRegion: string | undefined;
  let mapShortId: string | undefined;
  if (pathParts[0] === "country" && pathParts[1]) {
    mapCc = pathParts[1].toUpperCase();
    mapRegion = pathParts[2]?.toUpperCase();
    mapShortId = pathParts[3];
  } else if (pathParts[0] === "state" && pathParts[1]) {
    mapCc = "US";
    mapRegion = pathParts[1].toUpperCase();
    mapShortId = pathParts[2];
  } else if (pathParts[0] && COUNTRY_META[pathParts[0].toUpperCase()]) {
    mapCc = pathParts[0].toUpperCase();
    mapRegion = pathParts[1]?.toUpperCase();
    mapShortId = pathParts[2];
  }

  if (mapCc) {
    const country = COUNTRY_META[mapCc];
    const countryName = country?.name ?? mapCc;
    if (mapRegion && !country?.regions[mapRegion]) {
      return new Response("Region not found", { status: 404, headers: { "content-type": "text/plain; charset=utf-8" } });
    }
    if (!mapRegion) {
      meta = {
        title: `Churches in ${countryName}`,
        description: `Find Christian churches in ${countryName}. Free and crowd-sourced.`,
        image: `${SITE_URL}/og-default.png`,
        url: `${SITE_URL}/${mapCc}`,
      };
      seoRootArticle = `<article class="hmc-country-seo" style="padding:1.5rem;font-family:system-ui,sans-serif;max-width:42rem;line-height:1.5;color:#1c1917">
<h1 style="font-size:1.375rem;margin:0 0 0.75rem">Churches in ${escapeHtml(countryName)}</h1>
<p style="margin:0 0 1rem;color:#44403c;font-size:0.9375rem">Browse Christian churches by region on Here's My Church — free and crowd-sourced.</p>
<ul>${Object.entries(country?.regions || {}).map(([region, name]) => `<li><a href="/${mapCc}/${region}">Churches in ${escapeHtml(name)}</a></li>`).join("")}</ul>
</article>`;
    } else if (!mapShortId || mapShortId === "county") {
      const regionName = country?.regions[mapRegion] ?? (mapCc === "US" ? getStateName(mapRegion) : mapRegion);
      const pageUrl = `${SITE_URL}/${mapCc}/${mapRegion}`;
      meta = {
        title: `Churches in ${regionName}${mapCc === "US" ? "" : `, ${countryName}`}`,
        description:
          mapCc === "US"
            ? `Find Christian churches in ${regionName}. ${DEFAULT_DESCRIPTION}`
            : `Find Christian churches in ${regionName}, ${countryName}. Free and crowd-sourced.`,
        image: `${apiBase}/og-image?type=state&state=${encodeURIComponent(mapRegion)}`,
        url: pageUrl,
      };
      try {
        const res = await fetch(`${apiBase}/churches/${mapRegion}`, { headers: apiHeaders });
        if (res.ok) {
          const data = await res.json();
          const churches: SeoChurch[] = Array.isArray(data.churches) ? data.churches : [];
          const count = churches.length;
          if (count > 0) {
            meta.description =
              mapCc === "US"
                ? `${count.toLocaleString("en-US")} Christian churches mapped in ${regionName}. Free and crowd-sourced on Here's My Church.`
                : `${count.toLocaleString("en-US")} Christian churches mapped in ${regionName}, ${countryName}. Free and crowd-sourced.`;
          }
          seoRootArticle = buildRegionSeoArticle(
            regionName,
            countryName,
            mapCc,
            mapRegion,
            churches,
            pageUrl,
          );
        } else {
          seoRootArticle = buildRegionSeoArticle(
            regionName,
            countryName,
            mapCc,
            mapRegion,
            [],
            pageUrl,
          );
        }
      } catch (_) {
        seoRootArticle = buildRegionSeoArticle(
          regionName,
          countryName,
          mapCc,
          mapRegion,
          [],
          pageUrl,
        );
      }
    } else {
      const regionName = country?.regions[mapRegion] ?? (mapCc === "US" ? getStateName(mapRegion) : mapRegion);
      const pageUrl = `${SITE_URL}/${mapCc}/${mapRegion}/${encodeURIComponent(mapShortId)}`;
      if (pathParts.length !== 3) return new Response("Church not found", { status: 404 });
      try {
        const oneRes = await fetch(
          `${apiBase}/churches/${mapRegion}/church/${encodeURIComponent(mapShortId)}`,
          { headers: apiHeaders, signal: AbortSignal.timeout(8000) },
        );
        if (!oneRes.ok && oneRes.status !== 404) throw new Error(`Profile API: ${oneRes.status}`);
        const church: SeoChurch | null = oneRes.ok ? (await oneRes.json())?.church ?? null : null;
        if (!church || (church.country && church.country.toUpperCase() !== mapCc)) {
          pageStatus = 404;
          meta = { ...meta, title: "Church not found | Here's My Church", description: "This church listing could not be found.", url: pageUrl };
          seoRootArticle = `<article class="hmc-church-seo"><h1>Church not found</h1><p><a href="/${mapCc}/${mapRegion}">Find churches in ${escapeHtml(regionName)}</a></p></article>`;
        } else {
          const canonicalSegment = String(church.shortId ?? mapShortId);
          const canonicalUrl = `${SITE_URL}/${mapCc}/${mapRegion}/${encodeURIComponent(canonicalSegment)}`;
          if (canonicalUrl !== pageUrl || path.endsWith("/")) {
            return new Response(null, { status: 301, headers: { location: canonicalUrl + (markdownProfile ? ".md" : "") + url.search } });
          }
          const place: ChurchPlace = { cc: mapCc, region: mapRegion, regionName, countryName, url: canonicalUrl };
          const ogParams = new URLSearchParams({ type: "church", name: church.name || "Church", state: mapRegion });
          if (church.city) ogParams.set("city", church.city);
          if (church.denomination) ogParams.set("denomination", church.denomination);
          meta = { title: churchTitle(church, place), description: churchDescription(church, place),
            image: `${apiBase}/og-image?${ogParams}`, url: canonicalUrl };
          if (markdownProfile) return new Response(churchMarkdown(church, place), { headers: {
            "content-type": "text/markdown; charset=utf-8", "x-content-type-options": "nosniff",
            "x-robots-tag": "noindex", link: `<${canonicalUrl}>; rel="canonical", <${SITE_URL}/llms.txt>; rel="describedby"`,
          } });
          profileSchema = churchSchema(church, place);
          seoRootArticle = buildChurchSeoArticle(church, regionName, countryName, mapCc, mapRegion, canonicalUrl);
        }
      } catch (_) {
        // Temporary failures must not look like removed listings to search engines.
        return new Response("Church details are temporarily unavailable. Please try again shortly.", {
          status: 503, headers: { "retry-after": "60", "content-type": "text/plain; charset=utf-8" },
        });
      }
    }
  }

  const response = await next();

  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("text/html")) {
    return response;
  }

  const html = await response.text();

  let out = html;
  out = out.replace(/<meta\s+name="description"\s+content="[^"]*"\s*\/?>/i, () => `<meta name="description" content="${escapeAttr(meta.description)}" />`);
  out = out.replace(/<meta\s+property="og:title"\s+content="[^"]*"\s*\/?>/i, () => `<meta property="og:title" content="${escapeAttr(meta.title)}" />`);
  out = out.replace(/<meta\s+property="og:url"\s+content="[^"]*"\s*\/?>/i, () => `<meta property="og:url" content="${escapeAttr(meta.url)}" />`);
  out = out.replace(/<meta\s+property="og:image"\s+content="[^"]*"\s*\/?>/i, () => `<meta property="og:image" content="${escapeAttr(meta.image)}" />`);
  out = out.replace(/<meta\s+property="og:description"\s+content="[^"]*"\s*\/?>/i, () => `<meta property="og:description" content="${escapeAttr(meta.description)}" />`);
  out = out.replace(/<meta\s+name="twitter:title"\s+content="[^"]*"\s*\/?>/i, () => `<meta name="twitter:title" content="${escapeAttr(meta.title)}" />`);
  out = out.replace(/<meta\s+name="twitter:url"\s+content="[^"]*"\s*\/?>/i, () => `<meta name="twitter:url" content="${escapeAttr(meta.url)}" />`);
  out = out.replace(/<meta\s+name="twitter:image"\s+content="[^"]*"\s*\/?>/i, () => `<meta name="twitter:image" content="${escapeAttr(meta.image)}" />`);
  out = out.replace(/<meta\s+name="twitter:description"\s+content="[^"]*"\s*\/?>/i, () => `<meta name="twitter:description" content="${escapeAttr(meta.description)}" />`);
  out = out.replace(/<title>[^<]*<\/title>/i, () => `<title>${escapeAttr(meta.title)}</title>`);
  out = out.replace(
    /<link\s+rel="canonical"[^>]*>/i,
    () => `<link rel="canonical" id="hmc-canonical-link" href="${escapeAttr(meta.url)}" />`,
  );

  if (profileSchema) {
    out = out.replace("</head>", () => `<link rel="alternate" type="text/markdown" href="${escapeAttr(meta.url)}.md" /><link rel="describedby" href="/llms.txt" /><script id="${PROFILE_SCHEMA_ID}" type="application/ld+json">${schemaJson(profileSchema)}</script></head>`);
  }
  if (pageStatus === 404) out = out.replace("</head>", '<meta name="robots" content="noindex" /></head>');
  if (seoRootArticle) {
    out = out.replace(/<div id="root"><\/div>/i, () => `<div id="root">${seoRootArticle}</div>`);
  }

  if (seoRootArticle && isMapPage && !pageStatus) {
    // Identical markup for all UAs; the loading state only activates when JS runs.
    out = out.replace("</head>", () => `${MAP_STARTUP_HEAD}</head>`);
    out = out.replace(/<body([^>]*)>/i, (_, attrs) => `<body${attrs}>${MAP_STARTUP_BODY}`);
  }

  const headers = new Headers(response.headers);
  headers.delete("content-length");
  headers.delete("etag");
  return new Response(out, { status: pageStatus ?? response.status, headers });
}

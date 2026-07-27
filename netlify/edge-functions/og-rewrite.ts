/**
 * Netlify Edge Function: rewrite HTML meta tags for social crawlers
 * so /:CC, /:CC/:region, and church deep links get correct og:image/title/url.
 * Legacy /state/* and /country/* paths are still recognized.
 *
 * Required Netlify env vars (for bot requests):
 *   SUPABASE_FUNCTIONS_BASE_URL - e.g. https://PROJECT.supabase.co/functions/v1/make-server-283d8046
 *   SUPABASE_ANON_KEY - Supabase anon key for API calls
 */
import type { Context } from "https://edge.netlify.com";
import { INTL_COUNTRY_META } from "./lib/intl-country-meta.generated.ts";

/**
 * Fallback when Netlify env vars are unset. Same values as `utils/supabase/info.tsx`
 * (anon key is already public in the client bundle). Env vars override for other deploys.
 */
const DEFAULT_SUPABASE_FUNCTIONS_BASE_URL =
  "https://epufchwxofsyuictfufy.supabase.co/functions/v1/make-server-283d8046";
const DEFAULT_SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVwdWZjaHd4b2ZzeXVpY3RmdWZ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI5NzcxMTUsImV4cCI6MjA4ODU1MzExNX0.v11kHHpM1IsK6q81909CYkWgX5TdV8kJhCkNqSEs5QM";

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

export default async function handler(request: Request, context: Context): Promise<Response> {
  const userAgent = request.headers.get("user-agent") ?? "";
  if (!isBot(userAgent)) {
    return context.next();
  }

  const url = new URL(request.url);
  const path = url.pathname;
  const pathParts = path.split("/").filter(Boolean); // ["state", "CA"] or ["state", "CA", "16692500"]

  const apiBase = (Deno.env.get("SUPABASE_FUNCTIONS_BASE_URL") ?? DEFAULT_SUPABASE_FUNCTIONS_BASE_URL).replace(
    /\/$/,
    "",
  );
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? DEFAULT_SUPABASE_ANON_KEY;
  const supabaseHeaders: Record<string, string> = {
    Authorization: `Bearer ${anonKey}`,
    apikey: anonKey,
    "Content-Type": "application/json",
  };

  let meta: OgMeta = {
    title: "Here's My Church",
    description: DEFAULT_DESCRIPTION,
    image: `${SITE_URL}/og-image.png`,
    url: SITE_URL,
  };

  let seoRootArticle: string | null = null;

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
      const res = await fetch(`${apiBase}/reports`, { headers: supabaseHeaders });
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
      const res = await fetch(apiPath, { headers: supabaseHeaders });
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
    if (!mapRegion) {
      meta = {
        title: `Churches in ${countryName}`,
        description: `Find Christian churches in ${countryName}. Free and crowd-sourced.`,
        image: `${SITE_URL}/og-default.png`,
        url: `${SITE_URL}/${mapCc}`,
      };
    } else if (!mapShortId || mapShortId === "county") {
      const regionName = country?.regions[mapRegion] ?? (mapCc === "US" ? getStateName(mapRegion) : mapRegion);
      meta = {
        title: `Churches in ${regionName}${mapCc === "US" ? "" : `, ${countryName}`}`,
        description:
          mapCc === "US"
            ? `Find Christian churches in ${regionName}. ${DEFAULT_DESCRIPTION}`
            : `Find Christian churches in ${regionName}, ${countryName}. Free and crowd-sourced.`,
        image: `${apiBase}/og-image?type=state&state=${encodeURIComponent(mapRegion)}`,
        url: `${SITE_URL}/${mapCc}/${mapRegion}`,
      };
    } else {
      try {
        const res = await fetch(`${apiBase}/churches/${mapRegion}`, { headers: supabaseHeaders });
        if (res.ok) {
          const data = await res.json();
          const churches = data.churches ?? [];
          const church = churches.find((c: { shortId?: string }) => String(c.shortId) === String(mapShortId));
          if (church) {
            const name = church.name ?? "Church";
            const city = church.city ?? "";
            const denom = church.denomination ?? "";
            const regionName = country?.regions[mapRegion] ?? (mapCc === "US" ? getStateName(mapRegion) : mapRegion);
            const ogParams = new URLSearchParams({ type: "church", name, state: mapRegion });
            if (city) ogParams.set("city", city);
            if (denom) ogParams.set("denomination", denom);
            meta = {
              title: name,
              description:
                [city, regionName, mapCc === "US" ? null : countryName].filter(Boolean).join(", ") +
                (denom ? ` · ${denom}` : ""),
              image: `${apiBase}/og-image?${ogParams.toString()}`,
              url: `${SITE_URL}/${mapCc}/${mapRegion}/${mapShortId}`,
            };
          }
        }
      } catch (_) {
        // keep default meta
      }
    }
  }

  const response = await context.next();

  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("text/html")) {
    return response;
  }

  const html = await response.text();

  let out = html;
  out = out.replace(/<meta\s+name="description"\s+content="[^"]*"\s*\/?>/i, `<meta name="description" content="${escapeAttr(meta.description)}" />`);
  out = out.replace(/<meta\s+property="og:title"\s+content="[^"]*"\s*\/?>/i, `<meta property="og:title" content="${escapeAttr(meta.title)}" />`);
  out = out.replace(/<meta\s+property="og:url"\s+content="[^"]*"\s*\/?>/i, `<meta property="og:url" content="${escapeAttr(meta.url)}" />`);
  out = out.replace(/<meta\s+property="og:image"\s+content="[^"]*"\s*\/?>/i, `<meta property="og:image" content="${escapeAttr(meta.image)}" />`);
  out = out.replace(/<meta\s+property="og:description"\s+content="[^"]*"\s*\/?>/i, `<meta property="og:description" content="${escapeAttr(meta.description)}" />`);
  out = out.replace(/<meta\s+name="twitter:title"\s+content="[^"]*"\s*\/?>/i, `<meta name="twitter:title" content="${escapeAttr(meta.title)}" />`);
  out = out.replace(/<meta\s+name="twitter:url"\s+content="[^"]*"\s*\/?>/i, `<meta name="twitter:url" content="${escapeAttr(meta.url)}" />`);
  out = out.replace(/<meta\s+name="twitter:image"\s+content="[^"]*"\s*\/?>/i, `<meta name="twitter:image" content="${escapeAttr(meta.image)}" />`);
  out = out.replace(/<meta\s+name="twitter:description"\s+content="[^"]*"\s*\/?>/i, `<meta name="twitter:description" content="${escapeAttr(meta.description)}" />`);
  out = out.replace(/<title>[^<]*<\/title>/i, `<title>${escapeAttr(meta.title)}</title>`);
  out = out.replace(
    /<link\s+rel="canonical"[^>]*>/i,
    `<link rel="canonical" id="hmc-canonical-link" href="${escapeAttr(meta.url)}" />`,
  );

  if (seoRootArticle) {
    out = out.replace(/<div id="root"><\/div>/i, `<div id="root">${seoRootArticle}</div>`);
  }

  return new Response(out, {
    status: response.status,
    headers: new Headers(response.headers),
  });
}

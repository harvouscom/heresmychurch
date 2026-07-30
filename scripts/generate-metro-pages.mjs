#!/usr/bin/env node
/**
 * Postbuild: write crawlable HTML for /metro and /metro/{slug} into dist/.
 * Uses Vite's dist/index.html as the shell so the SPA still boots for humans;
 * #root is prefilled with a church list for bots / view-source.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const DIST = join(ROOT, "dist");
const BASE = "https://heresmychurch.com";

const DEFAULT_API_BASE =
  "https://epufchwxofsyuictfufy.supabase.co/functions/v1/make-server-283d8046";
const DEFAULT_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVwdWZjaHd4b2ZzeXVpY3RmdWZ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI5NzcxMTUsImV4cCI6MjA4ODU1MzExNX0.v11kHHpM1IsK6q81909CYkWgX5TdV8kJhCkNqSEs5QM";

const STATE_NAMES = {
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

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeAttr(s) {
  return String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function metroSlug(id) {
  return String(id).replace(/^us-/, "");
}

function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function applyMeta(html, { title, description, url }) {
  let out = html;
  out = out.replace(/<title>[^<]*<\/title>/i, `<title>${escapeAttr(title)}</title>`);
  out = out.replace(
    /<meta\s+name="description"\s+content="[^"]*"\s*\/?>/i,
    `<meta name="description" content="${escapeAttr(description)}" />`,
  );
  out = out.replace(
    /<meta\s+property="og:title"\s+content="[^"]*"\s*\/?>/i,
    `<meta property="og:title" content="${escapeAttr(title)}" />`,
  );
  out = out.replace(
    /<meta\s+property="og:description"\s+content="[^"]*"\s*\/?>/i,
    `<meta property="og:description" content="${escapeAttr(description)}" />`,
  );
  out = out.replace(
    /<meta\s+property="og:url"\s+content="[^"]*"\s*\/?>/i,
    `<meta property="og:url" content="${escapeAttr(url)}" />`,
  );
  out = out.replace(
    /<meta\s+name="twitter:title"\s+content="[^"]*"\s*\/?>/i,
    `<meta name="twitter:title" content="${escapeAttr(title)}" />`,
  );
  out = out.replace(
    /<meta\s+name="twitter:description"\s+content="[^"]*"\s*\/?>/i,
    `<meta name="twitter:description" content="${escapeAttr(description)}" />`,
  );
  out = out.replace(
    /<meta\s+name="twitter:url"\s+content="[^"]*"\s*\/?>/i,
    `<meta name="twitter:url" content="${escapeAttr(url)}" />`,
  );
  out = out.replace(
    /<link\s+rel="canonical"[^>]*>/i,
    `<link rel="canonical" id="hmc-canonical-link" href="${escapeAttr(url)}" />`,
  );
  return out;
}

function injectRoot(html, articleHtml, jsonLd) {
  const ld = jsonLd
    ? `<script type="application/ld+json">${jsonLd}</script>`
    : "";
  return html
    .replace(/<\/head>/i, `${ld}\n</head>`)
    .replace(/<div id="root"><\/div>/i, `<div id="root">${articleHtml}</div>`);
}

async function fetchChurches(apiBase, headers, region) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 45000);
  try {
    const res = await fetch(`${apiBase}/churches/${encodeURIComponent(region)}`, {
      headers,
      signal: controller.signal,
    });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data.churches) ? data.churches : [];
  } catch {
    return [];
  } finally {
    clearTimeout(t);
  }
}

async function main() {
  const indexPath = join(DIST, "index.html");
  if (!existsSync(indexPath)) {
    console.warn("generate-metro-pages: dist/index.html missing — skip (run after vite build)");
    return;
  }

  const template = readFileSync(indexPath, "utf8");
  const metros = JSON.parse(
    readFileSync(join(ROOT, "src", "app", "data", "us-metros.json"), "utf8"),
  );

  const apiBase = (process.env.HMC_FUNCTIONS_BASE_URL ?? DEFAULT_API_BASE).replace(/\/$/, "");
  const anonKey = process.env.HMC_SUPABASE_ANON_KEY ?? DEFAULT_ANON_KEY;
  const headers = {
    Authorization: `Bearer ${anonKey}`,
    apikey: anonKey,
    "Content-Type": "application/json",
  };

  // Index page
  {
    const url = `${BASE}/metro`;
    const title = "Churches by metro area — Here's My Church";
    const description =
      "Browse Christian churches in major U.S. metro areas. Free, crowd-sourced directory with filters for denomination and size.";
    const byState = new Map();
    for (const m of metros) {
      const list = byState.get(m.region) ?? [];
      list.push(m);
      byState.set(m.region, list);
    }
    const sections = [...byState.entries()]
      .sort((a, b) => (STATE_NAMES[a[0]] || a[0]).localeCompare(STATE_NAMES[b[0]] || b[0]))
      .map(([region, list]) => {
        const items = list
          .map(
            (m) =>
              `<li style="margin:0.35rem 0"><a href="${BASE}/metro/${metroSlug(m.id)}">${escapeHtml(m.name)}</a></li>`,
          )
          .join("");
        return `<h2 style="font-size:1.1rem;margin:1.25rem 0 0.5rem">${escapeHtml(STATE_NAMES[region] || region)}</h2><ul style="margin:0;padding-left:1.25rem">${items}</ul>`;
      })
      .join("");
    const article = `<article class="hmc-metro-index-seo" style="padding:1.5rem;font-family:system-ui,sans-serif;max-width:42rem;line-height:1.5;color:#1c1917">
<h1 style="font-size:1.5rem;margin:0 0 0.75rem">Churches by metro area</h1>
<p style="margin:0 0 1rem;color:#44403c;font-size:0.9375rem">${escapeHtml(description)}</p>
${sections}
<p style="margin:1.25rem 0 0;font-size:0.9375rem"><a href="${BASE}/US">Open the U.S. map</a></p>
</article>`;
    let html = applyMeta(template, { title, description, url });
    html = injectRoot(html, article, null);
    mkdirSync(join(DIST, "metro"), { recursive: true });
    writeFileSync(join(DIST, "metro", "index.html"), html, "utf8");
  }

  /** Cache region → churches */
  const regionCache = new Map();
  async function churchesFor(region) {
    if (regionCache.has(region)) return regionCache.get(region);
    const list = await fetchChurches(apiBase, headers, region);
    regionCache.set(region, list);
    return list;
  }

  let pages = 0;
  for (const metro of metros) {
    const slug = metroSlug(metro.id);
    const stateName = STATE_NAMES[metro.region] || metro.region;
    const all = await churchesFor(metro.region);
    const inMetro = all
      .filter(
        (c) =>
          Number.isFinite(c.lat) &&
          Number.isFinite(c.lng) &&
          haversineKm(metro.lat, metro.lng, c.lat, c.lng) <= metro.radiusKm,
      )
      .sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));

    const url = `${BASE}/metro/${slug}`;
    const title = `Churches in ${metro.name}, ${metro.region} — Here's My Church`;
    const description = `${inMetro.length.toLocaleString("en-US")} Christian churches mapped near ${metro.name}, ${stateName}. Filter by denomination and size — free and crowd-sourced.`;

    const items = inMetro
      .filter((c) => c.shortId != null && /^\d+$/.test(String(c.shortId)))
      .slice(0, 200)
      .map((c) => {
        const href = `${BASE}/US/${metro.region}/${c.shortId}`;
        const bits = [c.city, c.denomination].filter(Boolean).join(" · ");
        return `<li style="margin:0.35rem 0"><a href="${escapeAttr(href)}">${escapeHtml(c.name || "Church")}</a>${
          bits ? ` — ${escapeHtml(bits)}` : ""
        }</li>`;
      })
      .join("");

    const article = `<article class="hmc-metro-seo" style="padding:1.5rem;font-family:system-ui,sans-serif;max-width:42rem;line-height:1.5;color:#1c1917">
<h1 style="font-size:1.5rem;margin:0 0 0.75rem">Churches in ${escapeHtml(metro.name)}, ${escapeHtml(metro.region)}</h1>
<p style="margin:0 0 1rem;color:#44403c;font-size:0.9375rem">${escapeHtml(description)}</p>
${items ? `<ul style="margin:0;padding-left:1.25rem">${items}</ul>` : "<p>No churches mapped in this area yet.</p>"}
<p style="margin:1rem 0 0;font-size:0.9375rem"><a href="${escapeAttr(url)}">Open interactive directory</a> · <a href="${BASE}/US/${metro.region}">${escapeHtml(stateName)} map</a> · <a href="${BASE}/metro">All metros</a></p>
</article>`;

    const jsonLd = JSON.stringify({
      "@context": "https://schema.org",
      "@type": "ItemList",
      name: `Churches in ${metro.name}, ${metro.region}`,
      numberOfItems: inMetro.length,
      url,
      itemListElement: inMetro.slice(0, 50).map((c, i) => ({
        "@type": "ListItem",
        position: i + 1,
        name: c.name,
        url:
          c.shortId != null
            ? `${BASE}/US/${metro.region}/${c.shortId}`
            : undefined,
      })),
    });

    let html = applyMeta(template, { title, description, url });
    html = injectRoot(html, article, jsonLd);
    const dir = join(DIST, "metro", slug);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "index.html"), html, "utf8");
    pages++;
  }

  console.log(`generate-metro-pages: wrote /metro + ${pages} metro pages under dist/metro/`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

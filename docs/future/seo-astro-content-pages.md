# Future: SEO/AEO content pages (state/city church lists) — Astro or not

Content pages that list churches by state, city, etc. can improve search and answer-engine visibility. This doc outlines whether to use Astro for those pages or another approach.

## Goal

- Add URLs that serve **static (or server-rendered) HTML** with real church lists in the response body (e.g. “Churches in California”, “Churches in Austin, TX”).
- Improve **SEO** (crawlable content) and **AEO** (answer-engine-friendly pages) without relying on client-side JS to render the list.

## Current setup

- **Stack:** Vite + React SPA, React Router, Supabase Edge Function API.
- **Routes:** Single app shell for `/`, `/state/:stateAbbrev`, `/state/:stateAbbrev/:segment1/:segment2?`. Church data is loaded **client-side** via `fetchChurches(stateAbbrev)`.
- **SEO today:** One `index.html`; sitemap lists homepage and `/state/XX`. Bots get the same HTML shell; list content is JS-dependent. The `og-rewrite` edge function only adjusts OG meta for `/state/*` — it does not put church lists in the body.
- **Data:** API returns churches **by state** only (`GET /churches/:state`). Church records include `city`; there is no “churches by city” endpoint. City lists would come from filtering state payloads or a new API.

## Is Astro needed?

**No.** The same SEO/AEO benefit can be achieved without Astro. Options:

- **A) Astro for content** — Add Astro; at build time generate static pages (e.g. `/state/CA`, `/city/austin-tx`) that fetch from the existing API and output HTML. Map stays Vite SPA (or is embedded in Astro as a React island). Pros: great fit for content-heavy, minimal-JS pages. Cons: two frameworks/builds unless the map is migrated into Astro.
- **B) Vite + prerender** — Keep Vite; add a prerender step that visits key URLs and saves HTML to `dist`. Pros: single stack. Cons: prerendering the full React map for many URLs is heavy; better for “list only” views, which would need to be added.
- **C) Simple static generator** — A Node script that at build time calls the API and writes HTML files (templates) into `dist` for `/state/CA`, etc. Pros: no new framework. Cons: you own templates and keeping URLs in sync with the SPA.

**Conclusion:** Astro is **not required**. It is a **good idea** if you want a dedicated, low-friction way to generate many static list pages (state + city, or more) with one tool and minimal JS.

## When Astro is a good idea

- You want **many** content URLs: states + cities (and possibly metro/region later).
- You are fine with **two builds** (Astro for content, Vite for the map) or with **eventually moving the map into Astro** as a React island.
- You want **build-time data fetch** from the existing API (e.g. `fetchChurches(state)` per state, then derive cities from that payload for city pages).
- You care about **AEO/LLM-friendly** content: Astro’s default is static HTML with optional islands, which is ideal for crawlers and answer engines.

## When to skip Astro

- You only need **state-level** list pages and are okay with a **small custom solution**: e.g. extend the sitemap script to also generate HTML files (or a thin prerender) for `/state/XX` only.
- You want to **avoid a second framework** and are willing to maintain a Node-based HTML generator and routing (e.g. same paths as the SPA, with Netlify redirects so static HTML wins for those paths).

## Data and URL shape

- **State pages:** `GET /churches/:state` already exists. Astro (or any generator) can call it at build time and render “Churches in {State}” + list.
- **City pages:** No `/churches/city/:city` yet. Options:
  - **Build-time only:** Fetch each state’s churches, group by `city`, emit one HTML page per city (e.g. `/city/austin-tx` or `/state/tx/city/austin`). No API change.
  - **New API:** Add a city endpoint (e.g. by state + city slug) for on-demand or build-time use.

Sitemap and internal links should include the new content URLs so crawlers and users can discover them.

## Suggested direction

- **If you plan to scale to many state + city (and possibly more) list pages:** Use **Astro** for those content pages. Keep the existing Vite app for the interactive map; either a **hybrid** (Astro generates `/state/CA`, `/city/austin-tx`, etc., and links to the map) or a **single site** (map moved into Astro as a React island; bigger migration).
- **If you only want state-level lists for now:** **Skip Astro** and add a **build-time HTML generator** (Node script + templates) that calls the API and writes static files into `dist` for `/state/XX`, and ensure Netlify serves those before the SPA for those paths.

The SEO/AEO gain comes from **serving static (or SSR) HTML with the church list in the body** for those URLs; Astro is one convenient way to do that when you want many content pages.

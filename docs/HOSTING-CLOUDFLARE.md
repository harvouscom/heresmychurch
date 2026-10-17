# Hosting on Cloudflare

heresmychurch.com is served by a Cloudflare Worker with static assets (`wrangler.jsonc`),
replacing Netlify. The API runs on a second Worker, `hmc-api` (api.heresmychurch.com), described below.

## What runs where

| Path | Handled by |
|---|---|
| `/assets/*` (hashed bundles) | Static assets directly; the Worker never runs |
| `www.heresmychurch.com/*` | Worker → 301 to the apex |
| `/state/*`, `/country/:code`, `/country/:code/*` | Worker → 301 to `/US/*`, `/:code`, `/:code/*` |
| `/world`, `/:CC`, `/:CC/*`, `/report/*`, `/reports`, `/metro`, `/metro/*` | Worker → `worker/og-rewrite.ts` (bots only) |
| Every HTML response | Worker → `worker/geo-inject.ts` (`request.cf.country` / `regionCode`) |
| Unknown paths | `index.html` (`not_found_handling: single-page-application`) |

There is no `public/_redirects`: Cloudflare rejects Netlify's syntax, so Netlify's redirects and SPA fallback live in `netlify.toml`.

## Deploys

Workers Builds builds every push: `pnpm run build`, then `npx wrangler deploy` on `main`
(preview URLs on other branches). Build-time env vars (Workers → Settings → Build):

- `VITE_HMC_DATA_BASE_URL=https://data.heresmychurch.com` — R2 static files (see `STATIC-FILES-R2.md`)
- Optional: `HMC_FUNCTIONS_BASE_URL`, `HMC_SUPABASE_ANON_KEY`, `HMC_SKIP_API`, `HMC_REQUIRE_API`

`scripts/api-health.mjs` treats `WORKERS_CI_BRANCH=main` as production: if the API is down the
build fails fast and the last good deploy stays live.

Manual deploy: `pnpm run deploy`. Local: `pnpm run preview:cf` (wrangler dev on :8787).

## Domains

`heresmychurch.com` and `www.heresmychurch.com` are Custom Domains on the Worker.
`data.heresmychurch.com` is the R2 bucket `hmc-data`. MX/`*` records stay at Hover.

Rollback to Netlify (until the Netlify site is deleted): remove the two Custom Domains, then
re-add `A @ 75.2.60.5` and `CNAME www heresmychurch.netlify.app` (DNS only).

## API Worker (`hmc-api`, api.heresmychurch.com)

The API runs the same Hono app as the Supabase edge function:

- `supabase/functions/make-server-283d8046/app.ts` — the app (platform-neutral)
- `supabase/functions/make-server-283d8046/runtime.ts` — `env()`, `waitUntil()`, OG renderer hook
- `supabase/functions/make-server-283d8046/index.ts` — Supabase (Deno) entry
- `api/index.ts` + `api/wrangler.jsonc` — Worker entry; `alias` maps `npm:`/`jsr:` imports to npm packages
- `api/og-image.ts` — OG images via `workers-og` (the Deno `og-image.tsx` uses esm.sh + og_edge)

Read env only inside functions (never at module scope): Workers expose it per request.
Routes keep the `/make-server-283d8046` prefix internally; the Worker accepts bare paths too.
The database stays on Supabase Postgres (supabase-js over HTTP), as does Realtime presence.

Commands: `pnpm run dev:api` (local, :8790), `pnpm run deploy:api`,
`pnpm run parity:api [base]` (compares read-only responses with the Supabase function).

Secrets set on `hmc-api` (`wrangler secret put -c api/wrangler.jsonc NAME`):
SUPABASE_SERVICE_ROLE_KEY, MODERATOR_KEY, PARTNER_API_KEY, TWITTER_WEBHOOK_SECRET.
Plain vars live in `api/wrangler.jsonc`. R2 writes use the `HMC_DATA` bucket binding, so the
Worker needs no `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` (the Supabase function still uses them).

### Deliberately not configured on the Worker (Oct 2026)

These were left out when the API moved; the routes fail softly without them.

| Secret | Why skipped | Effect without it | To turn back on |
|---|---|---|---|
| `GOOGLE_MAPS_API_KEY` | Google Places enrichment is no longer used | `POST /admin/enrich-google/:state` returns an "API key missing" error; nothing else uses it | Copy the key from Google Cloud → Credentials, then `wrangler secret put -c api/wrangler.jsonc GOOGLE_MAPS_API_KEY` |
| `TWITTER_API_KEY`, `TWITTER_API_SECRET`, `TWITTER_ACCESS_TOKEN`, `TWITTER_ACCESS_TOKEN_SECRET` | Auto-posting to X paused | Tweet routes reply "No Twitter credentials" and post nothing; the `tweet-schedule` workflow still runs and simply skips | Copy the four values from the X developer portal and `wrangler secret put` each one (`TWITTER_WEBHOOK_SECRET` is already set) |
| `REGRID_TOKEN` | Unused anywhere in the code | None | — |

The Supabase function still holds its old copies of these until it is retired.

Callers switch by config, each reversible: `VITE_HMC_API_BASE_URL` (frontend build),
`HMC_API_BASE_URL` (site Worker og-rewrite), the `SUPABASE_FUNCTION_URL` GitHub secret
(cron workflows), and Harvous's `HERESMYCHURCH_API_BASE` (`https://api.heresmychurch.com/v1`).

# Hosting on Cloudflare

heresmychurch.com is served by a Cloudflare Worker with static assets (`wrangler.jsonc`),
replacing Netlify. The API is still the Supabase edge function (moving it is a separate phase).

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

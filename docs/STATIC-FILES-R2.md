# Static files on Cloudflare R2

The two hottest public reads are published as files on Cloudflare R2 and served from
Cloudflare's CDN, so page loads don't touch Postgres:

| File | Same body as |
|---|---|
| `states.json` | `GET /churches/states` |
| `churches/{REGION}.json` | `GET /churches/:state` (list plus corrections, Google enrichment, calibration, home campuses) |

## How files stay fresh

- **On write.** Every KV write goes through `kv.ts`, which reports the keys it touched.
  `publishTargetsForKey` in `index.ts` maps them to files:
  - `churches:{CC}:{REGION}` → that region (DC → MD)
  - `suggestions:{id}` and `enrichment:google:{id}` → the church's region
  - deleting `calibration:{ST}` → that region
  - `churches:meta` → `states.json`

  The edge function rebuilds those files in the background (`EdgeRuntime.waitUntil`) about 1.5s after the write.
- **Daily.** `.github/workflows/publish-static.yml` runs `scripts/publish-static.mjs`. It republishes everything,
  which catches changes the mapping can't see (for example home-campus summaries read from other regions).
- **In the browser.** After a tab writes (populate, add, suggest, confirm), it reads from the API for 2 minutes,
  so the person sees their own change straight away.

Each file is sent with `Cache-Control: public, max-age=60, stale-while-revalidate=600`, so other visitors see
changes within about a minute.

Every static read falls back to the API, and the R2 code is inert until its secrets exist.

## One-time setup

### 1. Bucket and custom domain (Cloudflare dashboard)
1. Go to **R2 → Create bucket** and name it `hmc-data`. Pick a location hint close to the Supabase region (East US).
2. Open the bucket, go to **Settings → Custom Domains → Connect Domain**, and enter `data.heresmychurch.com`.
   Cloudflare creates the DNS record. Leave it proxied (orange cloud).
3. Open the bucket's **Settings → CORS policy** and paste:
   ```json
   [{"AllowedOrigins":["https://heresmychurch.com","https://www.heresmychurch.com","http://localhost:5173"],
     "AllowedMethods":["GET","HEAD"],"AllowedHeaders":["*"],"MaxAgeSeconds":86400}]
   ```
4. Go to **Caching → Cache Rules** for heresmychurch.com and add this rule: when hostname equals
   `data.heresmychurch.com`, make it **Eligible for cache** and use the origin's Cache-Control for the edge TTL.
   Without the rule, Cloudflare doesn't cache `.json` by default.

### 2. API token (Cloudflare dashboard)
Go to **R2 → Manage R2 API Tokens → Create API token**. Choose **Object Read & Write**, limited to the
`hmc-data` bucket. Note the Access Key ID, the Secret Access Key, and your Account ID.

### 3. Edge function secrets (your terminal)
```bash
supabase secrets set --project-ref epufchwxofsyuictfufy R2_ACCOUNT_ID=... R2_ACCESS_KEY_ID=... R2_SECRET_ACCESS_KEY=... R2_BUCKET=hmc-data
npm run deploy:make-server
```

### 4. Backfill (needs a healthy database)
```bash
MODERATOR_KEY=... npm run publish:static
```
Then check https://data.heresmychurch.com/states.json and
https://data.heresmychurch.com/churches/TX.json.

### 5. Point the site at it
1. In Netlify, add the site environment variable `VITE_HMC_DATA_BASE_URL=https://data.heresmychurch.com`
   and redeploy.
2. In GitHub, add the repo secret `MODERATOR_KEY` so the daily workflow can run.
   It reuses `SUPABASE_FUNCTION_URL` and `SUPABASE_ANON_KEY`.

Leaving `VITE_HMC_DATA_BASE_URL` unset turns the static reads off. That's the rollback.

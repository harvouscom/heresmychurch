# Public / partner API

We already have an API: the Supabase Edge Function (`make-server-283d8046`). The frontend calls it via `src/app/components/api.ts` with the public anon key. This doc covers the **versioned partner surface** (Harvous-first) and the longer-term roadmap for a broader public API.

## Current state (site API)

- **Base URL:** `https://<projectId>.supabase.co/functions/v1/make-server-283d8046`
- **Auth:** Public anon key (same as the main site). Anyone with the key can call the same endpoints.
- **Read endpoints:** states, churches by state, search, denominations, suggestions, pending churches, community stats, reactions, population, review-stats.
- **Write endpoints:** add church, verify pending church, confirm church data, submit suggestion, submit reaction; admin-only: populate state, refresh-attendance, enrich-regrid, cleanup, rebuild search index, etc.

The single source of truth for the **site** request/response shapes is `src/app/components/api.ts` (and `src/app/components/church-data.ts`).

---

## Partner API v1 (Harvous-first)

Lean, state-scoped church **reference** search for server-to-server use. First consumer: [Harvous](https://github.com/harvouscom/harvous) (My Church picker → store stable HMC id; later church org verification).

### Base URL

```
https://<projectId>.supabase.co/functions/v1/make-server-283d8046/v1
```

All `/v1/*` routes require:

1. Supabase gateway auth as usual (`Authorization: Bearer <anon or service key>` + `apikey` header), **and**
2. Partner key: `x-partner-key: <PARTNER_API_KEY>`

### Secrets

| Env var | Purpose |
|---------|---------|
| `PARTNER_API_KEY` | Preferred. Shared secret for `/v1/*`. |
| `HARVOUS_API_KEY` | Accepted as fallback if `PARTNER_API_KEY` is unset. |

Set on the edge function via Supabase secrets. If neither is set, `/v1/*` returns `503 Partner API not configured`.

### Rate limit

120 requests / minute / partner key (KV counter). Exceeding returns `429`.

### Endpoints

#### `GET /v1/churches/search`

Fuzzy autocomplete over one state’s search index (same scoring as site search).

| Query | Required | Notes |
|-------|----------|--------|
| `q` | yes (min 2 chars for results) | Church name / city / address tokens |
| `state` | **yes** | 2-letter US abbrev (`DC` folded into `MD`) |
| `limit` | no | Default 20, max 50 |

**Response:**

```json
{
  "results": [
    {
      "id": "TX-123456",
      "shortId": "01234567",
      "name": "Grace Community Church",
      "city": "Austin",
      "state": "TX",
      "address": "123 Main St",
      "denomination": "Non-denominational",
      "lat": 30.27,
      "lng": -97.74
    }
  ],
  "query": "Grace"
}
```

`Cache-Control: private, max-age=30`

#### `GET /v1/churches/:state/:shortId`

Resolve a picked result by state + 8-digit `shortId` (or full id / numeric segment).

**Response:** `{ "church": { …lean ref… } }` or `404` `{ "church": null, "error": "…" }`

`Cache-Control: private, max-age=60`

#### `GET /v1/churches/by-id/:id`

Resolve by full HMC `id` (e.g. `TX-123456` or `community-TX-…`). Prefer storing this id in Harvous as `hmcChurchId`.

**Response:** same lean `{ "church": … }` envelope.

### Writes (same review rules as the site)

Partner writes never mutate `churches:{ST}` directly. They reuse the site suggestion + confirm pipeline.

| Method | Path | Behavior |
|--------|------|----------|
| `POST` | `/v1/churches/:id/suggestions` | Body `{ "field", "value" }`. Same valid fields and consensus as site `POST /suggestions`. |
| `GET` | `/v1/churches/:id/suggestions` | Pending/approved vote status per field (`needsModeration` for sensitive). |
| `POST` | `/v1/churches/:id/confirm` | Bumps `lastVerified` only (anti-staleness). No field merge, no search-index rewrite. |

**Valid `field` values:** `name`, `website`, `address`, `reportClosed`, `reportDuplicate`, `attendance`, `denomination`, `serviceTimes`, `languages`, `ministries`, `pastorName`, `phone`, `email`, `homeCampusId`

**Sensitive (moderator required — never auto-applied):** `name`, `website`, `address`, `reportClosed`, `reportDuplicate`, `homeCampusId`

**Non-sensitive:** auto-apply after consensus (`THR=1`, unique actor). Partner submissions use actor key `partner:harvous` (24h dedupe per field).

**Suggest response:**

```json
{
  "success": true,
  "field": "pastorName",
  "applied": true,
  "needsModeration": false,
  "consensus": { "votes": 1, "needed": 1, "approved": true, "value": "Jane Doe" }
}
```

After `applied: true`, re-fetch `GET /v1/churches/by-id/:id` (and refresh any denormalized Harvous copy). Partner resolve reads **KV only** (no pending-suggestion overlay), so sensitive fields stay unchanged on by-id until a moderator approves and applies them.

**Confirm response:** `{ "success": true, "totalConfirmations": N }` or `{ "success": true, "alreadyConfirmed": true, … }` (one confirm per partner actor per 24h).

### Harvous implementation guide (step by step)

Do all HMC calls from the **Harvous backend** only. Never put `PARTNER_API_KEY` (or the Supabase service role) in the browser / native app.

#### Step 1 — Configure secrets on Harvous

Add to Harvous server env (e.g. Railway / `.env` used by the API):

| Harvous env var | Value |
|-----------------|--------|
| `HMC_BASE_URL` | `https://epufchwxofsyuictfufy.supabase.co/functions/v1/make-server-283d8046` |
| `HMC_ANON_KEY` | Here's My Church Supabase anon (publishable) key |
| `HMC_PARTNER_API_KEY` | Same value as HMC edge secret `PARTNER_API_KEY` |

Smoke-test from a shell before coding UI:

```bash
curl -sS \
  -H "Authorization: Bearer $HMC_ANON_KEY" \
  -H "apikey: $HMC_ANON_KEY" \
  -H "x-partner-key: $HMC_PARTNER_API_KEY" \
  "$HMC_BASE_URL/v1/churches/search?q=Grace&state=TX&limit=5"
```

Expect `200` and a `results` array. `401` → wrong partner key. `503` → partner key not set on HMC.

#### Step 2 — Add a small HMC client on the Harvous server

Create a server-only helper (e.g. `server/utils/hmc-client.ts`) that:

1. Builds URLs under `$HMC_BASE_URL/v1/...`
2. Always sends:
   - `Authorization: Bearer $HMC_ANON_KEY`
   - `apikey: $HMC_ANON_KEY`
   - `x-partner-key: $HMC_PARTNER_API_KEY`
   - `Content-Type: application/json` on POST
3. Exposes typed methods:
   - `searchChurches({ q, state, limit })`
   - `getChurchById(id)`
   - `getChurchByShortId(state, shortId)`
   - `suggestChurchField(id, field, value)`
   - `getChurchSuggestions(id)`
   - `confirmChurch(id)`
4. Treats `429` as backoff (partner rate limit: 120/min).
5. URL-encodes `id` in path segments (`encodeURIComponent`).

Do **not** call this helper from Astro islands / SPA fetch without going through your own `/api/...` routes.

#### Step 3 — Persist a stable church link in Harvous

Extend user/church storage (e.g. `UserMetadata` and later `Churches`) with:

| Field | Purpose |
|-------|---------|
| `hmcChurchId` | Canonical HMC `id` (e.g. `TX-640440869`) — **source of truth for re-resolve** |
| `churchName`, `churchCity`, `churchState`, `churchCountry` | Denormalized display (keep today’s free-text fields) |
| Optional: `hmcShortId`, `hmcLat`, `hmcLng` | UX / maps without an extra round trip |

Keep free-text fields for users who skip search; prefer writing `hmcChurchId` whenever they pick a result.

#### Step 4 — Replace free-text My Church with typeahead → pick

In My Church / settings (prototype + production panel):

1. Require **state** (2-letter) before searching (v1 search requires `state`).
2. Debounce name input (≥2 chars), then call Harvous `GET /api/.../churches/search?q=&state=` which proxies to HMC search.
3. Show lean results: `name`, `city`, `state`, `address`, `denomination`.
4. On pick:
   - Save `hmcChurchId = result.id`
   - Copy denormalized `churchName` / `city` / `state` (and country `"US"` if you use it)
   - Optionally store `shortId` / lat / lng
5. Offer “Enter manually” fallback that clears `hmcChurchId` and keeps free-text only (matching can reconcile later).

#### Step 5 — Wire Harvous API routes (proxy)

Add authenticated Harvous routes that call the HMC client (Clerk session required; never expose partner key):

| Harvous route | Proxies to |
|---------------|------------|
| `GET /api/hmc/churches/search` | `GET /v1/churches/search` |
| `GET /api/hmc/churches/:id` | `GET /v1/churches/by-id/:id` |
| `POST /api/hmc/churches/:id/suggestions` | `POST /v1/churches/:id/suggestions` |
| `GET /api/hmc/churches/:id/suggestions` | `GET /v1/churches/:id/suggestions` |
| `POST /api/hmc/churches/:id/confirm` | `POST /v1/churches/:id/confirm` |

Validate query/body on the Harvous side (state length 2, `q` min 2, `field` allowlist) before calling HMC.

#### Step 6 — Corrections / org verification edits

When a user or church admin edits a field that should update Here's My Church:

1. `POST` suggest with `{ field, value }`.
2. If `applied === true`:
   - `GET` by-id and refresh Harvous denormalized fields from the lean ref (and any fields you store).
3. If `needsModeration === true`:
   - Show “Pending review on Here's My Church” (do **not** treat the new value as live on HMC).
   - Optionally poll `GET .../suggestions` until that field disappears after mod approve/reject, then re-fetch by-id.
4. Never write church catalog fields only in Harvous if the user intended a global correction — always suggest to HMC when `hmcChurchId` is set.

Example proxy call:

```bash
curl -sS -X POST \
  -H "Authorization: Bearer $HMC_ANON_KEY" \
  -H "apikey: $HMC_ANON_KEY" \
  -H "x-partner-key: $HMC_PARTNER_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"field":"pastorName","value":"Jane Doe"}' \
  "$HMC_BASE_URL/v1/churches/TX-123/suggestions"
```

#### Step 7 — Confirm freshness (“still correct”)

When the user affirms their church info is current:

1. If `hmcChurchId` is set → `POST /v1/churches/:id/confirm`.
2. Ignore `alreadyConfirmed: true` (once per 24h per partner actor).
3. This only updates HMC `lastVerified`; it does not change fields.

#### Step 8 — Church org registration (later)

When a church creates a Clerk org on Harvous:

1. Run the same typeahead → pick flow to bind `Churches.hmcChurchId`.
2. Use that id as the canonical link for matching congregants who already stored the same `hmcChurchId` (or fuzzy-match free-text → suggest they re-pick).
3. Org-submitted corrections use the same suggest endpoint (still moderated for sensitive fields).

#### Step 9 — Acceptance checklist

- [ ] Search “Grace” + `TX` returns ranked lean results under 1s typically
- [ ] Pick persists `hmcChurchId`; reload profile still shows the same church
- [ ] `GET` by-id returns the same id/name/city/state
- [ ] Non-sensitive suggest (e.g. `pastorName`) returns `applied: true`; by-id reflects after refresh
- [ ] Sensitive suggest (e.g. `name`) returns `needsModeration: true`; by-id name unchanged until mod approve
- [ ] Confirm returns success; second confirm within 24h returns `alreadyConfirmed`
- [ ] Browser network tab never shows `x-partner-key` or `HMC_PARTNER_API_KEY`

### Deferred (not in v1)

- National unconstrained partner search
- Compact index dump / client-side fuzzy
- Partner add-new-church / bulk import
- Webhook when moderator approves a partner suggestion
- Public OpenAPI docs for third parties

---

## Broader public API (roadmap)

- Publish OpenAPI and a docs page for third parties.
- Keep `/v1` stable; evolve behind new versions if needed.
- Optional per-partner keys and stricter CORS for browser clients.

## Data accuracy

Responses are partial — optional fields may be missing. Partner suggest/confirm (and the site suggest/add/confirm paths) are the supported ways to enrich records. See `churches/review-stats` for incompleteness counts.

## Alternatives

Supabase exposes `public` via PostgREST/GraphQL with the anon key (RLS). For partners, the Edge Function `/v1` surface is preferred: stable lean contract, partner auth, rate limits, and storage can change without breaking Harvous.

## References

- `src/app/components/api.ts` — site client API
- `src/app/components/church-data.ts` — `Church` / completeness types
- `supabase/functions/make-server-283d8046/index.ts` — route definitions (`/v1/*`)
- `supabase/config.toml` — schema exposure context

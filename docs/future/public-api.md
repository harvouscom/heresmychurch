# Future: Public API for partners and data accuracy

We already have an API: the Supabase Edge Function (`make-server-283d8046`). The frontend calls it via `src/app/components/api.ts` with the public anon key. This doc is a roadmap to formalize that surface so third parties and partners can use the church database safely and we can improve data accuracy together.

## Current state

- **Base URL:** `https://<projectId>.supabase.co/functions/v1/make-server-283d8046`
- **Auth:** Public anon key (same as the main site). Anyone with the key can call the same endpoints.
- **Read endpoints:** states, churches by state, search, denominations, suggestions, pending churches, community stats, reactions, population, review-stats.
- **Write endpoints:** add church, verify pending church, confirm church data, submit suggestion, submit reaction; admin-only: populate state, refresh-attendance, enrich-regrid, cleanup, rebuild search index, etc.

The single source of truth for request/response shapes and URLs is `src/app/components/api.ts` (and the types in `src/app/components/church-data.ts` for church/state shapes).

## Goals

- Let other apps and developers **read** church data (e.g. denominational tools, church finders, research).
- Let partners **contribute** corrections or new churches so the dataset stays accurate and complete.
- Keep one stable API surface so we can evolve the database and backend without breaking external consumers.

## Steps to formalize (when we do it)

- **Document:** Publish an OpenAPI/Swagger spec or a simple docs page that lists endpoints, methods, and request/response payloads. Derive from `api.ts` and the route definitions in `supabase/functions/make-server-283d8046/index.ts`.
- **Version:** Introduce a versioned base path (e.g. `/v1/...`) so we can change behavior later without breaking external callers.
- **Access (optional):** If we want to limit or track external usage, add API keys (header or query) and rate limiting; keep the anon key for the main site.
- **CORS:** If third parties will call from the browser, document allowed origins and configure CORS accordingly.

## Data accuracy

The API is already the channel for suggestions, confirmations, and pending churches. Formalizing it lets partners (denominations, other apps) integrate and submit corrections or new churches. An optional future step is dedicated bulk-import or partner-only endpoints (e.g. CSV/JSON for trusted sources) for higher-volume updates.

### Using church data when it’s incomplete

Many church records are partial (e.g. missing address, service times, or denomination). When we document the API and when others consume it:

1. **Responses are partial.** API responses include whatever fields we have. Consumers should treat optional fields as nullable and handle missing data in their UI (e.g. “Address not yet collected” or hiding empty sections).
2. **Search `locationLabel`.** `GET …/churches/search` returns a `locationLabel` on each result: meaningful street + city when available, else city + region name, else `Somewhere in {regionName}`. Raw `address` / `city` stay as stored so consumers can still detect incompleteness.
3. **Discovering incomplete records.** The existing `churches/review-stats` endpoint returns national and per-state counts: `totalNeedsReview`, `missingAddress`, `missingServiceTimes`, `missingDenomination`. Consumers can use these to find and prioritize which churches to enrich or correct.
4. **API documentation.** When we publish the API spec, we should clearly list which church fields are optional (e.g. `address`, `website`, `serviceTimes`, `denomination`, `languages`, `ministries`, `pastorName`, `phone`, `email`, `homeCampusId`). We should recommend that consumers use the suggestions, add-church, and confirm endpoints to submit missing or corrected data rather than discarding incomplete records.

### Worldwide regions

Read and write endpoints accept any populated HMC region abbrev (US states and international admin-1 codes such as `ON`, `AUNSW`, `CHZH`), not only US states. Coordinates for `POST …/churches/add` must fall within that region’s bounds. Non-US community ids are minted as `community-{CC}-{REGION}-…`.

### Add church: similar-match confirmation

`POST …/churches/add` mirrors the site “are you sure it’s not this one?” flow:

1. Submit name, address, city, `state` (region abbrev), lat/lng, and optional fields.
2. If near-duplicate candidates exist and the body does **not** include `confirmAdd: true`, the API responds **200** with `{ needsConfirmation: true, similar: [...] }` (not an error). Show those matches to the user.
3. To proceed anyway, resubmit the same payload with `confirmAdd: true`.
4. Exact duplicates still return `{ success: true, isDuplicate: true, … }` as before.

### Report out of scope (Trinitarian inclusion)

`POST …/suggestions` accepts `field: "reportOutOfScope"` (value is normalized to `out_of_scope`). Like closed/duplicate reports, it is sensitive: queued for moderator review and removes the church when approved. Use this when a listing is not a Trinitarian Christian church and should not appear on the map.

## Alternatives

Supabase exposes the `public` schema via PostgREST and GraphQL, so direct DB access is possible with the same anon key (subject to RLS). For a public-facing API, the custom Edge Function is preferable: it gives controlled, stable semantics and hides schema details, and we can change storage without breaking the contract.

## References

- `src/app/components/api.ts` — client API and TypeScript types for all endpoints.
- `src/app/components/church-data.ts` — `Church`, `StateInfo`, and completeness/review logic.
- `supabase/functions/make-server-283d8046/index.ts` — route definitions.
- `supabase/config.toml` — Supabase API/schema exposure (for context on the PostgREST option).

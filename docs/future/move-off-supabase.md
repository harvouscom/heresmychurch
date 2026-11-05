> **Status:** in progress, started 2026-11-05. D1 databases and R2 buckets exist; nothing reads or writes them yet. Production stays on Supabase until the cutover. Written 2026-10-18 after a full audit; the corrections below come from a second audit on 2026-11-05 and **override the phases further down** where they differ.

## Corrections (2026-11-05)

| # | Problem in the phases below | Do this instead |
|---|---|---|
| 1 | GET routes write caches (review stats, calibration, reports, partner rate limits), and the ephemeral-prefix allowlist misses review stats, so the freeze would break browsing | While frozen, `kv.ts` logs and skips **all** writes, because the middleware already rejects non-GETs. No `ReadOnlyError`, no allowlist |
| 2 | Cutover steps POST to `/churches/search/backfill` and `/admin/publish-static` while frozen | Exempt those two and `/admin/migrate/*`, behind `checkModKey`. The search-ready flag and migration writes use the raw backend |
| 3 | The freeze would block CORS preflight | Exempt `OPTIONS` and `HEAD` |
| 4 | Keys deleted between pre-copy and final copy would come back | The final copy also deletes D1 keys missing from Postgres |
| 5 | `created_us UNIQUE` could abort the copy on rows sharing a timestamp | Not unique; order by `(created_us, id)`. New inserts stay strictly increasing |
| 6 | `parsePartnerSince` returning only an integer would change the echoed cursor; Harvous stops when `nextSince === since` | Return both `iso` (echoed untouched when there are no rows) and `us` (for comparing) |
| 7 | Replacing a whole region per correction costs about 100k row writes for Texas (estimate) | `syncSearchRegion` compares in JS and writes only changed rows. Full replace is for backfill. Use `ON CONFLICT DO UPDATE`, never `INSERT OR REPLACE`, which skips the FTS delete trigger |
| 8 | A reader can hit a spilled R2 object that was just replaced | On an R2 miss, re-read the row once |
| 9 | D1 can fail transiently | Retry reads and idempotent writes twice with jitter |
| 10 | A deploy from a stale checkout would drop `STORE_BACKEND` and send writes back to Postgres | `deploy:api` refuses unless the tree is clean and contains `origin/main` (`scripts/check-deploy-ref.mjs`). After cutover, `d1` is the code default and Supabase is paused |
| 11 | Presence broadcasts `viewingState` unchecked | Validate it (`^[A-Z0-9-]{1,10}), cap id length and connections per IP |
| 12 | The repo has no test runner | Add `vitest` and `@cloudflare/vitest-pool-workers` |

**Added since this was written:** `lookup:dirty:*` keys and `/internal/lookup/*` are copied and tested like everything else. Migration writes skip `onKvWrite`, so Lookup doesn't see every region as changed. During the freeze, Lookup's POST routes return 503 with `Retry-After` and its reads keep working.

**Already done:** the cron workflows no longer use `SUPABASE_FUNCTION_URL`, which already pointed at the Worker.

**Migration tooling differs slightly from Phase 2:** \`prune\` removes deleted keys by asking Postgres about each D1 key, because the two databases sort keys differently, so comparing key ranges wouldn't be safe. Rollback is a Worker route, \`replay\`, instead of \`export-delta\`, so no keys leave the Worker; it needs \`confirm=write-postgres\` and a freeze. After \`mark-cutover\`, the copy steps refuse to run.

**Staging** has its own `hmc-data-staging` bucket as well, so a test publish can't overwrite the live public files.

# Move Here's My Church off Supabase (D1 + R2 + Durable Object)

## Context
The site, API and static data already run on Cloudflare. Supabase still holds:
- **Postgres:** a JSON key-value table (about 5,900 rows, 122 MB), `church_audit_log`, `monthly_impact_snapshots`, and `church_search` (pg_trgm with two SQL functions).
- **Realtime presence:** the "N people with you now" counts.

Supabase slowdowns keep hitting the site, and the user wants off it.

**Decisions made:**
- **Storage:** D1 for records, a private R2 bucket for blobs over the D1 size limit.
- **Presence:** a Durable Object.
- **Cutover:** a short write pause; browsing keeps working throughout.
- **Rollback:** Supabase stays paused for 2 weeks, then the user deletes it.

**Hard constraints:**
- D1 caps a value at 2 MB, and the Texas church list is about 4.4 MB.
- Harvous polls `/v1/churches/changes` with a stored cursor (e.g. `2026-10-14T21:08:14.25057+00:00`). The feed must not skip or repeat rows, and the `/v1` response shapes must stay the same.

**Approach:** keep the app's KV interface (`get / set / del / mget / mset / mdel / getByPrefix`) and swap what's underneath, so the ~5,900 lines of route code barely change. Everything sits behind a `STORE_BACKEND` flag (`supabase` or `d1`), so cutover and rollback are a config flip.

## Phase 0 — Prep (no behaviour change)
- **Workflows:** `.github/workflows/monthly-stats.yml`, `tweet-schedule.yml` and `publish-static.yml` call `api.heresmychurch.com` instead of `SUPABASE_FUNCTION_URL`. Drop the anon headers.
- **`api/wrangler.jsonc`:**
  - D1 `HMC_DB` (main) and `HMC_SEARCH_DB` (search only, because D1 export can't handle FTS virtual tables)
  - R2 `HMC_KV`, a new **private** bucket `hmc-kv` (pending-churches rows hold IPs, so never use the public `hmc-data`)
  - vars `STORE_BACKEND="supabase"` and `MAINTENANCE_READONLY=""`
  - a `staging` env with its own D1 databases and bucket
  - location hint `enam`
- **New `FN/bindings.ts`:** `setD1/getD1`, `setSearchD1`, `setKvBucket`, set in `api/index.ts` the same way `setR2Binding` is. (`FN` = `supabase/functions/make-server-283d8046/`.)
- **New `api/migrations/0001_init.sql`:**
  - `kv(key TEXT PK, value TEXT NULL, r2_key TEXT NULL, size INT, updated_at INT)`
  - `kv_tombstones(key, deleted_at)`
  - `church_audit_log`: the same columns plus `created_us INTEGER UNIQUE`; indexes on `created_us`, `(church_id, created_us)`, `(state, created_us)`, `(action, created_us)`
  - `monthly_impact_snapshots`: `month` TEXT, numerics REAL, PK `(month, state_abbrev)`
  - `migration_state`
- **New `api/search-migrations/0001_search.sql`:** `church_search` (with a `search_text` column filled in JS), an external-content FTS5 table, and sync triggers.

## Phase 1 — D1/R2 backends behind the flag
- **New `FN/kv-d1.ts`**, with the same exports as `kv_store.tsx` (that file stays untouched):
  - **Size check:** values are measured in UTF-8 bytes (`TextEncoder`).
  - **Spill to R2:** values over ~900 KB go to R2 at `kv/{sha1(key)}/{uuid}`, written before the row is upserted. The old object is deleted in `waitUntil`.
  - **Delete:** `del` / `mdel` use `DELETE … RETURNING r2_key` and clean up R2.
  - **Batch reads:** `mget` / `mdel` use `key IN (SELECT value FROM json_each(?1))`, sidestepping the 100-parameter limit.
  - **Prefix scans:** `getByPrefix` uses `key >= ?1 AND key < ?2`, where ?2 is the prefix with its last character incremented. This avoids LIKE (case-insensitive, `_` wildcard) and `￿`. It pages by key 500 at a time and resolves spilled values 6 at a time.
- **`FN/kv.ts`:**
  - picks the backend from `env("STORE_BACKEND")`
  - writes a tombstone on delete
  - adds a **read-only backstop**: while frozen, writes to ephemeral prefixes (`ratelimit:`, `report:`, `special-report`, `calibration:`) are skipped silently, and any other write throws `ReadOnlyError`
- **`FN/audit.ts`:** a D1 implementation.
  - The insert assigns `created_us = max(now_us, last + 1)` in SQL, so it's always unique and increasing (D1 runs writes one at a time). `created_at` is derived from it as a 6-digit `+00:00` ISO string.
  - Queries order by `created_us, id`.
  - `old_value` / `new_value` are stored as JSON text and parsed on read.
- **`FN/app.ts`:**
  - `parsePartnerSince` (~:1250) returns integer microseconds from any ISO string (Postgres 5-digit `+00:00`, 6-digit, `Z`, ms).
  - `/v1/churches/changes` compares numerically; its output shape doesn't change.
- **New `FN/monthly.ts`:** Supabase and D1 implementations, replacing `supabaseMonthly()` (~:3114). D1 uses `ON CONFLICT(month,state_abbrev) DO UPDATE`.
- **`FN/search-table.ts`:** a D1 version.
  - **Region replace:** `replace` is one `db.batch` — `DELETE` the region, then `INSERT OR REPLACE … SELECT FROM json_each(?)` in ~800 KB chunks.
  - **Indexed text:** `search_text = normalizeSearchText(…)`, the same JS normaliser as today, so tokens match exactly.
  - **The ≥60% rule:** an FTS `MATCH` over every k-token subset (`("a" "b") OR …`), capped at 8 tokens.
  - **Ranking:** `match_count` is computed with `instr`; results are ordered by `match_count DESC, attendance DESC`.
  - The existing fallback to the in-memory index scan stays.
- **Freeze middleware in `app.ts`:** while `MAINTENANCE_READONLY` is set, any non-GET (except `/admin/migrate/*`) returns 503 with `{error:"maintenance"}` and a `Retry-After` header. `onError` maps `ReadOnlyError` to 503.
- **`src/app/lib/friendly-error.ts`:** 503/maintenance shows "Changes are paused for a few minutes while we upgrade. Browsing still works."

## Phase 2 — Migration tooling
- **New `FN/admin-migrate.ts`** under `/admin/migrate/*`, guarded by `checkModKey` and the `x-moderator-key` header. It uses the Worker's existing Supabase service secret, so no keys are handled locally. It writes through the raw `kv-d1` backend, so it doesn't trigger R2 republishing.

  | Route | What it does |
  |---|---|
  | `kv?cursor=` | Pages Postgres by key under a byte budget. Always writes `church-search:ready = {ready:false}`. |
  | `audit?afterId=` | Copies audit rows. Keeps `id` and computes exact `created_us` from the Postgres timestamp. |
  | `monthly` | Copies the monthly snapshots. |
  | `verify?cursor=` | Compares row counts, and a SHA-256 per key over canonical JSON (keys sorted recursively), between Postgres and D1. Skips ephemeral prefixes. |
  | `export-delta?since=` | Returns keys changed or deleted, audit rows and monthly rows since cutover, for rollback. |

- **New `scripts/migrate-to-d1.mjs`:** loops each route until done, so the copy is resumable. Search isn't copied; `scripts/backfill-church-search.mjs` rebuilds it.

## Phase 3 — Presence Durable Object (can ship before cutover)
- **New `api/presence.ts`**, class `PresenceRoom` (SQLite-backed DO, one `"global"` instance):
  - **Connections:** hibernating WebSockets, each carrying `{id, isBot, viewingState}`. `ping` / `pong` is an auto-response, so heartbeats don't wake the DO.
  - **Broadcast:** a `track` message schedules a debounced storage alarm (~1.5 s). The alarm counts unique ids (one per visitor, not per tab), broadcasts `{people, bots, byState}`, and drops sockets that have been silent for more than 90 s.
- **`api/index.ts`:** routes `GET /presence` with WebSocket upgrade, plus an Origin allowlist. `api/wrangler.jsonc` gets the DO binding and a `new_sqlite_classes` migration.
- **`src/app/components/hooks/useActiveUsers.ts`:** uses a WebSocket instead of supabase-js. It keeps the same return shape and heartbeat (30 s ping, re-track on state, visibility or online changes), adds reconnect with jittered backoff, and stays lazy-loaded.

## Phase 4 — Rehearsal on staging
- Deploy the `staging` env with `STORE_BACKEND=d1`.
- Run a full migrate, then verify (0 mismatches), then the search backfill.
- Run against staging:
  - `api-parity.mjs` (staging vs prod)
  - `api-contract.mjs`
  - 50-query search parity
  - `/v1/churches/changes` with Harvous's real stored cursor, which must return the same page from both backends
- Time the copy; that sets how long the freeze will be.

## Phase 5 — Cutover (write pause ~10–15 min)
1. Pre-copy to production D1 while the site is live.
2. Set `MAINTENANCE_READONLY=1` on the Worker **and** the Supabase function, then wait 60 s for old versions to drain.
3. Run the final copy and verify (0 mismatches). Record `cutoverAt` and the max audit id in `migration_state`.
4. Deploy with `STORE_BACKEND=d1`, the freeze still on.
5. Run the search backfill (ready flag returns to true), then `publish-static.mjs`.
6. Run smoke, contract and parity checks, plus a Harvous sync run.
7. Unfreeze.
8. Submit one labelled test correction. Confirm it creates an audit row, shows up in `/v1/churches/changes`, and republishes to R2. Then revert it through moderation.

## Phase 6 — Watch for 2 weeks, then clean up
- **Rollback during the window:** unpause Supabase, freeze, replay `export-delta`, flip `STORE_BACKEND` back.
- **After the window:**
  - Remove the Supabase backends: `kv_store.tsx`, the supabase-js parts of `audit.ts` and `search-table.ts`, and `supabaseMonthly`.
  - Remove `@supabase/supabase-js`, `src/app/lib/supabase.ts` and `utils/supabase/info.tsx`.
  - Remove the anon headers and fallback in `src/app/components/api.ts` and `worker/og-rewrite.ts`.
  - Remove the Supabase dev proxy from `vite.config.ts`.
  - Remove the anon-key fallbacks in `scripts/*.mjs`, including `api-parity.mjs`.
  - Remove the legacy `supabase/functions/server/`, `deploy:make-server` and `.cursor/rules/supabase-deploy.mdc`.
  - Update the docs (`HOSTING-CLOUDFLARE`, `ARCHITECTURE`, `DATA-FLOW`, `STATIC-FILES-R2`, `future/public-api`) and the privacy policy's Supabase mentions.
  - Then the user deletes the Supabase project.
- **Moderator key:** rotate it. It appears in plain text in `.claude/settings.local.json` allow-rules; it may be the old, already-rotated key.

## Reuse
- `FN/runtime.ts` (`env`, `waitUntil`)
- `FN/r2.ts` (publishing)
- `kv.onKvWrite` (republish mapping)
- `normalizeSearchText` / `tokenizeSearchText` (search)
- `checkModKey` (admin auth)
- `scripts/publish-static.mjs`, `backfill-church-search.mjs`, `api-parity.mjs`, `api-contract.mjs`

## Verification
- **Unit tests** against `wrangler dev --local` D1:
  - spill at the ~900 KB threshold
  - prefix upper bound for prefixes ending in `:` and `-`
  - `mget` with 250 keys
  - k-subset search query vs the JS rule (1–8 tokens)
  - 50 audit inserts in one batch get unique `created_us`
  - `parsePartnerSince` with every cursor format
- **Migration:** verify reports 0 mismatches; counts match per key family; Texas round-trips byte-equal after canonicalising; audit `max(id)` and count match.
- **Presence:**
  - two browsers see the same count
  - two tabs from one visitor count once
  - a dropped connection clears within 90 s
  - the DO hibernates when idle
- **Cutover:**
  - POSTs return 503 JSON while frozen and GETs return 200
  - after the flip, the test correction goes end to end, including Harvous's change feed
  - `contract:api` and `parity:api` pass
  - a Worker log tail is clean

## Risks (highest first)
1. **The audit cursor**, because Harvous would skip or repeat rows silently. Mitigated by integer `created_us` and a test with the real stored cursor.
2. **Search parity on FTS5:** performance on common tokens, tokenizer differences, and the ready flag. Mitigated by the rehearsal and the scan fallback.
3. **Late writers during the freeze:** the Supabase function, workflows and old bundles. Mitigated by Phase 0 and freezing both backends.
4. **D1 limits on full scans and report generation.** Mitigated by keyset paging and capped concurrency.
5. **Presence reconnect edge cases.** Low data risk.

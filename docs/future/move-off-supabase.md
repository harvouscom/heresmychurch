> **Status:** plan only — not started. Written 2026-10-18 after a full audit of what still depends on Supabase.

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

# Cloudflare production cutover — November 9, 2026

Production now uses Cloudflare Workers for the API/site, D1 for records/audit/monthly snapshots, a separate D1 database for search, R2 for public files and private large values, and a Durable Object for presence. Workers AI assists reviewers with evidence checks.

## Verification before switching storage

Both the Worker and legacy Supabase endpoint were write-blocked. The final copy and comparison passed with zero differences across 5,922 non-ephemeral keys (approximately 293 MB), 1,941 audit entries (maximum id 1,965), and 358 monthly snapshots. The migration marker records `cutoverAt=1794282503651` and `auditMaxId=1965`; further Postgres-to-D1 copying is blocked.

Partner-feed comparisons passed for the previous 29 days (93 changes) and a microsecond-precision timestamp (35 changes). After switching to D1, directory reads still showed 244,569 churches. Content fingerprints matched for all 16,795 Texas and 5,706 Ontario listings, comparing ids, names, addresses, cities, regions, websites, phones, emails, and service times.

## Remaining rollback snapshot

The Supabase project has not been deleted. Its Edge Function has `MAINTENANCE_READONLY=1`. It must stay frozen: unfreezing it would create two writable copies. No current browser/API/presence/bot flow needs Supabase. Shared source still lives under the historical `supabase/functions` folder; that path does not mean it executes on Supabase.

Keep the snapshot for a short rollback window (the migration plan recommends two weeks), then the owner can remove the project. Pausing the project is reversible and can be done earlier once production smoke checks pass. Deleting it permanently removes this rollback option. Legacy Supabase adapters and migration tooling may remain in source without being production dependencies.

For a deliberate rollback: freeze Cloudflare writes, restore the Supabase URL configuration and service key if removed, use the migration replay tooling to bring the snapshot up to date, verify it, then switch storage explicitly. Never just flip to the stale snapshot.

## Operational safeguards

Production config pins `STORE_BACKEND=d1`. When the flag is absent, the Worker defaults to D1. Browser and bot defaults point to `api.heresmychurch.com`; the old Supabase fallback and local proxy are removed. Commit and publish this configuration so future builds cannot revert storage.

Fresh AI checks are reviewer-initiated, capped and cached, and never publish changes. See [AI evidence checks](future/ai-review-evidence.md).

## Final production checks

Search backfill completed for 544 regions. All 543 public region files and the national states file were refreshed; Michigan and PT12 were retried successfully after transient D1 overload responses. Production API contract checks passed. A temporary replacement stayed held, the original service time remained unchanged, and moderator approval of the original value exercised the D1 audit/write/publication path without publishing the probe time. Workers AI returned a validated `contradicted` result for the probe based on the official homepage. The final public Texas file retained the original value. A final search returned HTTP 200 in approximately 368 ms.

The migration/review PR was merged as [#42](https://github.com/harvouscom/heresmychurch/pull/42), and the active-model correction is on main. The GitHub Supabase Preview app still created a separate preview during the PR; disconnect this integration when retiring Supabase. It is not used by the live directory. The temporary local moderator-key copy was removed after the checks.

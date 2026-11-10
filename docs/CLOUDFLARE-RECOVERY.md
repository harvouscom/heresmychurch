# Publishing reliability and recovery

## Publishing

A KV write and the publication it requires now commit in the same D1 transaction. The outbox coalesces changes per public file and tracks a generation. The queue publishes from the latest stored data; it removes the job only if the generation did not change during the work. A concurrent edit therefore retains its own publication request. Duplicate deliveries after completion are harmless.

`hmc-publications` has one consumer at a time, small batches, delayed retries, and the separate `hmc-publication-failures` dead-letter queue. Queue submission failures leave the D1 outbox intact. A minute cron retries dispatch; claims expire if the dispatcher crashes. Repeated failures become blocked jobs, retained indefinitely in D1 for review even after the queue's failed-message retention expires.

Nightly full publishing runs at 09:00 UTC inside Cloudflare. The old GitHub workflow is manual-only. `scripts/publish-static.mjs` now queues work by default; finishing that script means jobs were queued, not that every public file is already refreshed.

Authenticated operations endpoints:

- `GET /moderate/operations` shows pending/blocked jobs and oldest request time.
- `POST /moderate/operations/retry` with `{ "target": "region:TX" }` or `{ "target": "states" }` retries a target.
- Both require the existing moderator key in `x-moderator-key`. No keys should be placed in URLs.

Structured Worker events include `publication_failed`, `publication_attention`, and `publication_dispatch_failed`. `publication_attention` flags blocked jobs or work older than 15 minutes. These are diagnostic events, not configured email/pager notifications.

## Recovery coverage

D1 Time Travel provides up to 30 days of recovery on Workers Paid. Large values are immutable objects in the private `hmc-kv` bucket. Replaced/deleted objects are now recorded transactionally in `r2_retired_objects` and retained for at least 35 days after their last retirement. Hourly cleanup deletes only expired files that no live KV row references. Restoring a database row therefore still has its referenced file available during the recovery window.

This protection begins with this release. Previously deleted file versions cannot be recreated by this patch. Take a fresh D1 recovery bookmark after deploying it and use that as the earliest recovery point for the new protection; keep the Supabase cutover snapshot for older recovery needs. Do not add an R2 lifecycle rule that expires active `kv/` files, and do not roll back to code that immediately deletes replaced files.

## Restore procedure

1. Set `MAINTENANCE_READONLY=1` on the Cloudflare API and deploy from current main. This stops edits, queue publication, and file cleanup. Queue deliveries leave their outbox work available for the eventual resume.
2. Record the current D1 bookmark, then choose the desired `hmc-db` bookmark at or after the protection release. `wrangler d1 time-travel info hmc-db --json -c api/wrangler.jsonc` reads a bookmark. Preserve the current one to undo a restore if needed.
3. Restore `hmc-db` to the chosen bookmark using `wrangler d1 time-travel restore hmc-db --bookmark=BOOKMARK -c api/wrangler.jsonc`. This overwrites that database in place. Do not restore production merely to test the command.
4. Verify the recovered KV data and referenced R2 files. The private bucket must remain intact. Cloudflare rollback does not replace the bucket.
5. Rebuild search with `scripts/backfill-church-search.mjs`; search is derived from the recovered primary data, so no independent search snapshot is required. While maintenance is active this privileged backfill is allowed.
6. Refresh public files while still in maintenance using `HMC_PUBLISH_DIRECT=1 HMC_PUBLISH_BATCH=1 node scripts/publish-static.mjs` with `MODERATOR_KEY` supplied privately in the environment. This deliberate maintenance mode serially bypasses the queue; requests for direct mode outside maintenance are rejected. Retry any failed targets before proceeding.
7. Verify directory totals, representative records, public files, and search. Clear maintenance and deploy. The minute cron resumes remaining outbox jobs.

Apply migration `0002_publication_recovery.sql` before deploying this code to any new environment, including staging.

## Tests and drill

Local integration tests cover transactional rollback of data plus outbox, failed queue submission, competing dispatchers, a crashed dispatcher lease, a write arriving during publication, obsolete deliveries, blocked jobs and retry, retained-file recovery, and cleanup refusing active file references.

A live isolated drill on November 9, 2026 used scratch database `hmc-recovery-drill-00099b49` and a synthetic 950 KB private R2 file. It recorded a D1 bookmark, changed the file pointer, restored the scratch database, and verified the original file content by SHA-256. Production records were untouched. The synthetic drill resources were removed afterward.

Next stages remain separate: per-church record concurrency, an indexed review queue, strict cross-location usage limits and external alert destinations, and evidence extraction from contact/service pages.

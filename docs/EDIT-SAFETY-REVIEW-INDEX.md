# Concurrent edits and indexed moderation

## Safer saves

KV records now have a monotonic revision. Fresh object/array reads retain an immutable baseline. When saving, the server reads the latest revision and merges changes against the original baseline. Disjoint church changes, disjoint fields on the same church, distinct vote records, and independent approval-history fields are preserved. Conflicting changes to the same field, including removing a church that changed after it was read, return HTTP 409. List-valued fields such as languages remain single decisions rather than being silently combined.

A guarded D1 batch commits the record, recovery-file retirement, publication job, and review-index invalidation together. A stale version aborts the whole batch; retries re-read and merge up to five times. Unused large-file candidates are retained for safe garbage collection. Church-list transformations explicitly carry their source baseline so additions/removals cannot silently replace unrelated concurrent edits. Read-only cached blobs discard write baselines to keep memory bounded.

Each review field has a fingerprint of its proposal data and the displayed current field value. The review UI sends it when approving or rejecting. A changed proposal gets a 409 response and the UI refreshes the queue. Reviewing one field does not invalidate another field's unchanged proposal. Older clients can still use the endpoints; their stored data writes receive the same revision protection, while proposal-fingerprint checking requires an updated client.

Bulk migration helpers retain their explicit overwrite semantics and must not be used to overwrite live data after cutover. The existing migration marker already blocks Postgres-to-D1 recopying.

## Review index

`review_churches` contains a projection of listing fields used for moderation, indexed by church id, region, and listing status. It excludes contributor IPs and submission metadata. `review_index_regions` tracks which source revision is complete. A church-list write marks its region dirty in the same transaction as the save.

The existing publication queue updates search and the review projection from the latest canonical data. Request handlers do not race each other to replace search indexes. A rebuild verifies the source revision throughout and marks the projection complete only if the source stayed unchanged. It uses batched JSON-table SQL to keep large-region builds within D1 query limits. A newer edit leaves its publication job pending for another pass.

The moderation endpoint loads only proposal targets, indexed reverify listings, and actual pending-church stores. Dirty or not-yet-built regions fall back to canonical data, preserving existing suggestions throughout rollout. A new deployment therefore starts correct and gets faster as the queue populates the index.

## Reviewed-change recovery

On November 9, 2026, eight visible reviewed changes were saved sequentially through the normal moderation endpoint and verified directly in primary Cloudflare storage: a Marshalltown church name, Apex and Lima addresses, Prairie Valley website/address, Harvest City name/website, and the Heber Valley website. The remaining visible address proposal belonged to a community listing already removed as a duplicate of `TX-356719211`; that obsolete proposal was cleared without recreating the duplicate. None of the nine repair items remained pending afterward.

## Rollout

Apply migration `0003_edit_versions_review_index.sql` before deploying the new Worker. Briefly pause writes while the old Worker drains, then reopen writes with the new code. Run `scripts/backfill-review-index.mjs` with the moderator key supplied privately to backfill only the review projection. The tool skips regions whose source revision is already indexed and retries temporary service failures. The normal publication queue also keeps the projection current; public reads remain available. Monitor `review_index_regions` and `publish_outbox` until the expected regions are complete.

The pre-index production moderation request took 234,084 ms with zero pending items.

Tests cover simultaneous regional/field edits, field conflicts, additions/removals, first votes, simultaneous moderator decisions and cleanup, correction counts, stale proposal actions, and indexed reads avoiding regional blob loads. Existing recovery and publication tests remain in place.

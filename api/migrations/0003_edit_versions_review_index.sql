ALTER TABLE kv ADD COLUMN revision INTEGER NOT NULL DEFAULT 1;
-- The NOT NULL guard aborts a whole D1 batch when its read version is stale.
CREATE TABLE kv_write_guards(token TEXT PRIMARY KEY, valid INTEGER NOT NULL CHECK(valid=1)) WITHOUT ROWID;
CREATE TABLE review_churches(
 church_id TEXT PRIMARY KEY,
 region TEXT NOT NULL,
 listing_status TEXT,
 doc TEXT NOT NULL
) WITHOUT ROWID;
CREATE INDEX idx_review_church_region ON review_churches(region);
CREATE INDEX idx_review_church_status ON review_churches(listing_status) WHERE listing_status IS NOT NULL;
CREATE TABLE review_index_regions(
 region TEXT PRIMARY KEY,
 source_revision INTEGER NOT NULL DEFAULT 0,
 complete INTEGER NOT NULL DEFAULT 0,
 indexed_at INTEGER
) WITHOUT ROWID;

-- Enable efficient prefix LIKE queries on kv_store (getByPrefix).
-- The default btree PK index doesn't support LIKE 'prefix%' efficiently,
-- causing sequential scans. text_pattern_ops enables index scans for these.
CREATE INDEX IF NOT EXISTS idx_kv_store_key_prefix
  ON kv_store_283d8046 (key text_pattern_ops);

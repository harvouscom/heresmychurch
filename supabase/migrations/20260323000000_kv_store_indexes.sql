-- The kv store table itself was created by the Figma Make template, outside
-- migrations (schema: functions/make-server-283d8046/kv_store.tsx). Production
-- has it; a fresh database built from migrations alone (Supabase preview
-- branches, `supabase db reset`) does not, so the index below failed with
-- "relation kv_store_283d8046 does not exist" on every PR touching supabase/.
-- IF NOT EXISTS makes this a no-op wherever the table already exists.
CREATE TABLE IF NOT EXISTS kv_store_283d8046 (
  key TEXT NOT NULL PRIMARY KEY,
  value JSONB NOT NULL
);

-- Enable efficient prefix LIKE queries on kv_store (getByPrefix).
-- The default btree PK index doesn't support LIKE 'prefix%' efficiently,
-- causing sequential scans. text_pattern_ops enables index scans for these.
CREATE INDEX IF NOT EXISTS idx_kv_store_key_prefix
  ON kv_store_283d8046 (key text_pattern_ops);

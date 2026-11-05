-- Main HMC database (binding HMC_DB). Replaces kv_store_283d8046, church_audit_log and
-- monthly_impact_snapshots from Postgres. See docs/future/move-off-supabase.md.

-- Values over the spill threshold live in the private hmc-kv R2 bucket: value is NULL, r2_key is set.
CREATE TABLE kv (
  key TEXT PRIMARY KEY,
  value TEXT,
  r2_key TEXT,
  size INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL
) WITHOUT ROWID;
CREATE INDEX idx_kv_updated ON kv (updated_at);

-- Deleted keys, so a rollback can replay deletes back into Postgres.
CREATE TABLE kv_tombstones (
  key TEXT PRIMARY KEY,
  deleted_at INTEGER NOT NULL
) WITHOUT ROWID;
CREATE INDEX idx_kv_tombstones_deleted ON kv_tombstones (deleted_at);

-- created_at is the exact string the API returns; created_us is the same instant in integer
-- microseconds, used for ordering and comparing partner cursors. Not UNIQUE: copied Postgres
-- rows may share a timestamp. New inserts always take max(now, last + 1).
CREATE TABLE church_audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  church_id TEXT,
  church_name TEXT,
  church_city_state TEXT,
  state TEXT NOT NULL,
  country TEXT,
  action TEXT NOT NULL,
  field TEXT,
  old_value TEXT,
  new_value TEXT,
  source TEXT NOT NULL,
  actor_type TEXT,
  actor_id TEXT,
  created_at TEXT NOT NULL,
  created_us INTEGER NOT NULL
);
CREATE INDEX idx_audit_created ON church_audit_log (created_us, id);
CREATE INDEX idx_audit_church ON church_audit_log (church_id, created_us);
CREATE INDEX idx_audit_state ON church_audit_log (state, created_us);
CREATE INDEX idx_audit_action ON church_audit_log (action, created_us);

CREATE TABLE monthly_impact_snapshots (
  month TEXT NOT NULL,
  state_abbrev TEXT NOT NULL DEFAULT '',
  country TEXT,
  total_churches INTEGER NOT NULL DEFAULT 0,
  total_needs_review INTEGER NOT NULL DEFAULT 0,
  pct_needs_review REAL NOT NULL DEFAULT 0,
  missing_address INTEGER NOT NULL DEFAULT 0,
  missing_service_times INTEGER NOT NULL DEFAULT 0,
  missing_denomination INTEGER NOT NULL DEFAULT 0,
  total_corrections INTEGER NOT NULL DEFAULT 0,
  churches_improved INTEGER NOT NULL DEFAULT 0,
  population INTEGER,
  people_per_church INTEGER,
  churches_per_10k REAL,
  PRIMARY KEY (month, state_abbrev)
);

-- Cutover bookkeeping (cutoverAt, max audit id, copy cursors).
CREATE TABLE migration_state (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL
) WITHOUT ROWID;

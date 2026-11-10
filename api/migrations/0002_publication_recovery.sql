-- Transactional publication outbox and recovery-safe large-object retention.
CREATE TABLE publish_outbox (
  target TEXT PRIMARY KEY,
  generation INTEGER NOT NULL DEFAULT 1,
  requested_at INTEGER NOT NULL,
  next_dispatch_at INTEGER NOT NULL DEFAULT 0,
  failures INTEGER NOT NULL DEFAULT 0,
  blocked INTEGER NOT NULL DEFAULT 0,
  last_error TEXT
) WITHOUT ROWID;
CREATE INDEX idx_publish_outbox_dispatch ON publish_outbox(blocked, next_dispatch_at);
CREATE TABLE publish_health (
  target TEXT PRIMARY KEY,
  last_success_at INTEGER,
  last_failure_at INTEGER,
  last_error TEXT
) WITHOUT ROWID;
CREATE TABLE r2_retired_objects (
  r2_key TEXT PRIMARY KEY,
  retired_at INTEGER NOT NULL,
  delete_after INTEGER NOT NULL
) WITHOUT ROWID;
CREATE INDEX idx_r2_retired_delete ON r2_retired_objects(delete_after);
CREATE INDEX idx_kv_r2_reference ON kv(r2_key) WHERE r2_key IS NOT NULL;

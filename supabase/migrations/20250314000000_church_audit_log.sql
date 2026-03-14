-- Church change audit log for data accuracy and transparency
CREATE TABLE IF NOT EXISTS church_audit_log (
  id BIGSERIAL PRIMARY KEY,
  church_id TEXT,
  state TEXT NOT NULL,
  action TEXT NOT NULL,
  field TEXT,
  old_value JSONB,
  new_value JSONB,
  source TEXT NOT NULL,
  actor_type TEXT,
  actor_id TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_church ON church_audit_log(church_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_state ON church_audit_log(state, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_created ON church_audit_log(created_at DESC);

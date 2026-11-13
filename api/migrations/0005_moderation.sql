-- Reversible removals and automated moderation.
-- hidden_churches keeps the full listing so a hide can be undone; nothing is hard-deleted on review.
CREATE TABLE hidden_churches (
  church_id TEXT PRIMARY KEY,
  region TEXT NOT NULL,
  doc TEXT NOT NULL,
  reason TEXT NOT NULL,
  decision_id INTEGER,
  hidden_at INTEGER NOT NULL,
  restored_at INTEGER
) WITHOUT ROWID;
CREATE INDEX idx_hidden_region ON hidden_churches (region, restored_at);

-- One row per proposal under review (churchId|field). stage: church|engine|human|posthoc|done.
CREATE TABLE moderation_items (
  id TEXT PRIMARY KEY,
  church_id TEXT NOT NULL,
  region TEXT NOT NULL,
  field TEXT NOT NULL,
  stage TEXT NOT NULL,
  due_at INTEGER NOT NULL,
  owner_deadline INTEGER,
  lease_until INTEGER NOT NULL DEFAULT 0,
  attempts INTEGER NOT NULL DEFAULT 0,
  last_decision_id INTEGER,
  updated_at INTEGER NOT NULL
) WITHOUT ROWID;
CREATE INDEX idx_mod_items_due ON moderation_items (stage, due_at);
CREATE INDEX idx_mod_items_church ON moderation_items (church_id);

-- Every automated, church and reviewer decision, with its reasons and evidence, so it can be explained and undone.
CREATE TABLE moderation_decisions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id TEXT NOT NULL,
  church_id TEXT NOT NULL,
  field TEXT NOT NULL,
  proposed_value TEXT,
  previous_value TEXT,
  outcome TEXT NOT NULL,
  mode TEXT NOT NULL,
  policy_version TEXT NOT NULL,
  reasons TEXT NOT NULL,
  evidence TEXT,
  removed_submissions TEXT,
  proposal_version TEXT,
  actor TEXT,
  applied INTEGER NOT NULL DEFAULT 0,
  undone_by INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_mod_dec_item ON moderation_decisions (item_id, created_at);
CREATE INDEX idx_mod_dec_outcome ON moderation_decisions (outcome, created_at);

-- Accepted and rejected counts per contributor (HMAC'd identity, never a raw IP).
CREATE TABLE actor_standing (
  actor_hash TEXT PRIMARY KEY,
  approved INTEGER NOT NULL DEFAULT 0,
  rejected INTEGER NOT NULL DEFAULT 0,
  last_at INTEGER NOT NULL
) WITHOUT ROWID;

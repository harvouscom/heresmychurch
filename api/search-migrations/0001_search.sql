-- Search database (binding HMC_SEARCH_DB), separate from HMC_DB for two reasons: D1 runs one
-- query at a time per database, so a heavy search can't block KV reads, and `wrangler d1 export`
-- doesn't support FTS virtual tables, so HMC_DB stays exportable. Rebuildable from the KV search
-- indexes with scripts/backfill-church-search.mjs, so it never needs a backup.

CREATE TABLE church_search (
  cc TEXT NOT NULL,
  region TEXT NOT NULL,
  id TEXT NOT NULL,
  short_id TEXT,
  name TEXT NOT NULL DEFAULT '',
  city TEXT NOT NULL DEFAULT '',
  denomination TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  attendance INTEGER NOT NULL DEFAULT 0,
  lat REAL,
  lng REAL,
  -- normalizeSearchText(name city denomination address), filled in JS: lowercase [a-z0-9] tokens,
  -- space separated and padded with spaces so instr(search_text, ' token ') is a whole-token test.
  search_text TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (cc, region, id)
);
CREATE INDEX idx_church_search_region ON church_search (region);

CREATE VIRTUAL TABLE church_search_fts USING fts5(
  search_text,
  content='church_search',
  content_rowid='rowid',
  tokenize='ascii'
);

-- Writes must be plain INSERT, UPDATE (including ON CONFLICT DO UPDATE) or DELETE. INSERT OR REPLACE
-- skips the delete trigger unless recursive_triggers is on, which would corrupt the index.
CREATE TRIGGER church_search_ai AFTER INSERT ON church_search BEGIN
  INSERT INTO church_search_fts (rowid, search_text) VALUES (new.rowid, new.search_text);
END;
CREATE TRIGGER church_search_ad AFTER DELETE ON church_search BEGIN
  INSERT INTO church_search_fts (church_search_fts, rowid, search_text) VALUES ('delete', old.rowid, old.search_text);
END;
CREATE TRIGGER church_search_au AFTER UPDATE OF search_text ON church_search BEGIN
  INSERT INTO church_search_fts (church_search_fts, rowid, search_text) VALUES ('delete', old.rowid, old.search_text);
  INSERT INTO church_search_fts (rowid, search_text) VALUES (new.rowid, new.search_text);
END;

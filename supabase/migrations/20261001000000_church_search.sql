-- Indexed church search.
--
-- Search used to download every region's search index (a multi-MB JSONB row
-- in kv_store_283d8046) into the edge function and scan it in memory on every
-- query. This table mirrors those indexes row-per-church so Postgres can do
-- the token filtering with a trigram index and return only matching rows.
--
-- The edge function keeps it in sync from writeIdx() (one region at a time,
-- via replace_church_search_region) and falls back to the KV scan until a
-- full backfill has marked it ready.

-- pg_trgm lives in "extensions" on Supabase, but may already be installed in
-- "public" on older projects; resolve the opclass through search_path rather
-- than schema-qualifying it.
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;
SET search_path = public, extensions;

CREATE TABLE IF NOT EXISTS church_search (
  cc TEXT NOT NULL,
  region TEXT NOT NULL,
  id TEXT NOT NULL,
  short_id TEXT,
  name TEXT NOT NULL DEFAULT '',
  city TEXT NOT NULL DEFAULT '',
  denomination TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  attendance INTEGER NOT NULL DEFAULT 0,
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  -- Same normalisation as tokenizeSearchText() in the edge function
  -- (lowercase, non-alphanumerics → single space), padded with spaces so
  -- whole-token matching is LIKE '% token %'.
  search_text TEXT GENERATED ALWAYS AS (
    ' ' || btrim(regexp_replace(lower(name || ' ' || city || ' ' || denomination || ' ' || address), '[^a-z0-9]+', ' ', 'g')) || ' '
  ) STORED,
  PRIMARY KEY (cc, region, id)
);

CREATE INDEX IF NOT EXISTS idx_church_search_region ON church_search (region);
CREATE INDEX IF NOT EXISTS idx_church_search_trgm ON church_search USING gin (search_text gin_trgm_ops);

-- Service role only (the edge function); no public policies.
ALTER TABLE church_search ENABLE ROW LEVEL SECURITY;

-- Atomically replace one region's rows so searches never see a half-written region.
CREATE OR REPLACE FUNCTION replace_church_search_region(p_cc TEXT, p_region TEXT, p_rows JSONB)
RETURNS INTEGER
LANGUAGE plpgsql
SET search_path = public, extensions
AS $$
DECLARE
  n INTEGER;
BEGIN
  DELETE FROM church_search WHERE cc = p_cc AND region = p_region;
  INSERT INTO church_search (cc, region, id, short_id, name, city, denomination, address, attendance, lat, lng)
  SELECT DISTINCT ON (r.id)
    p_cc, p_region, r.id, r.short_id,
    coalesce(r.name, ''), coalesce(r.city, ''), coalesce(r.denomination, ''), coalesce(r.address, ''),
    coalesce(r.attendance, 0), r.lat, r.lng
  FROM jsonb_to_recordset(coalesce(p_rows, '[]'::jsonb)) AS r(
    id TEXT, short_id TEXT, name TEXT, city TEXT, denomination TEXT, address TEXT,
    attendance INTEGER, lat DOUBLE PRECISION, lng DOUBLE PRECISION
  )
  WHERE r.id IS NOT NULL AND r.id <> '';
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

-- Token search with the same rule as the edge function: a row matches when it
-- contains every token (≤2 tokens) or at least ceil(60%) of them (3+ tokens),
-- as whole tokens. The OR of LIKEs lets the planner use the trigram index;
-- the sum then enforces the minimum.
CREATE OR REPLACE FUNCTION search_churches(p_tokens TEXT[], p_regions TEXT[] DEFAULT NULL, p_limit INTEGER DEFAULT 1000)
RETURNS TABLE (
  cc TEXT, region TEXT, id TEXT, short_id TEXT, name TEXT, city TEXT,
  denomination TEXT, address TEXT, attendance INTEGER, lat DOUBLE PRECISION, lng DOUBLE PRECISION,
  match_count INTEGER
)
LANGUAGE plpgsql
STABLE
SET search_path = public, extensions
AS $$
DECLARE
  toks TEXT[];
  n INTEGER;
  min_required INTEGER;
  any_clause TEXT;
  count_expr TEXT;
BEGIN
  SELECT array_agg(DISTINCT t) INTO toks
  FROM unnest(coalesce(p_tokens, '{}'::text[])) AS t
  WHERE t ~ '^[a-z0-9]+$';
  n := coalesce(array_length(toks, 1), 0);
  IF n = 0 THEN
    RETURN;
  END IF;
  min_required := CASE WHEN n <= 2 THEN n ELSE greatest(1, ceil(n * 0.6)::int) END;

  SELECT string_agg(format('s.search_text LIKE %L', '% ' || t || ' %'), ' OR '),
         string_agg(format('(s.search_text LIKE %L)::int', '% ' || t || ' %'), ' + ')
    INTO any_clause, count_expr
  FROM unnest(toks) AS t;

  RETURN QUERY EXECUTE format(
    'SELECT * FROM (
       SELECT s.cc, s.region, s.id, s.short_id, s.name, s.city, s.denomination, s.address,
              s.attendance, s.lat, s.lng, (%s)::int AS match_count
       FROM church_search s
       WHERE ($1 IS NULL OR s.region = ANY($1)) AND (%s)
     ) m
     WHERE m.match_count >= %s
     ORDER BY m.match_count DESC, m.attendance DESC
     LIMIT %s',
    count_expr, any_clause, min_required, greatest(1, least(coalesce(p_limit, 1000), 5000))
  ) USING p_regions;
END;
$$;

REVOKE ALL ON FUNCTION replace_church_search_region(TEXT, TEXT, JSONB) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION search_churches(TEXT[], TEXT[], INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION replace_church_search_region(TEXT, TEXT, JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION search_churches(TEXT[], TEXT[], INTEGER) TO service_role;

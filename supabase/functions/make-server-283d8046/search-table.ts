/**
 * Indexed church search: table church_search in Postgres (migration
 * 20261001000000_church_search.sql) or D1 (api/search-migrations), per STORE_BACKEND.
 *
 * Mirrors the per-region KV search indexes row-per-church so search can filter
 * with a trigram index instead of downloading every region's index. Search only
 * uses it once a full backfill has set the ready flag; any sync failure clears
 * the flag so search falls back to the KV scan rather than serving stale rows.
 */
import { createClient } from "jsr:@supabase/supabase-js@2.49.8";
import { getSearchD1 } from "./bindings.ts";
import { rawKv, usesD1 } from "./kv-backend.ts";
import { withRetry } from "./kv-d1.ts";
import { env } from "./runtime.ts";

const READY_KEY = "church-search:ready";
const READY_TTL_MS = 60_000;

let _client: ReturnType<typeof createClient> | null = null;
function client() {
  if (!_client) {
    _client = createClient(env("SUPABASE_URL")!, env("SUPABASE_SERVICE_ROLE_KEY")!);
  }
  return _client;
}

let readyCache: { at: number; ready: boolean } | null = null;

export async function isSearchTableReady(): Promise<boolean> {
  if (readyCache && Date.now() - readyCache.at < READY_TTL_MS) return readyCache.ready;
  let ready = false;
  try {
    const v = await rawKv().get(READY_KEY);
    ready = !!(v && typeof v === "object" && v.ready === true);
  } catch (_) { /* treat as not ready */ }
  readyCache = { at: Date.now(), ready };
  return ready;
}

export async function setSearchTableReady(ready: boolean, reason?: "backfill" | "sync-failed"): Promise<void> {
  readyCache = { at: Date.now(), ready };
  await rawKv().set(READY_KEY, { ready, at: new Date().toISOString(), ...(reason ? { reason } : {}) });
}

/**
 * Replace one region's rows from its search index entries (buildIdx shape:
 * {id, shortId, n, c, d, a, ad, la, lo}). Never throws; on failure clears the
 * ready flag so search stops trusting the table until the next backfill.
 */
export async function syncSearchRegion(cc: string, region: string, idx: any[]): Promise<boolean> {
  try {
    const rows = (Array.isArray(idx) ? idx : []).map((e: any) => ({
      id: e?.id,
      short_id: e?.shortId ?? null,
      name: e?.n || "",
      city: e?.c || "",
      denomination: e?.d || "",
      address: e?.ad || "",
      attendance: Number.isFinite(e?.a) ? Math.round(e.a) : 0,
      lat: Number.isFinite(e?.la) ? e.la : null,
      lng: Number.isFinite(e?.lo) ? e.lo : null,
    }));
    if (usesD1()) {
      await syncRegionD1(cc.toUpperCase(), region.toUpperCase(), rows);
      return true;
    }
    const { error } = await client().rpc("replace_church_search_region", {
      p_cc: cc.toUpperCase(),
      p_region: region.toUpperCase(),
      p_rows: rows,
    });
    if (error) throw new Error(error.message);
    return true;
  } catch (e) {
    console.log(`church_search sync failed for ${cc}:${region}: ${e}`);
    try { await setSearchTableReady(false, "sync-failed"); } catch (_) { /* ignore */ }
    return false;
  }
}

/**
 * Token search across regions. Returns rows grouped by region in the KV index
 * entry shape ({id, shortId, n, c, d, a, ad, la, lo}), or null when the table
 * isn't ready or the query failed (caller falls back to the KV scan).
 */
export async function searchTable(
  tokens: string[],
  regions: string[] | null,
  limit = 1000,
): Promise<Map<string, any[]> | null> {
  if (!tokens.length || !(await isSearchTableReady())) return null;
  try {
    if (usesD1()) return await searchD1(tokens, regions, limit);
    const { data, error } = await client().rpc("search_churches", {
      p_tokens: tokens,
      p_regions: regions && regions.length ? regions.map((r) => r.toUpperCase()) : null,
      p_limit: limit,
    });
    if (error) throw new Error(error.message);
    const byRegion = new Map<string, any[]>();
    for (const r of (data ?? []) as any[]) {
      const list = byRegion.get(r.region) ?? [];
      list.push({
        id: r.id, shortId: r.short_id ?? undefined, n: r.name, c: r.city, d: r.denomination,
        a: r.attendance, ad: r.address, la: r.lat ?? 0, lo: r.lng ?? 0,
      });
      byRegion.set(r.region, list);
    }
    return byRegion;
  } catch (e) {
    console.log(`church_search query failed, falling back to KV: ${e}`);
    return null;
  }
}

// ── D1 ──

/** Lowercase [a-z0-9] tokens, single spaced. The one definition, shared with the search route. */
export function normalizeSearchText(text: string): string {
  if (!text) return "";
  return text.toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

type SearchRow = {
  id: string; short_id: string | null; name: string; city: string; denomination: string;
  address: string; attendance: number; lat: number | null; lng: number | null; search_text?: string;
};

/** About 800 KB of JSON per statement keeps each one well under D1's 2 MB bound-value limit. */
const SYNC_CHUNK_BYTES = 800 * 1024;
const SEARCH_COLUMNS = ["id", "short_id", "name", "city", "denomination", "address", "attendance", "lat", "lng", "search_text"] as const;
const MAX_SEARCH_TOKENS = 8;

function sameRow(a: SearchRow, b: SearchRow): boolean {
  return SEARCH_COLUMNS.every((c) => (a[c] ?? null) === (b[c] ?? null));
}

function chunkByBytes<T>(items: T[]): string[] {
  const chunks: string[] = [];
  let part: string[] = [];
  let bytes = 0;
  for (const item of items) {
    const json = JSON.stringify(item);
    if (part.length && bytes + json.length > SYNC_CHUNK_BYTES) {
      chunks.push(`[${part.join(",")}]`);
      part = [];
      bytes = 0;
    }
    part.push(json);
    bytes += json.length;
  }
  if (part.length) chunks.push(`[${part.join(",")}]`);
  return chunks;
}

/**
 * Writes only the rows that changed, atomically. A correction changes one church but this runs for
 * the whole region, and rewriting Texas with its FTS entries each time would cost about 100k row writes.
 * Uses ON CONFLICT DO UPDATE because INSERT OR REPLACE would skip the FTS delete trigger.
 */
async function syncRegionD1(cc: string, region: string, rows: SearchRow[]): Promise<void> {
  const db = getSearchD1();
  const { results } = await withRetry(() =>
    db
      .prepare(`SELECT ${SEARCH_COLUMNS.join(", ")} FROM church_search WHERE cc = ?1 AND region = ?2`)
      .bind(cc, region)
      .all<SearchRow>(),
  );
  const existing = new Map((results ?? []).map((r) => [r.id, r]));

  const next = new Map<string, SearchRow>();
  for (const r of rows) {
    if (!r.id || next.has(r.id)) continue;
    const text = normalizeSearchText(`${r.name} ${r.city} ${r.denomination} ${r.address}`);
    next.set(r.id, { ...r, search_text: ` ${text} ` });
  }

  const changed = [...next.values()].filter((r) => {
    const old = existing.get(r.id);
    return !old || !sameRow(old, r);
  });
  const removed = [...existing.keys()].filter((id) => !next.has(id));
  if (!changed.length && !removed.length) return;

  const updates = SEARCH_COLUMNS.filter((c) => c !== "id").map((c) => `${c} = excluded.${c}`).join(", ");
  const extract = SEARCH_COLUMNS.map((c) => `json_extract(j.value, '$.${c}')`).join(", ");
  const statements = [
    ...chunkByBytes(removed).map((chunk) =>
      db
        .prepare("DELETE FROM church_search WHERE cc = ?1 AND region = ?2 AND id IN (SELECT value FROM json_each(?3))")
        .bind(cc, region, chunk),
    ),
    ...chunkByBytes(changed).map((chunk) =>
      db
        .prepare(
          `INSERT INTO church_search (cc, region, ${SEARCH_COLUMNS.join(", ")})
           SELECT ?1, ?2, ${extract} FROM json_each(?3) AS j WHERE true
           ON CONFLICT(cc, region, id) DO UPDATE SET ${updates}`,
        )
        .bind(cc, region, chunk),
    ),
  ];
  await withRetry(() => db.batch(statements));
}

/** Tokens a row must contain: all of them up to two, otherwise at least 60%. */
export function minTokenMatches(tokenCount: number): number {
  return tokenCount <= 2 ? tokenCount : Math.max(1, Math.ceil(tokenCount * 0.6));
}

function subsets(items: string[], size: number): string[][] {
  if (size === 0) return [[]];
  if (items.length < size) return [];
  const [first, ...rest] = items;
  return [...subsets(rest, size - 1).map((s) => [first, ...s]), ...subsets(rest, size)];
}

/** FTS5 query for "contains at least `min` of these tokens". Tokens must already be [a-z0-9]+. */
export function buildMatchQuery(tokens: string[], min: number): string {
  return subsets(tokens, min)
    .map((group) => `(${group.map((t) => `"${t}"`).join(" AND ")})`)
    .join(" OR ");
}

async function searchD1(tokens: string[], regions: string[] | null, limit: number): Promise<Map<string, any[]>> {
  const unique = [...new Set(tokens.filter((t) => /^[a-z0-9]+$/.test(t)))].slice(0, MAX_SEARCH_TOKENS);
  const byRegion = new Map<string, any[]>();
  if (!unique.length) return byRegion;

  const params: unknown[] = [buildMatchQuery(unique, minTokenMatches(unique.length))];
  const matchCount = unique
    .map((t) => {
      params.push(` ${t} `);
      return `(instr(s.search_text, ?${params.length}) > 0)`;
    })
    .join(" + ");
  let regionFilter = "";
  if (regions && regions.length) {
    params.push(JSON.stringify(regions.map((r) => r.toUpperCase())));
    regionFilter = `AND s.region IN (SELECT value FROM json_each(?${params.length}))`;
  }
  params.push(Math.max(1, Math.min(limit || 1000, 5000)));
  const sql = `SELECT s.region, s.id, s.short_id, s.name, s.city, s.denomination, s.address, s.attendance, s.lat, s.lng,
      ${matchCount} AS match_count
    FROM church_search_fts f JOIN church_search s ON s.rowid = f.rowid
    WHERE church_search_fts MATCH ?1 ${regionFilter}
    ORDER BY match_count DESC, s.attendance DESC
    LIMIT ?${params.length}`;
  const { results } = await withRetry(() => getSearchD1().prepare(sql).bind(...params).all<any>());
  for (const r of results ?? []) {
    const list = byRegion.get(r.region) ?? [];
    list.push({
      id: r.id, shortId: r.short_id ?? undefined, n: r.name, c: r.city, d: r.denomination,
      a: r.attendance, ad: r.address, la: r.lat ?? 0, lo: r.lng ?? 0,
    });
    byRegion.set(r.region, list);
  }
  return byRegion;
}

/**
 * Postgres-backed church search (table church_search, see migration
 * 20261001000000_church_search.sql).
 *
 * Mirrors the per-region KV search indexes row-per-church so search can filter
 * with a trigram index instead of downloading every region's index. Search only
 * uses it once a full backfill has set the ready flag; any sync failure clears
 * the flag so search falls back to the KV scan rather than serving stale rows.
 */
import { createClient } from "jsr:@supabase/supabase-js@2.49.8";
import * as kv from "./kv_store.tsx";

const READY_KEY = "church-search:ready";
const READY_TTL_MS = 60_000;

let _client: ReturnType<typeof createClient> | null = null;
function client() {
  if (!_client) {
    _client = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  }
  return _client;
}

let readyCache: { at: number; ready: boolean } | null = null;

export async function isSearchTableReady(): Promise<boolean> {
  if (readyCache && Date.now() - readyCache.at < READY_TTL_MS) return readyCache.ready;
  let ready = false;
  try {
    const v = await kv.get(READY_KEY);
    ready = !!(v && typeof v === "object" && v.ready === true);
  } catch (_) { /* treat as not ready */ }
  readyCache = { at: Date.now(), ready };
  return ready;
}

export async function setSearchTableReady(ready: boolean, reason?: "backfill" | "sync-failed"): Promise<void> {
  readyCache = { at: Date.now(), ready };
  await kv.set(READY_KEY, { ready, at: new Date().toISOString(), ...(reason ? { reason } : {}) });
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

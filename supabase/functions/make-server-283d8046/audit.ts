// Church change audit log — non-throwing; failures must not break mutations
import { createClient } from "jsr:@supabase/supabase-js@2.49.8";
import { getD1 } from "./bindings.ts";
import { isFrozen, usesD1 } from "./kv-backend.ts";
import { withRetry } from "./kv-d1.ts";
import { env, waitUntil } from "./runtime.ts";

// Reuse a single client instance to avoid per-request connection overhead
let _client: ReturnType<typeof createClient> | null = null;
function getClient() {
  if (!_client) {
    const url = env("SUPABASE_URL");
    const key = env("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !key) throw new Error("Missing Supabase env");
    _client = createClient(url, key);
  }
  return _client;
}

export type AuditEntry = {
  church_id?: string | null;
  church_name?: string | null;
  church_city_state?: string | null;
  state: string;
  /** ISO 3166-1 alpha-2; optional for back-compat with existing callers. */
  country?: string | null;
  action: string;
  field?: string | null;
  old_value?: unknown;
  new_value?: unknown;
  source: string;
  actor_type?: "ip" | "moderator" | "system";
  actor_id?: string | null;
};

function hashForAudit(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return Math.abs(h).toString(36);
}

/** Insert an audit row. Registered with waitUntil so fire-and-forget callers
 *  (`void recordChurchAudit(...)`) aren't cut off after the response on Workers. */
export function recordChurchAudit(
  entry: AuditEntry,
  opts?: { hashIp?: string; hashModKey?: string }
): Promise<void> {
  const p = recordChurchAuditNow(entry, opts);
  waitUntil(p);
  return p;
}

async function recordChurchAuditNow(
  entry: AuditEntry,
  opts?: { hashIp?: string; hashModKey?: string }
): Promise<void> {
  try {
    // A row written after the final copy of a cutover would be lost.
    if (isFrozen()) {
      console.warn(`audit: frozen, skipped ${entry.action} for ${entry.church_id ?? entry.state}`);
      return;
    }
    let actor_type = entry.actor_type ?? null;
    let actor_id: string | null = entry.actor_id ?? null;
    if (opts?.hashIp) {
      actor_type = "ip";
      actor_id = hashForAudit(opts.hashIp);
    } else if (opts?.hashModKey) {
      actor_type = "moderator";
      actor_id = hashForAudit(opts.hashModKey);
    }
    const row = {
      church_id: entry.church_id ?? null,
      church_name: entry.church_name ?? null,
      church_city_state: entry.church_city_state ?? null,
      state: entry.state,
      country: entry.country ?? null,
      action: entry.action,
      field: entry.field ?? null,
      old_value: entry.old_value ?? null,
      new_value: entry.new_value ?? null,
      source: entry.source,
      actor_type,
      actor_id,
    };
    if (usesD1()) {
      await insertAuditRowD1(row);
      return;
    }
    let client: ReturnType<typeof createClient>;
    try { client = getClient(); } catch { return; }
    const { error } = await client.from("church_audit_log").insert(row);
    if (error) console.error("audit insert error:", error.message);
  } catch (e) {
    console.error("recordChurchAudit error:", e);
  }
}

// ── D1 ──
// Partners poll with "rows after this timestamp", so every new row must sort strictly after the
// last one. D1 runs writes one at a time, so max(now, last + 1) in a single statement guarantees it.
// created_at stays in Postgres's format with microseconds and a +00:00 offset.
const INSERT_AUDIT_D1 = `INSERT INTO church_audit_log
    (church_id, church_name, church_city_state, state, country, action, field, old_value, new_value, source, actor_type, actor_id, created_at, created_us)
  SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12,
    strftime('%Y-%m-%dT%H:%M:%S', t.us / 1000000, 'unixepoch') || '.' || printf('%06d', t.us % 1000000) || '+00:00',
    t.us
  FROM (SELECT max(CAST(?13 AS INTEGER), coalesce((SELECT max(created_us) FROM church_audit_log), 0) + 1) AS us) AS t`;

function jsonOrNull(v: unknown): string | null {
  return v === null || v === undefined ? null : JSON.stringify(v);
}

async function insertAuditRowD1(row: Record<string, any>): Promise<void> {
  // A rare duplicate from a retry is harmless to partners; a dropped row is a missed change.
  await withRetry(() =>
    getD1()
      .prepare(INSERT_AUDIT_D1)
      .bind(
        row.church_id, row.church_name, row.church_city_state, row.state, row.country, row.action, row.field,
        jsonOrNull(row.old_value), jsonOrNull(row.new_value), row.source, row.actor_type, row.actor_id,
        Date.now() * 1000,
      )
      .run(),
  );
}

function parseAuditJson(text: unknown): unknown {
  if (typeof text !== "string") return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function fromD1(row: any): AuditLogRow {
  const { created_us: _createdUs, ...rest } = row;
  return { ...rest, old_value: parseAuditJson(row.old_value), new_value: parseAuditJson(row.new_value) };
}

async function queryD1(where: string, params: unknown[], limit: number, ascending = false): Promise<AuditLogRow[]> {
  const dir = ascending ? "ASC" : "DESC";
  const sql = `SELECT * FROM church_audit_log ${where} ORDER BY created_us ${dir}, id ${dir} LIMIT ${limit}`;
  const { results } = await withRetry(() => getD1().prepare(sql).bind(...params).all());
  return (results ?? []).map(fromD1);
}

/**
 * Exact integer microseconds for any timestamp the API accepts or has returned: Postgres's trimmed
 * fractions (.25057+00:00), six digits, milliseconds, Z, or another offset. A JS Date only keeps
 * milliseconds, which would make the partner feed return its own cursor row forever.
 */
export function isoToMicros(iso: string): number {
  const m = iso.trim().match(/^(.*T\d{2}:\d{2}:\d{2})(?:\.(\d{1,6}))?(Z|[+-]\d{2}:?\d{2})?$/);
  if (!m) throw new Error(`Invalid timestamp: ${iso}`);
  const offset = m[3] ? (m[3] === "Z" ? "Z" : `${m[3].slice(0, 3)}:${m[3].slice(-2)}`) : "Z";
  const seconds = Date.parse(`${m[1]}${offset}`);
  if (Number.isNaN(seconds)) throw new Error(`Invalid timestamp: ${iso}`);
  return seconds * 1000 + Number((m[2] ?? "").padEnd(6, "0"));
}

export type AuditLogRow = {
  id: number;
  church_id: string | null;
  church_name: string | null;
  church_city_state: string | null;
  state: string;
  action: string;
  field: string | null;
  old_value: unknown;
  new_value: unknown;
  source: string;
  actor_type: string | null;
  actor_id: string | null;
  created_at: string;
};

const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 500;

export async function queryAuditRecent(limit = DEFAULT_LIMIT): Promise<AuditLogRow[]> {
  const n = Math.min(Math.max(1, limit), MAX_LIMIT);
  if (usesD1()) return queryD1("", [], n);
  const { data, error } = await getClient()
    .from("church_audit_log")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(n);
  if (error) throw new Error(error.message);
  return (data ?? []) as AuditLogRow[];
}

export async function queryAuditByState(state: string, limit = DEFAULT_LIMIT): Promise<AuditLogRow[]> {
  const n = Math.min(Math.max(1, limit), MAX_LIMIT);
  if (usesD1()) return queryD1("WHERE state = ?1", [state.toUpperCase()], n);
  const { data, error } = await getClient()
    .from("church_audit_log")
    .select("*")
    .eq("state", state.toUpperCase())
    .order("created_at", { ascending: false })
    .limit(n);
  if (error) throw new Error(error.message);
  return (data ?? []) as AuditLogRow[];
}

export async function queryAuditByChurch(churchId: string, limit = 100): Promise<AuditLogRow[]> {
  const n = Math.min(Math.max(1, limit), MAX_LIMIT);
  if (usesD1()) return queryD1("WHERE church_id = ?1", [churchId], n);
  const { data, error } = await getClient()
    .from("church_audit_log")
    .select("*")
    .eq("church_id", churchId)
    .order("created_at", { ascending: false })
    .limit(n);
  if (error) throw new Error(error.message);
  return (data ?? []) as AuditLogRow[];
}

/** Actions that affect partner denormalized snapshots (name/location/existence). */
export const PARTNER_CHANGE_ACTIONS = [
  "field_updated",
  "church_removed",
  "church_added",
] as const;

export type PartnerChangeAction = (typeof PARTNER_CHANGE_ACTIONS)[number];

const CHANGES_DEFAULT_LIMIT = 100;
const CHANGES_MAX_LIMIT = 500;

/**
 * Chronological partner change feed: rows with created_at strictly after `sinceIso`,
 * filtered to snapshot-relevant actions. Ascending for watermark-friendly pagination.
 */
export async function queryAuditChangesSince(
  sinceIso: string,
  limit = CHANGES_DEFAULT_LIMIT
): Promise<AuditLogRow[]> {
  const n = Math.min(Math.max(1, limit), CHANGES_MAX_LIMIT);
  if (usesD1()) {
    const actions = PARTNER_CHANGE_ACTIONS.map((_, i) => `?${i + 2}`).join(", ");
    return queryD1(
      `WHERE created_us > CAST(?1 AS INTEGER) AND action IN (${actions}) AND church_id IS NOT NULL`,
      [isoToMicros(sinceIso), ...PARTNER_CHANGE_ACTIONS],
      n,
      true,
    );
  }
  const { data, error } = await getClient()
    .from("church_audit_log")
    .select("*")
    .gt("created_at", sinceIso)
    .in("action", [...PARTNER_CHANGE_ACTIONS])
    .not("church_id", "is", null)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true })
    .limit(n);
  if (error) throw new Error(error.message);
  return (data ?? []) as AuditLogRow[];
}

// Church change audit log — non-throwing; failures must not break mutations
import { createClient } from "jsr:@supabase/supabase-js@2.49.8";

// Reuse a single client instance to avoid per-request connection overhead
let _client: ReturnType<typeof createClient> | null = null;
function getClient() {
  if (!_client) {
    const url = Deno.env.get("SUPABASE_URL");
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
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

export async function recordChurchAudit(
  entry: AuditEntry,
  opts?: { hashIp?: string; hashModKey?: string }
): Promise<void> {
  try {
    let client: ReturnType<typeof createClient>;
    try { client = getClient(); } catch { return; }
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
      action: entry.action,
      field: entry.field ?? null,
      old_value: entry.old_value ?? null,
      new_value: entry.new_value ?? null,
      source: entry.source,
      actor_type,
      actor_id,
    };
    const { error } = await client.from("church_audit_log").insert(row);
    if (error) console.error("audit insert error:", error.message);
  } catch (e) {
    console.error("recordChurchAudit error:", e);
  }
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
  const { data, error } = await getClient()
    .from("church_audit_log")
    .select("*")
    .eq("church_id", churchId)
    .order("created_at", { ascending: false })
    .limit(n);
  if (error) throw new Error(error.message);
  return (data ?? []) as AuditLogRow[];
}

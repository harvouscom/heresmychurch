// One-time tooling for moving from Postgres to D1 (docs/future/move-off-supabase.md), driven by
// scripts/migrate-to-d1.mjs. Runs inside the Worker so it uses the existing service secret and no
// keys are handled locally. Every route is resumable and checks the moderator key.
//
// These read Postgres and write D1 regardless of STORE_BACKEND, and bypass kv.ts, so copying doesn't
// republish static files or mark regions dirty for Lookup. Only `replay` writes to Postgres.
import { createClient } from "jsr:@supabase/supabase-js@2.49.8";
import { isoToMicros } from "./audit.ts";
import { getD1 } from "./bindings.ts";
import * as d1Kv from "./kv-d1.ts";
import { upsertMonthlyRowsD1 } from "./monthly.ts";
import { env } from "./runtime.ts";

const KV_TABLE = "kv_store_283d8046";
const AUDIT_TABLE = "church_audit_log";
const MONTHLY_TABLE = "monthly_impact_snapshots";
const READY_KEY = "church-search:ready";
const EPHEMERAL_PREFIX = "ratelimit:";
const TIME_BUDGET_MS = 20_000;
const KEY_PAGE = 200;
const CONCURRENCY = 4;
const AUDIT_PAGE = 500;
const D1_BATCH = 50;

type Pg = ReturnType<typeof createClient>;
let pgOverride: Pg | null = null;
/** Tests swap in a fake. */
export function setPostgresForTest(client: unknown): void {
  pgOverride = client as Pg;
}
let pgClient: Pg | null = null;
const pg = (): Pg => pgOverride ?? (pgClient ??= createClient(env("SUPABASE_URL")!, env("SUPABASE_SERVICE_ROLE_KEY")!));

/** Recursively sorted keys, so two copies of a value compare equal whatever order they're stored in. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    const o = value as Record<string, unknown>;
    return `{${Object.keys(o).sort().filter((k) => o[k] !== undefined).map((k) => `${JSON.stringify(k)}:${canonicalJson(o[k])}`).join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}

/** Next page of Postgres keys, in Postgres's own order. */
async function postgresKeys(after: string): Promise<string[]> {
  let q = pg().from(KV_TABLE).select("key").order("key").limit(KEY_PAGE);
  if (after) q = q.gt("key", after);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []).map((r: any) => r.key);
}

async function postgresValue(key: string): Promise<{ found: boolean; value?: unknown }> {
  const { data, error } = await pg().from(KV_TABLE).select("value").eq("key", key).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? { found: true, value: (data as any).value } : { found: false };
}

async function inParallel<T>(items: T[], worker: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, items.length) }, async () => {
    while (next < items.length) await worker(items[next++]);
  }));
}

/** Runs key pages until the time budget runs out. Returns the last finished key, or null when done. */
async function forKeyPages(after: string, fn: (keys: string[]) => Promise<void>): Promise<string | null> {
  const started = Date.now();
  let cursor = after;
  for (;;) {
    const keys = await postgresKeys(cursor);
    if (!keys.length) return null;
    await fn(keys);
    cursor = keys[keys.length - 1];
    if (keys.length < KEY_PAGE) return null;
    if (Date.now() - started > TIME_BUDGET_MS) return cursor;
  }
}

function familyOf(key: string): string {
  const i = key.indexOf(":");
  return i < 0 ? key : key.slice(0, i);
}

const ROUTES: Record<string, (q: (name: string) => string | undefined) => Promise<unknown>> = {
  /** Copies KV rows, skipping any already identical. Search stays "not ready" until a backfill. */
  async kv(q) {
    let copied = 0, unchanged = 0, bytes = 0;
    const next = await forKeyPages(q("cursor") ?? "", async (keys) => {
      await inParallel(keys.filter((k) => !k.startsWith(EPHEMERAL_PREFIX)), async (key) => {
        const source = await postgresValue(key);
        if (!source.found) return;
        if (key === READY_KEY) {
          await d1Kv.set(key, { ready: false, at: new Date().toISOString(), reason: "backfill" });
          return;
        }
        const json = JSON.stringify(source.value);
        bytes += json.length;
        if ((await d1Kv.getRawJson(key)) === json) {
          unchanged++;
          return;
        }
        await d1Kv.set(key, source.value);
        copied++;
      });
    });
    return { next, copied, unchanged, bytes };
  },

  /**
   * Deletes D1 keys no longer in Postgres, so a key deleted after the pre-copy doesn't come back.
   * Asks Postgres about each key instead of comparing ranges: the two databases sort keys differently.
   * ?dryRun=1 only reports them.
   */
  async prune(q) {
    const dryRun = q("dryRun") === "1";
    const { results } = await getD1()
      .prepare(`SELECT key FROM kv WHERE key > ?1 ORDER BY key LIMIT ${KEY_PAGE}`)
      .bind(q("cursor") ?? "")
      .all<{ key: string }>();
    const keys = (results ?? []).map((r) => r.key);
    if (!keys.length) return { next: null, extra: [] };
    const { data, error } = await pg().from(KV_TABLE).select("key").in("key", keys);
    if (error) throw new Error(error.message);
    const present = new Set((data ?? []).map((r: any) => r.key));
    const extra = keys.filter((k) => !present.has(k) && !k.startsWith(EPHEMERAL_PREFIX));
    if (!dryRun) await d1Kv.mdel(extra);
    return { next: keys.length < KEY_PAGE ? null : keys[keys.length - 1], extra };
  },

  /** Copies audit rows by id, keeping the id and exact timestamp text, so old cursors still line up. */
  async audit(q) {
    const after = Number(q("afterId") ?? 0);
    const { data, error } = await pg().from(AUDIT_TABLE).select("*").gt("id", after).order("id", { ascending: true }).limit(AUDIT_PAGE);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as any[];
    const db = getD1();
    const json = (v: unknown) => (v === null || v === undefined ? null : JSON.stringify(v));
    for (let i = 0; i < rows.length; i += D1_BATCH) {
      await d1Kv.withRetry(() => db.batch(rows.slice(i, i + D1_BATCH).map((r) =>
        db.prepare(
          `INSERT INTO church_audit_log (id, church_id, church_name, church_city_state, state, country, action, field, old_value, new_value, source, actor_type, actor_id, created_at, created_us)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, CAST(?15 AS INTEGER)) ON CONFLICT(id) DO NOTHING`,
        ).bind(
          r.id, r.church_id ?? null, r.church_name ?? null, r.church_city_state ?? null, r.state, r.country ?? null, r.action,
          r.field ?? null, json(r.old_value), json(r.new_value), r.source, r.actor_type ?? null, r.actor_id ?? null,
          r.created_at, isoToMicros(r.created_at),
        ))));
    }
    return { next: rows.length < AUDIT_PAGE ? null : rows[rows.length - 1].id, copied: rows.length };
  },

  async monthly() {
    const { data, error } = await pg().from(MONTHLY_TABLE).select("*").limit(100_000);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as any[];
    for (let i = 0; i < rows.length; i += D1_BATCH) await upsertMonthlyRowsD1(rows.slice(i, i + D1_BATCH));
    return { next: null, copied: rows.length };
  },

  /** Compares values with Postgres. Zero mismatches only means something while frozen. */
  async verify(q) {
    const mismatched: string[] = [], missing: string[] = [];
    const families: Record<string, number> = {};
    let checked = 0;
    const next = await forKeyPages(q("cursor") ?? "", async (keys) => {
      await inParallel(keys.filter((k) => !k.startsWith(EPHEMERAL_PREFIX)), async (key) => {
        if (key === READY_KEY) return;
        const source = await postgresValue(key);
        if (!source.found) return;
        families[familyOf(key)] = (families[familyOf(key)] ?? 0) + 1;
        checked++;
        const raw = await d1Kv.getRawJson(key);
        if (raw === null) missing.push(key);
        else if (canonicalJson(source.value) !== canonicalJson(JSON.parse(raw))) mismatched.push(key);
      });
    });
    return { next, checked, mismatched, missing, families };
  },

  /** Row counts on the D1 side, plus audit and monthly totals from both, to compare with verify. */
  async counts() {
    const db = getD1();
    const { results } = await db.prepare(
      "SELECT substr(key, 1, instr(key || ':', ':') - 1) AS family, count(*) AS n FROM kv WHERE key NOT LIKE 'ratelimit:%' AND key <> ?1 GROUP BY 1",
    ).bind(READY_KEY).all<{ family: string; n: number }>();
    const audit = await db.prepare("SELECT count(*) AS n, max(id) AS max_id FROM church_audit_log").first<any>();
    const monthly = await db.prepare("SELECT count(*) AS n FROM monthly_impact_snapshots").first<any>();
    const count = async (table: string) => {
      const { count: n, error } = await pg().from(table).select("*", { count: "exact", head: true });
      if (error) throw new Error(error.message);
      return n ?? 0;
    };
    const { data: top, error } = await pg().from(AUDIT_TABLE).select("id").order("id", { ascending: false }).limit(1);
    if (error) throw new Error(error.message);
    return {
      d1: { families: Object.fromEntries((results ?? []).map((r) => [r.family, r.n])), audit: audit?.n ?? 0, auditMaxId: audit?.max_id ?? 0, monthly: monthly?.n ?? 0 },
      postgres: { audit: await count(AUDIT_TABLE), auditMaxId: (top as any)?.[0]?.id ?? 0, monthly: await count(MONTHLY_TABLE) },
    };
  },

  /** Records where production switched, which is what `replay` works from. */
  async "mark-cutover"() {
    const db = getD1();
    const audit = await db.prepare("SELECT max(id) AS max_id FROM church_audit_log").first<any>();
    const state = { cutoverAt: Date.now(), auditMaxId: audit?.max_id ?? 0 };
    await db.prepare(
      "INSERT INTO migration_state (key, value, updated_at) VALUES ('cutover', ?1, ?2) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
    ).bind(JSON.stringify(state), state.cutoverAt).run();
    return state;
  },

  /**
   * Rollback: writes everything changed in D1 since the cutover back to Postgres, one section at a
   * time. The only route that writes to Postgres, so it requires ?confirm=write-postgres and a freeze.
   */
  async replay(q) {
    if (q("confirm") !== "write-postgres") throw new HttpError(400, "replay writes to Postgres: pass confirm=write-postgres");
    if (!env("MAINTENANCE_READONLY")) throw new HttpError(409, "replay needs MAINTENANCE_READONLY set");
    const db = getD1();
    const row = await db.prepare("SELECT value FROM migration_state WHERE key = 'cutover'").first<{ value: string }>();
    if (!row) throw new HttpError(409, "no cutover recorded");
    const { cutoverAt, auditMaxId } = JSON.parse(row.value) as { cutoverAt: number; auditMaxId: number };
    const section = q("section");
    const cursor = q("cursor") ?? "";

    if (section === "kv") {
      const { results } = await db.prepare(
        `SELECT key FROM kv WHERE updated_at >= ?1 AND key > ?2 ORDER BY key LIMIT ${KEY_PAGE}`,
      ).bind(cutoverAt, cursor).all<{ key: string }>();
      const keys = (results ?? []).map((r) => r.key).filter((k) => !k.startsWith(EPHEMERAL_PREFIX));
      await inParallel(keys, async (key) => {
        const raw = await d1Kv.getRawJson(key);
        if (raw === null) return;
        const { error } = await pg().from(KV_TABLE).upsert({ key, value: JSON.parse(raw) });
        if (error) throw new Error(error.message);
      });
      const all = results ?? [];
      return { next: all.length < KEY_PAGE ? null : all[all.length - 1].key, replayed: keys.length };
    }
    if (section === "tombstones") {
      const { results } = await db.prepare(
        `SELECT key FROM kv_tombstones WHERE deleted_at >= ?1 AND key > ?2 ORDER BY key LIMIT ${KEY_PAGE}`,
      ).bind(cutoverAt, cursor).all<{ key: string }>();
      const keys = (results ?? []).map((r) => r.key);
      if (keys.length) {
        const { error } = await pg().from(KV_TABLE).delete().in("key", keys);
        if (error) throw new Error(error.message);
      }
      return { next: keys.length < KEY_PAGE ? null : keys[keys.length - 1], replayed: keys.length };
    }
    if (section === "audit") {
      const after = Math.max(Number(cursor || 0), auditMaxId);
      const { results } = await db.prepare(
        `SELECT * FROM church_audit_log WHERE id > ?1 ORDER BY id LIMIT ${AUDIT_PAGE}`,
      ).bind(after).all<any>();
      const rows = (results ?? []).map(({ created_us: _us, old_value, new_value, ...r }: any) => ({
        ...r,
        old_value: old_value === null ? null : JSON.parse(old_value),
        new_value: new_value === null ? null : JSON.parse(new_value),
      }));
      if (rows.length) {
        const { error } = await pg().from(AUDIT_TABLE).upsert(rows);
        if (error) throw new Error(error.message);
      }
      return { next: rows.length < AUDIT_PAGE ? null : rows[rows.length - 1].id, replayed: rows.length };
    }
    if (section === "monthly") {
      const { results } = await db.prepare("SELECT * FROM monthly_impact_snapshots").all<any>();
      if (results?.length) {
        const { error } = await pg().from(MONTHLY_TABLE).upsert(results, { onConflict: "month,state_abbrev" });
        if (error) throw new Error(error.message);
      }
      return { next: null, replayed: results?.length ?? 0 };
    }
    throw new HttpError(400, "section must be kv, tombstones, audit or monthly");
  },
};

const COPY_STEPS = new Set(["kv", "prune", "audit", "monthly"]);

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/** Mounts POST {prefix}/admin/migrate/:step. Registered from app.ts. */
export function registerMigrateRoutes(app: any, prefix: string, isModerator: (c: any) => boolean): void {
  app.post(`${prefix}/admin/migrate/:step`, async (c: any) => {
    if (!isModerator(c)) return c.json({ error: "Unauthorized" }, 401);
    const step = c.req.param("step");
    const route = ROUTES[step];
    if (!route) return c.json({ error: "Unknown step" }, 404);
    try {
      // After the switch D1 is the live copy, so one stray copy from stale Postgres would overwrite it.
      if (COPY_STEPS.has(step) && (await getD1().prepare("SELECT 1 AS done FROM migration_state WHERE key = 'cutover'").first())) {
        throw new HttpError(409, "Cutover is recorded, so copying from Postgres is disabled");
      }
      return c.json(await route((name) => c.req.query(name)));
    } catch (e) {
      console.error(`migrate ${step} failed:`, e);
      if (e instanceof HttpError) return c.json({ error: e.message }, e.status);
      // Moderator-only, and the operator needs the real reason to fix a copy.
      return c.json({ error: String((e as Error)?.message ?? e) }, 500);
    }
  });
}

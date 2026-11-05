import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { canonicalJson, setPostgresForTest } from "../../supabase/functions/make-server-283d8046/admin-migrate.ts";
import app from "../../supabase/functions/make-server-283d8046/app.ts";
import * as kv from "../../supabase/functions/make-server-283d8046/kv.ts";
import { SPILL_BYTES, get as d1Get, set as d1Set } from "../../supabase/functions/make-server-283d8046/kv-d1.ts";
import { type Harness, startHarness } from "./harness.ts";

/** Just enough of the supabase-js query builder, over in-memory rows. */
function fakePostgres(tables: Record<string, any[]>, primaryKeys: Record<string, string[]>) {
  // Locale order, like Postgres's collation: deliberately not the byte order D1 uses.
  const cmp = (a: any, b: any) => (typeof a === "string" ? a.localeCompare(b) : a - b);
  const from = (table: string) => {
    const filters: Array<(r: any) => boolean> = [];
    let sort: { col: string; asc: boolean } | null = null;
    let cap = Infinity, single = false, mode: "select" | "delete" = "select", head = false;
    const run = () => {
      let rows = tables[table].filter((r) => filters.every((f) => f(r)));
      if (mode === "delete") {
        tables[table] = tables[table].filter((r) => !rows.includes(r));
        return { data: null, error: null };
      }
      if (sort) rows = [...rows].sort((a, b) => cmp(a[sort!.col], b[sort!.col]) * (sort!.asc ? 1 : -1));
      rows = rows.slice(0, cap);
      if (head) return { data: null, count: rows.length, error: null };
      if (single) return { data: rows[0] ?? null, error: null };
      return { data: structuredClone(rows), error: null };
    };
    const q: any = {
      select: (_c: string, o?: any) => { head = !!o?.head; return q; },
      order: (col: string, o?: any) => { sort = { col, asc: o?.ascending !== false }; return q; },
      limit: (n: number) => { cap = n; return q; },
      gt: (col: string, v: any) => { filters.push((r) => cmp(r[col], v) > 0); return q; },
      eq: (col: string, v: any) => { filters.push((r) => r[col] === v); return q; },
      in: (col: string, vs: any[]) => { filters.push((r) => vs.includes(r[col])); return q; },
      maybeSingle: () => { single = true; return q; },
      delete: () => { mode = "delete"; return q; },
      upsert: async (rows: any) => {
        for (const row of Array.isArray(rows) ? rows : [rows]) {
          const pk = primaryKeys[table];
          const at = tables[table].findIndex((r) => pk.every((c) => r[c] === row[c]));
          if (at >= 0) tables[table][at] = row;
          else tables[table].push(row);
        }
        return { error: null };
      },
      then: (ok: any, no: any) => Promise.resolve().then(run).then(ok, no),
    };
    return q;
  };
  return { from };
}

const P = "/make-server-283d8046";
let h: Harness;
let pg: Record<string, any[]>;
const auditRow = (id: number, created_at: string, extra = {}) => ({
  id, church_id: `US-TX-${id}`, church_name: "Grace", church_city_state: "Dallas, TX", state: "TX", country: null,
  action: "field_updated", field: "website", old_value: { v: 1 }, new_value: "x", source: "test", actor_type: null, actor_id: null, created_at, ...extra,
});

async function step(name: string, params: Record<string, string> = {}, key = "mod-test") {
  const res = await app.fetch(new Request(`https://api.test${P}/admin/migrate/${name}?${new URLSearchParams(params)}`, { method: "POST", headers: { "x-moderator-key": key } }));
  return { status: res.status, body: await res.json() as any };
}
/** Runs a step to completion, as the script does. */
async function all(name: string, cursorName = "cursor", params: Record<string, string> = {}) {
  const pages: any[] = [];
  let cursor = "";
  for (;;) {
    const { status, body } = await step(name, { ...params, ...(cursor ? { [cursorName]: cursor } : {}) });
    expect(status, JSON.stringify(body)).toBe(200);
    pages.push(body);
    if (body.next == null) return pages;
    cursor = String(body.next);
  }
}
const copyAll = async () => {
  await all("kv");
  await all("audit", "afterId");
  await all("monthly");
  await all("prune");
};
const verify = async () => {
  const pages = await all("verify");
  return { mismatched: pages.flatMap((p) => p.mismatched), missing: pages.flatMap((p) => p.missing), checked: pages.reduce((n, p) => n + p.checked, 0) };
};

beforeAll(async () => { h = await startHarness({ MODERATOR_KEY: "mod-test", STORE_BACKEND: "supabase" }); });
afterAll(async () => { setPostgresForTest(null); await h.mf.dispose(); });
beforeEach(async () => {
  for (const t of ["kv", "kv_tombstones", "church_audit_log", "monthly_impact_snapshots", "migration_state"]) await h.db.prepare(`DELETE FROM ${t}`).run();
  await h.db.prepare("DELETE FROM sqlite_sequence").run();
  h.vars.MAINTENANCE_READONLY = "";
  pg = {
    kv_store_283d8046: [
      { key: "churches:US:TX", value: Array.from({ length: 500 }, (_, i) => ({ id: i, pad: "p".repeat(2500) })) },
      { key: "churches:meta", value: { stateCounts: { TX: 500 } } },
      { key: "suggestions:US-TX-1", value: { submissions: [{ b: 1, a: 2 }] } },
      { key: "Zeta:case", value: 1 },
      { key: "a_b:underscore", value: null },
      { key: "ratelimit:x", value: { n: 1 } },
      { key: "church-search:ready", value: { ready: true } },
      { key: "lookup:dirty:TX", value: { abbrev: "TX", at: 5 } },
    ],
    church_audit_log: [auditRow(1, "2026-10-14T21:08:14.25057+00:00"), auditRow(7, "2026-10-14T21:08:14.25057+00:00"), auditRow(9, "2026-10-15T00:00:00+00:00")],
    monthly_impact_snapshots: [{ month: "2026-03-01", state_abbrev: "", country: null, total_churches: 0, total_needs_review: 0, pct_needs_review: 74, missing_address: 0, missing_service_times: 0, missing_denomination: 0, total_corrections: 0, churches_improved: 0, population: null, people_per_church: null, churches_per_10k: null }],
  };
  setPostgresForTest(fakePostgres(pg, { kv_store_283d8046: ["key"], church_audit_log: ["id"], monthly_impact_snapshots: ["month", "state_abbrev"] }));
});

describe("migration", () => {
  it("requires the moderator key", async () => {
    expect((await step("kv", {}, "wrong")).status).toBe(401);
    expect((await step("nope")).status).toBe(404);
  });

  it("copies everything exactly, and verify then reports no differences", async () => {
    await copyAll();
    expect(await d1Get("churches:US:TX")).toEqual(pg.kv_store_283d8046[0].value);
    expect((await h.db.prepare("SELECT r2_key FROM kv WHERE key = 'churches:US:TX'").first()).r2_key).toBeTruthy();
    expect(await d1Get("a_b:underscore")).toBeNull();
    expect(await d1Get("lookup:dirty:TX")).toEqual({ abbrev: "TX", at: 5 });
    expect(await verify()).toEqual({ mismatched: [], missing: [], checked: 6 });

    const { body } = await step("counts");
    expect(body.d1.audit).toBe(3);
    expect(body.d1.auditMaxId).toBe(9);
    expect(body.postgres).toEqual({ audit: 3, auditMaxId: 9, monthly: 1 });
    expect(body.d1.families).toMatchObject({ churches: 2, suggestions: 1, Zeta: 1, a_b: 1, lookup: 1 });
  });

  it("skips rate limits and leaves search not ready until a backfill", async () => {
    await copyAll();
    expect(await d1Get("ratelimit:x")).toBeUndefined();
    expect((await d1Get("church-search:ready")).ready).toBe(false);
  });

  it("keeps audit ids and exact timestamp text, and new rows continue after them", async () => {
    await copyAll();
    const row = await h.db.prepare("SELECT * FROM church_audit_log WHERE id = 7").first();
    expect(row.created_at).toBe("2026-10-14T21:08:14.25057+00:00");
    expect(row.created_us).toBe(Date.UTC(2026, 9, 14, 21, 8, 14) * 1000 + 250570);
    expect(JSON.parse(row.old_value)).toEqual({ v: 1 });
    await h.db.prepare("INSERT INTO church_audit_log (state, action, source, created_at, created_us) VALUES ('TX','x','y','z',1)").run();
    expect((await h.db.prepare("SELECT max(id) AS id FROM church_audit_log").first()).id).toBe(10);
  });

  it("is resumable and skips rows already identical", async () => {
    await copyAll();
    const second = (await all("kv"))[0];
    expect(second.copied).toBe(0);
    expect(second.unchanged).toBe(6);
    await all("audit", "afterId");
    expect((await step("counts")).body.d1.audit).toBe(3);
  });

  it("picks up changes and deletions in a final copy", async () => {
    await copyAll();
    pg.kv_store_283d8046[1].value = { stateCounts: { TX: 501 } };
    pg.kv_store_283d8046 = pg.kv_store_283d8046.filter((r) => r.key !== "suggestions:US-TX-1");
    pg.kv_store_283d8046.push({ key: "suggestions:US-TX-2", value: {} });
    pg.church_audit_log.push(auditRow(11, "2026-10-16T00:00:00+00:00"));

    const before = await verify();
    expect(before.mismatched).toEqual(["churches:meta"]);
    expect(before.missing).toEqual(["suggestions:US-TX-2"]);
    expect((await all("prune", "cursor", { dryRun: "1" })).flatMap((p) => p.extra)).toEqual(["suggestions:US-TX-1"]);
    expect(await d1Get("suggestions:US-TX-1")).toBeDefined();

    await copyAll();
    expect(await verify()).toEqual({ mismatched: [], missing: [], checked: 6 });
    expect(await d1Get("suggestions:US-TX-1")).toBeUndefined();
    expect((await step("counts")).body.d1.auditMaxId).toBe(11);
  });

  it("verify ignores key order but catches real differences", async () => {
    expect(canonicalJson({ b: 1, a: [{ d: 1, c: 2 }] })).toBe(canonicalJson({ a: [{ c: 2, d: 1 }], b: 1 }));
    expect(canonicalJson([1, 2])).not.toBe(canonicalJson([2, 1]));
    await copyAll();
    await d1Set("suggestions:US-TX-1", { submissions: [{ a: 2, b: 1 }] });
    expect((await verify()).mismatched).toEqual([]);
    await d1Set("suggestions:US-TX-1", { submissions: [{ a: 2, b: 999 }] });
    expect((await verify()).mismatched).toEqual(["suggestions:US-TX-1"]);
  });

  it("doesn't notify the publisher or touch Postgres while copying", async () => {
    const seen: string[] = [];
    kv.onKvWrite((keys) => seen.push(...keys));
    const rowsBefore = pg.kv_store_283d8046.length;
    await copyAll();
    expect(seen).toEqual([]);
    expect(pg.kv_store_283d8046).toHaveLength(rowsBefore);
  });

  it("works while frozen", async () => {
    h.vars.MAINTENANCE_READONLY = "1";
    await copyAll();
    expect(await verify()).toEqual({ mismatched: [], missing: [], checked: 6 });
  });

  it("refuses to copy once the cutover is recorded, so stale Postgres can't overwrite live data", async () => {
    await copyAll();
    expect((await step("mark-cutover")).status).toBe(200);
    for (const s of ["kv", "prune", "audit", "monthly"]) expect((await step(s)).status, s).toBe(409);
    expect((await step("verify")).status).toBe(200);
  });
});

describe("rollback replay", () => {
  it("needs explicit confirmation, a freeze and a recorded cutover", async () => {
    expect((await step("replay", { section: "kv" })).status).toBe(400);
    expect((await step("replay", { section: "kv", confirm: "write-postgres" })).status).toBe(409);
    h.vars.MAINTENANCE_READONLY = "1";
    expect((await step("replay", { section: "kv", confirm: "write-postgres" })).status).toBe(409);
  });

  it("brings Postgres level with D1", async () => {
    await copyAll();
    // Keep the clock moving so changes land after the recorded cutover.
    await new Promise((r) => setTimeout(r, 5));
    await step("mark-cutover");
    await new Promise((r) => setTimeout(r, 5));

    const big = "b".repeat(SPILL_BYTES + 5);
    await d1Set("churches:meta", { stateCounts: { TX: 999 } });
    await d1Set("suggestions:new", { fresh: true });
    await d1Set("spilled:new", big);
    await d1Set("ratelimit:new", { n: 1 });
    await (await import("../../supabase/functions/make-server-283d8046/kv-d1.ts")).del("suggestions:US-TX-1");
    await h.db.prepare("INSERT INTO church_audit_log (state, action, source, created_at, created_us, old_value) VALUES ('TX','field_updated','live','2026-11-15T00:00:00.000000+00:00',1,'{\"a\":1}')").run();

    h.vars.MAINTENANCE_READONLY = "1";
    const cfg = { confirm: "write-postgres" };
    for (const section of ["kv", "tombstones", "audit", "monthly"]) await all("replay", "cursor", { ...cfg, section });

    const value = (k: string) => pg.kv_store_283d8046.find((r) => r.key === k)?.value;
    expect(value("churches:meta")).toEqual({ stateCounts: { TX: 999 } });
    expect(value("suggestions:new")).toEqual({ fresh: true });
    expect(value("spilled:new")).toBe(big);
    expect(value("suggestions:US-TX-1")).toBeUndefined();
    expect(value("ratelimit:new")).toBeUndefined();
    expect(value("churches:US:TX")).toBeDefined();
    const audit = pg.church_audit_log.find((r) => r.source === "live");
    expect(audit).toMatchObject({ id: 10, old_value: { a: 1 }, created_at: "2026-11-15T00:00:00.000000+00:00" });
    expect(audit).not.toHaveProperty("created_us");
    expect(pg.church_audit_log).toHaveLength(4);
  });
});

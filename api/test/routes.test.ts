import { afterAll, beforeAll, describe, expect, it } from "vitest";
import app from "../../supabase/functions/make-server-283d8046/app.ts";
import { recordChurchAudit } from "../../supabase/functions/make-server-283d8046/audit.ts";
import { friendlyError, MAINTENANCE_ERROR } from "../../src/app/lib/friendly-error.ts";
import { type Harness, startHarness } from "./harness.ts";

const P = "/make-server-283d8046";
let h: Harness;
beforeAll(async () => { h = await startHarness({ PARTNER_API_KEY: "partner-test", MODERATOR_KEY: "mod-test", LOOKUP_INTERNAL_KEY: "lookup-test" }); });
afterAll(async () => { await h.mf.dispose(); });

const call = (path: string, init?: RequestInit) => app.fetch(new Request(`https://api.test${P}${path}`, init));
const changes = (since: string) => call(`/v1/churches/changes?since=${encodeURIComponent(since)}`, { headers: { "x-partner-key": "partner-test" } });

describe("change feed route", () => {
  it("echoes the cursor untouched when there are no rows, so Harvous's stop check holds", async () => {
    for (const since of [new Date(Date.now() - 86_400_000).toISOString(), new Date(Date.now() - 86_400_000).toISOString().replace("Z", "+00:00").replace(/\.\d+/, ".25057")]) {
      const body = await (await changes(since)).json() as any;
      expect(body).toEqual({ changes: [], nextSince: since, hasMore: false });
    }
  });

  it("returns rows in the same shape, and its nextSince then returns nothing", async () => {
    const since = new Date(Date.now() - 1000).toISOString();
    await recordChurchAudit({ church_id: "US-TX-1", state: "TX", action: "field_updated", field: "website", source: "test" });
    const body = await (await changes(since)).json() as any;
    expect(body.changes).toEqual([{ churchId: "US-TX-1", action: "field_updated", field: "website", at: body.nextSince }]);
    expect(body.nextSince).toMatch(/\.\d{6}\+00:00$/);
    expect(body.hasMore).toBe(false);
    const again = await (await changes(body.nextSince)).json() as any;
    expect(again).toEqual({ changes: [], nextSince: body.nextSince, hasMore: false });
  });
});

describe("freeze", () => {
  const frozen = async (fn: () => Promise<void>) => {
    h.vars.MAINTENANCE_READONLY = "1";
    try { await fn(); } finally { h.vars.MAINTENANCE_READONLY = ""; }
  };

  it("rejects writes with 503 JSON and Retry-After, including Lookup's", async () => {
    await frozen(async () => {
      for (const path of ["/churches/add", "/v1/churches/US-TX-1/suggestions", "/internal/lookup/suggestions", "/internal/lookup/confirm"]) {
        const res = await call(path, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
        expect(res.status, path).toBe(503);
        expect(res.headers.get("Retry-After")).toBe("300");
        expect(await res.json()).toEqual({ error: "maintenance" });
      }
    });
  });

  it("keeps reads, CORS preflight and Lookup's reads working", async () => {
    await frozen(async () => {
      expect((await call("/health")).status).toBe(200);
      expect((await call("/churches/add", { method: "OPTIONS", headers: { Origin: "https://heresmychurch.com", "Access-Control-Request-Method": "POST" } })).status).toBeLessThan(300);
      expect((await call("/internal/lookup/regions", { headers: { "x-lookup-key": "lookup-test" } })).status).toBe(200);
    });
  });

  it("exempts the routes a cutover needs, which still check the moderator key", async () => {
    await frozen(async () => {
      expect((await call("/churches/search/backfill", { method: "POST" })).status).toBe(401);
      expect((await call("/admin/publish-static", { method: "POST" })).status).toBe(401);
    });
  });

  it("does nothing when not frozen", async () => {
    expect((await call("/churches/search/backfill", { method: "POST" })).status).toBe(401);
    expect((await call("/internal/lookup/confirm", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" })).status).toBe(401);
  });

  it("shows visitors a plain message", () => {
    expect(friendlyError(new Error("maintenance"))).toBe(MAINTENANCE_ERROR);
    expect(friendlyError(new Error('{"error":"maintenance"}'))).toBe(MAINTENANCE_ERROR);
  });
});

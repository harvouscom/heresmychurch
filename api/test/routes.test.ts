import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import app from "../../supabase/functions/make-server-283d8046/app.ts";
import * as kv from "../../supabase/functions/make-server-283d8046/kv.ts";
import { recordChurchAudit } from "../../supabase/functions/make-server-283d8046/audit.ts";
import { friendlyError, MAINTENANCE_ERROR } from "../../src/app/lib/friendly-error.ts";
import { type Harness, startHarness } from "./harness.ts";

const P = "/make-server-283d8046";
let h: Harness;
const DAY = 86_400_000;
const TX = [
  { id: "TX-1001", shortId: "10010001", name: "First Baptist Austin", address: "901 Trinity St", city: "Austin", state: "TX", lat: 30.27, lng: -97.74, denomination: "Baptist", attendance: 500, serviceTimes: "Sun 10:00 AM", submittedByIp: "1.2.3.4" },
  { id: "TX-1002", shortId: "10010002", name: "Old Mission Church", address: "1 Old Rd", city: "Austin", state: "TX", lat: 30.3, lng: -97.7, denomination: "Methodist", listingStatus: "pending_reverify", relocatedTo: "community-TX-1-abc" },
  { id: "TX-1003", shortId: "10010003", name: "Hill Chapel", address: "5 Hill Rd", city: "Austin", state: "TX", lat: 30.31, lng: -97.71, denomination: "Methodist", listingStatus: "pending_reverify" },
];
const ON = [
  { id: "CA-ON-2001", shortId: "20010001", name: "St James Cathedral", address: "106 King St E", city: "Toronto", state: "ON", lat: 43.65, lng: -79.37, denomination: "Anglican" },
  { id: "CA-ON-2002", shortId: "20010002", name: "Moved Church", address: "9 Queen St", city: "Toronto", state: "ON", lat: 43.66, lng: -79.38, denomination: "Anglican", listingStatus: "pending_reverify" },
];
beforeAll(async () => {
  h = await startHarness({ PARTNER_API_KEY: "partner-test", MODERATOR_KEY: "mod-test", LOOKUP_INTERNAL_KEY: "lookup-test" });
  // Seeded before any route reads churches:meta (it's cached in memory for a minute).
  await kv.set("churches:meta", { stateCounts: { "US:TX": TX.length, "CA:ON": ON.length }, lastUpdated: new Date().toISOString() });
  await kv.set("churches:US:TX", TX);
  await kv.set("churches:CA:ON", ON);
});
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

describe("Lookup routes", () => {
  const LK = { "content-type": "application/json", "x-lookup-key": "lookup-test" };
  const MOD = { "x-moderator-key": "mod-test" };
  const actor = { client: "acme-forms", ipHash: "abcdef0123456789" };
  const post = (path: string, body: unknown, headers: Record<string, string> = LK) =>
    call(path, { method: "POST", headers, body: JSON.stringify(body) });
  const suggest = (churchId: string, field: string, value: unknown, who = actor) =>
    post("/internal/lookup/suggestions", { ...who, churchId, field, value });
  const stored = async (id: string) => (await (await call(`/internal/lookup/church/${id}`, { headers: LK })).json() as any).church;

  it("needs the Lookup key on every route", async () => {
    expect((await call("/internal/lookup/church/TX-1001")).status).toBe(401);
    expect((await call("/internal/lookup/church/TX-1001", { headers: { "x-lookup-key": "nope" } })).status).toBe(401);
    for (const path of ["/internal/lookup/suggestions", "/internal/lookup/confirm", "/internal/lookup/churches"]) {
      expect((await post(path, {}, { "content-type": "application/json" })).status, path).toBe(401);
    }
  });

  it("GET /church/:id returns one stored church in the export shape", async () => {
    const res = await call("/internal/lookup/church/CA-ON-2001", { headers: LK });
    expect(res.status).toBe(200);
    const { church } = await res.json() as any;
    expect(church).toMatchObject({ id: "CA-ON-2001", shortId: "20010001", country: "CA", state: "ON", name: "St James Cathedral" });
    const tx = await stored("TX-1001");
    expect(tx.country).toBe("US");
    expect(tx).not.toHaveProperty("attendance");
    expect(tx).not.toHaveProperty("submittedByIp");
    expect((await call("/internal/lookup/church/TX-9999", { headers: LK })).status).toBe(404);
    expect((await call("/internal/lookup/church/nonsense", { headers: LK })).status).toBe(400);
  });

  it("answers 409 for listings that moved or wait for re-verify, and leaves the flag alone", async () => {
    for (const id of ["TX-1002", "TX-1003", "CA-ON-2002"]) {
      const res = await suggest(id, "serviceTimes", "Sun 9:00 AM");
      expect(res.status, id).toBe(409);
      expect((await res.json() as any).error).toBeTruthy();
    }
    const body = await (await suggest("TX-1002", "phone", "512-555-0100")).json() as any;
    expect(body.relocatedTo).toBe("community-TX-1-abc");
    expect((await stored("TX-1003")).listingStatus).toBe("pending_reverify");
  });

  it("returns the updated church when a suggestion applies", async () => {
    const res = await suggest("TX-1001", "phone", "5125550199");
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body).toMatchObject({ success: true, applied: true, needsModeration: false });
    expect(body.church).toMatchObject({ id: "TX-1001", country: "US", phone: "5125550199" });
    await h.flush();
  });

  it("holds replacements, exposes them for review, and applies only after approval", async () => {
    const res = await suggest("TX-1001", "serviceTimes", "Sun 8:00 AM");
    expect(await res.json()).toMatchObject({ applied: false, needsModeration: true });
    expect((await stored("TX-1001")).serviceTimes).toBe("Sun 10:00 AM");
    const pending = await (await call("/suggestions/pending/TX")).json() as any;
    expect(pending.pending.find((s: any) => s.churchId === "TX-1001").fields.serviceTimes.topValue).toBe("Sun 8:00 AM");
    const queue = await (await call("/moderate/pending", { headers: MOD })).json() as any;
    expect(queue.pendingSuggestions.find((s: any) => s.churchId === "TX-1001" && s.field === "serviceTimes")).toMatchObject({ proposedValue: "Sun 8:00 AM" });
    // Unrelated publishing must not sweep the replacement into the listing.
    await suggest("TX-1001", "languages", "English");
    expect((await stored("TX-1001")).serviceTimes).toBe("Sun 10:00 AM");
    const approved = await call("/moderate/approve/suggestion", { method: "POST", headers: { ...MOD, "content-type": "application/json" }, body: JSON.stringify({ churchId: "TX-1001", field: "serviceTimes" }) });
    expect(approved.status).toBe(200);
    expect((await stored("TX-1001")).serviceTimes).toBe("Sun 8:00 AM");
    // A subsequent disagreement still cannot replace the moderator's decision.
    expect(await (await suggest("TX-1001", "serviceTimes", "Sun 11:00 AM")).json()).toMatchObject({ applied: false, needsModeration: true });
    expect((await stored("TX-1001")).serviceTimes).toBe("Sun 8:00 AM");
    await h.flush();
  });

  it("holds site replacements and rejection preserves accepted data", async () => {
    const res = await call("/suggestions", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ churchId: "TX-1001", field: "languages", value: "Spanish" }) });
    expect(await res.json()).toMatchObject({ applied: false, needsModeration: true });
    const rejected = await call("/moderate/reject/suggestion", { method: "POST", headers: { ...MOD, "content-type": "application/json" }, body: JSON.stringify({ churchId: "TX-1001", field: "languages" }) });
    expect(rejected.status).toBe(200);
    expect((await stored("TX-1001")).languages).toEqual(["English"]);
  });

  it("limits a church across different contributors", async () => {
    await kv.set("ratelimit:church-suggestion:CA-ON-2001", { count: 20, windowStart: Date.now() });
    const res = await suggest("CA-ON-2001", "phone", "4165550199", { client: "another-tool", ipHash: "aaaabbbbccccdddd" });
    expect(res.status).toBe(429);
    expect((await stored("CA-ON-2001")).phone).toBeUndefined();
    await kv.del("ratelimit:church-suggestion:CA-ON-2001");
  });

  it("takes phone and address corrections outside the US", async () => {
    const phone = await suggest("CA-ON-2001", "phone", "+1 416 555 0100");
    expect(phone.status).toBe(200);
    expect((await phone.json() as any).church.phone).toBe("4165550100");
    const addr = await suggest("CA-ON-2001", "address", JSON.stringify({ address: "65 Church St", city: "Toronto" }));
    expect(addr.status).toBe(200);
    expect(await addr.json()).toMatchObject({ applied: false, needsModeration: true });
    await h.flush();
  });

  it("holds Lookup's email and pastorName for a moderator", async () => {
    const res = await suggest("TX-1001", "email", "office@fbaustin.example");
    expect(await res.json()).toMatchObject({ success: true, applied: false, needsModeration: true });
    expect(await suggest("TX-1001", "pastorName", "Rev. Example")).toBeTruthy();
    // A later site vote on another field must not sweep the held email onto the listing.
    await call("/suggestions", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ churchId: "TX-1001", field: "denomination", value: "Baptist" }) });
    await h.flush();
    expect((await stored("TX-1001")).email).toBeUndefined();
    const queue = (await (await call("/moderate/pending", { headers: MOD })).json() as any).pendingSuggestions;
    const item = queue.find((s: any) => s.churchId === "TX-1001" && s.field === "email");
    expect(item).toMatchObject({ proposedValue: "office@fbaustin.example", clients: ["acme-forms"] });
    expect(queue.some((s: any) => s.churchId === "TX-1001" && s.field === "pastorName")).toBe(true);
  });

  it("accepts the report fields, which wait for a moderator", async () => {
    const res = await suggest("TX-1001", "reportClosed", "yes");
    expect(await res.json()).toMatchObject({ applied: false, needsModeration: true });
  });

  it("rejects invalid values before counting them against the limit", async () => {
    const who = { client: "acme-forms", ipHash: "ffff0000ffff0000" };
    const res = await suggest("TX-1001", "phone", "12", who);
    expect(res.status).toBe(400);
    expect(await kv.get("ratelimit:lookup-suggestion:ffff0000ffff0000")).toBeFalsy();
  });

  it("counts one vote per person, not per tool", async () => {
    await suggest("TX-1001", "website", "https://a.example", { client: "tool-one", ipHash: "1111222233334444" });
    await suggest("TX-1001", "website", "https://b.example", { client: "tool-two", ipHash: "1111222233334444" });
    const subs = (await kv.get("suggestions:TX-1001")).submissions.filter((s: any) => s.field === "website");
    expect(subs).toHaveLength(1);
    expect(subs[0]).toMatchObject({ ip: "lookup:1111222233334444", source: "lookup:tool-two" });
  });

  it("confirm returns lastVerified", async () => {
    const res = await post("/internal/lookup/confirm", { ...actor, churchId: "CA-ON-2001" });
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.success).toBe(true);
    expect(typeof body.lastVerified).toBe("number");
    expect((await post("/internal/lookup/confirm", { ...actor, churchId: "CA-ON-9999" })).status).toBe(404);
  });

  it("moderation queue ignores votes older than a year and lists re-verify items outside the US", async () => {
    await kv.set("suggestions:TX-1003", { churchId: "TX-1003", submissions: [{ ip: "9.9.9.9", field: "website", value: "https://stale.example/", timestamp: Date.now() - 400 * DAY, source: "suggestion" }] });
    const body = await (await call("/moderate/pending", { headers: MOD })).json() as any;
    expect(body.pendingSuggestions.some((s: any) => s.churchId === "TX-1003")).toBe(false);
    expect(body.pendingReverifyChurches.map((c: any) => c.churchId)).toEqual(expect.arrayContaining(["TX-1003", "CA-ON-2002"]));
  });

  describe("POST /internal/lookup/churches", () => {
    const geocode = (lat: number, lng: number) =>
      vi.stubGlobal("fetch", async (url: string | URL | Request) => {
        if (String(url).includes("nominatim")) return new Response(JSON.stringify(lat ? [{ lat: String(lat), lon: String(lng) }] : []));
        throw new Error(`unexpected fetch ${String(url)}`);
      });
    afterAll(() => { vi.unstubAllGlobals(); });
    const add = (church: Record<string, unknown>, extra: Record<string, unknown> = {}) =>
      post("/internal/lookup/churches", { ...actor, church, ...extra });

    it("validates the body", async () => {
      geocode(43.65, -79.37);
      expect((await post("/internal/lookup/churches", { church: { name: "X" } })).status).toBe(400);
      expect((await add({ name: "New Church", address: "1 King St", city: "Toronto", region: "ZZ" })).status).toBe(400);
      expect((await add({ name: "New Church", address: "1 King St", city: "Toronto", region: "ON", country: "US" })).status).toBe(400);
      expect((await add({ name: "New Church", city: "Toronto", region: "ON" })).status).toBe(400);
    });

    it("answers 422 when the address can't be placed", async () => {
      geocode(0, 0);
      expect((await add({ name: "Nowhere Church", address: "1 Nowhere", city: "Toronto", region: "ON" })).status).toBe(422);
      geocode(30.27, -97.74); // inside Texas, not Ontario
      expect((await add({ name: "Nowhere Church", address: "1 Nowhere", city: "Toronto", region: "ON" })).status).toBe(422);
    });

    it("asks to confirm near-duplicates, then adds live with confirmAdd", async () => {
      geocode(43.6501, -79.3701);
      const first = await (await add({ name: "St James Cathedral", address: "106 King St E", city: "Toronto", region: "ON", country: "CA" })).json() as any;
      expect(first.needsConfirmation).toBe(true);
      expect(first.similar[0]).toMatchObject({ id: "CA-ON-2001", country: "CA" });

      const res = await add({ name: "St James Cathedral Annex", address: "108 King St E", city: "Toronto", postcode: "M5C 2E9", region: "ON", phone: "+1 416 555 0199", languages: "English, French", email: "x@example.com", pastorName: "Someone" }, { confirmAdd: true });
      expect(res.status).toBe(200);
      const body = await res.json() as any;
      expect(body.success).toBe(true);
      expect(body.church).toMatchObject({ name: "St James Cathedral Annex", country: "CA", state: "ON", postcode: "M5C 2E9", phone: "4165550199", languages: ["English", "French"] });
      expect(body.church.id).toMatch(/^community-CA-ON-/);
      expect(body.church).not.toHaveProperty("email");
      expect(body.church).not.toHaveProperty("pastorName");
      expect(await stored(body.church.id)).toMatchObject({ id: body.church.id, lat: 43.6501 });
      await h.flush();
    });
  });
});

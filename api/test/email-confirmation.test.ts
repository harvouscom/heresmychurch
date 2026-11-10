import { beforeAll, beforeEach, afterAll, describe, it, expect, vi } from "vitest";
import app from "../../supabase/functions/make-server-283d8046/app.ts";
import * as kv from "../../supabase/functions/make-server-283d8046/kv.ts";
import { dispatchConfirmationEmails, setConfirmationEmailBinding } from "../../supabase/functions/make-server-283d8046/email-confirmation.ts";
import { startHarness, type Harness } from "./harness";
let h: Harness;
const sent: any[] = [];
const deliver = vi.fn(async (message: any) => { sent.push({ ...message, to: [message.to] }); return { messageId: "test-message" }; });
const call = (path: string, body?: any) => app.fetch(new Request(`https://api.test/make-server-283d8046/email-confirmation/${path}`, body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}));
const credentials = (email: any, mode: string) => {
  const url = email.text.split("\n").find((line: string) => line.startsWith("https://heresmychurch.com/email-confirmation#") && line.includes(`mode=${mode}`));
  return Object.fromEntries(new URLSearchParams(new URL(url).hash.slice(1)));
};
beforeAll(async () => {
  h = await startHarness({ EMAIL_CONFIRMATION_ENABLED: "1", EMAIL_FROM: "test@example.org", EMAIL_TOKEN_SECRET: "a-long-test-secret" });
  await kv.set("churches:US:TX", [{ id: "TX-123", shortId: "12345678", name: "Test Church", state: "TX", city: "Austin", address: "123 Main St", lat: 30, lng: -97, email: "office@example.org", serviceTimes: "Sunday 9am", listingStatus: "pending_reverify" }]);
  setConfirmationEmailBinding({ send: deliver });
});
beforeEach(async () => { await kv.del("ratelimit:email-confirmation:unknown"); });
afterAll(async () => { setConfirmationEmailBinding(null); await h.flush(); await h.mf.dispose(); });
describe("church email confirmation", () => {
  it("requires setup and honors maintenance", async () => {
    h.vars.EMAIL_CONFIRMATION_ENABLED = "";
    expect((await call("request", { churchId: "TX-123", email: "visitor@example.org" })).status).toBe(503);
    h.vars.EMAIL_CONFIRMATION_ENABLED = "1"; h.vars.MAINTENANCE_READONLY = "1";
    expect((await call("request", { churchId: "TX-123", email: "visitor@example.org" })).status).toBe(503);
    h.vars.MAINTENANCE_READONLY = "";
  });
  it("rejects invalid addresses, missing churches, and forged tokens", async () => {
    expect((await call("request", { churchId: "TX-123", email: "bad" })).status).toBe(400);
    expect((await call("request", { churchId: "TX-456", email: "v@example.org" })).status).toBe(404);
    expect((await call("action", { key: "email-confirmation:staff:fake", token: "fake", action: "save" })).status).toBe(403);
  });
  it("double opts in, groups outreach, publishes service times, and notifies privately", async () => {
    const body = { churchId: "TX-123", email: "visitor@example.org" };
    expect((await call("request", body)).status).toBe(200);
    await call("request", body);
    await dispatchConfirmationEmails();
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toEqual([body.email]);
    const visitor = credentials(sent[0], "subscribe");
    expect((await call("action", { ...visitor, action: "preview" })).status).toBe(403);
    expect((await call("action", { ...visitor, action: "subscribe" })).status).toBe(200);
    await dispatchConfirmationEmails();
    expect(sent).toHaveLength(2);
    expect(sent[1].to).toEqual(["office@example.org"]);
    expect(sent[1].text).not.toContain(body.email);
    const staff = credentials(sent[1], "staff");
    expect((await call("action", { ...staff, action: "preview" })).status).toBe(200);
    const save = await call("action", { ...staff, action: "save", serviceTimes: "Sunday 10am", locationCorrect: false, address: "456 Main St, Austin, TX" });
    expect(save.status).toBe(200);
    const church = (await kv.get("churches:US:TX"))[0];
    expect(church.serviceTimes).toContain("10");
    expect(church.address).toBe("123 Main St");
    expect(church.listingStatus).toBe("pending_reverify");
    expect((await kv.get("suggestions:TX-123")).submissions[0].field).toBe("address");
    const status = await (await call("status/TX-123")).json() as any;
    expect(status.serviceTimesConfirmedAt).toBeGreaterThan(0);
    expect(status.locationConfirmedAt).toBeUndefined();
    await dispatchConfirmationEmails();
    expect(sent).toHaveLength(3);
    expect(sent[2].to).toEqual([body.email]);
    expect(sent[2].text).toContain("/US/TX/12345678");
    await dispatchConfirmationEmails();
    expect(sent).toHaveLength(3);
    expect(await kv.get(visitor.key)).toBeUndefined();
    expect((await call("action", { ...visitor, action: "subscribe" })).status).toBe(410);
    // A stale proof cannot verify subsequently changed service times.
    church.serviceTimes = "Sunday 11am"; await kv.set("churches:US:TX", [church]);
    expect((await (await call("status/TX-123")).json() as any).serviceTimesConfirmedAt).toBeUndefined();
  });
  it("retries failed deliveries, allows cancellation, and expires private data", async () => {
    await call("request", { churchId: "TX-123", email: "cancel@example.org" });
    const rows = await kv.getByPrefix("email-confirmation:visitor:");
    const row = rows.find((r: any) => r.email === "cancel@example.org");
    const count = sent.length;
    deliver.mockRejectedValueOnce(new Error("unavailable"));
    await dispatchConfirmationEmails();
    expect((await kv.get(row.key)).sent).toBeUndefined();
    await dispatchConfirmationEmails();
    expect(sent.length).toBe(count + 1);
    const creds = credentials(sent.at(-1), "subscribe");
    row.expires = Date.now() - 1; await kv.set(row.key, row);
    expect((await call("action", { ...creds, action: "subscribe" })).status).toBe(410);
    await dispatchConfirmationEmails();
    expect(await kv.get(row.key)).toBeUndefined();
    await call("request", { churchId: "TX-123", email: "cancel@example.org" });
    await dispatchConfirmationEmails();
    expect((await call("action", { ...credentials(sent.at(-1), "subscribe"), action: "cancel" })).status).toBe(200);
    expect(await kv.get(row.key)).toBeUndefined();
  });
  it("lets churches opt out and limits request volume", async () => {
    const staff = credentials(sent[1], "staff");
    expect((await call("action", { ...staff, action: "stop" })).status).toBe(200);
    expect(await kv.get("email-stop:TX-123")).toBeTruthy();
    for (let i = 0; i < 9; i++) await call("request", { churchId: "TX-123", email: "limit@example.org" });
    expect((await call("request", { churchId: "TX-123", email: "limit@example.org" })).status).toBe(429);
  });

  it("leases dispatches so concurrent schedules send a queued message once", async () => {
    await call("request", { churchId: "TX-123", email: "concurrent@example.org" });
    const before = sent.length;
    await Promise.all([dispatchConfirmationEmails(), dispatchConfirmationEmails()]);
    expect(sent.slice(before).filter(message => message.to.includes("concurrent@example.org"))).toHaveLength(1);
  });

});

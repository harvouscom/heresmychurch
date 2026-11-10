import type { Hono } from "npm:hono";
import * as kv from "./kv.ts";
import { env } from "./runtime.ts";
import { getD1 } from "./bindings.ts";
import { getChurches, regionFromChurchId } from "./church-keys.ts";

const DAY = 86400000;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PREFIX = "email-confirmation:";
const site = () => (env("EMAIL_SITE_URL") || "https://heresmychurch.com").replace(/\/$/, "");
export type ConfirmationEmailBinding = {
  send(message: { from: string; to: string; subject: string; text: string }): Promise<{ messageId: string }>;
};
let emailBinding: ConfirmationEmailBinding | null = null;
export function setConfirmationEmailBinding(binding: ConfirmationEmailBinding | null) { emailBinding = binding; }
export const emailConfirmationEnabled = () => env("EMAIL_CONFIRMATION_ENABLED") === "1" && !!emailBinding && !!env("EMAIL_FROM") && !!env("EMAIL_TOKEN_SECRET");
export async function emailDigest(value: string) {
  return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)))).map(b => b.toString(16).padStart(2, "0")).join("");
}
async function signature(key: string) {
  const secret = await crypto.subtle.importKey("raw", new TextEncoder().encode(env("EMAIL_TOKEN_SECRET")!), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return Array.from(new Uint8Array(await crypto.subtle.sign("HMAC", secret, new TextEncoder().encode(key)))).map(b => b.toString(16).padStart(2, "0")).join("");
}
async function link(key: string, mode: string) {
  return `${site()}/email-confirmation#${new URLSearchParams({ key, token: await signature(key), mode })}`;
}
async function send(to: string, subject: string, text: string, _id: string) {
  if (!emailBinding) throw new Error("Cloudflare email binding is not configured");
  // Test mode is enforced server-side and never redirects real visitors' mail.
  const testRecipient = env("EMAIL_TEST_RECIPIENT");
  if (testRecipient && to.toLowerCase() !== testRecipient.toLowerCase()) throw new Error("Recipient is outside email test mode");
  await emailBinding.send({ from: env("EMAIL_FROM")!, to, subject, text });
}
async function churchById(id: string) {
  const region = regionFromChurchId(id);
  if (!region) return null;
  const rows = await getChurches(region);
  return Array.isArray(rows) ? rows.find((row: any) => row.id === id) : null;
}
export function churchMapLink(church: any) {
  // The map resolves stable church IDs in the final path segment.
  return `${site()}/${church.country || "US"}/${church.state}/${church.shortId || church.id}`;
}
/** Each recipient has a separate private row. No addresses enter public church data. */
export async function dispatchConfirmationEmails() {
  if (!emailConfirmationEnabled() || env("MAINTENANCE_READONLY")) return;
  // A D1 lease prevents overlapping cron invocations from sending the same row.
  const db = getD1();
  const token = JSON.stringify({ token: crypto.randomUUID() });
  const now = Date.now();
  const lock = await db.prepare(`INSERT INTO kv(key,value,size,updated_at) VALUES('email-dispatch-lock',?1,0,?2)
    ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at
    WHERE kv.updated_at<?3 RETURNING key`).bind(token, now, now - 120000).first();
  if (!lock) return;
  try { await dispatchPendingConfirmationEmails(now); }
  finally { await db.prepare("DELETE FROM kv WHERE key='email-dispatch-lock' AND value=?1").bind(token).run(); }
}
async function dispatchPendingConfirmationEmails(started: number) {
  const rows = await kv.getByPrefix(PREFIX);
  let sends = 0;
  for (const row of rows) {
    if (row.expires < Date.now()) { await kv.del(row.key); continue; }
    if (sends >= 25 || Date.now() - started > 45000) break;
    try {
      const church = await churchById(row.churchId);
      if (!church) { await kv.del(row.key); continue; }
      if (row.kind === "visitor" && !row.confirmed && !row.sent) {
        await send(row.email, `Confirm your update request for ${church.name}`, `You requested an email when this church's service times are confirmed. Confirm your request here:\n${await link(row.key, "subscribe")}\n\nThis request expires in 48 hours. If you didn't request this, ignore this email. No marketing subscription is created.`, row.key);
        row.sent = true; sends++;
      } else if (row.kind === "staff" && !row.sent && !row.completed) {
        // Recheck the contact against the listing; never use a visitor-supplied recipient.
        if (await kv.get(`email-stop:${church.id}`)) continue;
        if (church.email?.trim().toLowerCase() !== row.email) { await kv.del(row.key); continue; }
        await send(row.email, `Help visitors plan a visit to ${church.name}`, `Someone is looking for confirmed service times on Here's My Church. Please review your church's service times and location:\n${await link(row.key, "staff")}\n\nThis private link expires in 30 days. Visitor email addresses are never shared.\nStop these requests: ${await link(row.key, "stop")}`, row.key);
        row.sent = true; sends++;
      } else if (row.kind === "visitor" && row.confirmed && !row.notified) {
        const proof = await kv.get(`email-proof:${row.churchId}`);
        if (proof && proof.at >= row.confirmed && proof.serviceTimes === church.serviceTimes) {
          await send(row.email, `Service times confirmed for ${church.name}`, `${church.name}\nService times: ${church.serviceTimes}\nListed address: ${church.address || "Not listed"}, ${church.city || ""}\nService times confirmed through the church's listed email contact on ${new Date(proof.at).toISOString().slice(0, 10)}. Check the map for location confirmation and any changes before visiting.\n${churchMapLink(church)}`, `${row.key}:result`);
          // Delete personal data after the requested notification succeeds.
          await kv.del(row.key); sends++; continue;
        }
      }
      if (row.sent) {
        const current = await kv.get(row.key);
        if (current && !current.sent) await kv.set(row.key, { ...current, sent: true });
      }
    } catch { console.error("confirmation_email_dispatch_failed", row.kind); }
  }
}

type Dependencies = {
  rateLimit: (c: any) => Promise<boolean>;
  save: (id: string, times: string, address: string | undefined, actor: string) => Promise<string>;
};
export function registerEmailConfirmationRoutes(app: Hono, prefix: string, deps: Dependencies) {
  const base = `${prefix}/email-confirmation`;
  app.get(`${base}/status/:id`, async c => {
    c.header("Cache-Control", "no-store");
    const church = await churchById(c.req.param("id"));
    const proof = church && await kv.get(`email-proof:${church.id}`);
    return c.json({ enabled: emailConfirmationEnabled(), serviceTimesConfirmedAt: proof?.serviceTimes === church?.serviceTimes ? proof?.at : undefined,
      locationConfirmedAt: proof?.address === church?.address && proof?.city === church?.city && proof?.lat === church?.lat && proof?.lng === church?.lng && church?.listingStatus !== "pending_reverify" ? proof?.locationAt : undefined });
  });
  app.post(`${base}/request`, async c => {
    if (!emailConfirmationEnabled()) return c.json({ error: "Email updates are not available yet." }, 503);
    if (!await deps.rateLimit(c)) return c.json({ error: "Too many requests. Please try again later." }, 429);
    const body = await c.req.json();
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    if (env("EMAIL_TEST_RECIPIENT") && email !== env("EMAIL_TEST_RECIPIENT")!.toLowerCase()) return c.json({ error: "Email updates are currently being tested. Please try again later." }, 503);
    if (!EMAIL.test(email) || email.length > 254 || typeof body.churchId !== "string") return c.json({ error: "Enter a valid email address." }, 400);
    const church = await churchById(body.churchId);
    if (!church) return c.json({ error: "Church not found." }, 404);
    const key = `${PREFIX}visitor:${await emailDigest(`${church.id}:${email}:${Math.floor(Date.now() / (90 * DAY))}`)}`;
    const existing = await kv.get(key);
    if (!existing || existing.expires < Date.now()) await kv.set(key, { key, kind: "visitor", churchId: church.id, email, expires: Date.now() + 2 * DAY });
    return c.json({ success: true });
  });
  // POST only: email scanners opening a link cannot subscribe or edit a church.
  app.post(`${base}/action`, async c => {
    c.header("Cache-Control", "no-store");
    if (!emailConfirmationEnabled()) return c.json({ error: "Email updates are not available yet." }, 503);
    if (!await deps.rateLimit(c)) return c.json({ error: "Too many requests. Please try again later." }, 429);
    const body = await c.req.json();
    const { key, token, action } = body;
    if (typeof key !== "string" || !key.startsWith(PREFIX) || key.length > 180 || typeof token !== "string" || token !== await signature(key)) return c.json({ error: "Invalid link." }, 403);
    const row = await kv.get(key);
    if (!row || row.expires < Date.now()) return c.json({ error: "This link has expired." }, 410);
    const church = await churchById(row.churchId);
    if (!church) return c.json({ error: "Church not found." }, 404);
    if (action === "cancel") { await kv.del(key); return c.json({ success: true }); }
    if (row.kind === "visitor" && action === "subscribe") {
      if (!row.confirmed) { row.confirmed = Date.now(); row.expires = Date.now() + 90 * DAY; await kv.set(key, row); }
      if (EMAIL.test(church.email || "") && !await kv.get(`email-stop:${church.id}`)) {
        const staffKey = `${PREFIX}staff:${await emailDigest(`${church.id}:${Math.floor(Date.now() / (30 * DAY))}`)}`;
        if (!await kv.get(staffKey)) await kv.set(staffKey, { key: staffKey, kind: "staff", churchId: church.id, email: church.email.trim().toLowerCase(), expires: Date.now() + 30 * DAY });
      }
      return c.json({ success: true, message: "We'll email you when service times are confirmed. You can cancel using this link. Requests expire after 90 days." });
    }
    if (row.kind !== "staff" || church.email?.trim().toLowerCase() !== row.email) return c.json({ error: "This link is no longer valid." }, 403);
    if (action === "stop") { await kv.set(`email-stop:${church.id}`, { stoppedAt: Date.now() }); return c.json({ success: true, message: "Church confirmation requests stopped." }); }
    if (action === "preview") return c.json({ church: { name: church.name, serviceTimes: church.serviceTimes || "", address: church.address || "", city: church.city || "" }, completed: !!row.completed });
    if (action !== "save") return c.json({ error: "Invalid action." }, 400);
    if (row.completed) return c.json({ success: true, message: "These details have already been submitted." });
    if (body.original && (body.original.serviceTimes !== (church.serviceTimes || "") || body.original.address !== (church.address || "") || body.original.city !== (church.city || ""))) return c.json({ error: "The listing changed. Please reopen your link and review the current details." }, 409);
    const times = typeof body.serviceTimes === "string" ? body.serviceTimes.trim() : "";
    if (!times || times.length > 1000 || /^(unknown|tbd|see website|n\/a)$/i.test(times)) return c.json({ error: "Enter your worship service days and times." }, 400);
    if (body.locationCorrect !== true && (typeof body.address !== "string" || !body.address.trim() || body.address.length > 600)) return c.json({ error: "Enter the corrected street address, city, and region for review." }, 400);
    const confirmedTimes = await deps.save(church.id, times, body.locationCorrect === true ? undefined : body.address.trim(), key);
    await kv.set(`email-proof:${church.id}`, { at: Date.now(), serviceTimes: confirmedTimes, address: church.address, city: church.city, lat: church.lat, lng: church.lng,
      locationAt: body.locationCorrect === true && !!church.address && church.listingStatus !== "pending_reverify" ? Date.now() : undefined });
    row.completed = Date.now(); await kv.set(key, row);
    return c.json({ success: true, message: body.locationCorrect === true ? "Thank you. Your service times are confirmed." : "Your service times are confirmed. Your location correction is awaiting review." });
  });
}

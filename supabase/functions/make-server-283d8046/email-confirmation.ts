import type { Hono } from "npm:hono";
import { emailHtml, emailText, type EmailMessage } from "./email-template.ts";
import * as kv from "./kv.ts";
import { env } from "./runtime.ts";
import { getD1 } from "./bindings.ts";
import { getChurches, regionFromChurchId } from "./church-keys.ts";

const DAY = 86400000;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PREFIX = "email-confirmation:";
// Also shorten previously issued visitor requests to the current retention limit.
function expiresAt(row: any): number {
  return row.kind === "visitor" && row.confirmed ? Math.min(row.expires, row.confirmed + 14 * DAY) : row.expires;
}
const site = () => (env("EMAIL_SITE_URL") || "https://heresmychurch.com").replace(/\/$/, "");
export type ConfirmationEmailBinding = {
  send(message: { from: string; to: string; subject: string; text: string; html?: string }): Promise<{ messageId: string }>;
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
async function send(to: string, message: EmailMessage, _id: string) {
  if (!emailBinding) throw new Error("Cloudflare email binding is not configured");
  // Test mode is enforced server-side and never redirects real visitors' mail.
  const testRecipient = env("EMAIL_TEST_RECIPIENT");
  if (testRecipient && to.toLowerCase() !== testRecipient.toLowerCase()) throw new Error("Recipient is outside email test mode");
  await emailBinding.send({ from: env("EMAIL_FROM")!, to, subject: message.subject, text: emailText(message), html: emailHtml(message, site()) });
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
    if (expiresAt(row) < Date.now()) { await kv.del(row.key); continue; }
    if (sends >= 25 || Date.now() - started > 45000) break;
    try {
      const church = await churchById(row.churchId);
      if (!church) { await kv.del(row.key); continue; }
      if (row.kind === "visitor" && !row.confirmed && !row.sent) {
        await send(row.email, messages.visitorConfirm(church, await link(row.key, "subscribe")), row.key);
        row.sent = true; sends++;
      } else if (row.kind === "staff" && !row.sent && !row.completed) {
        // Recheck the contact against the listing; never use a visitor-supplied recipient.
        if (await kv.get(`email-stop:${church.id}`)) continue;
        if (church.email?.trim().toLowerCase() !== row.email) { await kv.del(row.key); continue; }
        await send(row.email, messages.staffRequest(church, await link(row.key, "staff"), await link(row.key, "stop")), row.key);
        row.sent = true; sends++;
      } else if (row.kind === "visitor" && row.confirmed && !row.notified) {
        const proof = await kv.get(`email-proof:${row.churchId}`);
        if (proof && proof.at >= row.confirmed && proof.serviceTimes === church.serviceTimes) {
          await send(row.email, messages.visitorResult(church, proof.at, churchMapLink(church)), `${row.key}:result`);
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
    const key = `${PREFIX}visitor:${await emailDigest(`${church.id}:${email}:${Math.floor(Date.now() / (14 * DAY))}`)}`;
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
    if (!row || expiresAt(row) < Date.now()) return c.json({ error: "This link has expired." }, 410);
    const church = await churchById(row.churchId);
    if (!church) return c.json({ error: "Church not found." }, 404);
    if (action === "cancel") { await kv.del(key); return c.json({ success: true }); }
    if (row.kind === "visitor" && action === "subscribe") {
      if (!row.confirmed) { row.confirmed = Date.now(); row.expires = Date.now() + 14 * DAY; await kv.set(key, row); }
      if (EMAIL.test(church.email || "") && !await kv.get(`email-stop:${church.id}`)) {
        const staffKey = `${PREFIX}staff:${await emailDigest(`${church.id}:${church.email.trim().toLowerCase()}:${Math.floor(Date.now() / (30 * DAY))}`)}`;
        if (!await kv.get(staffKey)) await kv.set(staffKey, { key: staffKey, kind: "staff", churchId: church.id, email: church.email.trim().toLowerCase(), expires: Date.now() + 30 * DAY });
      }
      return c.json({ success: true, message: "We'll email you when service times are confirmed. You can cancel using this link. Requests expire after 14 days." });
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

export const churchPortalEmailEnabled = () => env("CHURCH_PORTAL_ENABLED") === "1" && !!emailBinding && !!env("EMAIL_FROM");
export async function sendChurchPortalEmail(to: string, name: string, token: string) {
  await send(to, messages.portalLink(name, `${site()}/for-churches#${new URLSearchParams({ token })}`), "church-portal");
}

export type DigestItem = { field: string; value: string; current?: unknown; votes?: number };
export async function sendChurchDigestEmail(to: string, name: string, token: string, items: DigestItem[], days: number) {
  await send(to, messages.ownerDigest(name, `${site()}/for-churches#${new URLSearchParams({ token })}`, items, days), "church-digest");
}

export async function sendChurchEmailChangeEmail(to: string, name: string, token: string) {
  await send(to, messages.emailChange(name, `${site()}/for-churches#${new URLSearchParams({ verify: token })}`), "church-email-change");
}

/** (512) 555-0199 for US and Canadian numbers; international numbers are shown as stored. */
export function formatPhone(raw: string): string {
  const d = raw.replace(/\D/g, "");
  if (!raw.trim().startsWith("+") && d.length === 10) return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
  if (!raw.trim().startsWith("+") && d.length === 11 && d[0] === "1") return `(${d.slice(1, 4)}) ${d.slice(4, 7)}-${d.slice(7)}`;
  // International numbers are stored with their + and country code; shown as stored.
  return raw;
}

// ── Message content, shared by the sender and the preview script ──
const FIELD_NAMES: Record<string, string> = { name: "Name", address: "Address", denomination: "Denomination", serviceTimes: "Service times", phone: "Phone", email: "Contact email", website: "Website", pastorName: "Lead pastor", languages: "Languages", ministries: "Ministries", reportClosed: "Reported closed", reportDuplicate: "Reported as a duplicate", reportOutOfScope: "Reported as not a church", reportRelocated: "Reported as moved", homeCampusId: "Main campus" };
function shown(field: string, value: unknown): string {
  if (field === "address" && typeof value === "string" && value.trim().startsWith("{")) { try { const a = JSON.parse(value); return [a.address, a.city, a.postcode].filter(Boolean).join(", "); } catch { /* fall through */ } }
  if (field.startsWith("report")) return "";
  if (field === "phone") return formatPhone(String(value ?? ""));
  return Array.isArray(value) ? value.join(", ") : String(value ?? "");
}
export const messages = {
  portalLink: (name: string, url: string): EmailMessage => ({
    subject: `Manage ${name} on Here’s My Church`,
    preheader: "Your private link to claim and update your church listing.",
    heading: `Manage ${name}`,
    paragraphs: ["Here’s your private link to claim your church’s listing and keep its details up to date. Changes you make go live on the map right away, and suggestions from visitors come to you first."],
    button: { label: "Open your listing", url },
    note: "This link works for 24 hours. Anyone who has it can update the listing, so please don’t forward it. If you didn’t ask for it, you can ignore this email.",
  }),
  ownerDigest: (name: string, url: string, items: DigestItem[], days: number): EmailMessage => {
    const what = items.length === 1 ? "1 suggested update" : `${items.length} suggested updates`;
    return {
      subject: `${what} for ${name}`,
      preheader: `Visitors suggested changes to ${name}. They wait for you first.`,
      heading: `${what} waiting for you`,
      paragraphs: [`Visitors suggested changes to ${name}’s listing on Here’s My Church. Because your church manages its listing, nothing changes until you decide.`],
      details: items.slice(0, 6).map(i => {
        const next = shown(i.field, i.value), before = shown(i.field, i.current);
        return { label: FIELD_NAMES[i.field] || i.field, value: i.field.startsWith("report") ? FIELD_NAMES[i.field] || "Report" : next || "(empty)", note: before && !i.field.startsWith("report") ? `Currently: ${before}` : undefined };
      }).concat(items.length > 6 ? [{ label: "And more", value: `${items.length - 6} other suggestion${items.length - 6 === 1 ? "" : "s"}`, note: undefined }] : []),
      button: { label: "Review suggestions", url },
      note: `This private link works for 3 days. If you don’t respond within ${days} days, our automated review decides instead, and you can always change your listing later.`,
    };
  },
  emailChange: (name: string, url: string): EmailMessage => ({
    subject: `Confirm the new contact email for ${name}`,
    preheader: `Make this address the contact for ${name} on Here’s My Church.`,
    heading: "Confirm your church’s new contact email",
    paragraphs: [`Someone signed in to ${name}’s listing asked to make this address its contact email. Once you confirm, sign-in links for the listing will come here.`],
    button: { label: "Confirm this address", url },
    note: "This link works for 3 days. If you weren’t expecting it, ignore this email and nothing changes.",
  }),
  staffRequest: (church: any, url: string, stopUrl: string): EmailMessage => ({
    subject: `Help visitors plan a visit to ${church.name}`,
    preheader: "Someone is looking for confirmed service times.",
    heading: `Are ${church.name}’s service times right?`,
    paragraphs: ["Someone on Here’s My Church is looking for confirmed service times for your church. It takes less than a minute to check them and your location."],
    details: [{ label: "Service times", value: church.serviceTimes || "Not listed yet" }, { label: "Address", value: [church.address, church.city].filter(Boolean).join(", ") || "Not listed" }],
    button: { label: "Review service times", url },
    note: "This private link works for 30 days. Visitor email addresses are never shared with churches.",
    stop: { label: "Stop these requests", url: stopUrl },
  }),
  visitorConfirm: (church: any, url: string): EmailMessage => ({
    subject: `Confirm your update request for ${church.name}`,
    preheader: "One click and we’ll email you when the church confirms its times.",
    heading: "Confirm your request",
    paragraphs: [`You asked to hear when ${church.name} confirms its service times. Confirm below and we’ll email you once, when it does.`],
    button: { label: "Confirm request", url },
    note: "This request expires in 48 hours. If you didn’t ask for it, ignore this email. You won’t be added to any mailing list.",
  }),
  visitorResult: (church: any, at: number, mapUrl: string): EmailMessage => ({
    subject: `Service times confirmed for ${church.name}`,
    preheader: `${church.name} confirmed its service times.`,
    heading: `${church.name} confirmed its service times`,
    paragraphs: [`The church confirmed these through its listed email on ${new Date(at).toISOString().slice(0, 10)}.`],
    details: [{ label: "Service times", value: church.serviceTimes || "" }, { label: "Address", value: [church.address || "Not listed", church.city].filter(Boolean).join(", ") }],
    button: { label: "See it on the map", url: mapUrl },
    note: "Check the map for any changes before you visit.",
  }),
};

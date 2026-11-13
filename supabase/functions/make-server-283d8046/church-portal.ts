import { recordPrivateAttendance } from './attendance-calibration.ts';
import type { Hono } from 'npm:hono';
import * as kv from './kv.ts';
import { getChurches, regionFromChurchId, isValidRegion } from './church-keys.ts';
import { env } from './runtime.ts';
import { emailDigest, sendChurchPortalEmail, sendChurchEmailChangeEmail, churchPortalEmailEnabled } from './email-confirmation.ts';
import { claimState, writeClaim, dispatchOwnerDigests } from './church-ownership.ts';
import { queryAuditByChurch } from './audit.ts';

const DAY = 86400000;
const clean = (v: unknown) => typeof v === 'string' && v.trim().length > 0 && !/^(unknown|other|tbd|n\/?a|pending|see website|to be determined)$/i.test(v.trim());
export function completeness(ch: any, now = Date.now()) {
  const checks = { address: clean(ch.address) && ch.address.trim().length >= 5 && ch.address.trim().toLowerCase() !== String(ch.city || '').toLowerCase(), serviceTimes: clean(ch.serviceTimes), website: /^https?:\/\//i.test(ch.website || ''), contact: clean(ch.phone) || clean(ch.email), photo: /^https?:\/\//i.test(ch.photoUrl || ch.photo || ''), recentConfirmation: typeof ch.lastVerified === 'number' && ch.lastVerified <= now && now - ch.lastVerified <= 180 * DAY };
  return { score: Math.round(Object.values(checks).filter(Boolean).length / 6 * 100), missing: Object.entries(checks).filter(([, v]) => !v).map(([k]) => k) };
}
// A duplicate candidate is a suggestion for human review, never an automatic merge.
export function duplicateCandidates(rows: any[]) {
  const groups = new Map<string, any[]>();
  for (const ch of rows) {
    const name = String(ch.name || '').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
    const city = String(ch.city || '').trim().toLowerCase();
    if (!name || !city) continue;
    const key = `${city}:${name}`;
    const list = groups.get(key) || []; list.push(ch); groups.set(key, list);
  }
  return [...groups.values()].filter(g => g.length > 1).map(g => g.map(c => c.id));
}
/** Shows enough of the listed inbox for a church to recognize it, without publishing the full address. */
export function maskEmail(email: string) {
  const [user, domain] = email.split('@');
  return user && domain ? `${user[0]}•••@${domain}` : '';
}
// Sources where anyone could set the listing email without review (before email edits were always held).
const UNREVIEWED_EMAIL_SOURCES = new Set(['suggestion', 'partner_suggestion', 'community_add', 'church_portal']);
const unreviewed = (source: unknown) => typeof source === 'string' && (UNREVIEWED_EMAIL_SOURCES.has(source) || source.startsWith('lookup:'));
/** False when the current listing email was set by an unreviewed visitor, partner or Lookup edit, or came
 *  with an unreviewed community add. Such an inbox must not receive sign-in links or claim the listing. */
export async function listedEmailTrusted(ch: any): Promise<boolean> {
  const rows = await queryAuditByChurch(ch.id, 200);
  const emailRow = rows.find(r => r.action === 'field_updated' && r.field === 'email');
  if (emailRow) return !unreviewed(emailRow.source);
  if (String(ch.id).startsWith('community-')) {
    const added = rows.find(r => r.action === 'church_added');
    return !!added && !unreviewed(added.source);
  }
  return true;
}
async function find(id: string) {
  const region = regionFromChurchId(id);
  const rows = region ? await getChurches(region) : [];
  return Array.isArray(rows) ? rows.find((c: any) => c.id === id) : null;
}
const listedEmail = (ch: any) => String(ch.email || '').trim().toLowerCase();
const validEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
const listedInbox = (ch: any) => { const email = listedEmail(ch); return validEmail(email) ? { hasEmail: true, emailHint: maskEmail(email) } : { hasEmail: false }; };
const listText = (v: unknown) => Array.isArray(v) ? v.join(', ') : typeof v === 'string' ? v : '';
const publicChurch = (ch: any) => ({ id: ch.id, name: ch.name, address: ch.address || '', city: ch.city, state: ch.state, postcode: ch.postcode || '', country: ch.country || 'US', denomination: ch.denomination, lat: ch.lat, lng: ch.lng, shortId: ch.shortId, serviceTimes: ch.serviceTimes || '', phone: ch.phone || '', email: ch.email || '', website: ch.website || '', pastorName: ch.pastorName || '', languages: listText(ch.languages), ministries: listText(ch.ministries) });
const DAY_MS = 86400000;
/** A private sign-in link for the listed inbox. Only the token's hash is stored. */
export async function createChurchLogin(ch: any, emailHash: string, ttlMs = DAY_MS) {
  const token = crypto.randomUUID() + crypto.randomUUID(); const key = `church-login:${await emailDigest(token)}`;
  await kv.set(key, { key, churchId: ch.id, emailHash, expires: Date.now() + ttlMs });
  return token;
}
type PortalDeps = {
  pending(entry: any, church: any): number;
  rateLimit(c: any): Promise<boolean>;
  applyOwner(churchId: string, fields: Record<string, string>, emailHash: string): Promise<{ applied: string[]; errors: { field: string; error: string }[] }>;
  pendingForOwner(ch: any): Promise<any[]>;
  accept(churchId: string, field: string, value: string, reviewVersion: string | undefined, emailHash: string): Promise<any>;
  decline(churchId: string, field: string, value: string, reviewVersion: string | undefined, emailHash: string): Promise<any>;
  setOwnerEmail(churchId: string, email: string, emailHash: string): Promise<boolean>;
};
let registeredDeps: PortalDeps | null = null;
/** Cron: daily digest emails to claimed churches with suggestions waiting for them. */
export async function runOwnerDigests() {
  if (!registeredDeps || !churchPortalEmailEnabled()) return 0;
  const deps = registeredDeps;
  return dispatchOwnerDigests({ find, pendingFor: ch => deps.pendingForOwner(ch), createLogin: createChurchLogin });
}
export function registerChurchPortalRoutes(app: Hono, p: string, deps: PortalDeps) {
  registeredDeps = deps;
  app.use(`${p}/church-portal/*`, async (c, next) => { c.header('Cache-Control', 'no-store'); c.header('Referrer-Policy', 'no-referrer'); await next(); });
  app.get(`${p}/church-portal/status/:id`, async c => {
    const ch = await find(c.req.param('id')); if (!ch) return c.json({ error: 'Listing not found.' }, 404);
    const state = await claimState(ch);
    return c.json({ enabled: churchPortalEmailEnabled(), claimed: state.claimed, ...(state.claimed ? { claimedAt: state.claimedAt } : {}) });
  });
  app.get(`${p}/church-portal/listing/:id`, async c => {
    const ch = await find(c.req.param('id')); if (!ch) return c.json({ error: 'Listing not found.' }, 404);
    return c.json({ church: { id: ch.id, name: ch.name, country: ch.country || 'US', state: ch.state, city: ch.city, shortId: ch.shortId, denomination: ch.denomination, serviceTimes: ch.serviceTimes, website: ch.website, lat: ch.lat, lng: ch.lng, ...listedInbox(ch) } });
  });
  app.post(`${p}/church-portal/request`, async c => {
    if (!churchPortalEmailEnabled()) return c.json({ error: 'Church sign-in is not available yet. Please use Suggest an edit on the map.' }, 503);
    if (!(await deps.rateLimit(c))) return c.json({ error: 'Too many requests. Please try again later.' }, 429);
    const body = await c.req.json().catch(() => null);
    if (typeof body?.churchId !== 'string' || body.churchId.length > 160) return c.json({ error: 'Choose a church listing.' }, 400);
    const ch = await find(body.churchId); if (!ch) return c.json({ error: 'Listing not found.' }, 404);
    const email = listedEmail(ch);
    // Never send an ownership link to a visitor-provided email address.
    if (validEmail(email) && !(await listedEmailTrusted(ch))) return c.json({ error: 'This listing’s contact email hasn’t been reviewed yet, so we can’t send a sign-in link to it. Please try again after review, or suggest a contact correction from the map.' }, 409);
    if (validEmail(email)) {
      const cooldown = `church-login-cooldown:${ch.id}`;
      if (Date.now() - Number(await kv.get(cooldown) || 0) >= 15 * 60000) {
        const token = await createChurchLogin(ch, await emailDigest(email));
        const key = `church-login:${await emailDigest(token)}`;
        try { await sendChurchPortalEmail(email, ch.name, token); await kv.set(cooldown, Date.now()); }
        catch { await kv.del(key); return c.json({ error: 'Unable to send the link. Please try again later.' }, 503); }
      }
    }
    return c.json({ message: 'If this listing has a contact email, we have sent a private link there. Links expire after 24 hours. If you cannot access that inbox, suggest a contact correction on the map.' });
  });
  // Confirms a new contact email from the link sent to that address. The claim moves with it.
  app.post(`${p}/church-portal/verify-email`, async c => {
    if (!churchPortalEmailEnabled()) return c.json({ error: 'Church sign-in is unavailable.' }, 503);
    if (!(await deps.rateLimit(c))) return c.json({ error: 'Too many requests. Please try again later.' }, 429);
    const body = await c.req.json().catch(() => null);
    if (typeof body?.token !== 'string' || body.token.length > 150) return c.json({ error: 'Invalid confirmation link.' }, 403);
    const key = `church-email-change:${await emailDigest(body.token)}`; const change = await kv.get(key);
    if (!change || change.expires < Date.now()) { if (change) await kv.del(key); return c.json({ error: 'This confirmation link has expired. Request the change again.' }, 403); }
    const ch = await find(change.churchId);
    // Only the inbox that asked for the change can hand the listing over.
    if (!ch || change.fromHash !== await emailDigest(listedEmail(ch))) { await kv.del(key); return c.json({ error: 'The listing contact has changed since this was requested.' }, 409); }
    if (!(await deps.setOwnerEmail(ch.id, change.newEmail, change.fromHash))) return c.json({ error: 'Unable to update the contact email.' }, 400);
    await kv.del(key);
    return c.json({ message: `${ch.name}'s contact email is now ${change.newEmail}. Sign-in links will go there.` });
  });
  app.post(`${p}/church-portal/session`, async c => {
    if (!churchPortalEmailEnabled()) return c.json({ error: 'Church sign-in is unavailable.' }, 503);
    if (!(await deps.rateLimit(c))) return c.json({ error: 'Too many requests. Please try again later.' }, 429);
    const body = await c.req.json().catch(() => null);
    if (typeof body?.token !== 'string' || body.token.length > 150) return c.json({ error: 'Invalid sign-in link.' }, 403);
    const hash = await emailDigest(body.token); const key = `church-login:${hash}`; const login = await kv.get(key);
    if (!login || login.expires < Date.now()) { if (login) await kv.del(key); return c.json({ error: 'This link has expired. Request a new one from your listing.' }, 403); }
    const ch = await find(login.churchId);
    if (!ch || login.emailHash !== await emailDigest(String(ch.email || '').trim().toLowerCase())) return c.json({ error: 'The listing contact has changed. Request a new link.' }, 403);
    if (body.action === 'preview') {
      return c.json({ church: publicChurch(ch), expires: login.expires, claimed: (await claimState(ch)).claimed });
    }
    if (body.action === 'logout') { await kv.del(key); return c.json({ message: 'Signed out. This link can no longer be used.' }); }
    if (body.action === 'claim') {
      if (!(await listedEmailTrusted(ch))) return c.json({ error: 'This listing’s contact email is waiting for review, so it can’t be claimed yet.' }, 409);
      await writeClaim(ch.id, login.emailHash);
      return c.json({ message: 'Listing claimed through the church’s listed inbox.' });
    }
    if (body.action === 'attendance') {
      const result = await recordPrivateAttendance(ch, login.emailHash, body.report);
      return 'error' in result ? c.json({ error: result.error }, result.status) : c.json(result);
    }
    if (body.action === 'pending') return c.json({ pending: await deps.pendingForOwner(ch) });
    if (body.action === 'accept' || body.action === 'decline') {
      if (!(await claimState(ch)).claimed) return c.json({ error: 'Claim this listing first.' }, 409);
      if (typeof body.field !== 'string' || typeof body.value !== 'string') return c.json({ error: 'Choose a suggestion.' }, 400);
      const reviewVersion = typeof body.reviewVersion === 'string' ? body.reviewVersion : undefined;
      try {
        const r = await (body.action === 'accept' ? deps.accept : deps.decline)(ch.id, body.field, body.value, reviewVersion, login.emailHash);
        if (!r.ok) return c.json({ error: r.error }, r.status);
      } catch (e: any) { if (e?.code) return c.json({ error: 'This suggestion changed. Refresh and try again.' }, 409); throw e; }
      const fresh = (await find(ch.id)) || ch;
      return c.json({ message: body.action === 'accept' ? 'Accepted. The listing is updated.' : 'Declined.', church: publicChurch(fresh), pending: await deps.pendingForOwner(fresh) });
    }
    if (body.action !== 'save') return c.json({ error: 'Unknown action.' }, 400);
    const allowed = ['name', 'address', 'city', 'postcode', 'denomination', 'serviceTimes', 'phone', 'email', 'website', 'pastorName', 'languages', 'ministries'];
    if (!body.fields || typeof body.fields !== 'object' || Array.isArray(body.fields) || Object.keys(body.fields).some(k => !allowed.includes(k)) || Object.values(body.fields).some(v => typeof v !== 'string' || v.length > 2000)) return c.json({ error: 'Invalid listing fields.' }, 400);
    // Saving through the listed inbox claims the listing; an unreviewed inbox can't.
    if (!(await claimState(ch)).claimed) {
      if (!(await listedEmailTrusted(ch))) return c.json({ error: 'This listing’s contact email is waiting for review, so it can’t be managed yet.' }, 409);
      await writeClaim(ch.id, login.emailHash);
    }
    const current = publicChurch(ch) as Record<string, string>;
    const changes: Record<string, string> = {};
    for (const [field, value] of Object.entries(body.fields as Record<string, string>)) if (value.trim() !== String(current[field] ?? '').trim()) changes[field] = value;
    const results: any[] = [];
    if (changes.email !== undefined) {
      const newEmail = changes.email.trim().toLowerCase(); delete changes.email;
      if (!validEmail(newEmail)) results.push({ field: 'email', ok: false, error: 'Enter a valid email address.' });
      else {
        const token = crypto.randomUUID() + crypto.randomUUID();
        const key = `church-email-change:${await emailDigest(token)}`;
        await kv.set(key, { key, churchId: ch.id, newEmail, fromHash: login.emailHash, expires: Date.now() + 3 * DAY });
        try { await sendChurchEmailChangeEmail(newEmail, ch.name, token); results.push({ field: 'email', ok: true, pendingVerification: true }); }
        catch { await kv.del(key); results.push({ field: 'email', ok: false, error: 'Unable to send the confirmation email.' }); }
      }
    }
    // Street, city and postcode change together as one address.
    if (changes.address !== undefined || changes.city !== undefined || changes.postcode !== undefined) {
      const f = body.fields as Record<string, string>;
      changes.address = JSON.stringify({ address: f.address ?? current.address, city: f.city ?? current.city, state: ch.state, postcode: (f.postcode ?? current.postcode) || undefined });
      delete changes.city; delete changes.postcode;
    }
    if (Object.keys(changes).length) {
      const r = await deps.applyOwner(ch.id, changes, login.emailHash);
      for (const f of r.applied) results.push({ field: f, ok: true, applied: true });
      for (const e of r.errors) results.push({ ok: false, ...e });
    }
    const failed = results.some(r => !r.ok), verifying = results.some(r => r.pendingVerification);
    return c.json({ results, claimed: true, church: publicChurch((await find(ch.id)) || ch), message: failed ? 'Some changes could not be saved. Review the details below.' : results.length ? `Saved. Your listing is updated.${verifying ? ' Check the new inbox to confirm the contact email.' : ''}` : 'No changes to save.' });
  });
  app.get(`${p}/data-health/:region`, async c => {
    const region = c.req.param('region').toUpperCase();
    if (!isValidRegion(region)) return c.json({ error: 'Choose a valid region.' }, 400);
    const raw = await getChurches(region); const churches = Array.isArray(raw) ? raw : [];
    const prefixes = [`suggestions:${region}-`, `suggestions:community-${region}-`];
    const country = churches[0]?.country;
    if (country && country !== 'US') prefixes.push(`suggestions:${country}-${region}-`, `suggestions:community-${country}-${region}-`);
    const suggestions = (await Promise.all(prefixes.map(prefix => kv.getByPrefix(prefix)))).flat();
    const pending = new Map<string, number>();
    const byId = new Map(churches.map((ch: any) => [ch.id, ch]));
    for (const entry of suggestions) {
      const count = deps.pending(entry, byId.get(entry?.churchId));
      if (count) pending.set(entry.churchId, count);
    }
    const duplicates = duplicateCandidates(churches); const duplicateIds = new Set(duplicates.flat());
    const rows = churches.map((ch: any) => ({ id: ch.id, name: ch.name, city: ch.city, state: ch.state, country: ch.country || 'US', denomination: ch.denomination, lat: ch.lat, lng: ch.lng, shortId: ch.shortId, ...completeness(ch), openSuggestions: pending.get(ch.id) || 0, possibleDuplicate: duplicateIds.has(ch.id) }));
    return c.json({ region, generatedAt: Date.now(), total: rows.length, averageScore: rows.length ? Math.round(rows.reduce((n: number, r: any) => n + r.score, 0) / rows.length) : 0, openSuggestions: rows.reduce((n: number, r: any) => n + r.openSuggestions, 0), duplicateGroups: duplicates.length, rows });
  });
}

/** Expired inbox grants are removed by the existing minute dispatcher. */
export async function cleanupChurchPortalSessions() {
  if (env('MAINTENANCE_READONLY')) return;
  const rows = await kv.getByPrefix('church-login:');
  await kv.mdel(rows.filter((r: any) => r.key?.startsWith('church-login:') && r.expires < Date.now()).map((r: any) => r.key));
}

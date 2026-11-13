import { recordPrivateAttendance } from './attendance-calibration.ts';
import type { Hono } from 'npm:hono';
import * as kv from './kv.ts';
import { getChurches, regionFromChurchId, isValidRegion } from './church-keys.ts';
import { env } from './runtime.ts';
import { emailDigest, sendChurchPortalEmail, churchPortalEmailEnabled } from './email-confirmation.ts';
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
const publicChurch = (ch: any) => ({ id: ch.id, name: ch.name, city: ch.city, state: ch.state, country: ch.country || 'US', denomination: ch.denomination, lat: ch.lat, lng: ch.lng, shortId: ch.shortId, serviceTimes: ch.serviceTimes || '', phone: ch.phone || '', email: ch.email || '', website: ch.website || '' });
export function registerChurchPortalRoutes(app: Hono, p: string, deps: { pending(entry: any, church: any): number; rateLimit(c: any): Promise<boolean>; submit(id: string, field: string, value: string, actor: string): Promise<any> }) {
  app.use(`${p}/church-portal/*`, async (c, next) => { c.header('Cache-Control', 'no-store'); c.header('Referrer-Policy', 'no-referrer'); await next(); });
  app.get(`${p}/church-portal/status/:id`, async c => {
    const ch = await find(c.req.param('id')); if (!ch) return c.json({ error: 'Listing not found.' }, 404);
    const claim = await kv.get(`church-claim:${ch.id}`);
    const claimed = !!claim && claim.emailHash === await emailDigest(String(ch.email || '').trim().toLowerCase());
    return c.json({ enabled: churchPortalEmailEnabled(), claimed, ...(claimed ? { claimedAt: claim.at } : {}) });
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
        const token = crypto.randomUUID() + crypto.randomUUID(); const hash = await emailDigest(token);
        const key = `church-login:${hash}`;
        await kv.set(key, { key, churchId: ch.id, emailHash: await emailDigest(email), expires: Date.now() + DAY });
        try { await sendChurchPortalEmail(email, ch.name, token); await kv.set(cooldown, Date.now()); }
        catch { await kv.del(key); return c.json({ error: 'Unable to send the link. Please try again later.' }, 503); }
      }
    }
    return c.json({ message: 'If this listing has a contact email, we have sent a private link there. Links expire after 24 hours. If you cannot access that inbox, suggest a contact correction on the map.' });
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
      const claim = await kv.get(`church-claim:${ch.id}`);
      return c.json({ church: publicChurch(ch), expires: login.expires, claimed: claim?.emailHash === login.emailHash });
    }
    if (body.action === 'logout') { await kv.del(key); return c.json({ message: 'Signed out. This link can no longer be used.' }); }
    if (body.action === 'claim') {
      if (!(await listedEmailTrusted(ch))) return c.json({ error: 'This listing’s contact email is waiting for review, so it can’t be claimed yet.' }, 409);
      await kv.set(`church-claim:${ch.id}`, { emailHash: login.emailHash, at: Date.now() });
      return c.json({ message: 'Listing claimed through the church’s listed inbox.' });
    }
    if (body.action === 'attendance') {
      const result = await recordPrivateAttendance(ch, login.emailHash, body.report);
      return 'error' in result ? c.json({ error: result.error }, result.status) : c.json(result);
    }
    if (body.action !== 'save') return c.json({ error: 'Unknown action.' }, 400);
    const allowed = ['serviceTimes', 'phone', 'email', 'website'];
    if (!body.fields || typeof body.fields !== 'object' || Array.isArray(body.fields) || Object.keys(body.fields).some(k => !allowed.includes(k)) || Object.values(body.fields).some(v => typeof v !== 'string' || v.length > 2000)) return c.json({ error: 'Invalid listing fields.' }, 400);
    const results: any[] = [];
    for (const field of allowed) {
      const value = body.fields[field];
      if (value === undefined || value === (ch[field] || '')) continue;
      const result = await deps.submit(ch.id, field, value, `church-inbox:${hash}`);
      results.push({ field, ...result });
    }
    return c.json({ results, message: results.some(r => !r.ok) ? 'Some changes could not be submitted. Review the details below.' : results.length ? 'Changes submitted. Updates that require review will appear after approval.' : 'No changes to submit.' });
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

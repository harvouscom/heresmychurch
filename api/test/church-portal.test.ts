import { beforeAll, beforeEach, afterAll, describe, it, expect, vi } from 'vitest';
import app from '../../supabase/functions/make-server-283d8046/app.ts';
import * as kv from '../../supabase/functions/make-server-283d8046/kv.ts';
import { setConfirmationEmailBinding } from '../../supabase/functions/make-server-283d8046/email-confirmation.ts';
import { completeness, duplicateCandidates, cleanupChurchPortalSessions } from '../../supabase/functions/make-server-283d8046/church-portal.ts';
import { startHarness, type Harness } from './harness';
let h: Harness;
const sent: any[] = [];
const call = (path: string, body?: any) => app.fetch(new Request(`https://api.test/make-server-283d8046/${path}`, body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }));
const seed = () => kv.set('churches:US:TX', [{ id: 'TX-123', name: 'Grace Church', city: 'Austin', state: 'TX', email: 'office@example.org', phone: '5125550123', serviceTimes: 'Sunday 9am', website: 'https://example.org', address: '123 Main St', lat: 30, lng: -97 }]);
beforeAll(async () => { h = await startHarness({ CHURCH_PORTAL_ENABLED: '1', EMAIL_FROM: 'test@example.org' }); setConfirmationEmailBinding({ send: vi.fn(async message => { sent.push(message); return { messageId: 'test' }; }) }); });
beforeEach(async () => { await seed(); await kv.del('ratelimit:church-portal:unknown'); await kv.del('church-login-cooldown:TX-123'); });
afterAll(async () => { setConfirmationEmailBinding(null); await h.flush(); await h.mf.dispose(); });
async function login() { await call('church-portal/request', { churchId: 'TX-123', email: 'attacker@example.net' }); const url = sent.at(-1).text.split('\n').find((s: string) => s.startsWith('https://')); return new URLSearchParams(new URL(url).hash.slice(1)).get('token'); }
describe('church portal', () => {
  it('sends only to the current listed inbox, stores a hash, and cools down requests', async () => { const before = sent.length; const token = await login(); expect(sent.at(-1).to).toBe('office@example.org'); expect(sent.at(-1).text).toContain('/for-churches#'); await call('church-portal/request', { churchId: 'TX-123' }); expect(sent.length).toBe(before + 1); const rows = await kv.getByPrefix('church-login:'); expect(JSON.stringify(rows)).not.toContain(token); expect((await call('church-portal/session', { token, action: 'preview' })).status).toBe(200); });
  it('requires explicit claiming and rejects forged, expired, changed-contact and logged-out links', async () => {
    expect((await call('church-portal/session', { token: 'forged', action: 'claim' })).status).toBe(403);
    const token = await login(); await call('church-portal/session', { token, action: 'preview' }); expect((await (await call('church-portal/status/TX-123')).json() as any).claimed).toBe(false);
    await call('church-portal/session', { token, action: 'claim' }); expect((await (await call('church-portal/status/TX-123')).json() as any).claimed).toBe(true);
    await call('church-portal/session', { token, action: 'logout' }); expect((await call('church-portal/session', { token, action: 'preview' })).status).toBe(403);
    await kv.del('church-login-cooldown:TX-123'); const second = await login(); const rows = await kv.getByPrefix('church-login:'); const row = rows.find((r: any) => r.expires > Date.now());
    const churches = await kv.get('churches:US:TX'); churches[0].email = 'new@example.org'; await kv.set('churches:US:TX', churches);
    expect((await call('church-portal/session', { token: second, action: 'save', fields: { serviceTimes: 'Sunday 11am' } })).status).toBe(403);
    expect((await (await call('church-portal/status/TX-123')).json() as any).claimed).toBe(false);
    expect(row).toBeTruthy();
  });
  it('holds replacements for moderation and rejects arbitrary fields', async () => {
    const token = await login(); expect((await call('church-portal/session', { token, action: 'save', fields: { name: 'Changed' } })).status).toBe(400);
    const res = await call('church-portal/session', { token, action: 'save', fields: { serviceTimes: 'Sunday 11am' } }); expect(res.status).toBe(200);
    expect((await kv.get('churches:US:TX'))[0].serviceTimes).toBe('Sunday 9am');
    expect((await kv.get('suggestions:TX-123')).submissions.some((s: any) => s.field === 'serviceTimes')).toBe(true);
    const data = await (await call('data-health/TX')).json() as any; expect(data.openSuggestions).toBeGreaterThan(0); expect(JSON.stringify(data)).not.toContain('office@example.org'); expect(JSON.stringify(data)).not.toContain(token);
  });
  it('shows a masked inbox hint so a church can request a link', async () => {
    const d = await (await call('church-portal/listing/TX-123')).json() as any;
    expect(d.church.hasEmail).toBe(true); expect(d.church.emailHint).toBe('o•••@example.org'); expect(JSON.stringify(d)).not.toContain('office@example.org');
  });
  it('holds visitor email fills and refuses sign-in to a visitor-set inbox', async () => {
    const churches = await kv.get('churches:US:TX'); delete churches[0].email; await kv.set('churches:US:TX', churches);
    const res = await call('suggestions', { churchId: 'TX-123', field: 'email', value: 'attacker@example.net' }); expect(res.status).toBe(200);
    expect(((await res.json()) as any).needsModeration).toBe(true);
    expect((await kv.get('churches:US:TX'))[0].email).toBeUndefined();
    // An email that reached the listing through an unreviewed visitor edit (before this rule) can't receive links or claim.
    const { recordChurchAudit } = await import('../../supabase/functions/make-server-283d8046/audit.ts');
    const stored = await kv.get('churches:US:TX'); stored[0].email = 'attacker@example.net'; await kv.set('churches:US:TX', stored);
    recordChurchAudit({ church_id: 'TX-123', state: 'TX', action: 'field_updated', field: 'email', new_value: 'attacker@example.net', source: 'suggestion' }, { hashIp: 'x' }); await h.flush();
    const before = sent.length;
    expect((await call('church-portal/request', { churchId: 'TX-123' })).status).toBe(409); expect(sent.length).toBe(before);
    recordChurchAudit({ church_id: 'TX-123', state: 'TX', action: 'field_updated', field: 'email', new_value: 'office@example.org', source: 'moderate_approve' }, { hashModKey: 'm' }); await h.flush();
    stored[0].email = 'office@example.org'; await kv.set('churches:US:TX', stored);
    const token = await login(); expect(sent.length).toBe(before + 1);
    expect((await call('church-portal/session', { token, action: 'claim' })).status).toBe(200);
  });
  it('keeps an adder-supplied email off a new listing until it is reviewed', async () => {
    const res = await call('churches/add', { name: 'New Hope Fellowship', address: '9 Oak St', city: 'Austin', state: 'TX', lat: 30.3, lng: -97.7, email: 'me@example.net', confirmAdd: true });
    expect(res.status).toBe(200); const body = await res.json() as any;
    const listed = (await kv.get('churches:US:TX')).find((c: any) => c.id === body.church.id);
    expect(listed.email).toBeUndefined();
    const held = (await kv.get(`suggestions:${body.church.id}`)).submissions[0];
    expect(held).toMatchObject({ field: 'email', value: 'me@example.net', needsModeration: true });
  });
  it('expires and cleans up old grants', async () => {
    const token = await login();
    const { emailDigest } = await import('../../supabase/functions/make-server-283d8046/email-confirmation.ts');
    const key = `church-login:${await emailDigest(token!)}`;
    await kv.set(key, { key, churchId: 'TX-123', expires: Date.now() - 1000 });
    expect((await call('church-portal/session', { token, action: 'preview' })).status).toBe(403);
    await kv.set(key, { key, expires: Date.now() - 1000 }); await cleanupChurchPortalSessions(); expect(await kv.get(key)).toBeUndefined();
  });
  it('honors the feature switch and maintenance freeze', async () => { h.vars.CHURCH_PORTAL_ENABLED = ''; expect((await call('church-portal/request', { churchId: 'TX-123' })).status).toBe(503); h.vars.CHURCH_PORTAL_ENABLED = '1'; h.vars.MAINTENANCE_READONLY = '1'; expect((await call('church-portal/request', { churchId: 'TX-123' })).status).toBe(503); h.vars.MAINTENANCE_READONLY = ''; });
  it('scores missing placeholders and flags same-name-city candidates without merging', async () => { expect(completeness({ city: 'Austin', address: 'Austin', serviceTimes: 'see website' }).score).toBe(0); expect(completeness({ lastVerified: Date.now() + 10000 }).score).toBe(0); expect(duplicateCandidates([{ id: 'a', name: 'Grace Church', city: 'Austin' }, { id: 'b', name: 'Grace Church', city: 'austin' }, { id: 'c', name: 'Grace Church', city: 'Dallas' }])).toEqual([['a', 'b']]); expect((await call('data-health/invalid')).status).toBe(400); });
});

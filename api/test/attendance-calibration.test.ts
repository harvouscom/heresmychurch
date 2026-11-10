import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import app from '../../supabase/functions/make-server-283d8046/app.ts';
import * as kv from '../../supabase/functions/make-server-283d8046/kv.ts';
import { setConfirmationEmailBinding } from '../../supabase/functions/make-server-283d8046/email-confirmation.ts';
import { cleanupPrivateAttendance } from '../../supabase/functions/make-server-283d8046/attendance-calibration.ts';
import { startHarness, type Harness } from './harness';
let h: Harness, token: string;
const call = (path: string, body?: any, mod = false) => app.fetch(new Request(`https://api.test/make-server-283d8046/${path}`, { ...(body === undefined ? {} : { method: 'POST', body: JSON.stringify(body) }), headers: { 'Content-Type': 'application/json', ...(mod ? { 'x-moderator-key': 'test-mod' } : {}) } }));
const report = { lower: 70, upper: 90, weeks: 8, basis: 'counted', notes: 'Private seasonal context', definitionAccepted: true };
const submit = (extra = {}) => call('church-portal/session', { token, action: 'attendance', report: { ...report, ...extra } });
const pending = async () => (await (await call('moderate/attendance-reports', undefined, true)).json() as any).reports;
beforeAll(async () => { h = await startHarness({ CHURCH_PORTAL_ENABLED: '1', EMAIL_FROM: 'test@example.org', MODERATOR_KEY: 'test-mod' }); setConfirmationEmailBinding({ send: async message => { token = new URLSearchParams(new URL(message.text.split('\n').find(s => s.startsWith('https://'))!).hash.slice(1)).get('token')!; return { messageId: 'test' }; } }); });
beforeEach(async () => {
  await kv.set('churches:US:TX', [{ id: 'TX-123', name: 'Grace Church', city: 'Austin', state: 'TX', country: 'US', attendance: 100, lat: 30, lng: -97, email: 'office@example.org', lastVerified: 1600000000000, listingStatus: 'pending_reverify' }]);
  await kv.del('ratelimit:church-portal:unknown'); await kv.del('church-login-cooldown:TX-123');
  for (const r of await kv.getByPrefix('private-attendance-report:')) await kv.del(`private-attendance-report:${r.id}`);
  for (const r of await kv.getByPrefix('private-attendance-recent:')) await kv.del(r.key);
  await call('church-portal/request', { churchId: 'TX-123' });
});
afterAll(async () => { setConfirmationEmailBinding(null); await h.flush(); await h.mf.dispose(); });
describe('private attendance calibration', () => {
  it('requires a valid inbox link and explicit count definition', async () => {
    expect((await call('church-portal/session', { token: 'fake', action: 'attendance', report })).status).toBe(403);
    expect((await submit({ definitionAccepted: false })).status).toBe(400);
    expect((await submit({ upper: 60 })).status).toBe(400);
    expect((await submit({ weeks: 1 })).status).toBe(400);
    expect((await submit({ lower: 1.5 })).status).toBe(400);
  });
  it('keeps raw reports private, leaves the model unchanged, and limits repeat submissions', async () => {
    expect((await submit()).status).toBe(200); expect((await submit()).status).toBe(429);
    expect((await kv.get('churches:US:TX'))[0].attendance).toBe(100);
    expect((await call('moderate/attendance-reports')).status).toBe(401);
    const rows = await pending(); expect(rows[0].lower).toBe(70); expect(rows[0].notes).toBe(report.notes);
    for (const path of ['data-health/TX', 'church-portal/listing/TX-123', 'church-portal/status/TX-123']) {
      const text = JSON.stringify(await (await call(path)).json()); expect(text).not.toContain(report.notes); expect(text).not.toContain('baselineEstimate'); expect(text).not.toContain('private-attendance');
    }
    expect((await kv.getByPrefix('suggestions:')).length).toBe(0);
  });
  it('requires a deliberate moderator choice, preserves relocation and confirmation state, and publishes only the calibrated estimate', async () => {
    await submit(); const [row] = await pending(); const body = { id: row.id, action: 'apply', estimate: 80, reason: 'Reviewed typical-week counts and local context.' };
    expect((await call('moderate/attendance-reports/review', body)).status).toBe(401);
    expect((await call('moderate/attendance-reports/review', { ...body, estimate: 1000 }, true)).status).toBe(400);
    expect((await call('moderate/attendance-reports/review', { ...body, reason: '' }, true)).status).toBe(400);
    const response = await call('moderate/attendance-reports/review', body, true); expect(response.status).toBe(200);
    const church = (await kv.get('churches:US:TX'))[0]; expect(church.attendance).toBe(80); expect(church.listingStatus).toBe('pending_reverify'); expect(church.lastVerified).toBe(1600000000000);
    expect((await pending()).length).toBe(0); expect((await call('moderate/attendance-reports/review', body, true)).status).toBe(409);
    expect((await kv.get(`private-attendance-report:${row.id}`)).state).toBe('applied');
  });
  it('holds a stale estimate for a fresh review rather than overwriting newer work', async () => {
    await submit(); const [row] = await pending(); const churches = await kv.get('churches:US:TX'); churches[0].attendance = 120; await kv.set('churches:US:TX', churches);
    expect((await call('moderate/attendance-reports/review', { id: row.id, action: 'apply', estimate: 80, reason: 'Reviewed attendance evidence.' }, true)).status).toBe(409);
    expect((await kv.get('churches:US:TX'))[0].attendance).toBe(120);
    expect((await call('moderate/attendance-reports/review', { id: row.id, action: 'dismiss', reason: 'Stale estimate; request a fresh report.' }, true)).status).toBe(200);
  });
  it('honors maintenance and removes reports after 180 days', async () => {
    await submit(); const [row] = await pending(); h.vars.MAINTENANCE_READONLY = '1'; expect((await call('moderate/attendance-reports/review', { id: row.id, action: 'dismiss', reason: 'Reviewed report for dismissal.' }, true)).status).toBe(503); h.vars.MAINTENANCE_READONLY = '';
    await kv.set(`private-attendance-report:${row.id}`, { ...row, expires: Date.now() - 1 }); await cleanupPrivateAttendance(); expect(await kv.get(`private-attendance-report:${row.id}`)).toBeUndefined();
  });
});

import { beforeAll, beforeEach, afterAll, describe, it, expect } from 'vitest';
import app from '../../supabase/functions/make-server-283d8046/app.ts';
import * as kv from '../../supabase/functions/make-server-283d8046/kv.ts';
import { queryAuditByChurch } from '../../supabase/functions/make-server-283d8046/audit.ts';
import { startHarness, type Harness } from './harness';

let h: Harness;
const P = '/make-server-283d8046';
const headers = { 'content-type': 'application/json', 'x-moderator-key': 'mod-test' };
const post = (path: string, body: unknown) => app.fetch(new Request(`https://api.test${P}${path}`, { method: 'POST', headers, body: JSON.stringify(body) }));
const get = (path: string) => app.fetch(new Request(`https://api.test${P}${path}`, { headers }));
const listed = async () => (await kv.get('churches:US:TX')) as any[];
const seed = () => kv.set('churches:US:TX', [
  { id: 'TX-501', shortId: '50100000', name: 'Old Chapel', city: 'Austin', state: 'TX', lat: 30.2, lng: -97.7, phone: '5125550100' },
  { id: 'TX-502', shortId: '50200000', name: 'Hope Church', city: 'Austin', state: 'TX', lat: 30.3, lng: -97.8 },
]);

beforeAll(async () => { h = await startHarness({ MODERATOR_KEY: 'mod-test' }); });
beforeEach(async () => { await seed(); await kv.del('suggestions:TX-501'); await kv.del('suggestions:TX-502'); await h.db.prepare('DELETE FROM hidden_churches').run(); });
afterAll(async () => { await h.flush(); await h.mf.dispose(); });

describe('reversible removals', () => {
  it('hides an approved closure instead of deleting it, and restores it with the same id', async () => {
    await kv.set('suggestions:TX-501', { churchId: 'TX-501', submissions: [{ ip: '1.1.1.1', field: 'reportClosed', value: 'closed', timestamp: Date.now(), source: 'suggestion' }] });
    const res = await post('/moderate/approve/suggestion', { churchId: 'TX-501', field: 'reportClosed' });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ success: true, applied: true, hidden: true });
    expect((await listed()).some(c => c.id === 'TX-501')).toBe(false);
    const hidden = await (await get('/moderate/hidden')).json() as any;
    expect(hidden.hidden).toEqual([expect.objectContaining({ churchId: 'TX-501', reason: 'reportClosed', name: 'Old Chapel' })]);

    const restored = await post('/moderate/restore', { churchId: 'TX-501' });
    expect(restored.status).toBe(200);
    expect((await listed()).find(c => c.id === 'TX-501')).toMatchObject({ shortId: '50100000', phone: '5125550100' });
    expect((await post('/moderate/restore', { churchId: 'TX-501' })).status).toBe(404);
    await h.flush();
    const actions = (await queryAuditByChurch('TX-501')).map(r => r.action);
    expect(actions).toEqual(expect.arrayContaining(['church_removed', 'church_added']));
  });

  it('rejects only the named value, so a competing proposal survives', async () => {
    const now = Date.now();
    await kv.set('suggestions:TX-502', { churchId: 'TX-502', submissions: [
      { ip: 'a', field: 'website', value: 'https://spam.example', timestamp: now, source: 'suggestion' },
      { ip: 'b', field: 'website', value: 'https://hope.example', timestamp: now, source: 'suggestion' },
    ] });
    expect((await post('/moderate/reject/suggestion', { churchId: 'TX-502', field: 'website', value: 'https://spam.example' })).status).toBe(200);
    const left = (await kv.get('suggestions:TX-502')).submissions;
    expect(left.map((s: any) => s.value)).toEqual(['https://hope.example']);
    // Without a value the old behavior holds: every proposal on the field is dropped.
    await post('/moderate/reject/suggestion', { churchId: 'TX-502', field: 'website' });
    expect((await kv.get('suggestions:TX-502')).submissions).toEqual([]);
  });

  it('still requires the moderator key', async () => {
    const res = await app.fetch(new Request(`https://api.test${P}/moderate/restore`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"churchId":"TX-501"}' }));
    expect(res.status).toBe(401);
  });
});

import { beforeAll, beforeEach, afterAll, afterEach, describe, it, expect, vi } from 'vitest';
import app from '../../supabase/functions/make-server-283d8046/app.ts';
import * as kv from '../../supabase/functions/make-server-283d8046/kv.ts';
import { runModerationItem, setModerationConfig, dispatchModeration } from '../../supabase/functions/make-server-283d8046/moderation/runner.ts';
import { startHarness, type Harness } from './harness';

let h: Harness;
const P = '/make-server-283d8046';
const MOD = { 'content-type': 'application/json', 'x-moderator-key': 'mod-test' };
const suggest = (field: string, value: string, ip: string) => app.fetch(new Request(`https://api.test${P}/suggestions`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': ip }, body: JSON.stringify({ churchId: 'TX-900', field, value }) }));
const mod = (path: string, body?: unknown) => app.fetch(new Request(`https://api.test${P}${path}`, body === undefined ? { headers: MOD } : { method: 'POST', headers: MOD, body: JSON.stringify(body) }));
const church = async () => (await kv.get('churches:US:TX'))[0];
const decisions = async () => (await h.db.prepare('SELECT * FROM moderation_decisions ORDER BY id').all()).results as any[];

beforeAll(async () => { h = await startHarness({ MODERATOR_KEY: 'mod-test', AUTO_MODERATION: 'shadow' }); });
beforeEach(async () => {
  await kv.set('churches:US:TX', [{ id: 'TX-900', shortId: '90000000', name: 'Grace Church', city: 'Austin', state: 'TX', lat: 30.2, lng: -97.7, phone: '5125550100' }]);
  for (const k of ['suggestions:TX-900', 'moderation:config', 'ratelimit:church-suggestion:TX-900']) await kv.del(k);
  for (const ip of ['203.0.113.1', '198.51.100.1', '192.0.2.1']) await kv.del(`ratelimit:suggestion:${ip}`);
  await h.db.prepare('DELETE FROM moderation_decisions').run(); await h.db.prepare('DELETE FROM moderation_items').run();
});
afterEach(() => vi.unstubAllGlobals());
afterAll(async () => { await h.flush(); await h.mf.dispose(); });

describe('moderation engine', () => {
  it('records a shadow decision with reasons but leaves the listing for a person', async () => {
    await suggest('phone', '5125550199', '203.0.113.1'); await suggest('phone', '5125550199', '198.51.100.1'); await h.flush();
    expect((await church()).phone).toBe('5125550100');
    const d = (await decisions()).filter(r => r.mode === 'shadow').at(-1);
    expect(d).toMatchObject({ field: 'phone', outcome: 'approve', applied: 0 });
    const queue = await (await mod('/moderate/pending')).json() as any;
    expect(queue.pendingSuggestions[0].engine).toMatchObject({ outcome: 'approve', mode: 'shadow' });
  });
  it('applies an enforced decision, takes it out of the queue, and can undo it', async () => {
    await mod('/moderate/config', { mode: 'enforce', enforceFields: ['phone'] });
    await suggest('phone', '5125550199', '203.0.113.1'); await suggest('phone', '5125550199', '198.51.100.1'); await h.flush();
    expect((await church()).phone).toBe('5125550199');
    const applied = (await decisions()).find(r => r.applied === 1 && r.outcome === 'approve');
    expect(applied).toBeTruthy();
    expect((await (await mod('/moderate/pending')).json() as any).pendingSuggestions).toEqual([]);
    expect((await mod(`/moderate/decisions/${applied.id}/undo`, {})).status).toBe(200);
    expect((await church()).phone).toBe('5125550100');
    expect((await mod(`/moderate/decisions/${applied.id}/undo`, {})).status).toBe(409);
  });
  it('rejects spam automatically in enforce mode', async () => {
    await setModerationConfig({ mode: 'enforce', enforceFields: ['name'] });
    await suggest('name', 'Cheap casino tickets', '203.0.113.1'); await h.flush();
    expect((await church()).name).toBe('Grace Church');
    expect((await kv.get('suggestions:TX-900')).submissions).toEqual([]);
    expect((await decisions()).find(r => r.outcome === 'reject')).toMatchObject({ applied: 1, field: 'name' });
  });
  it('leases items so one proposal is never decided twice at once', async () => {
    await suggest('phone', '5125550177', '203.0.113.1'); await h.flush();
    await h.db.prepare("UPDATE moderation_items SET stage='engine',lease_until=0,due_at=0").run();
    const [a, b] = await Promise.all([runModerationItem('TX-900|phone'), runModerationItem('TX-900|phone')]);
    expect([a, b].filter(Boolean)).toHaveLength(1);
  });
  it('pauses itself to shadow mode after too many automatic changes in an hour', async () => {
    await setModerationConfig({ mode: 'enforce', enforceFields: ['phone'] });
    const now = Date.now();
    for (let i = 0; i < 31; i++) await h.db.prepare("INSERT INTO moderation_decisions(item_id,church_id,field,outcome,mode,policy_version,reasons,applied,created_at) VALUES('x','x','phone','approve','enforce','t','[]',1,?1)").bind(now).run();
    await suggest('phone', '5125550155', '203.0.113.1'); await suggest('phone', '5125550155', '198.51.100.1'); await h.flush();
    expect((await church()).phone).toBe('5125550100');
    const config = await (await mod('/moderate/config')).json() as any;
    expect(config.config.mode).toBe('shadow'); expect(config.config.reason).toMatch(/Paused automatically/);
  });
  it('approves a phone number found on the stored church website', async () => {
    const list = await kv.get('churches:US:TX'); list[0].website = 'https://grace.example.org'; await kv.set('churches:US:TX', list);
    vi.stubGlobal('fetch', vi.fn(async (input: any) => {
      const url = String(input);
      if (url.includes('dns-query')) return new Response(JSON.stringify({ Status: 0, Answer: [{ type: 1, data: '93.184.216.34' }] }), { headers: { 'content-type': 'application/dns-json' } });
      return new Response('<html><body><h1>Grace Church</h1><p>Call us at (512) 555-0144</p></body></html>', { headers: { 'content-type': 'text/html' } });
    }));
    await setModerationConfig({ mode: 'enforce', enforceFields: ['phone'] });
    await suggest('phone', '512-555-0144', '203.0.113.1'); await h.flush();
    expect((await church()).phone).toBe('5125550144');
    const d = (await decisions()).find(r => r.applied === 1);
    expect(JSON.parse(d.reasons)[0].signal).toBe('website');
  });
  it('dispatches due items from the cron', async () => {
    await suggest('phone', '5125550122', '203.0.113.1'); await h.flush();
    await h.db.prepare("UPDATE moderation_items SET stage='wait',due_at=0,lease_until=0").run();
    expect(await dispatchModeration(Date.now())).toBeGreaterThanOrEqual(1);
  });
});

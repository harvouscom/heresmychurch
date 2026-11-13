import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import app from '../../supabase/functions/make-server-283d8046/app.ts';
import * as kv from '../../supabase/functions/make-server-283d8046/kv.ts';
import { setAccessKeysForTest, verifyAccessJwt } from '../../supabase/functions/make-server-283d8046/reviewer-auth.ts';
import { startHarness, type Harness } from './harness';

const TEAM = 'hmc.cloudflareaccess.com', AUD = 'aud-tag-123';
let h: Harness; let keys: CryptoKeyPair; let otherKeys: CryptoKeyPair;
const enc = (o: unknown) => Buffer.from(typeof o === 'string' ? o : JSON.stringify(o)).toString('base64url');
async function sign(claims: Record<string, unknown>, pair = keys, kid = 'k1') {
  const head = enc({ alg: 'RS256', kid, typ: 'JWT' }), body = enc(claims);
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', pair.privateKey, new TextEncoder().encode(`${head}.${body}`));
  return `${head}.${body}.${Buffer.from(sig).toString('base64url')}`;
}
const now = () => Math.floor(Date.now() / 1000);
const good = (extra: Record<string, unknown> = {}) => ({ aud: [AUD], iss: `https://${TEAM}`, exp: now() + 600, email: 'Reviewer@Example.org', ...extra });
const gen = () => crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']) as Promise<CryptoKeyPair>;
const pending = (headers: Record<string, string>, prefix = '/make-server-283d8046') => app.fetch(new Request(`https://api.test${prefix}/moderate/pending`, { headers }));

beforeAll(async () => {
  h = await startHarness({ ACCESS_TEAM_DOMAIN: TEAM, ACCESS_AUD: AUD, REVIEWER_EMAILS: 'reviewer@example.org', REVIEWER_SERVICE_TOKENS: 'script.access', MODERATOR_KEY: 'mod-test', ADMIN_KEY: 'admin-test' });
  keys = await gen(); otherKeys = await gen();
  const jwk = await crypto.subtle.exportKey('jwk', keys.publicKey);
  setAccessKeysForTest(TEAM, [{ ...jwk, kid: 'k1' }]);
  await kv.set('churches:US:TX', []);
});
afterAll(async () => { setAccessKeysForTest(TEAM, null); await h.flush(); await h.mf.dispose(); });

describe('Cloudflare Access reviewers', () => {
  it('accepts a valid allowlisted reviewer and service token', async () => {
    expect(await verifyAccessJwt(await sign(good()))).toEqual({ kind: 'email', id: 'reviewer@example.org' });
    expect(await verifyAccessJwt(await sign(good({ email: undefined, common_name: 'script.access' })))).toEqual({ kind: 'service', id: 'script.access' });
  });
  it('rejects wrong audience, issuer, expiry, signer, and unlisted identities', async () => {
    expect(await verifyAccessJwt(await sign(good({ aud: ['other'] })))).toBeNull();
    expect(await verifyAccessJwt(await sign(good({ iss: 'https://evil.cloudflareaccess.com' })))).toBeNull();
    expect(await verifyAccessJwt(await sign(good({ exp: now() - 5 })))).toBeNull();
    expect(await verifyAccessJwt(await sign(good(), otherKeys))).toBeNull();
    expect(await verifyAccessJwt(await sign(good({ email: 'someone@example.org' })))).toBeNull();
    expect(await verifyAccessJwt('not.a.jwt')).toBeNull();
  });
  it('lets a signed-in reviewer use moderation routes on both path forms, and refuses forged headers', async () => {
    const token = await sign(good());
    expect((await pending({ 'cf-access-jwt-assertion': token })).status).toBe(200);
    expect((await pending({ 'cf-access-jwt-assertion': token }, '')).status).toBe(200);
    expect((await pending({ 'cf-access-jwt-assertion': await sign(good(), otherKeys) })).status).toBe(401);
    expect((await pending({})).status).toBe(401);
  });
  it('keeps the legacy key until switched off, and the admin key only opens maintenance routes', async () => {
    expect((await pending({ 'x-moderator-key': 'mod-test' })).status).toBe(200);
    expect((await pending({ 'x-admin-key': 'admin-test' })).status).toBe(401);
    h.vars.LEGACY_MODERATOR_KEY = 'off';
    expect((await pending({ 'x-moderator-key': 'mod-test' })).status).toBe(401);
    const ops = await app.fetch(new Request('https://api.test/make-server-283d8046/moderate/operations', { headers: { 'x-admin-key': 'admin-test' } }));
    expect(ops.status).not.toBe(401);
    h.vars.LEGACY_MODERATOR_KEY = '';
  });
});

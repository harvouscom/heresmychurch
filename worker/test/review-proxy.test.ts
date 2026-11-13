import { describe, it, expect, vi } from 'vitest';
import { isReviewApi, proxyReviewApi } from '../review-proxy';

describe('reviewer API proxy', () => {
  it('forwards only allowlisted routes with the Access token and content type', async () => {
    const fetcher = vi.fn(async () => new Response('{"ok":true}', { status: 200, headers: { 'content-type': 'application/json' } }));
    const req = new Request('https://heresmychurch.com/review/api/moderate/approve/suggestion?x=1', { method: 'POST', headers: { 'cf-access-jwt-assertion': 'tok', 'content-type': 'application/json', cookie: 'CF_Authorization=secret', 'x-moderator-key': 'leak' }, body: '{"a":1}' });
    const res = await proxyReviewApi(req, 'https://api.example', fetcher as any);
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    const [url, init] = fetcher.mock.calls[0] as any;
    expect(url).toBe('https://api.example/moderate/approve/suggestion?x=1');
    const sent = new Headers(init.headers);
    expect(sent.get('cf-access-jwt-assertion')).toBe('tok');
    expect(sent.get('cookie')).toBeNull();
    expect(sent.get('x-moderator-key')).toBeNull();
  });
  it('refuses other API routes and requests without a token', async () => {
    const fetcher = vi.fn();
    expect((await proxyReviewApi(new Request('https://heresmychurch.com/review/api/admin/publish-static', { headers: { 'cf-access-jwt-assertion': 'tok' } }), 'https://api.example', fetcher as any)).status).toBe(404);
    expect((await proxyReviewApi(new Request('https://heresmychurch.com/review/api/moderate/pending'), 'https://api.example', fetcher as any)).status).toBe(401);
    expect(fetcher).not.toHaveBeenCalled();
    expect(isReviewApi('/review')).toBe(false);
    expect(isReviewApi('/review/api/moderate/pending')).toBe(true);
  });
});

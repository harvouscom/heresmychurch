import type { Hono } from 'npm:hono';
import * as kv from './kv.ts';
import { getD1 } from './bindings.ts';
import { usesD1 } from './kv-backend.ts';
import { getChurches, regionFromChurchId } from './church-keys.ts';
import { env } from './runtime.ts';
const DAY = 86400000;
const PREFIX = 'private-attendance-report:';

export async function recordPrivateAttendance(church: any, inboxHash: string, input: any) {
  const { lower, upper, weeks, basis, notes = '' } = input || {};
  if (![lower, upper, weeks].every(Number.isInteger) || lower < 1 || upper > 50000 || lower > upper || weeks < 4 || weeks > 13 || !['counted', 'approximate'].includes(basis) || typeof notes !== 'string' || notes.length > 500 || input?.definitionAccepted !== true) return { error: 'Enter a range from 1–50,000, based on 4–13 typical weeks, and confirm what was counted.', status: 400 as const };
  const recentKey = `private-attendance-recent:${church.id}:${inboxHash}`;
  const recent = await kv.get(recentKey);
  if (recent && Date.now() - recent.at < DAY) return { error: 'Thanks—you’ve already shared a report today. Please return tomorrow if it needs updating.', status: 429 as const };
  const id = crypto.randomUUID(), now = Date.now();
  await kv.set(`${PREFIX}${id}`, { id, churchId: church.id, churchName: church.name, city: church.city, region: regionFromChurchId(church.id), lower, upper, weeks, basis, notes: notes.trim(), at: now, expires: now + 180 * DAY, baselineEstimate: church.attendance || null, state: 'pending', source: 'listed_church_inbox' });
  await kv.set(recentKey, { key: recentKey, at: now, expires: now + DAY });
  return { message: 'Thank you. Your report is private and will help us review the estimate. It won’t appear on your listing or change the public number automatically.' };
}
export function registerAttendanceCalibrationRoutes(app: Hono, p: string, deps: { authorized(c: any): boolean; apply(id: string, estimate: number, expected: number | null, modKey: string): Promise<void> }) {
  app.use(`${p}/moderate/attendance-reports*`, async (c, next) => { c.header('Cache-Control', 'no-store'); if (!deps.authorized(c)) return c.json({ error: 'Moderator access required.' }, 401); await next(); });
  app.get(`${p}/moderate/attendance-reports`, async c => {
    const rows = await kv.getByPrefix(PREFIX);
    const pending = rows.filter(r => r.state === 'pending' && r.expires > Date.now()).sort((a, b) => a.at - b.at);
    return c.json({ reports: pending.slice(0, 100), remaining: Math.max(0, pending.length - 100) });
  });
  app.post(`${p}/moderate/attendance-reports/review`, async c => {
    const body = await c.req.json().catch(() => null);
    if (typeof body?.id !== 'string' || !/^[a-f0-9-]{36}$/.test(body.id) || !['apply', 'dismiss'].includes(body.action) || typeof body.reason !== 'string' || body.reason.trim().length < 10 || body.reason.length > 500) return c.json({ error: 'Choose an action and add a review note (10–500 characters).' }, 400);
    if (!usesD1()) return c.json({ error: 'Attendance review requires the Cloudflare database.' }, 503);
    const key = `${PREFIX}${body.id}`, row = await kv.get(key);
    if (!row || row.expires < Date.now()) return c.json({ error: 'This report has expired or is unavailable.' }, 404);
    if (row.state !== 'pending') return c.json({ error: 'This report has already been reviewed.' }, 409);
    if (body.action === 'apply' && (!Number.isInteger(body.estimate) || body.estimate < row.lower || body.estimate > row.upper)) return c.json({ error: 'Choose an estimate within the reported range after assessing the evidence.' }, 400);
    const lockKey = `attendance-review-lock:${row.churchId}`, lease = crypto.randomUUID(), now = Date.now(), db = getD1();
    const lock = await db.prepare(`INSERT INTO kv(key,value,size,updated_at) VALUES(?1,?2,0,?3) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at WHERE kv.updated_at<?4 RETURNING key`).bind(lockKey, JSON.stringify(lease), now, now - 120000).first();
    if (!lock) return c.json({ error: 'Another review is in progress for this church. Refresh shortly.' }, 409);
    try {
      const current = await kv.get(key); if (current?.state !== 'pending') return c.json({ error: 'This report has already been reviewed.' }, 409);
      if (body.action === 'apply') {
        const region = regionFromChurchId(row.churchId); const churches = region ? await getChurches(region) : [];
        const church = Array.isArray(churches) ? churches.find((r: any) => r.id === row.churchId) : null;
        if (!church) return c.json({ error: 'Listing no longer available.' }, 404);
        if ((church.attendance || null) !== row.baselineEstimate) return c.json({ error: 'The estimate changed after this report. Dismiss this report and request a fresh check before changing it again.' }, 409);
        await deps.apply(row.churchId, body.estimate, row.baselineEstimate, c.req.header('x-moderator-key') || '');
      }
      await kv.set(key, { ...current, state: body.action === 'apply' ? 'applied' : 'dismissed', reviewedAt: Date.now(), reviewNote: body.reason.trim(), ...(body.action === 'apply' ? { calibratedEstimate: body.estimate } : {}) });
      return c.json({ message: body.action === 'apply' ? 'Estimate calibrated. The source report remains private.' : 'Report dismissed. The estimate is unchanged.' });
    } finally { await db.prepare('DELETE FROM kv WHERE key=?1 AND value=?2').bind(lockKey, JSON.stringify(lease)).run(); }
  });
}
export async function cleanupPrivateAttendance() {
  if (env('MAINTENANCE_READONLY')) return;
  const reports = await kv.getByPrefix(PREFIX), recent = await kv.getByPrefix('private-attendance-recent:');
  await kv.mdel([...reports.filter(r => r.expires < Date.now()).map(r => `${PREFIX}${r.id}`), ...recent.filter(r => r.expires < Date.now()).map(r => r.key)]);
}

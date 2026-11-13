// Church ownership: a listing is claimed when church-claim:{id} was written through the listed inbox
// and still matches the current listing email. It is derived, never stored on the church row, so an
// email change by any path ends the claim on its own. On a claimed church, the verified inbox edits
// directly and everyone else's edits go to the church first (reviewBy:"church") for OWNER_REVIEW_MS.
import * as kv from "./kv.ts";
import { env } from "./runtime.ts";
import { emailDigest, sendChurchDigestEmail } from "./email-confirmation.ts";

const DAY = 86400000;
export const ownerReviewMs = () => {
  const days = Number(env("OWNER_REVIEW_DAYS"));
  return (Number.isFinite(days) && days > 0 ? days : 14) * DAY;
};
/** Stable vote and audit identity for a church inbox, the same across sign-in links. */
export const ownerActorKey = (emailHash: string) => `church:${emailHash.slice(0, 24)}`;
const listedEmail = (ch: any) => String(ch?.email || "").trim().toLowerCase();

export async function claimState(ch: any): Promise<{ claimed: boolean; claimedAt?: number; emailHash?: string }> {
  if (!ch?.id) return { claimed: false };
  const claim = await kv.get(`church-claim:${ch.id}`);
  const email = listedEmail(ch);
  if (!claim || !email) return { claimed: false };
  const hash = await emailDigest(email);
  if (claim.emailHash !== hash) return { claimed: false };
  // Older claim rows lack churchId, which region scans need.
  if (!claim.churchId) await kv.set(`church-claim:${ch.id}`, { ...claim, churchId: ch.id });
  return { claimed: true, claimedAt: claim.at, emailHash: hash };
}

export async function writeClaim(churchId: string, emailHash: string, at = Date.now()) {
  await kv.set(`church-claim:${churchId}`, { churchId, emailHash, at });
}

/** Claimed churches in a region list, as id → claimedAt. One prefix scan, then a hash per claimed church. */
export async function claimedInRegion(rows: any[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (!rows.length) return out;
  const byId = new Map(rows.map((ch: any) => [ch.id, ch]));
  const prefixes = new Set<string>();
  for (const ch of rows) {
    const id = String(ch.id || "");
    const parts = id.split("-");
    prefixes.add(parts[0] === "community" ? `church-claim:community-${parts[1]}-` : `church-claim:${parts[0]}-`);
  }
  const claims = (await Promise.all([...prefixes].map((p) => kv.getByPrefix(p)))).flat();
  for (const claim of claims) {
    const ch = claim?.churchId ? byId.get(claim.churchId) : null;
    const email = listedEmail(ch);
    if (ch && email && claim.emailHash === await emailDigest(email)) out.set(ch.id, claim.at);
  }
  return out;
}

/** Adds claimed/claimedAt to public church rows (region files, partner and Lookup exports). */
export async function decorateClaims<T extends Record<string, any>>(rows: T[]): Promise<T[]> {
  const claimed = await claimedInRegion(rows);
  if (!claimed.size) return rows;
  return rows.map((ch) => claimed.has(ch.id) ? { ...ch, claimed: true, claimedAt: claimed.get(ch.id) } : ch);
}

/** Moves a claim to a relocated listing's new id. */
export async function transferClaim(fromId: string, toId: string) {
  const claim = await kv.get(`church-claim:${fromId}`);
  if (claim) await kv.set(`church-claim:${toId}`, { ...claim, churchId: toId });
}

// ── Digest emails: at most one per church per day, to the listed inbox only. ──
export async function queueOwnerDigest(churchId: string) {
  const key = `owner-digest:${churchId}`;
  const row = (await kv.get(key)) || { key, churchId, lastSent: 0 };
  if (!row.pending) await kv.set(key, { ...row, key, churchId, pending: true, queuedAt: Date.now() });
}

export async function dispatchOwnerDigests(deps: {
  find(id: string): Promise<any>;
  pendingFor(ch: any): Promise<{ field: string; value: string; current?: unknown; votes?: number }[]>;
  createLogin(ch: any, emailHash: string, ttlMs: number): Promise<string>;
}, now = Date.now()) {
  if (env("MAINTENANCE_READONLY")) return 0;
  const rows = (await kv.getByPrefix("owner-digest:")).filter((r: any) => r?.pending && now - (r.lastSent || 0) >= DAY);
  let sent = 0;
  for (const row of rows.slice(0, 25)) {
    const ch = await deps.find(row.churchId);
    const state = ch ? await claimState(ch) : { claimed: false };
    const items = ch && state.claimed ? await deps.pendingFor(ch) : [];
    if (!ch || !state.claimed || !items.length) { await kv.set(row.key, { ...row, pending: false }); continue; }
    try {
      const token = await deps.createLogin(ch, state.emailHash!, 3 * DAY);
      await sendChurchDigestEmail(listedEmail(ch), ch.name, token, items, Math.round(ownerReviewMs() / DAY));
      await kv.set(row.key, { ...row, pending: false, lastSent: now });
      sent++;
    } catch (e) {
      console.error("owner digest failed", e instanceof Error ? e.message : "unknown");
    }
  }
  return sent;
}

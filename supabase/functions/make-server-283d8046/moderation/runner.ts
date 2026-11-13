// The moderation engine: one D1 row per proposal (churchId|field), leased so two workers never decide
// the same item, re-evaluated whenever a new vote arrives. Every decision is recorded with its reasons;
// decisions are applied only in enforce mode, through the same approve/reject functions people use,
// with a reviewVersion so a decision on stale data turns into a retry instead of an overwrite.
import { getD1 } from "../bindings.ts";
import * as kv from "../kv.ts";
import { env } from "../runtime.ts";
import { currentReviewValue, proposalVersion } from "../edit-versions.ts";
import { claimState } from "../church-ownership.ts";
import { regionFromChurchId } from "../church-keys.ts";
import { decide, POLICY_VERSION, type Decision, type PolicyInput } from "./policy.ts";
import { candidatesFrom, distanceM, nameSimilarity, sharesDistinctiveWord, siteDeadChecks, siteEvidence, websiteSignals } from "./signals.ts";

const DAY = 86400000;
const LEASE_MS = 90000;
export type ModerationMode = "off" | "shadow" | "enforce";
export type ModerationConfig = { mode: ModerationMode; enforceFields: string[]; reason?: string; updatedAt?: number };
const CONFIG_KEY = "moderation:config";
export const ALL_FIELDS = ["phone", "serviceTimes", "denomination", "languages", "ministries", "pastorName", "email", "website", "name", "address", "reportClosed", "reportDuplicate", "reportRelocated", "reportOutOfScope", "homeCampusId", "attendance"];

type Actor = { type: "system"; id: string };
export type ModerationDeps = {
  findChurch(id: string): Promise<{ church: any; rows: any[]; st: string } | null>;
  approve(o: { churchId: string; field: string; value?: string; reviewVersion?: string; actor: Actor; source: string }): Promise<any>;
  reject(o: { churchId: string; field: string; value?: string; reviewVersion?: string; actor: Actor; source: string }): Promise<any>;
  restore(churchId: string, actor: Actor): Promise<any>;
  setField(churchId: string, field: string, value: string, actor: Actor): Promise<boolean>;
  isSensitive(field: string): boolean;
  normalizePhone(v: string, st: string): string;
  parseAddress(v: string, st: string): any;
  geocode(a: any): Promise<{ lat: number; lng: number } | null>;
  inferDenomination(name: string): string | null;
  inHumanReview(churchId: string, field: string): Promise<boolean>;
  fetcher?: typeof fetch;
};
let deps: ModerationDeps | null = null;
export function registerModeration(d: ModerationDeps) { deps = d; }

export async function getModerationConfig(): Promise<ModerationConfig> {
  // AUTO_MODERATION=off is a hard stop. Otherwise it is the starting mode until a reviewer saves one.
  const base = env("AUTO_MODERATION");
  if (base === "off" || !base) { if (base === "off") return { mode: "off", enforceFields: [] }; }
  const stored = await kv.get(CONFIG_KEY);
  const fallback: ModerationMode = base === "shadow" || base === "enforce" ? base : "off";
  return { mode: stored?.mode ?? fallback, enforceFields: Array.isArray(stored?.enforceFields) ? stored.enforceFields : [], reason: stored?.reason, updatedAt: stored?.updatedAt };
}
export async function setModerationConfig(next: Partial<ModerationConfig>) {
  const cur = await getModerationConfig();
  const mode = (["off", "shadow", "enforce"] as const).includes(next.mode as any) ? next.mode! : cur.mode;
  const enforceFields = Array.isArray(next.enforceFields) ? next.enforceFields.filter(f => ALL_FIELDS.includes(f)) : cur.enforceFields;
  const value = { mode, enforceFields, reason: next.reason, updatedAt: Date.now() };
  await kv.set(CONFIG_KEY, value);
  return value;
}

const itemId = (churchId: string, field: string) => `${churchId}|${field}`;
const regionOf = (churchId: string) => regionFromChurchId(churchId) || "";

/** Queue (or re-queue) a proposal for the engine. posthoc: a first value already went live. */
export async function enqueueModeration(churchId: string, field: string, o: { posthoc?: boolean; now?: number } = {}) {
  const now = o.now ?? Date.now();
  const stage = o.posthoc ? "posthoc" : "engine";
  await getD1().prepare(`INSERT INTO moderation_items(id,church_id,region,field,stage,due_at,updated_at) VALUES(?1,?2,?3,?4,?5,?6,?6)
    ON CONFLICT(id) DO UPDATE SET stage=excluded.stage,due_at=excluded.due_at,updated_at=excluded.updated_at`)
    .bind(itemId(churchId, field), churchId, regionOf(churchId), field, stage, now).run();
}

async function setStage(id: string, stage: string, dueAt: number, decisionId?: number) {
  await getD1().prepare("UPDATE moderation_items SET stage=?2,due_at=?3,lease_until=0,last_decision_id=coalesce(?4,last_decision_id),updated_at=?5 WHERE id=?1").bind(id, stage, dueAt, decisionId ?? null, Date.now()).run();
}

async function recordDecision(row: Record<string, unknown>): Promise<number> {
  const r: any = await getD1().prepare(`INSERT INTO moderation_decisions(item_id,church_id,field,proposed_value,previous_value,outcome,mode,policy_version,reasons,evidence,removed_submissions,proposal_version,actor,applied,created_at)
    VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15) RETURNING id`)
    .bind(row.item_id, row.church_id, row.field, row.proposed_value ?? null, row.previous_value ?? null, row.outcome, row.mode, row.policy_version ?? POLICY_VERSION, JSON.stringify(row.reasons ?? []), row.evidence ? JSON.stringify(row.evidence) : null, row.removed_submissions ? JSON.stringify(row.removed_submissions) : null, row.proposal_version ?? null, row.actor ?? null, row.applied ? 1 : 0, Date.now()).first();
  return Number(r?.id);
}

/** A reviewer's or church's decision, so shadow decisions can be compared and the item closed. */
export async function recordPersonDecision(churchId: string, field: string, outcome: "human_approve" | "human_reject" | "church_accept" | "church_decline", value: unknown, actor: string) {
  try {
    const id = itemId(churchId, field);
    const decisionId = await recordDecision({ item_id: id, church_id: churchId, field, proposed_value: value == null ? null : String(value), outcome, mode: outcome.startsWith("church") ? "church" : "human", reasons: [], actor, applied: true });
    await setStage(id, "done", Date.now(), decisionId);
  } catch (e) { console.error("record person decision failed", e instanceof Error ? e.message : "unknown"); }
}

async function circuitOpen(now: number): Promise<string | null> {
  const db = getD1();
  const applied: any = await db.prepare("SELECT count(*) AS n FROM moderation_decisions WHERE mode='enforce' AND applied=1 AND created_at>?1").bind(now - 3600000).first();
  if (Number(applied?.n) > (Number(env("MODERATION_HOURLY_CAP")) || 30)) return "More than 30 automatic changes in an hour.";
  const day: any = await db.prepare("SELECT sum(applied) AS a, sum(CASE WHEN undone_by IS NOT NULL THEN 1 ELSE 0 END) AS u FROM moderation_decisions WHERE mode='enforce' AND created_at>?1").bind(now - DAY).first();
  if (Number(day?.a) >= 10 && Number(day?.u) / Number(day?.a) > 0.1) return "More than 10% of automatic changes were undone in a day.";
  return null;
}

async function gatherSignals(input: PolicyInput, church: any, st: string, rows: any[], value: string): Promise<{ evidence?: unknown }> {
  const d = deps!; const fetcher = d.fetcher ?? fetch;
  const field = input.field;
  if (["phone", "serviceTimes", "pastorName", "email", "name", "address"].includes(field)) {
    const ev = await siteEvidence(church, field, value, { normalizePhone: v => d.normalizePhone(v, st), parseAddress: v => d.parseAddress(v, st) }, fetcher);
    input.evidence = ev.evidence; input.evidenceDetail = ev.detail;
    if (field === "name") input.nameSimilarity = nameSimilarity(String(church.name || ""), value);
    if (field === "address") {
      const parsed = d.parseAddress(value, st);
      const geo = parsed ? (parsed.lat != null && parsed.lng != null ? { lat: parsed.lat, lng: parsed.lng } : await d.geocode(parsed)) : null;
      input.addressDistanceM = geo ? distanceM(church, geo) : null;
    }
    return { evidence: ev };
  }
  if (field === "denomination") { const inferred = d.inferDenomination(String(church.name || "")); input.denominationMatchesName = !!inferred && inferred.toLowerCase() === value.toLowerCase(); }
  if (field === "languages" || field === "ministries") {
    const cur = (Array.isArray(church[field]) ? church[field] : String(church[field] || "").split(",")).map((x: string) => x.trim().toLowerCase()).filter(Boolean);
    const next = new Set(value.split(",").map(x => x.trim().toLowerCase()).filter(Boolean));
    input.listAddsOnly = cur.every((x: string) => next.has(x));
  }
  if (field === "website") input.website = await websiteSignals(church, value, fetcher);
  if (field === "reportClosed") {
    const google = await kv.get(`enrichment:google:${church.id}`);
    input.closure = { siteDeadChecks: await siteDeadChecks(church, fetcher), osmClosed: false, googleClosed: google?.businessStatus === "CLOSED_PERMANENTLY", recentActivity: typeof church.lastVerified === "number" && Date.now() - church.lastVerified < 30 * DAY };
  }
  if (field === "reportDuplicate") {
    const target = rows.find((c: any) => c.id === value) || (await d.findChurch(value))?.church;
    const completeness = (c: any) => ["address", "website", "phone", "serviceTimes", "denomination"].filter(k => c?.[k]).length;
    input.duplicate = target ? {
      targetExists: true, distanceM: distanceM(church, target), nameScore: nameSimilarity(church.name, target.name),
      sameAddress: !!church.address && String(church.address).trim().toLowerCase() === String(target.address || "").trim().toLowerCase(),
      reportedIsNewerOrThinner: (String(church.id).startsWith("community-") && !String(target.id).startsWith("community-")) || completeness(church) < completeness(target),
      eitherClaimed: (await claimState(church)).claimed || (await claimState(target)).claimed,
    } : { targetExists: false, distanceM: null, nameScore: 0, sameAddress: false, reportedIsNewerOrThinner: false, eitherClaimed: false };
  }
  if (field === "homeCampusId") {
    const target = rows.find((c: any) => c.id === value) || (await d.findChurch(value))?.church;
    const dist = target ? distanceM(church, target) : null;
    input.campus = { targetExists: !!target, distanceKm: dist == null ? null : dist / 1000, sharesName: !!target && sharesDistinctiveWord(church.name, target.name) };
  }
  return {};
}

/** Evaluates one item. Returns the decision, or null when there was nothing to do. */
export async function runModerationItem(id: string, now = Date.now()): Promise<Decision | null> {
  if (!deps || env("MAINTENANCE_READONLY")) return null;
  const d = deps; const db = getD1();
  const item: any = await db.prepare(`UPDATE moderation_items SET lease_until=?2,attempts=attempts+1 WHERE id=?1 AND lease_until<?3 AND stage IN ('engine','posthoc','church','wait') RETURNING *`).bind(id, now + LEASE_MS, now).first();
  if (!item) return null;
  const config = await getModerationConfig();
  if (config.mode === "off") { await setStage(id, item.stage, now + DAY); return null; }
  const { church_id: churchId, field } = item;
  if (await d.inHumanReview(churchId, field)) { await setStage(id, item.stage, now + 30 * 60000); return null; }
  const found = await d.findChurch(churchId);
  const ex = await kv.get(`suggestions:${churchId}`);
  const subs: any[] = Array.isArray(ex?.submissions) ? ex.submissions : [];
  if (!found) { await setStage(id, "done", now); return null; }
  const { church, rows, st } = found;
  const current = currentReviewValue(church, field, st);
  const claimed = (await claimState(church)).claimed;

  // Still waiting for the church to answer: come back at its deadline.
  const awaiting = subs.filter(s => s.field === field && s.reviewBy === "church" && Number(s.ownerDeadline) > now);
  if (awaiting.length) { await setStage(id, "church", Math.max(...awaiting.map(s => Number(s.ownerDeadline)))); return null; }

  const posthoc = item.stage === "posthoc";
  const sensitive = d.isSensitive(field);
  const candidates = posthoc
    ? candidatesFrom(subs, field, s => s.needsModeration !== true && String(s.value) === String(current ?? ""))
    : candidatesFrom(subs, field, s => sensitive || s.needsModeration === true);
  if (!candidates.length) { await setStage(id, "done", now); return null; }

  const input: PolicyInput = { field, current, claimed, appliedBlankFill: posthoc, candidates, now };
  const top = [...candidates].sort((a, b) => b.people - a.people || a.firstAt - b.firstAt)[0];
  const extra = top.spam || posthoc ? {} : await gatherSignals(input, church, st, rows, top.value);
  const decision = decide(input);
  const enforce = config.mode === "enforce" && config.enforceFields.includes(field);
  const version = ex ? await proposalVersion(ex, field, current) : undefined;
  const base = { item_id: id, church_id: churchId, field, proposed_value: decision.value ?? top.value, previous_value: current == null ? null : String(current), outcome: decision.outcome, policy_version: decision.policyVersion, reasons: decision.reasons, evidence: extra.evidence, proposal_version: version, actor: "engine" };

  const actsOnListing = decision.outcome === "approve" || decision.outcome === "reject" || decision.outcome === "hide";
  if (!enforce || !actsOnListing) {
    const decisionId = await recordDecision({ ...base, mode: enforce ? "enforce" : "shadow", applied: false });
    if (decision.outcome === "wait") await setStage(id, "wait", decision.retryAt ?? now + DAY, decisionId);
    else if (posthoc) await setStage(id, "done", now, decisionId);
    // Shadow mode leaves the decision to a person, with the engine's reasons shown next to it.
    else await setStage(id, "human", now, decisionId);
    return decision;
  }
  const tripped = await circuitOpen(now);
  if (tripped) {
    await setModerationConfig({ mode: "shadow", reason: `Paused automatically: ${tripped}` });
    const decisionId = await recordDecision({ ...base, mode: "shadow", applied: false, reasons: [...decision.reasons, { signal: "circuit-breaker", detail: tripped }] });
    await setStage(id, "human", now, decisionId);
    return decision;
  }
  const decisionId = await recordDecision({ ...base, mode: "enforce", applied: false, removed_submissions: decision.outcome === "reject" ? subs.filter(s => s.field === field && String(s.value) === String(base.proposed_value)) : null });
  const actor: Actor = { type: "system", id: `decision:${decisionId}` };
  try {
    let result: any;
    if (posthoc && decision.outcome === "reject") result = { ok: await d.setField(churchId, field, "", actor) };
    else if (decision.outcome === "reject") result = await d.reject({ churchId, field, value: String(base.proposed_value), reviewVersion: version, actor, source: "auto_moderation" });
    else result = await d.approve({ churchId, field, value: String(base.proposed_value), reviewVersion: version, actor, source: "auto_moderation" });
    if (!result?.ok) throw new Error(result?.error || "not applied");
    await db.prepare("UPDATE moderation_decisions SET applied=1 WHERE id=?1").bind(decisionId).run();
    // Another value may still be waiting on the same field.
    const left = ((await kv.get(`suggestions:${churchId}`))?.submissions || []).some((s: any) => s.field === field);
    await setStage(id, left ? "engine" : "done", now + (left ? 60000 : 0), decisionId);
  } catch (e: any) {
    // A newer edit arrived while deciding: look again shortly.
    const conflict = e?.code || /conflict|changed/i.test(String(e?.message));
    await db.prepare("UPDATE moderation_decisions SET outcome=?2 WHERE id=?1").bind(decisionId, conflict ? "wait" : "escalate").run();
    await setStage(id, conflict ? "engine" : "human", now + (conflict ? 60000 : 0), decisionId);
  }
  return decision;
}

/** Cron and post-submit: works through due items for up to budgetMs. */
export async function dispatchModeration(now = Date.now(), budgetMs = 40000, limit = 25): Promise<number> {
  if (!deps || env("MAINTENANCE_READONLY") || env("AUTO_MODERATION") === "off") return 0;
  const { results } = await getD1().prepare(`SELECT id FROM moderation_items WHERE stage IN ('engine','posthoc','church','wait') AND due_at<=?1 AND lease_until<?1 ORDER BY due_at LIMIT ?2`).bind(now, limit).all();
  const start = Date.now(); let n = 0;
  for (const row of (results || []) as any[]) {
    if (Date.now() - start > budgetMs) break;
    try { if (await runModerationItem(row.id, now)) n++; } catch (e) { console.error("moderation item failed", row.id, e instanceof Error ? e.message : "unknown"); await setStage(row.id, "engine", now + 5 * 60000); }
  }
  return n;
}

/** Puts back what an automatic decision did, when the listing hasn't changed since. */
export async function undoDecision(decisionId: number, actorLabel: string): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const d = deps; if (!d) return { ok: false, status: 503, error: "Moderation is not configured." };
  const db = getD1();
  const row: any = await db.prepare("SELECT * FROM moderation_decisions WHERE id=?1").bind(decisionId).first();
  if (!row) return { ok: false, status: 404, error: "Decision not found." };
  if (!row.applied || row.undone_by) return { ok: false, status: 409, error: "This decision wasn't applied or was already undone." };
  const actor: Actor = { type: "system", id: `undo:${decisionId}` };
  if (row.outcome === "hide") {
    const r = await d.restore(row.church_id, actor); if (!r?.ok) return { ok: false, status: r?.status || 409, error: r?.error || "Unable to restore." };
  } else if (row.outcome === "approve") {
    const found = await d.findChurch(row.church_id);
    if (!found) return { ok: false, status: 404, error: "Listing not found." };
    const now = currentReviewValue(found.church, row.field, found.st);
    if (String(now ?? "") !== String(row.proposed_value ?? "") && row.field !== "address") return { ok: false, status: 409, error: "The listing changed since; edit it directly instead." };
    if (!(await d.setField(row.church_id, row.field, row.previous_value ?? "", actor))) return { ok: false, status: 409, error: "Unable to put back the old value." };
  } else if (row.outcome === "reject") {
    const removed = row.removed_submissions ? JSON.parse(row.removed_submissions) : [];
    const key = `suggestions:${row.church_id}`; const ex = (await kv.get(key)) || { churchId: row.church_id, submissions: [] };
    ex.submissions = [...(ex.submissions || []), ...removed]; await kv.set(key, ex);
  } else return { ok: false, status: 409, error: "Only applied decisions can be undone." };
  const undoId = await recordDecision({ item_id: row.item_id, church_id: row.church_id, field: row.field, proposed_value: row.previous_value, previous_value: row.proposed_value, outcome: "undo", mode: "human", reasons: [{ signal: "undo", detail: `Undid decision ${decisionId}` }], actor: actorLabel, applied: true });
  await db.prepare("UPDATE moderation_decisions SET undone_by=?2 WHERE id=?1").bind(decisionId, undoId).run();
  await setStage(row.item_id, "human", Date.now(), undoId);
  return { ok: true };
}

export async function latestDecisions(itemIds: string[]): Promise<Map<string, any>> {
  const out = new Map<string, any>();
  for (let i = 0; i < itemIds.length; i += 50) {
    const chunk = itemIds.slice(i, i + 50);
    const { results } = await getD1().prepare(`SELECT d.* FROM moderation_decisions d JOIN moderation_items m ON m.last_decision_id=d.id WHERE m.id IN (${chunk.map((_, j) => `?${j + 1}`).join(",")})`).bind(...chunk).all();
    for (const r of (results || []) as any[]) out.set(r.item_id, { id: r.id, outcome: r.outcome, mode: r.mode, reasons: JSON.parse(r.reasons || "[]"), applied: !!r.applied, at: r.created_at, undone: !!r.undone_by });
  }
  return out;
}

export async function recentDecisions(limit = 100, stage?: string) {
  const db = getD1();
  const sql = stage === "human"
    ? `SELECT d.* FROM moderation_decisions d JOIN moderation_items m ON m.last_decision_id=d.id WHERE m.stage='human' ORDER BY d.created_at DESC LIMIT ?1`
    : `SELECT * FROM moderation_decisions ORDER BY created_at DESC LIMIT ?1`;
  const { results } = await db.prepare(sql).bind(Math.min(500, Math.max(1, limit))).all();
  return ((results || []) as any[]).map(r => ({ ...r, reasons: JSON.parse(r.reasons || "[]"), evidence: r.evidence ? JSON.parse(r.evidence) : null, removed_submissions: undefined }));
}

/** How shadow decisions compare with what people decided on the same items. */
export async function shadowAgreement(sinceMs = 14 * DAY) {
  const { results } = await getD1().prepare(`SELECT s.field, s.outcome AS engine, p.outcome AS person FROM moderation_decisions s
    JOIN moderation_decisions p ON p.item_id=s.item_id AND p.created_at>s.created_at AND p.mode IN ('human','church') AND p.outcome LIKE '%\\_%' ESCAPE '\\'
    WHERE s.mode='shadow' AND s.outcome IN ('approve','reject','hide') AND s.created_at>?1`).bind(Date.now() - sinceMs).all();
  const byField: Record<string, { agree: number; disagree: number }> = {};
  for (const r of (results || []) as any[]) {
    const agrees = (r.engine === "reject") === /reject|decline/.test(r.person);
    const f = (byField[r.field] ||= { agree: 0, disagree: 0 });
    agrees ? f.agree++ : f.disagree++;
  }
  return byField;
}

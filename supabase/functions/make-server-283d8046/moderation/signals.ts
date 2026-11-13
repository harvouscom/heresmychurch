// Signals for the moderation policy. Evidence comes only from the church's STORED website (never
// from the proposal itself), and an AI answer counts only when its quote is found on the page and a
// deterministic check of that quote agrees.
import { fetchSitePages, evidenceFromText, reviewAiAvailable } from "../review-evidence.ts";
import { spamReason, type Candidate, type Evidence } from "./policy.ts";
import * as kv from "../kv.ts";
import { env } from "../runtime.ts";

const DAY = 86400000;

/** Independent-person grouping: IPv4 /24, IPv6 /48; Lookup, partner and church actors as they are. */
export function actorGroup(actor: string): string {
  const a = String(actor || "");
  if (/^(lookup|partner|church|church-inbox):/.test(a)) return a;
  const v4 = a.match(/^(\d+)\.(\d+)\.(\d+)\.\d+$/);
  if (v4) return `${v4[1]}.${v4[2]}.${v4[3]}`;
  if (a.includes(":")) return a.toLowerCase().split(":").slice(0, 3).join(":");
  return a;
}

export function candidatesFrom(submissions: any[], field: string, include: (s: any) => boolean): Candidate[] {
  const groups = new Map<string, any[]>();
  for (const s of submissions) if (s?.field === field && include(s)) groups.set(String(s.value), [...(groups.get(String(s.value)) || []), s]);
  return [...groups.entries()].map(([value, subs]) => {
    const people = new Set(subs.map((s: any) => actorGroup(s.ip)));
    return { value, people: people.size, partnerOnly: subs.every((s: any) => String(s.ip).startsWith("partner:")), firstAt: Math.min(...subs.map((s: any) => Number(s.timestamp) || Date.now())), spam: spamReason(field, value) };
  });
}

// ── Names ──
const NAME_SWAPS: [RegExp, string][] = [[/\bst\.?\b/g, "saint"], [/\bmt\.?\b/g, "mount"], [/\b1st\b/g, "first"], [/\b2nd\b/g, "second"], [/&/g, " and "]];
export function normalizeName(s: string): string {
  let n = String(s || "").toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/['’]/g, "");
  for (const [re, to] of NAME_SWAPS) n = n.replace(re, to);
  return n.replace(/[^a-z0-9]+/g, " ").trim();
}
function editDistance(a: string, b: string): number {
  const dp = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0]; dp[0] = i;
    for (let j = 1; j <= b.length; j++) { const tmp = dp[j]; dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1)); prev = tmp; }
  }
  return dp[b.length];
}
/** 0..1 similarity of two church names after normalizing abbreviations and punctuation. */
export function nameSimilarity(a: string, b: string): number {
  const x = normalizeName(a), y = normalizeName(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  return 1 - editDistance(x, y) / Math.max(x.length, y.length);
}
const GENERIC = new Set(["church", "the", "of", "and", "a", "in", "at", "community", "fellowship", "ministries", "ministry", "chapel", "first", "saint"]);
export function sharesDistinctiveWord(a: string, b: string): boolean {
  const words = (s: string) => new Set(normalizeName(s).split(" ").filter(w => w.length > 2 && !GENERIC.has(w)));
  const wa = words(a), wb = words(b);
  return [...wa].some(w => wb.has(w));
}

export function distanceM(a: { lat?: number; lng?: number } | null | undefined, b: { lat?: number; lng?: number } | null | undefined): number | null {
  if (!a || !b || typeof a.lat !== "number" || typeof a.lng !== "number" || typeof b.lat !== "number" || typeof b.lng !== "number") return null;
  const R = 6371000, rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// ── Website evidence ──
type Page = { url: string; text: string };
async function sitePages(url: string, fetcher: typeof fetch): Promise<Page[] | null> {
  const key = `site-text:${await sha(url)}`;
  const cached = await kv.get(key);
  if (cached && Date.now() - cached.at < DAY) return cached.pages;
  try {
    const pages = await fetchSitePages(url, fetcher, 3);
    await kv.set(key, { at: Date.now(), pages });
    return pages;
  } catch { return null; }
}
async function sha(s: string) {
  return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)))).map(b => b.toString(16).padStart(2, "0")).join("").slice(0, 40);
}
const digitsIn = (text: string) => [...text.matchAll(/\+?\d[\d\s().-]{6,}\d/g)].map(m => m[0].replace(/\D/g, ""));
const lower = (s: unknown) => String(s ?? "").toLowerCase().replace(/\s+/g, " ").trim();
/** Times like 9am, 9:30 am, 10:45AM, normalized to "9:00am". */
export function timesIn(text: string): string[] {
  return [...String(text).toLowerCase().matchAll(/\b(\d{1,2})(?::(\d{2}))?\s*([ap])\.?\s*m\b/g)].map(m => `${Number(m[1])}:${m[2] || "00"}${m[3]}m`);
}

async function aiBudgetOk(): Promise<boolean> {
  if (!reviewAiAvailable() || env("AI_REVIEW_ENABLED") !== "1") return false;
  const limit = Number(env("AI_DAILY_BUDGET")) || 300;
  const key = `moderation:ai-budget:${new Date().toISOString().slice(0, 10)}`;
  const used = Number(await kv.get(key)) || 0;
  if (used >= limit) return false;
  await kv.set(key, used + 1);
  return true;
}

export type SiteEvidence = { evidence: Evidence; detail?: string; source?: string };
/** Looks for the proposed value on the church's stored website. Never throws. */
export async function siteEvidence(church: any, field: string, value: string, deps: { normalizePhone(v: string): string; parseAddress(v: string): any }, fetcher: typeof fetch = fetch): Promise<SiteEvidence> {
  if (!church?.website || !/^https:\/\//i.test(church.website)) return { evidence: "none", detail: "No secure church website to check." };
  const pages = await sitePages(church.website, fetcher);
  if (!pages?.length) return { evidence: "none", detail: "The church website couldn't be read." };
  const all = pages.map(p => p.text).join(" \n ");
  const found = (needle: string) => { const p = pages.find(pg => lower(pg.text).includes(lower(needle))); return p ? { evidence: "supported" as const, source: p.url, detail: `"${needle}" appears on ${new URL(p.url).pathname}` } : null; };
  switch (field) {
    case "phone": {
      const want = deps.normalizePhone(value);
      const have = new Set(digitsIn(all).map(d => deps.normalizePhone(d)).filter(Boolean));
      if (want && have.has(want)) return { evidence: "supported", detail: "The number appears on the church website." };
      const current = deps.normalizePhone(String(church.phone || ""));
      if (current && have.has(current)) return { evidence: "contradicted", detail: "The website lists the current number instead." };
      return { evidence: "none" };
    }
    case "email": return found(value) || { evidence: "none" };
    case "pastorName": return value.trim().length >= 5 ? (found(value) || { evidence: "none" }) : { evidence: "none" };
    case "name": return found(value) || { evidence: "none" };
    case "address": {
      const a = deps.parseAddress(value);
      const street = String(a?.address || "").trim();
      const m = street.match(/^(\d+[a-z]?)\s+(.+?)\b/i);
      if (m && lower(all).includes(lower(m[1])) && lower(all).includes(lower(street.split(" ").slice(1, 2).join(" ")))) return { evidence: "supported", detail: "The street number and street appear on the church website." };
      return { evidence: "none" };
    }
    case "serviceTimes": {
      const wanted = timesIn(value);
      if (!wanted.length) return { evidence: "none" };
      if (!(await aiBudgetOk())) return { evidence: "none", detail: "Daily AI check budget reached." };
      try {
        const page = { url: pages[0].url, text: all.slice(0, 16000) };
        const result = await evidenceFromText(church, field, value, page);
        // The model only locates a quote; code decides whether the quote shows these times.
        const quoted = new Set(timesIn(result.quote || ""));
        if (result.verdict === "supported" && wanted.every(t => quoted.has(t))) return { evidence: "supported", detail: result.quote!, source: result.sourceUrl || undefined };
        if (result.verdict === "contradicted" && result.quote && timesIn(result.quote).length) return { evidence: "contradicted", detail: result.quote, source: result.sourceUrl || undefined };
      } catch { /* treat as no evidence */ }
      return { evidence: "none" };
    }
    default: return { evidence: "none" };
  }
}

/** Checks a proposed website: reachable, names the church, not parked; and whether the stored site is gone. */
export async function websiteSignals(church: any, proposed: string, fetcher: typeof fetch = fetch) {
  let pages: Page[] | null = null; let error: string | undefined;
  try { pages = await fetchSitePages(proposed, fetcher, 1); } catch (e) { error = e instanceof Error ? e.message : "The new website can't be read."; }
  const text = lower(pages?.[0]?.text || "");
  const words = normalizeName(church.name).split(" ").filter(w => w.length > 2 && !GENERIC.has(w));
  const nameOnPage = !!text && (words.length ? words.filter(w => text.includes(w)).length / words.length >= 0.6 : text.includes(lower(church.name)));
  const parked = /domain (is )?for sale|buy this domain|parked free|this domain may be for sale/i.test(text);
  let oldSiteGone = !church.website;
  if (church.website) { try { await fetchSitePages(church.website, fetcher, 1); } catch { oldSiteGone = true; } }
  return { reachable: !!pages, nameOnPage, parked, oldSiteGone, error };
}

/** Records one website check for a closure report; returns how many distinct days it was down. */
export async function siteDeadChecks(church: any, fetcher: typeof fetch = fetch, now = Date.now()): Promise<number> {
  if (!church?.website) return 0;
  const key = `site-check:${church.id}`;
  const row = (await kv.get(key)) || { fails: [] as number[] };
  let up = true;
  try { await fetchSitePages(church.website, fetcher, 1); } catch { up = false; }
  const fails: number[] = up ? [] : [...row.fails.filter((t: number) => now - t < 30 * DAY), now];
  await kv.set(key, { fails });
  return new Set(fails.map(t => Math.floor(t / DAY))).size;
}

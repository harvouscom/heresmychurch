/**
 * "Is this church already listed?" matching, shared by the add form, the API and moderation.
 * Pure functions, no browser or runtime dependencies.
 */

export type MatchInput = { name?: string; lat?: number | null; lng?: number | null; city?: string; address?: string };
export type MatchCandidate = MatchInput & { [key: string]: unknown };
export type DuplicateScore = { score: number; nameScore: number; reasons: string[]; distanceM?: number; flagged: boolean };
export type DuplicateMatch<T> = DuplicateScore & { church: T };

/** Spelled-out forms, so "St. Mary's" and "Saint Mary" compare equal. */
const ALIASES: Record<string, string> = {
  st: "saint", ste: "saint", sts: "saints", mt: "mount", ft: "fort",
  "1st": "first", "2nd": "second", "3rd": "third", "4th": "fourth", "5th": "fifth",
  ctr: "center", centre: "center", intl: "international", assy: "assembly",
};
/** Dropped entirely. */
const STOPWORDS = new Set(["the", "of", "and", "a", "an", "at", "in", "on", "for", "inc", "llc"]);
/** Words many unrelated churches share; they count for little on their own. */
const GENERIC = new Set([
  "church", "churches", "chapel", "ministries", "ministry", "fellowship", "community", "congregation",
  "parish", "worship", "center", "international", "family", "christian", "first", "second", "third",
  "baptist", "methodist", "united", "presbyterian", "lutheran", "catholic", "roman", "episcopal",
  "pentecostal", "assembly", "assemblies", "god", "evangelical", "reformed", "orthodox", "apostolic",
  "missionary", "free", "will", "umc", "ame", "cogic", "sda", "seventh", "day", "adventist", "nazarene",
  "nondenominational", "non", "denominational", "bible", "gospel", "tabernacle", "temple", "cathedral",
  "full", "new", "life", "house", "global", "campus", "street", "road",
]);
const SAINT_WEIGHT = 0.5;
const GENERIC_WEIGHT = 0.25;
/** Names that say nothing about which church it is. */
const PLACEHOLDER = /^(unnamed|unknown|untitled)?\s*(church|chapel|place of worship)?$/;

function fold(s: string): string {
  return String(s ?? "").normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/** Lowercased, accent-free, punctuation-free, with common abbreviations spelled out. */
export function normalizeChurchName(name: string): string {
  const s = fold(name)
    .replace(/&/g, " and ")
    .replace(/['’`]s\b/g, "")
    .replace(/['’`]/g, "")
    .replace(/[^a-z0-9]+/g, " ");
  return s.split(" ").filter(Boolean).map((t) => ALIASES[t] ?? t).filter((t) => !STOPWORDS.has(t)).join(" ");
}

function tokens(name: string): string[] {
  return [...new Set(normalizeChurchName(name).split(" ").filter(Boolean))];
}
const weight = (t: string) => (t === "saint" || t === "saints" ? SAINT_WEIGHT : GENERIC.has(t) ? GENERIC_WEIGHT : 1);

function levenshtein(a: string, b: string): number {
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = tmp;
    }
  }
  return prev[b.length];
}
/** 1 for the same word; partial credit for a close spelling of a word of 5+ letters. */
function tokenMatch(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length < 5 || b.length < 5) return 0;
  const sim = 1 - levenshtein(a, b) / Math.max(a.length, b.length);
  return sim >= 0.85 ? sim : 0;
}

/** True for names like "Unnamed Church" that identify nothing. */
export function isPlaceholderName(name: string): boolean {
  return PLACEHOLDER.test(normalizeChurchName(name));
}

/**
 * 0–1 similarity of two church names. Distinctive words carry the score; words most churches share
 * ("church", "first", "baptist") count a quarter. Scored both ways and averaged, so extra words on
 * either side lower it. Two names with distinctive words but none in common score at most 0.4.
 */
export function nameSimilarity(a: string, b: string): number {
  if (isPlaceholderName(a) || isPlaceholderName(b)) return 0;
  const ta = tokens(a), tb = tokens(b);
  if (!ta.length || !tb.length) return 0;
  if (ta.join(" ") === tb.join(" ")) return 1;
  let matched = 0, distinctiveHit = false;
  const used = new Set<number>();
  for (const t of ta) {
    let best = 0, bestJ = -1;
    tb.forEach((u, j) => { if (!used.has(j)) { const m = tokenMatch(t, u); if (m > best) { best = m; bestJ = j; } } });
    if (bestJ >= 0) { used.add(bestJ); matched += weight(t) * best; if (weight(t) === 1) distinctiveHit = true; }
  }
  const wa = ta.reduce((n, t) => n + weight(t), 0), wb = tb.reduce((n, t) => n + weight(t), 0);
  let score = (matched / wa + matched / wb) / 2;
  const distinctive = (ts: string[]) => ts.some((t) => weight(t) === 1);
  if (distinctive(ta) && distinctive(tb) && !distinctiveHit) score = Math.min(score, 0.4);
  // Same generic words but a different denomination ("First Baptist" vs "First Presbyterian").
  if (!distinctive(ta) && !distinctive(tb)) score = Math.min(score, 0.6);
  return Math.max(0, Math.min(1, score));
}

export function distanceKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180, dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() && Number.isFinite(Number(v)) ? Number(v) : null);
const normCity = (c?: string) => fold(c || "").replace(/[^a-z0-9]+/g, " ").trim();
/** "123 N Main St." → "123 main" (house number and first street word), for same-address checks. */
export function streetKey(address?: string): string {
  const parts = fold(address || "").replace(/[^a-z0-9]+/g, " ").trim().split(" ").filter(Boolean);
  const n = parts.findIndex((p) => /^\d+[a-z]?$/.test(p));
  if (n < 0) return "";
  const rest = parts.slice(n + 1).filter((p) => !["n", "s", "e", "w", "ne", "nw", "se", "sw", "north", "south", "east", "west"].includes(p));
  return rest.length ? `${parts[n]} ${rest[0]}` : "";
}
function formatDistance(m: number): string {
  if (m < 1000) return `${Math.max(10, Math.round(m / 10) * 10)} m away`;
  return `${(m / 1000).toFixed(1)} km away`;
}

export type ScoreOptions = {
  /** Name similarity needed to flag a church that isn't at the same spot. Default 0.85. */
  minName?: number;
  /** Anything this close is flagged whatever its name. Default 60 m. */
  sameSpotM?: number;
  /** A similar name counts when the church is this close (or in the same city). Default 2 km. */
  nearKm?: number;
};

/** How likely `church` is the church described by `input`, with human-readable reasons. */
export function scoreDuplicate(input: MatchInput, church: MatchCandidate, opts: ScoreOptions = {}): DuplicateScore {
  const minName = opts.minName ?? 0.85, sameSpotM = opts.sameSpotM ?? 60, nearKm = opts.nearKm ?? 2;
  const nameScore = input.name ? nameSimilarity(input.name, String(church.name ?? "")) : 0;
  const la = num(input.lat), lo = num(input.lng), cla = num(church.lat), clo = num(church.lng);
  const distanceM = la != null && lo != null && cla != null && clo != null ? distanceKm(la, lo, cla, clo) * 1000 : undefined;
  const sameCity = !!normCity(input.city) && normCity(input.city) === normCity(String(church.city ?? ""));
  const sk = streetKey(input.address);
  const sameStreet = !!sk && sk === streetKey(String(church.address ?? ""));
  const hasLocation = distanceM != null || !!normCity(input.city);
  const sameSpot = distanceM != null && distanceM <= sameSpotM;
  const near = distanceM != null && distanceM <= nearKm * 1000;
  const flagged = sameSpot || nameScore >= minName && (!hasLocation || near || sameCity) || sameStreet && nameScore >= 0.5;
  const decay = distanceM == null ? (sameCity ? 0.8 : hasLocation ? 0.3 : 1) : Math.exp(-distanceM / 3000);
  let score = nameScore * (0.5 + 0.5 * decay);
  if (sameSpot) score = Math.max(score, 0.9);
  if (sameStreet) score += 0.1;
  const reasons: string[] = [];
  if (nameScore >= 0.99) reasons.push("Same name");
  else if (nameScore >= minName) reasons.push("Similar name");
  if (sameStreet) reasons.push("Same street address");
  if (distanceM != null && distanceM <= nearKm * 1000) reasons.push(formatDistance(distanceM));
  else if (sameCity) reasons.push("Same city");
  return { score: Math.min(1, score), nameScore, reasons, ...(distanceM != null ? { distanceM: Math.round(distanceM) } : {}), flagged };
}

/** The most likely existing listings for a church being added, best first. */
export function findLikelyDuplicates<T extends MatchCandidate>(input: MatchInput, churches: T[], opts: ScoreOptions & { limit?: number } = {}): DuplicateMatch<T>[] {
  if (!Array.isArray(churches) || !churches.length) return [];
  const hasName = !!normalizeChurchName(input.name || "");
  const hasPoint = num(input.lat) != null && num(input.lng) != null;
  if (!hasName && !hasPoint) return [];
  return churches
    .map((church) => ({ church, ...scoreDuplicate(input, church, opts) }))
    .filter((m) => m.flagged)
    .sort((a, b) => b.score - a.score || (a.distanceM ?? Infinity) - (b.distanceM ?? Infinity))
    .slice(0, opts.limit ?? 5);
}

// Pure rules for community contributions (suggestions from the site, partners and Lookup).
// Kept free of KV and env so they can be unit tested directly.

/** Votes older than this stop counting toward consensus. */
export const VOTE_TTL_MS = 365 * 24 * 60 * 60 * 1000;

/** Fields that go live on one vote from the site, but always wait for a moderator when they
 *  come from Lookup: a host form can hold personal details. */
export const LOOKUP_MODERATED_FIELDS = new Set(["email", "pastorName"]);

type Vote = { field?: unknown; source?: unknown; timestamp?: unknown };

/** True when a vote came through Lookup for a field Lookup may only propose. */
export function isHeldVote(s: Vote): boolean {
  return typeof s?.field === "string" && LOOKUP_MODERATED_FIELDS.has(s.field) &&
    typeof s.source === "string" && s.source.startsWith("lookup:");
}

/** Drops votes older than VOTE_TTL_MS. A vote without a timestamp is kept, since its age is unknown. */
export function liveVotes<T extends Vote>(subs: T[], now = Date.now()): T[] {
  return subs.filter((s) => typeof s?.timestamp !== "number" || now - (s.timestamp as number) <= VOTE_TTL_MS);
}

/**
 * Phone numbers, by the church's country. US and Canada keep the existing 10-digit form (a leading
 * 1 is dropped). Elsewhere: 8–15 digits, with a leading + kept (00 is read as +), so international
 * numbers aren't mangled. Returns "" when the number isn't plausible.
 */
export function normalizePhone(s: string, cc = "US"): string {
  const raw = String(s ?? "").trim();
  const digits = raw.replace(/\D/g, "");
  const country = (cc || "US").toUpperCase();
  if (country === "US" || country === "CA") {
    if (digits.length === 11 && digits[0] === "1") return digits.slice(1);
    if (digits.length < 10) return "";
    return digits;
  }
  const plus = raw.startsWith("+");
  const zeroZero = !plus && digits.startsWith("00");
  const d = zeroZero ? digits.slice(2) : digits;
  if (d.length < 8 || d.length > 15) return "";
  return plus || zeroZero ? `+${d}` : d;
}

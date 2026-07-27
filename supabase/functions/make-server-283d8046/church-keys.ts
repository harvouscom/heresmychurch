/**
 * Country-namespaced church KV keys.
 *
 * Canonical form: churches:{CC}:{ABBREV}  (e.g. churches:US:CA, churches:CA:PE)
 * Legacy flat keys (churches:TX) are dual-read during cutover so a botched
 * migration cannot blank the map. Writes always go to the namespaced key.
 */
import * as kv from "./kv_store.tsx";
import { INTL_REGIONS } from "./regions-intl.ts";

const US_STATE_ABBREVS = new Set([
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "DC", "FL", "GA", "HI", "ID",
  "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD", "MA", "MI", "MN", "MS", "MO",
  "MT", "NE", "NV", "NH", "NJ", "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA",
  "RI", "SC", "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY",
]);

export function regionCountry(abbrev: string): string {
  const k = abbrev.toUpperCase();
  // US state codes always win over colliding foreign abbrevs (IE Cork = CO).
  if (US_STATE_ABBREVS.has(k)) return "US";
  if (INTL_REGIONS[k]) return INTL_REGIONS[k].cc;
  return "US";
}

/** Known country codes used in namespaced church ids (`CA-PE-123`, `IE-IECO-123`). */
const COUNTRY_CODES = new Set([
  "US", "CA", "GB", "IE",
  "FR", "DE", "NL", "BE", "ES", "IT", "PT", "AT", "CH",
  "SE", "NO", "DK", "FI", "PL", "AU",
]);

/** True if abbrev is a US state or a registered international region. */
export function isValidRegion(abbrev: string): boolean {
  const k = (abbrev || "").toUpperCase();
  if (!k || k.length < 2 || k.length > 32) return false;
  if (US_STATE_ABBREVS.has(k)) return true;
  return !!INTL_REGIONS[k];
}

/**
 * Region abbrev from church id.
 * US: `TX-123` → TX; California `CA-456` → CA.
 * Intl: `CA-PE-123` → PE; `IE-IECO-99` → IECO; `GB-NORTHERNIRELAND-1` → NORTHERNIRELAND.
 */
export function regionFromChurchId(id: string): string | null {
  if (!id || typeof id !== "string") return null;
  const t = id.trim();
  if (t.startsWith("community-")) {
    const p = t.split("-");
    // community-{region}-… (US) or community-{cc}-{region}-…
    if (p.length >= 3 && COUNTRY_CODES.has((p[1] || "").toUpperCase()) && !US_STATE_ABBREVS.has((p[1] || "").toUpperCase())) {
      const reg = (p[2] || "").toUpperCase();
      return isValidRegion(reg) ? reg : null;
    }
    const st = (p[1] || "").toUpperCase();
    return isValidRegion(st) ? st : null;
  }
  const parts = t.split("-");
  if (parts.length >= 3) {
    const cc = (parts[0] || "").toUpperCase();
    // Namespaced id: {CC}-{REGION}-{osmId…}. California is only ever `CA-{digits}`.
    if (COUNTRY_CODES.has(cc) && (cc !== "US" || parts[1].length > 2)) {
      const reg = (parts[1] || "").toUpperCase();
      if (isValidRegion(reg)) return reg;
    }
  }
  if (parts.length >= 2) {
    const st = (parts[0] || "").toUpperCase();
    if (isValidRegion(st)) return st;
  }
  return null;
}

export function churchesKey(cc: string, abbrev: string): string {
  return `churches:${cc.toUpperCase()}:${abbrev.toUpperCase()}`;
}

export function sidxKey(cc: string, abbrev: string): string {
  return `churches:sidx:${cc.toUpperCase()}:${abbrev.toUpperCase()}`;
}

export function pendingKey(cc: string, abbrev: string): string {
  return `pending-churches:${cc.toUpperCase()}:${abbrev.toUpperCase()}`;
}

export function reviewStatsStateKey(cc: string, abbrev: string): string {
  return `churches:review-stats:${cc.toUpperCase()}:${abbrev.toUpperCase()}`;
}

/** Meta stateCounts entry: "US:TX" or "CA:PE". */
export function metaCountKey(cc: string, abbrev: string): string {
  return `${cc.toUpperCase()}:${abbrev.toUpperCase()}`;
}

export function parseMetaCountKey(key: string): { cc: string; abbrev: string } {
  // Allow longer region abbrevs (GB ITL slugs, IE ISO without hyphen).
  const m = key.match(/^([A-Z]{2}):([A-Z][A-Z0-9]+)$/);
  if (m) return { cc: m[1], abbrev: m[2] };
  const abbrev = key.toUpperCase();
  return { cc: regionCountry(abbrev), abbrev };
}

export async function getChurches(abbrev: string, cc?: string): Promise<any> {
  const st = abbrev.toUpperCase();
  const country = (cc || regionCountry(st)).toUpperCase();
  const namespaced = await kv.get(churchesKey(country, st));
  if (namespaced != null) return namespaced;
  return kv.get(`churches:${st}`);
}

export async function setChurches(abbrev: string, value: any, cc?: string): Promise<void> {
  const st = abbrev.toUpperCase();
  const country = (cc || regionCountry(st)).toUpperCase();
  await kv.set(churchesKey(country, st), value);
}

export async function delChurches(abbrev: string, cc?: string): Promise<void> {
  const st = abbrev.toUpperCase();
  const country = (cc || regionCountry(st)).toUpperCase();
  await kv.del(churchesKey(country, st));
  // Also clear legacy flat key if present
  try { await kv.del(`churches:${st}`); } catch { /* ignore */ }
}

export async function getSidx(abbrev: string, cc?: string): Promise<any> {
  const st = abbrev.toUpperCase();
  const country = (cc || regionCountry(st)).toUpperCase();
  const namespaced = await kv.get(sidxKey(country, st));
  if (namespaced != null) return namespaced;
  return kv.get(`churches:sidx:${st}`);
}

export async function setSidx(abbrev: string, value: any, cc?: string): Promise<void> {
  const st = abbrev.toUpperCase();
  const country = (cc || regionCountry(st)).toUpperCase();
  await kv.set(sidxKey(country, st), value);
}

export async function delSidx(abbrev: string, cc?: string): Promise<void> {
  const st = abbrev.toUpperCase();
  const country = (cc || regionCountry(st)).toUpperCase();
  await kv.del(sidxKey(country, st));
  try { await kv.del(`churches:sidx:${st}`); } catch { /* ignore */ }
}

export async function getPending(abbrev: string, cc?: string): Promise<any> {
  const st = abbrev.toUpperCase();
  const country = (cc || regionCountry(st)).toUpperCase();
  const namespaced = await kv.get(pendingKey(country, st));
  if (namespaced != null) return namespaced;
  return kv.get(`pending-churches:${st}`);
}

export async function setPending(abbrev: string, value: any, cc?: string): Promise<void> {
  const st = abbrev.toUpperCase();
  const country = (cc || regionCountry(st)).toUpperCase();
  await kv.set(pendingKey(country, st), value);
}

export async function getReviewStatsState(abbrev: string, cc?: string): Promise<any> {
  const st = abbrev.toUpperCase();
  const country = (cc || regionCountry(st)).toUpperCase();
  const namespaced = await kv.get(reviewStatsStateKey(country, st));
  if (namespaced != null) return namespaced;
  return kv.get(`churches:review-stats:${st}`);
}

export async function setReviewStatsState(abbrev: string, value: any, cc?: string): Promise<void> {
  const st = abbrev.toUpperCase();
  const country = (cc || regionCountry(st)).toUpperCase();
  await kv.set(reviewStatsStateKey(country, st), value);
}

export function getCount(sc: Record<string, number>, abbrev: string, cc?: string): number {
  const st = abbrev.toUpperCase();
  const country = (cc || regionCountry(st)).toUpperCase();
  const nk = metaCountKey(country, st);
  if (sc[nk] != null) return sc[nk];
  return sc[st] || 0;
}

export function setCount(sc: Record<string, number>, abbrev: string, count: number, cc?: string): void {
  const st = abbrev.toUpperCase();
  const country = (cc || regionCountry(st)).toUpperCase();
  sc[metaCountKey(country, st)] = count;
  delete sc[st];
}

export function deleteCount(sc: Record<string, number>, abbrev: string, cc?: string): void {
  const st = abbrev.toUpperCase();
  const country = (cc || regionCountry(st)).toUpperCase();
  delete sc[metaCountKey(country, st)];
  delete sc[st];
}

/** Populated regions from meta.stateCounts, normalizing legacy bare keys. */
export function listPopulated(sc: Record<string, number>): Array<{ cc: string; abbrev: string }> {
  const out: Array<{ cc: string; abbrev: string }> = [];
  const seen = new Set<string>();
  for (const key of Object.keys(sc)) {
    if (!sc[key]) continue;
    const { cc, abbrev } = parseMetaCountKey(key);
    const id = `${cc}:${abbrev}`;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({ cc, abbrev });
  }
  return out;
}

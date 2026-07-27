import { churchMapPath } from "../lib/map-paths";

/** Map URL for a seasonal report spotlight row (opens church on the map). */
export function spotlightMapHref(spotlight: {
  id?: string;
  shortId?: string;
  state: string;
  country?: string;
}): string | null {
  if (!spotlight.id) return null;
  const seg = getChurchUrlSegment(
    { id: spotlight.id, shortId: spotlight.shortId },
    spotlight.state,
    spotlight.country
  );
  const cc = (spotlight.country || "US").toUpperCase();
  return churchMapPath(cc, spotlight.state, seg);
}

/**
 * Returns the numeric 8-digit segment to use in church URLs (e.g. /US/IA/16692500).
 * Prefers shortId when present; otherwise derives from church.id so the path never contains "STATE-" prefix.
 */
export function getChurchUrlSegment(
  church: { id: string; shortId?: string },
  stateAbbrev: string,
  countryCode?: string
): string {
  if (church.shortId != null && /^\d{8}$/.test(String(church.shortId))) {
    return String(church.shortId);
  }
  const st = (stateAbbrev || "").toUpperCase();
  const cc = (countryCode || "").toUpperCase();
  // US: `TX-123…`; intl: `CA-PE-123…` / `IE-IECO-123…`
  const prefixes = [
    cc && st ? `${cc}-${st}-` : "",
    st ? `${st}-` : "",
  ].filter(Boolean);
  for (const prefix of prefixes) {
    if (church.id.startsWith(prefix)) {
      const numPart = church.id.slice(prefix.length);
      if (/^\d+$/.test(numPart)) {
        return numPart.length >= 8 ? numPart.slice(0, 8) : numPart.padStart(8, "0");
      }
    }
  }
  // Infer CC-REGION-digits when countryCode was omitted (e.g. CA-ON-18899678).
  const namespaced = church.id.match(/^([A-Z]{2})-([A-Z][A-Z0-9]+)-(\d+)$/);
  if (namespaced && (!st || namespaced[2] === st)) {
    const numPart = namespaced[3];
    return numPart.length >= 8 ? numPart.slice(0, 8) : numPart.padStart(8, "0");
  }
  if (church.id.startsWith("community-")) {
    let h = 0;
    for (let i = 0; i < church.id.length; i++) {
      h = ((h << 5) - h + church.id.charCodeAt(i)) | 0;
    }
    const n = Math.abs(h) % 100000000;
    return n.toString().padStart(8, "0");
  }
  let h = 0;
  for (let i = 0; i < church.id.length; i++) {
    h = ((h << 5) - h + church.id.charCodeAt(i)) | 0;
  }
  return Math.abs(h).toString().padStart(8, "0").slice(0, 8);
}

/** Match church by route segment (legacy id or numeric shortId). */
export function churchMatchesRouteSegment(
  church: { id: string; shortId?: string },
  segment: string,
  stateAbbrev: string,
  countryCode?: string,
): boolean {
  if (church.id === segment) return true;
  if (church.shortId != null && String(church.shortId) === segment) return true;
  if (getChurchUrlSegment(church, stateAbbrev, countryCode) === segment) return true;
  const st = (stateAbbrev || "").toUpperCase();
  const cc = (countryCode || "").toUpperCase();
  const prefixes = [
    cc && st ? `${cc}-${st}-` : "",
    st ? `${st}-` : "",
  ].filter(Boolean);
  for (const prefix of prefixes) {
    if (church.id.startsWith(prefix)) {
      const numPart = church.id.slice(prefix.length);
      if (/^\d+$/.test(numPart)) {
        const normalized = numPart.length >= 8 ? numPart.slice(0, 8) : numPart.padStart(8, "0");
        if (normalized === segment || numPart === segment) return true;
      }
    }
  }
  return false;
}

/** Appends ref=heresmychurch to a URL so the destination can see traffic came from here. */
export function withSiteRef(url: string, ref = "heresmychurch"): string {
  try {
    const u = new URL(url);
    u.searchParams.set("ref", ref);
    return u.toString();
  } catch {
    return url;
  }
}

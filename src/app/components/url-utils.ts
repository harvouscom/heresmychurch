/**
 * Returns the numeric 8-digit segment to use in church URLs (e.g. /state/IA/16692500).
 * Prefers shortId when present; otherwise derives from church.id so the path never contains "STATE-" prefix.
 */
export function getChurchUrlSegment(
  church: { id: string; shortId?: string },
  stateAbbrev: string
): string {
  if (church.shortId && /^\d{8}$/.test(church.shortId)) {
    return church.shortId;
  }
  const st = (stateAbbrev || "").toUpperCase();
  const statePrefix = st && st.length === 2 ? `${st}-` : "";
  if (statePrefix && church.id.startsWith(statePrefix)) {
    const numPart = church.id.slice(statePrefix.length);
    if (/^\d+$/.test(numPart)) {
      return numPart.length >= 8 ? numPart.slice(0, 8) : numPart.padStart(8, "0");
    }
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

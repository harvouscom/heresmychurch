import type { Church } from "./church-data";
import { churchMatchesRouteSegment } from "./url-utils";

/**
 * Survives ChurchMap remounts when navigating across route entries
 * (e.g. /world → /AU/AUNSW/:shortId). Search selection writes here before
 * the URL changes; the destination mount reads it to open the detail panel
 * immediately instead of waiting on a full region fetch.
 */
let pending: Church | null = null;

export function setNavigationChurchPreload(church: Church): void {
  pending = church;
}

export function peekNavigationChurchPreload(): Church | null {
  return pending;
}

/** Returns the preload when it matches the route, otherwise null (does not clear). */
export function matchNavigationChurchPreload(
  shortId: string,
  stateAbbrev: string,
  countryCode?: string,
): Church | null {
  if (!pending) return null;
  return churchMatchesRouteSegment(pending, shortId, stateAbbrev, countryCode)
    ? pending
    : null;
}

export function clearNavigationChurchPreload(): void {
  pending = null;
}

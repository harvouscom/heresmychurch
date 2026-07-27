import { geoContains } from "d3-geo";
import { STATE_TO_FIPS } from "./map-constants";

/**
 * Admin-2 name containing (lng, lat), using the same features as the map.
 * For US, `stateAbbrev` scopes by FIPS prefix; for CA (and others with
 * `regionAbbrev` on features), it scopes by that property.
 */
export function findCountyNameForPoint(
  stateAbbrev: string,
  lng: number,
  lat: number,
  countyFeatures: Map<string, unknown> | null | undefined
): string | null {
  if (!countyFeatures?.size) return null;
  const region = stateAbbrev.toUpperCase();
  const stateFips = STATE_TO_FIPS[region.slice(0, 2)];
  for (const [id, feat] of countyFeatures.entries()) {
    const props = (feat as { properties?: { name?: string; regionAbbrev?: string } }).properties;
    if (stateFips) {
      if (String(id).substring(0, 2) !== stateFips) continue;
    } else if (props?.regionAbbrev) {
      if (String(props.regionAbbrev).toUpperCase() !== region) continue;
    }
    try {
      if (geoContains(feat as any, [lng, lat])) {
        const name = String(props?.name ?? "").trim();
        return name || null;
      }
    } catch {
      // ignore bad geometry
    }
  }
  return null;
}

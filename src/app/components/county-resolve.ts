import { geoContains } from "d3-geo";
import { STATE_TO_FIPS } from "./map-constants";

/**
 * US county name containing (lng, lat), using the same TopoJSON features as the map.
 * `stateAbbrev` scopes the search (2-letter code matching the church's state).
 */
export function findCountyNameForPoint(
  stateAbbrev: string,
  lng: number,
  lat: number,
  countyFeatures: Map<string, unknown> | null | undefined
): string | null {
  if (!countyFeatures?.size) return null;
  const stateFips = STATE_TO_FIPS[stateAbbrev.toUpperCase().slice(0, 2)];
  if (!stateFips) return null;
  for (const [fips, feat] of countyFeatures.entries()) {
    if (String(fips).substring(0, 2) !== stateFips) continue;
    try {
      if (geoContains(feat as any, [lng, lat])) {
        const name = String((feat as { properties?: { name?: string } }).properties?.name ?? "").trim();
        return name || null;
      }
    } catch {
      // ignore bad geometry
    }
  }
  return null;
}

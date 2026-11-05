import { geoContains } from "d3-geo";
import { STATE_TO_FIPS } from "./map-constants";

/**
 * Which admin-2 area (county, census division…) a point falls in.
 *
 * This runs for every church in a region whenever one loads, from several places (county
 * stats, search, the church list). d3's spherical `geoContains` against every county cost
 * about 8 seconds of frozen main thread for Texas (16,795 churches × 254 counties). Here
 * each area keeps a bounding box, so nearly all are ruled out with four comparisons, and
 * the rest use a planar ray-casting test, which matches the spherical one at county scale.
 * Areas that cross the antimeridian (the Aleutians) keep the spherical test.
 */

type Ring = Float64Array; // [lng0, lat0, lng1, lat1, …]
interface IndexedArea {
  id: string;
  name: string;
  minLng: number;
  minLat: number;
  maxLng: number;
  maxLat: number;
  /** Polygons, each an outer ring followed by its holes. Null: use `feature` instead. */
  polygons: Ring[][] | null;
  feature: unknown;
}

type Feature = { properties?: { name?: string; regionAbbrev?: string }; geometry?: GeoJSON.Geometry | null };

const indexCache = new WeakMap<Map<string, unknown>, Map<string, IndexedArea[]>>();

function toRings(coords: number[][][]): Ring[] {
  return coords.map((ring) => {
    const out = new Float64Array(ring.length * 2);
    ring.forEach(([lng, lat], k) => {
      out[k * 2] = lng;
      out[k * 2 + 1] = lat;
    });
    return out;
  });
}

function indexArea(id: string, feat: unknown): IndexedArea | null {
  const f = feat as Feature;
  const g = f.geometry;
  if (!g || (g.type !== "Polygon" && g.type !== "MultiPolygon")) return null;
  const polys = g.type === "Polygon" ? [g.coordinates] : g.coordinates;
  let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity;
  for (const poly of polys) {
    for (const [lng, lat] of poly[0] ?? []) {
      if (lng < minLng) minLng = lng;
      if (lng > maxLng) maxLng = lng;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
    }
  }
  const crossesAntimeridian = maxLng - minLng > 180;
  return {
    id,
    name: String(f.properties?.name ?? "").trim(),
    // An antimeridian area's box spans the globe, so it's always a candidate.
    minLng: crossesAntimeridian ? -180 : minLng,
    maxLng: crossesAntimeridian ? 180 : maxLng,
    minLat,
    maxLat,
    polygons: crossesAntimeridian ? null : polys.map((p) => toRings(p as number[][][])),
    feature: feat,
  };
}

/** Areas within a region, indexed once per feature map and region. */
function regionIndex(region: string, countyFeatures: Map<string, unknown>): IndexedArea[] {
  let byRegion = indexCache.get(countyFeatures);
  if (!byRegion) {
    byRegion = new Map();
    indexCache.set(countyFeatures, byRegion);
  }
  const key = region.toUpperCase();
  const cached = byRegion.get(key);
  if (cached) return cached;
  // US: scope by FIPS prefix. Elsewhere (CA…): by the feature's regionAbbrev, when present.
  const stateFips = STATE_TO_FIPS[key.slice(0, 2)];
  const areas: IndexedArea[] = [];
  for (const [id, feat] of countyFeatures.entries()) {
    const props = (feat as Feature).properties;
    if (stateFips) {
      if (String(id).substring(0, 2) !== stateFips) continue;
    } else if (props?.regionAbbrev) {
      if (String(props.regionAbbrev).toUpperCase() !== key) continue;
    }
    const area = indexArea(String(id), feat);
    if (area) areas.push(area);
  }
  byRegion.set(key, areas);
  return areas;
}

/** Even-odd ray cast: inside the outer ring and not inside a hole. */
function polygonContains(rings: Ring[], lng: number, lat: number): boolean {
  let inside = false;
  for (const ring of rings) {
    const n = ring.length;
    for (let i = 0, j = n - 2; i < n; j = i, i += 2) {
      const xi = ring[i], yi = ring[i + 1], xj = ring[j], yj = ring[j + 1];
      if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
    }
  }
  return inside;
}

function areaContains(area: IndexedArea, lng: number, lat: number): boolean {
  if (lng < area.minLng || lng > area.maxLng || lat < area.minLat || lat > area.maxLat) return false;
  if (!area.polygons) {
    try {
      return geoContains(area.feature as GeoJSON.Feature, [lng, lat]);
    } catch {
      return false; // bad geometry
    }
  }
  return area.polygons.some((rings) => polygonContains(rings, lng, lat));
}

const singleAreaCache = new WeakMap<object, IndexedArea | null>();

/** Whether one polygon feature (a county, a state) contains (lng, lat), with the same fast test. */
export function featureContainsPoint(feat: unknown, lng: number, lat: number): boolean {
  let area = singleAreaCache.get(feat as object);
  if (area === undefined) {
    area = indexArea("", feat);
    singleAreaCache.set(feat as object, area);
  }
  return area ? areaContains(area, lng, lat) : false;
}

/** Admin-2 area containing (lng, lat) within `region`, or null. */
export function findAdmin2ForPoint(
  region: string,
  lng: number,
  lat: number,
  countyFeatures: Map<string, unknown> | null | undefined,
): { id: string; name: string } | null {
  if (!countyFeatures?.size || !region) return null;
  for (const area of regionIndex(region, countyFeatures)) {
    if (areaContains(area, lng, lat)) return { id: area.id, name: area.name };
  }
  return null;
}

/**
 * Admin-2 name containing (lng, lat), using the same features as the map.
 * For US, `stateAbbrev` scopes by FIPS prefix; for CA (and others with
 * `regionAbbrev` on features), it scopes by that property.
 */
export function findCountyNameForPoint(
  stateAbbrev: string,
  lng: number,
  lat: number,
  countyFeatures: Map<string, unknown> | null | undefined,
): string | null {
  return findAdmin2ForPoint(stateAbbrev, lng, lat, countyFeatures)?.name || null;
}

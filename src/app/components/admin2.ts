/**
 * Country-aware admin-2 (US county / CA census division / AU LGA) helpers.
 * Geometry comes from CountryConfig.admin2SourceUrl; stats are client-side PIP.
 */

import { geoContains } from "d3-geo";
import { feature } from "topojson-client";
import { getCountry } from "../config/countries";
import { STATE_TO_FIPS } from "./map-constants";
import { COUNTY_POPULATIONS } from "./data/county-populations";
import { CA_CD_POPULATIONS } from "./data/ca-cd-populations";
import type { Church } from "./church-data";
import type { CountyStats } from "./MapLibreCanvas";

export type Admin2Feature = GeoJSON.Feature<GeoJSON.Geometry, {
  id: string;
  name: string;
  regionAbbrev?: string;
  fips?: string;
  [key: string]: unknown;
}>;

const featureCache = new Map<string, Promise<Map<string, Admin2Feature>>>();

function populationsFor(countryCode: string): Record<string, number> {
  const cc = countryCode.toUpperCase();
  if (cc === "US") return COUNTY_POPULATIONS;
  if (cc === "CA") return CA_CD_POPULATIONS;
  return {};
}

/**
 * Planar [[west, south], [east, north]] from coordinates.
 * Prefer this over d3-geo's geoBounds for simplified/admin-2 polygons —
 * invalid rings after simplification make the spherical algorithm return the
 * whole globe ([[-180,-90],[180,90]]), which zoomed CD clicks to world view.
 */
export function planarBoundsForFeature(
  feature: GeoJSON.Feature | GeoJSON.Geometry | null | undefined,
): [[number, number], [number, number]] | null {
  if (!feature) return null;
  const geom = "geometry" in feature ? feature.geometry : feature;
  if (!geom || geom.type === "GeometryCollection") return null;
  let west = Infinity, south = Infinity, east = -Infinity, north = -Infinity;
  const visit = (coords: unknown): void => {
    if (!Array.isArray(coords) || coords.length === 0) return;
    if (typeof coords[0] === "number" && typeof coords[1] === "number") {
      const lng = coords[0] as number;
      const lat = coords[1] as number;
      if (lng < west) west = lng;
      if (lng > east) east = lng;
      if (lat < south) south = lat;
      if (lat > north) north = lat;
      return;
    }
    for (const c of coords) visit(c);
  };
  visit((geom as GeoJSON.Polygon | GeoJSON.MultiPolygon).coordinates);
  if (!Number.isFinite(west) || west > east || south > north) return null;
  // Reject globe-sized garbage (same failure mode as broken geoBounds).
  if (east - west > 170 || north - south > 140) return null;
  return [[west, south], [east, north]];
}

/** Normalize a raw feature into a stable string id + name. */
function normalizeFeature(
  countryCode: string,
  f: GeoJSON.Feature,
): Admin2Feature | null {
  const cc = countryCode.toUpperCase();
  if (cc === "US") {
    const fips = String(f.id ?? "").padStart(5, "0");
    if (fips.length !== 5) return null;
    return {
      ...f,
      id: fips,
      properties: {
        ...(f.properties ?? {}),
        id: fips,
        fips,
        name: String((f.properties as { name?: string } | null)?.name ?? `County ${fips}`),
        regionAbbrev: Object.entries(STATE_TO_FIPS).find(([, p]) => p === fips.slice(0, 2))?.[0],
      },
    };
  }
  const props = (f.properties ?? {}) as Record<string, unknown>;
  const pad = cc === "CA" ? 4 : cc === "AU" ? 5 : 0;
  const id = String(props.id ?? f.id ?? "").padStart(pad, "0");
  if (!id) return null;
  return {
    ...f,
    id,
    properties: {
      ...props,
      id,
      fips: id, // MapLibre hit-test still reads properties.fips
      name: String(props.name ?? id),
      regionAbbrev: String(props.regionAbbrev ?? ""),
    },
  };
}

async function fetchAdmin2Map(countryCode: string): Promise<Map<string, Admin2Feature>> {
  const cc = countryCode.toUpperCase();
  const cfg = getCountry(cc);
  if (!cfg?.hasAdmin2 || !cfg.admin2SourceUrl) return new Map();

  const res = await fetch(cfg.admin2SourceUrl);
  if (!res.ok) throw new Error(`admin2 fetch failed (${cc}): ${res.status}`);
  const raw = await res.json();

  let features: GeoJSON.Feature[] = [];
  if (raw?.type === "Topology" && raw.objects?.counties) {
    const geo = feature(raw, raw.objects.counties) as GeoJSON.FeatureCollection;
    features = geo.features ?? [];
  } else if (raw?.type === "FeatureCollection") {
    features = raw.features ?? [];
  } else {
    throw new Error(`Unrecognized admin2 format for ${cc}`);
  }

  const map = new Map<string, Admin2Feature>();
  for (const f of features) {
    const n = normalizeFeature(cc, f);
    if (n) map.set(String(n.id), n);
  }
  return map;
}

/** Cached admin-2 feature map for a country. */
export function loadAdmin2Features(countryCode: string): Promise<Map<string, Admin2Feature>> {
  const cc = countryCode.toUpperCase();
  let p = featureCache.get(cc);
  if (!p) {
    p = fetchAdmin2Map(cc).catch((err) => {
      featureCache.delete(cc);
      throw err;
    });
    featureCache.set(cc, p);
  }
  return p;
}

/** Features belonging to a region (state/province). */
export function admin2InRegion(
  countryCode: string,
  regionAbbrev: string,
  all: Map<string, Admin2Feature>,
): Array<[string, Admin2Feature]> {
  const cc = countryCode.toUpperCase();
  const region = regionAbbrev.toUpperCase();
  if (cc === "US") {
    const prefix = STATE_TO_FIPS[region];
    if (!prefix) return [];
    return Array.from(all.entries()).filter(([id]) => id.slice(0, 2) === prefix);
  }
  return Array.from(all.entries()).filter(
    ([, f]) => String(f.properties?.regionAbbrev ?? "").toUpperCase() === region,
  );
}

/** GeoJSON FeatureCollection for MapLibre, with fill colors from stats. */
export function admin2CollectionForRegion(
  countryCode: string,
  regionAbbrev: string,
  all: Map<string, Admin2Feature>,
  countyStats: CountyStats | null,
  defaultFill: string,
  colorFor: (perCapita: number, sorted: { perCapita: number }[]) => string,
): GeoJSON.FeatureCollection {
  const sorted = countyStats?.sortedByPerCapita ?? [];
  const features = admin2InRegion(countryCode, regionAbbrev, all).map(([id, f]) => {
    const data = countyStats?.byFips[id];
    const fill = data ? colorFor(data.perCapita, sorted) : defaultFill;
    return {
      ...f,
      properties: {
        ...f.properties,
        fips: id,
        id,
        fill,
      },
    };
  });
  return { type: "FeatureCollection", features };
}

export function buildAdmin2Stats(
  countryCode: string,
  regionAbbrev: string,
  churches: Church[],
  all: Map<string, Admin2Feature> | null | undefined,
): CountyStats | null {
  if (!regionAbbrev || !all?.size || churches.length === 0) return null;
  const regionFeatures = admin2InRegion(countryCode, regionAbbrev, all);
  if (!regionFeatures.length) return null;

  const pops = populationsFor(countryCode);
  const names: Record<string, string> = {};
  for (const [id, feat] of regionFeatures) {
    names[id] = feat.properties?.name ?? id;
  }

  const byFips: CountyStats["byFips"] = {};
  for (const church of churches) {
    let hit: string | null = null;
    for (const [id, feat] of regionFeatures) {
      if (geoContains(feat as GeoJSON.Feature, [church.lng, church.lat])) {
        hit = id;
        break;
      }
    }
    if (!hit) continue;
    const pop = pops[hit] ?? 0;
    if (!byFips[hit]) {
      byFips[hit] = {
        churchCount: 0,
        population: pop,
        perCapita: 0,
        peoplePer: 0,
        name: names[hit] ?? hit,
      };
    }
    byFips[hit].churchCount += 1;
  }

  const sortedByPerCapita: CountyStats["sortedByPerCapita"] = [];
  for (const [fips, data] of Object.entries(byFips)) {
    const pop = data.population || 1;
    const perCapita = data.churchCount / pop;
    const peoplePer = Math.round(pop / data.churchCount);
    data.perCapita = perCapita;
    data.peoplePer = peoplePer;
    sortedByPerCapita.push({
      fips,
      name: data.name,
      churchCount: data.churchCount,
      population: data.population,
      perCapita,
      peoplePer,
    });
  }
  sortedByPerCapita.sort((a, b) => b.perCapita - a.perCapita);
  return { byFips, sortedByPerCapita };
}

export function filterChurchesToAdmin2(
  churches: Church[],
  admin2Id: string | null,
  all: Map<string, Admin2Feature> | null | undefined,
): Church[] {
  if (!admin2Id || !all?.size) return churches;
  const feat = all.get(admin2Id);
  if (!feat) return churches;
  return churches.filter((ch) => geoContains(feat as GeoJSON.Feature, [ch.lng, ch.lat]));
}

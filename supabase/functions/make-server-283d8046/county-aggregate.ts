/**
 * County assignment for churches (lat/lng) using US Atlas counties topology + d3 geoContains.
 * Matches the client map’s point-in-polygon approach (see useChurchMapData).
 */
import { geoBounds, geoContains } from "npm:d3-geo@3";
import { feature } from "npm:topojson-client@3";
import { COUNTY_POPULATIONS } from "./county-populations.ts";

const COUNTIES_TOPO_URL = "https://cdn.jsdelivr.net/npm/us-atlas@3/counties-10m.json";

/** State abbrev → 2-digit FIPS prefix (no leading zero in map key — pad when comparing). */
export const STATE_TO_FIPS_PREFIX: Record<string, string> = {
  AL: "01", AK: "02", AZ: "04", AR: "05", CA: "06", CO: "08", CT: "09", DE: "10",
  FL: "12", GA: "13", HI: "15", ID: "16", IL: "17", IN: "18", IA: "19", KS: "20",
  KY: "21", LA: "22", ME: "23", MD: "24", MA: "25", MI: "26", MN: "27", MS: "28",
  MO: "29", MT: "30", NE: "31", NV: "32", NH: "33", NJ: "34", NM: "35", NY: "36",
  NC: "37", ND: "38", OH: "39", OK: "40", OR: "41", PA: "42", RI: "44", SC: "45",
  SD: "46", TN: "47", TX: "48", UT: "49", VT: "50", VA: "51", WA: "53", WV: "54",
  WI: "55", WY: "56", DC: "11",
};

let _topo: any = null;

async function loadCountiesTopo(): Promise<any> {
  if (_topo) return _topo;
  const res = await fetch(COUNTIES_TOPO_URL);
  if (!res.ok) throw new Error(`counties topo fetch failed: ${res.status}`);
  _topo = await res.json();
  return _topo;
}

export type CountyFeatureEntry = {
  fips: string;
  name: string;
  feature: any;
  bbox: [number, number, number, number]; // west, south, east, north
};

function inBBox(b: [number, number, number, number], lng: number, lat: number): boolean {
  const [west, south, east, north] = b;
  return lng >= west && lng <= east && lat >= south && lat <= north;
}

/**
 * All counties in one state as GeoJSON features (for point-in-polygon).
 */
export async function loadCountyEntriesForState(stateAbbrev: string): Promise<CountyFeatureEntry[]> {
  const pref = STATE_TO_FIPS_PREFIX[stateAbbrev.toUpperCase()];
  if (!pref) return [];
  const topo = await loadCountiesTopo();
  if (!topo?.objects?.counties) return [];
  const geojson = feature(topo, topo.objects.counties) as any;
  const out: CountyFeatureEntry[] = [];
  for (const f of geojson.features || []) {
    const id = String((f as any).id ?? "").padStart(5, "0");
    if (id.length !== 5 || !id.startsWith(pref)) continue;
    const name = String((f.properties as any)?.name ?? `County ${id}`);
    const [[west, south], [east, north]] = geoBounds(f as any);
    out.push({ fips: id, name, feature: f, bbox: [west, south, east, north] });
  }
  return out;
}

export function findCountyFips(entries: CountyFeatureEntry[], lng: number, lat: number): string | null {
  for (const { fips, feature: feat, bbox } of entries) {
    if (!inBBox(bbox, lng, lat)) continue;
    try {
      if (geoContains(feat as any, [lng, lat])) return fips;
    } catch {
      // ignore bad geometry
    }
  }
  return null;
}

export function countyPopulation(fips: string): number {
  return COUNTY_POPULATIONS[fips] ?? 0;
}

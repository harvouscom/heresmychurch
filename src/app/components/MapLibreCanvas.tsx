/**
 * MapLibreCanvas — Phase 0 (worldwide support) map engine.
 *
 * Replacement-in-progress for MapCanvas (react-simple-maps / geoAlbersUsa).
 * MapLibre GL uses Web Mercator, which — unlike geoAlbersUsa — can plot any
 * coordinate on Earth, so it is the prerequisite for showing churches outside
 * the US. See docs/future/mapbox-migration.md.
 *
 * Here's My Church is a data visualization, not a street map: a cream canvas
 * with purple choropleth regions — no roads or labels. So the base style is just
 * the app's background color, and states/counties/churches are GeoJSON layers on
 * top. A subtle street basemap can be faded in only at high (church-level) zoom.
 *
 * SCAFFOLD STATUS: states, counties, and church dots are ported. Hover/click
 * interactions and the zoom-model conversion come next; MapCanvas remains the
 * live map until this reaches parity and is wired into ChurchMap.
 */
import { memo, useEffect, useMemo, useRef, type MutableRefObject } from "react";
import {
  Map as MaplibreMap,
  type GeoJSONSource,
  type MapMouseEvent,
  type Point,
  type StyleSpecification,
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { feature } from "topojson-client";
import {
  GEO_URL,
  FIPS_TO_STATE,
  STATE_TO_FIPS,
  STATE_BOUNDS,
  getStateTier,
  getCountyPerCapitaColor,
  STATE_COUNT_TIERS,
  ACTIVE_PIN_FILL,
} from "./map-constants";
import { getSizeCategory, type Church, type StateInfo } from "./church-data";
import {
  getCountry,
  getRegion,
  getCountryByNumeric,
  getTierForCount,
  DEFAULT_COUNTRY_CODE,
  WORLD_GEO_URL,
  WORLD_COUNT_TIERS,
  type CountryConfig,
} from "../config/countries";
import type { CountrySummary } from "./api";
import { usePrefersReducedMotion } from "../hooks/usePrefersReducedMotion";
import {
  admin2CollectionForRegion,
  loadAdmin2Features,
  planarBoundsForFeature,
} from "./admin2";

/** Per-admin-2 church counts and per-capita rates, keyed by id (FIPS / CDUID). */
export type CountyStats = {
  byFips: Record<
    string,
    { churchCount: number; population: number; perCapita: number; peoplePer: number; name: string }
  >;
  sortedByPerCapita: Array<{
    fips: string;
    name: string;
    churchCount: number;
    population: number;
    perCapita: number;
    peoplePer: number;
  }>;
};

const CREAM = "#F5F0E8"; // --background (national view)
const STATE_FILL = STATE_COUNT_TIERS[0].color; // "not yet explored" tier, for states with no data
const STATE_STROKE = "#C9A0DC"; // brand purple borders (matches national view)
const STATE_FOCUSED_FILL = "#C9A0DC"; // focused state
const STATE_DIMMED_FILL = "#EDE4F3"; // non-focused states in state view
const STATE_HOVER_FILL = "#D4B8E8"; // hovered state (national view only)
/** Other countries under a country/region view — same family as state dim. */
const COUNTRY_DIMMED_FILL = "#EDE4F3";
// County choropleth defaults (match CountyGeographies in MapCanvas)
const COUNTY_FILL = "rgba(255, 255, 255, 0.8)";
const COUNTY_STROKE = "rgba(107, 33, 168, 0.25)";
const COUNTY_HOVER_FILL = "#D4B8E8";
/** Sibling counties when one county is focused. */
const COUNTY_DIMMED_FILL = "#F3EEF7";

// Street basemap for church-level navigation. Kept invisible at the national and
// state zooms so those stay a clean purple-on-cream data visualization, then
// faded in as you approach a single church — the point being to locate churches
// that have no address (docs/future/mapbox-migration.md). The choropleth fills
// fade out across the same range so the streets are legible underneath.
// Vector tiles (free, no API key) so every road, label and water body can be
// drawn in the app's own palette rather than a fixed grey bitmap.
const STREET_FADE_START = 9; // pure data-viz at and below this
const STREET_FADE_END = 12; // streets fully visible from here in

/** 0 → 1 across the fade range. */
const streetFadeIn = [
  "interpolate", ["linear"], ["zoom"],
  STREET_FADE_START, 0,
  STREET_FADE_END, 1,
];
/** 1 → `end` across the fade range (choropleth receding as streets arrive). */
const streetFadeOut = (end: number) => [
  "interpolate", ["linear"], ["zoom"],
  STREET_FADE_START, 1,
  STREET_FADE_END, end,
];

// Brand palette for the street layer. Raster basemaps ship as fixed bitmaps —
// generic grey, impossible to recolor — so the streets are drawn from vector
// tiles instead and styled here: cream land, white roads with soft purple
// casing, light purple water, deep purple labels. Same palette as the
// choropleth, so zooming in never leaves the app's visual language.
const WATER_FILL = "#E4D4F0";
const ROAD_FILL = "#FFFFFF";
const ROAD_CASING = "#D4B8E8";
const LABEL_COLOR = "#6B21A8";
const LABEL_HALO = CREAM;

const BASEMAP_STYLE: StyleSpecification = {
  version: 8,
  glyphs: "https://tiles.basemaps.cartocdn.com/fonts/{fontstack}/{range}.pbf",
  sources: {
    streets: {
      type: "vector",
      url: "https://tiles.basemaps.cartocdn.com/vector/carto.streets/v1/tiles.json",
      attribution: '© <a href="https://carto.com/">CARTO</a> © OpenStreetMap contributors',
    },
  },
  layers: [
    { id: "bg", type: "background", paint: { "background-color": CREAM } },
    {
      id: "water",
      type: "fill",
      source: "streets",
      "source-layer": "water",
      paint: { "fill-color": WATER_FILL, "fill-opacity": streetFadeIn as never },
    },
    {
      id: "road-casing",
      type: "line",
      source: "streets",
      "source-layer": "transportation",
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": ROAD_CASING,
        "line-opacity": streetFadeIn as never,
        "line-width": [
          "interpolate", ["exponential", 1.5], ["zoom"],
          10, 1.4,
          14, 5,
          18, 22,
        ],
      },
    },
    {
      id: "road",
      type: "line",
      source: "streets",
      "source-layer": "transportation",
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": ROAD_FILL,
        "line-opacity": streetFadeIn as never,
        "line-width": [
          "interpolate", ["exponential", 1.5], ["zoom"],
          10, 0.6,
          14, 3,
          18, 17,
        ],
      },
    },
    {
      id: "road-label",
      type: "symbol",
      source: "streets",
      "source-layer": "transportation_name",
      minzoom: 12,
      layout: {
        "text-field": ["get", "name"],
        "text-font": ["Open Sans Regular"],
        "text-size": 11,
        "symbol-placement": "line",
      },
      paint: {
        "text-color": LABEL_COLOR,
        "text-halo-color": LABEL_HALO,
        "text-halo-width": 1.2,
        "text-opacity": streetFadeIn as never,
      },
    },
    {
      id: "place-label",
      type: "symbol",
      source: "streets",
      "source-layer": "place",
      minzoom: 9,
      layout: {
        "text-field": ["get", "name"],
        "text-font": ["Open Sans Regular"],
        "text-size": 13,
      },
      paint: {
        "text-color": LABEL_COLOR,
        "text-halo-color": LABEL_HALO,
        "text-halo-width": 1.4,
        "text-opacity": streetFadeIn as never,
      },
    },
  ],
};

// Continental-US default view (Web Mercator zoom 0–22, not the old 1–500 scale).
export const US_DEFAULT_CENTER: [number, number] = [-98.5, 39.5];
export const US_DEFAULT_ZOOM = 3.4;
/** World choropleth framing — keep in sync with the camera effect. */
const WORLD_CENTER: [number, number] = [0, 20];
const WORLD_ZOOM = 1.35;

interface MapLibreCanvasProps {
  /** [lng, lat] center. */
  center?: [number, number];
  /** MapLibre zoom (0–22). */
  zoom?: number;
  /** ISO 3166-1 alpha-2 country being browsed; selects the boundary source. */
  countryCode?: string;
  /** world | country | region — world draws countries-110m choropleth. */
  viewLevel?: "world" | "country" | "region";
  /** Country summaries for the world choropleth. */
  countries?: CountrySummary[];
  /** State list with church counts; drives the choropleth tier coloring. */
  states?: StateInfo[];
  /** Abbrev of the focused state; shows counties and dims other states. */
  focusedState?: string | null;
  /**
   * Region the URL is pointing at, which is known the instant a state is
   * clicked — whereas `focusedState` only flips once the loading overlay
   * finishes its verses (~7s). The camera keys off these so the map starts
   * flying immediately; the layers still follow `focusedState`.
   */
  cameraState?: string | null;
  cameraCounty?: string | null;
  /** Churches to plot as dots. */
  churches?: Church[];
  /** Currently selected church — drawn as the "you are here" pin. */
  selectedChurchId?: string | null;
  /** Per-county church/population stats; drives the per-capita choropleth. */
  countyStats?: CountyStats | null;
  /** Currently focused county FIPS. */
  focusedCounty?: string | null;
  /**
   * Zoom the camera to the focused state's bounds (and back out when cleared).
   * Set false if the parent drives the camera itself via center/zoom.
   */
  fitToFocusedState?: boolean;
  /**
   * Screen space the detail panel covers, kept clear of the camera so the
   * selected church centres in what's actually visible rather than behind the
   * panel — bottom on mobile, right on desktop. Replaces the Albers/viewBox
   * specific getMobileLatOffset() math.
   */
  bottomPadding?: number;
  rightPadding?: number;
  /**
   * Called after the user finishes moving the map. `bounds` is the visible
   * extent as [[west, south], [east, north]] — this is what replaces
   * MapSearchBar's geoAlbersUsa projection math for "churches in view".
   */
  onMoveEnd?: (
    center: [number, number],
    zoom: number,
    bounds: [[number, number], [number, number]],
  ) => void;
  onStateClick?: (abbrev: string) => void;
  onStateHover?: (abbrev: string | null) => void;
  /** World view: click a populated country to open its region choropleth. */
  onCountryClick?: (countryCode: string) => void;
  onCountyClick?: (fips: string) => void;
  onCountyHover?: (fips: string | null) => void;
  onChurchClick?: (church: Church) => void;
  onChurchHover?: (church: Church | null) => void;
  /** Clicking empty canvas / outside the focused state. */
  onResetView?: () => void;
  /**
   * The user zoomed out far enough that the focused region no longer fills the
   * view — the gesture that steps county → state → national. Expressed as a
   * bounds comparison rather than a zoom threshold, so it needs no per-region
   * constants and holds for any country's subdivisions.
   */
  onZoomedOutPastRegion?: () => void;
  /**
   * Populated with imperative map controls so the app's own chrome (the styled
   * zoom buttons) can drive the camera. The app's zoom state is in the legacy
   * 1–500 Albers scale, which is meaningless here, so those buttons call these
   * instead of writing a zoom number.
   */
  apiRef?: MutableRefObject<MapLibreHandle | null>;
}

/** Imperative controls exposed via `apiRef`. */
export interface MapLibreHandle {
  zoomIn: () => void;
  zoomOut: () => void;
}

/** Topmost-first hit-test order: a church dot beats the county beneath it. */
const HIT_LAYERS = ["churches", "counties-fill", "states-fill"];

/**
 * Zoom model: the SVG map used a bespoke 1–500 Albers scale with a hand-tuned
 * getStateZoom() per state. MapLibre uses Web Mercator zoom 0–22 and can derive
 * the right zoom from the region's bounding box, so fitBounds replaces that
 * lookup table entirely — and works for any country's regions, not just US
 * states. STATE_BOUNDS is [south, west, north, east]; MapLibre wants
 * [[west, south], [east, north]].
 */
function boundsForState(
  abbrev: string,
  countryCode: string = DEFAULT_COUNTRY_CODE,
): [[number, number], [number, number]] | null {
  // US states keep their hand-tuned table; other countries read the generated
  // registry, whose bounds come from the same Natural Earth geometry the map
  // draws — so the fit always matches the shape on screen.
  const b = STATE_BOUNDS[abbrev] ?? getRegion(countryCode, abbrev)?.bounds;
  if (!b) return null;
  const [south, west, north, east] = b;
  return [
    [west, south],
    [east, north],
  ];
}

/** Bounding box of a single admin-2 unit (US county / CA census division). */
async function boundsForCounty(
  admin2Id: string,
  countryCode: string = DEFAULT_COUNTRY_CODE,
): Promise<[[number, number], [number, number]] | null> {
  try {
    const all = await loadAdmin2Features(countryCode);
    const match = all.get(admin2Id);
    if (!match) return null;
    // Planar bbox — d3 geoBounds returns the whole globe on simplified CA
    // MultiPolygons with degenerate rings after mapshaper.
    return planarBoundsForFeature(match as GeoJSON.Feature);
  } catch {
    return null;
  }
}

/**
 * True when the viewport is `factor`× larger than the region in both
 * dimensions — i.e. the user has zoomed well past it, not merely nudged out.
 */
function viewportExceedsRegion(
  view: [[number, number], [number, number]],
  region: [[number, number], [number, number]],
  factor: number,
) {
  const viewW = view[1][0] - view[0][0];
  const viewH = view[1][1] - view[0][1];
  const regionW = region[1][0] - region[0][0];
  const regionH = region[1][1] - region[0][1];
  return viewW > regionW * factor && viewH > regionH * factor;
}

/** How much larger than the region the view must get before stepping out. */
const ZOOM_OUT_FACTOR = 1.6;

/**
 * How far below the fitted zoom the user may pull out while a region is
 * focused. One zoom level doubles the visible span — enough to cross
 * ZOOM_OUT_FACTOR (1.6×) and trigger the step back up a level, but not enough
 * to leave the region and stare at the whole country or globe first.
 */
const ZOOM_OUT_ALLOWANCE = 1;

/**
 * Country → world uses a zoom delta instead of bbox size. US (and some others)
 * have Alaska/Hawaii-style extents that make "viewport > 1.6× country" almost
 * impossible, so pinch-out never left the country view.
 */
const COUNTRY_ZOOM_OUT_DELTA = 0.95;
/** Min zoom floor sits a bit below the step-out trigger so the gesture can fire. */
const COUNTRY_ZOOM_OUT_FLOOR_EXTRA = 0.55;

/**
 * A country's full extent, unioned from its region bounds. Derived rather than
 * configured so it can never disagree with the regions actually drawn.
 */
function boundsForCountry(countryCode: string): [[number, number], [number, number]] | null {
  const regions = Object.values(getCountry(countryCode)?.regions ?? {});
  if (!regions.length) return null;
  let s = 90, w = 180, n = -90, e = -180;
  for (const r of regions) {
    const [rs, rw, rn, re] = r.bounds;
    if (rs < s) s = rs;
    if (rw < w) w = rw;
    if (rn > n) n = rn;
    if (re > e) e = re;
  }
  return [[w, s], [e, n]];
}

/** Leaves room for the UI chrome around the fitted region. */
const FIT_PADDING = 40;
const VIEW_TRANSITION_MS = 800;
/**
 * Web Mercator zoom for the church detail view. Building level, so the view is
 * essentially the selected church and its street rather than its whole town.
 */
const CHURCH_VIEW_ZOOM = 16;
/** Matches the app's existing zoom-button transition feel. */
const ZOOM_STEP_MS = 320;

/**
 * Run a layer mutation once the style is actually ready.
 *
 * MapLibre throws "Style is not done loading" if you add a source/layer too
 * early, and the `load` event alone is not a sufficient guard (data arrives
 * asynchronously, and HMR can remount against a fresh map). Errors are logged
 * rather than thrown so a transient map failure can never crash the React tree.
 */
function whenStyleReady(map: MaplibreMap, fn: () => void) {
  const run = () => {
    try {
      fn();
    } catch (err) {
      console.error("[maplibre] layer update failed", err);
    }
  };
  const ready = () => {
    try {
      return map.isStyleLoaded();
    } catch {
      return false; // map was removed
    }
  };
  if (ready()) return run();
  // Poll rather than wait on a single `styledata`/`load` event: those can fire
  // while the style is still busy (e.g. a large GeoJSON source is tiling) and
  // then never fire again once it settles, stranding the update forever.
  let tries = 0;
  const tick = () => {
    if (ready()) return run();
    if (++tries > 200) {
      console.warn("[maplibre] style never became ready; skipping layer update");
      return;
    }
    setTimeout(tick, 50);
  };
  setTimeout(tick, 50);
}

// Canonical bottom→top draw order. Layers are added asynchronously (each waits
// on a TopoJSON fetch or an API call), so insertion order is not reliable —
// re-assert the stacking explicitly after any layer is added.
// world-context sits under the active country regions so gray neighbors frame focus.
const LAYER_ORDER = [
  "world-context-fill",
  "world-context-line",
  "states-fill",
  "states-line",
  "counties-fill",
  "counties-line",
  "churches",
];

function enforceLayerOrder(map: MaplibreMap) {
  // moveLayer without a beforeId moves the layer to the top, so walking the
  // list bottom→top leaves them in exactly this order.
  for (const id of LAYER_ORDER) {
    if (map.getLayer(id)) map.moveLayer(id);
  }
}

// Cache the (large) boundary files so repeated recolors don't refetch them.
const topoCache = new Map<string, Promise<any>>();
function fetchTopo(url: string): Promise<any> {
  let p = topoCache.get(url);
  if (!p) {
    p = fetch(url).then((r) => r.json());
    topoCache.set(url, p);
  }
  return p;
}

/**
 * Add US state polygons as a branded GeoJSON choropleth (purple by church-count
 * tier on cream), matching the current SVG national view. us-atlas ships
 * TopoJSON, which we convert to GeoJSON with topojson-client, then join each
 * state to its church count (by FIPS→abbrev) and precompute the tier color as a
 * feature property so MapLibre can style it data-driven.
 */
/**
 * Region outlines for a country, normalised so every feature carries `abbrev`.
 *
 * The US comes from us-atlas TopoJSON keyed by FIPS; other countries come from
 * pre-extracted Natural Earth GeoJSON that already carries `abbrev`
 * (scripts/generate-admin1.mjs). Normalising here means the layer code below
 * never has to know which country it is drawing.
 */
/** Cached admin-1 FeatureCollections (geometry only — callers clone props). */
const regionFeaturesCache = new Map<string, Promise<GeoJSON.FeatureCollection>>();

/** Warm admin-1 boundaries so country → region doesn't wait on the network. */
function prefetchRegionFeatures(countryCode: string) {
  const cc = countryCode.toUpperCase();
  if (!cc || !getCountry(cc)) return;
  void loadRegionFeatures(cc).catch(() => {
    regionFeaturesCache.delete(cc);
  });
}

async function loadRegionFeatures(countryCode: string): Promise<GeoJSON.FeatureCollection> {
  const cc = countryCode.toUpperCase();
  let cached = regionFeaturesCache.get(cc);
  if (!cached) {
    cached = (async () => {
      if (cc === "US") {
        const topo = await fetchTopo(GEO_URL);
        const geo = feature(topo, topo.objects.states) as GeoJSON.FeatureCollection;
        for (const f of geo.features) {
          f.properties = { ...f.properties, abbrev: FIPS_TO_STATE[String(f.id).padStart(2, "0")] };
        }
        return geo;
      }
      const url = getCountry(cc)?.regionSourceUrl;
      if (!url) throw new Error(`No boundary source for country ${cc}`);
      const res = await fetch(url);
      if (!res.ok) throw new Error(`${url} -> ${res.status}`);
      return (await res.json()) as GeoJSON.FeatureCollection;
    })();
    regionFeaturesCache.set(cc, cached);
  }
  const base = await cached;
  // Clone so fill/count joins don't mutate the cache.
  return {
    type: "FeatureCollection",
    features: base.features.map((f) => ({
      ...f,
      properties: { ...f.properties },
    })),
  };
}

/** Antarctica spans the full southern edge and paints huge bands in Mercator. */
const ANTARCTICA_ISO = "010";

type LngLat = [number, number];

/**
 * World-atlas countries-110m attaches far-flung overseas polygons to the same
 * ISO id (France includes Guyane in South America). Keep only parts whose
 * centroid sits in the metropolitan bbox so /world matches our region maps.
 */
const METROPOLITAN_POLYGON_BBOX: Record<
  string,
  { minLng: number; maxLng: number; minLat: number; maxLat: number }
> = {
  // France: metropolitan hexagon + Corsica; drop Guyane (and any other DROM).
  "250": { minLng: -10, maxLng: 12, minLat: 40, maxLat: 52 },
};

function polygonCentroid(poly: LngLat[][]): LngLat {
  const ring = poly[0] ?? [];
  let lng = 0;
  let lat = 0;
  const n = Math.max(ring.length, 1);
  for (const p of ring) {
    lng += p[0];
    lat += p[1];
  }
  return [lng / n, lat / n];
}

/** Drop overseas MultiPolygon parts that sit outside a country's metro bbox. */
function keepMetropolitanCountryParts(f: GeoJSON.Feature): GeoJSON.Feature {
  const num = String(f.id ?? "").padStart(3, "0");
  const box = METROPOLITAN_POLYGON_BBOX[num];
  const g = f.geometry;
  if (!box || !g || (g.type !== "Polygon" && g.type !== "MultiPolygon")) return f;
  const polys = (g.type === "Polygon" ? [g.coordinates] : g.coordinates) as LngLat[][][];
  const kept = polys.filter((poly) => {
    const [lng, lat] = polygonCentroid(poly);
    return (
      lng >= box.minLng &&
      lng <= box.maxLng &&
      lat >= box.minLat &&
      lat <= box.maxLat
    );
  });
  if (!kept.length || kept.length === polys.length) return f;
  return {
    ...f,
    geometry:
      kept.length === 1
        ? { type: "Polygon", coordinates: kept[0] }
        : { type: "MultiPolygon", coordinates: kept },
  };
}

/** Unwrap a ring so successive longitudes are continuous (no ±360 jumps). */
function unwrapRing(ring: LngLat[]): LngLat[] {
  const out: LngLat[] = [[ring[0][0], ring[0][1]]];
  for (let i = 1; i < ring.length; i++) {
    let lng = ring[i][0];
    const prev = out[out.length - 1][0];
    while (lng - prev > 180) lng -= 360;
    while (lng - prev < -180) lng += 360;
    out.push([lng, ring[i][1]]);
  }
  return out;
}

/**
 * Split a ring that crosses the antimeridian into pieces that each sit inside
 * one [-180, 180] world copy. MapLibre otherwise fills the shortest path across
 * the map — the horizontal purple slabs over Canada/the Arctic (Russia/Fiji).
 */
function cutRingAtAntimeridian(ring: LngLat[]): LngLat[][] {
  if (ring.length < 4) return [ring];
  const unwrapped = unwrapRing(ring);
  const lngs = unwrapped.map((p) => p[0]);
  const min = Math.min(...lngs);
  const max = Math.max(...lngs);
  if (max - min <= 180 && min >= -180 && max <= 180) return [ring];

  const parts: LngLat[][] = [];
  const kMin = Math.floor((min + 180) / 360);
  const kMax = Math.floor((max + 180) / 360);
  for (let k = kMin; k <= kMax; k++) {
    const left = -180 + 360 * k;
    const right = 180 + 360 * k;
    const clipped: LngLat[] = [];
    const push = (lng: number, lat: number) => {
      const p: LngLat = [lng - 360 * k, lat];
      const prev = clipped[clipped.length - 1];
      if (!prev || prev[0] !== p[0] || prev[1] !== p[1]) clipped.push(p);
    };
    for (let i = 0; i < unwrapped.length - 1; i++) {
      const [ax, ay] = unwrapped[i];
      const [bx, by] = unwrapped[i + 1];
      const inA = ax >= left && ax <= right;
      const inB = bx >= left && bx <= right;
      if (inA) push(ax, ay);
      if (inA !== inB && ax !== bx) {
        for (const edge of [left, right]) {
          if ((ax - edge) * (bx - edge) > 0) continue;
          const t = (edge - ax) / (bx - ax);
          if (t >= 0 && t <= 1) push(edge, ay + t * (by - ay));
        }
      }
    }
    const last = unwrapped[unwrapped.length - 1];
    if (last[0] >= left && last[0] <= right) push(last[0], last[1]);
    if (clipped.length < 3) continue;
    const first = clipped[0];
    const end = clipped[clipped.length - 1];
    if (first[0] !== end[0] || first[1] !== end[1]) clipped.push([first[0], first[1]]);
    if (clipped.length >= 4) parts.push(clipped);
  }
  return parts.length ? parts : [ring];
}

function cutPolygonAtAntimeridian(poly: LngLat[][]): LngLat[][][] {
  const outerParts = cutRingAtAntimeridian(poly[0] as LngLat[]);
  const out: LngLat[][][] = [];
  for (const outer of outerParts) {
    const oAvg = outer.reduce((s, p) => s + p[0], 0) / outer.length;
    const rings: LngLat[][] = [outer];
    for (let h = 1; h < poly.length; h++) {
      for (const hole of cutRingAtAntimeridian(poly[h] as LngLat[])) {
        const hAvg = hole.reduce((s, p) => s + p[0], 0) / hole.length;
        if (Math.abs(oAvg - hAvg) < 90) rings.push(hole);
      }
    }
    out.push(rings);
  }
  return out;
}

/** Cut Russia/Fiji-style wraps so fills stay clipped to country outlines. */
function cutAntimeridianFeature(f: GeoJSON.Feature): GeoJSON.Feature {
  const g = f.geometry;
  if (!g || (g.type !== "Polygon" && g.type !== "MultiPolygon")) return f;
  const polys = g.type === "Polygon" ? [g.coordinates] : g.coordinates;
  const outPolys: LngLat[][][] = [];
  for (const poly of polys) outPolys.push(...cutPolygonAtAntimeridian(poly as LngLat[][]));
  if (!outPolys.length) return f;
  return {
    ...f,
    geometry:
      outPolys.length === 1
        ? { type: "Polygon", coordinates: outPolys[0] }
        : { type: "MultiPolygon", coordinates: outPolys },
  };
}

/** Cached, antimeridian-safe world countries (geometry only — clone props per use). */
let worldCountryCollectionPromise: Promise<GeoJSON.FeatureCollection> | null = null;

/**
 * World-atlas countries as GeoJSON, without Antarctica / overseas exclaves, and
 * with antimeridian rings split so Mercator fills don't paint ocean slabs.
 */
async function loadWorldCountryCollection(): Promise<GeoJSON.FeatureCollection> {
  if (!worldCountryCollectionPromise) {
    worldCountryCollectionPromise = (async () => {
      const topo = await fetchTopo(WORLD_GEO_URL);
      const geo = feature(topo, topo.objects.countries) as GeoJSON.FeatureCollection;
      return {
        type: "FeatureCollection",
        features: geo.features
          .filter((f) => String(f.id ?? "").padStart(3, "0") !== ANTARCTICA_ISO)
          .map(keepMetropolitanCountryParts)
          .map(cutAntimeridianFeature),
      };
    })();
  }
  const base = await worldCountryCollectionPromise;
  // Clone features/properties so callers can attach fill/count without mutating cache.
  return {
    type: "FeatureCollection",
    features: base.features.map((f) => ({
      ...f,
      properties: { ...f.properties },
    })),
  };
}

/** Track tile buffer per source — MapLibre can't change buffer via setData. */
const polygonSourceBuffer = new Map<string, number>();

/**
 * Upsert a polygon GeoJSON source.
 * Prefer buffer ≥ 128 — geojson-vt with buffer 0 paints faint tile-seam grids across land.
 */
function upsertPolygonSource(
  map: MaplibreMap,
  id: string,
  data: GeoJSON.FeatureCollection,
  opts: { buffer?: number; layerIds?: string[] } = {},
) {
  const buffer = opts.buffer ?? 128;
  const src = map.getSource(id) as GeoJSONSource | undefined;
  if (src && polygonSourceBuffer.get(id) === buffer) {
    src.setData(data);
    return;
  }
  for (const lid of opts.layerIds ?? []) {
    if (map.getLayer(lid)) map.removeLayer(lid);
  }
  if (src) map.removeSource(id);
  map.addSource(id, { type: "geojson", data, buffer });
  polygonSourceBuffer.set(id, buffer);
}

function clearWorldContextLayer(map: MaplibreMap) {
  if (map.getLayer("world-context-line")) map.removeLayer("world-context-line");
  if (map.getLayer("world-context-fill")) map.removeLayer("world-context-fill");
  if (map.getSource("world-context")) map.removeSource("world-context");
  polygonSourceBuffer.delete("world-context");
}

/** Feature property → string, or null (never the literal "undefined"). */
function propStr(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v);
  return s && s !== "undefined" && s !== "null" ? s : null;
}

/** GeoJSON→vector-tile round-trips sometimes stringify booleans. */
function propTruthy(v: unknown): boolean {
  return v === true || v === 1 || v === "true" || v === "1";
}

/**
 * Gray underlay of every country except the one being browsed. Keeps world
 * geography visible when the active choropleth is only that country's regions.
 * Not in HIT_LAYERS — clicks pass through to regions / empty → reset.
 */
async function setWorldContextLayer(
  map: MaplibreMap,
  focusedCountryCode: string,
  isCurrent?: () => boolean,
) {
  let geo: GeoJSON.FeatureCollection;
  try {
    geo = await loadWorldCountryCollection();
  } catch (err) {
    console.error("[maplibre] failed to load world context boundaries", err);
    return;
  }
  if (isCurrent && !isCurrent()) return;
  const focused = focusedCountryCode.toUpperCase();
  for (const f of geo.features) {
    const num = String(f.id ?? "").padStart(3, "0");
    const cfg = getCountryByNumeric(num);
    f.properties = {
      ...f.properties,
      isoNumeric: num,
      countryCode: cfg?.code ?? "",
    };
  }
  whenStyleReady(map, () => {
    if (isCurrent && !isCurrent()) return;
    // Default tile buffer — buffer 0 left hairline seams across Canada/Mexico.
    upsertPolygonSource(map, "world-context", geo, {
      buffer: 128,
      layerIds: ["world-context-fill", "world-context-line"],
    });

    // Omit the focused country so the regions choropleth owns that area.
    const notFocused: unknown = ["!=", ["get", "countryCode"], focused];

    if (!map.getLayer("world-context-fill")) {
      map.addLayer({
        id: "world-context-fill",
        type: "fill",
        source: "world-context",
        filter: notFocused as never,
        paint: {
          "fill-color": COUNTRY_DIMMED_FILL,
          "fill-opacity": streetFadeOut(0) as never,
        },
      });
    } else {
      map.setFilter("world-context-fill", notFocused as never);
    }
    if (!map.getLayer("world-context-line")) {
      map.addLayer({
        id: "world-context-line",
        type: "line",
        source: "world-context",
        filter: notFocused as never,
        paint: {
          "line-color": STATE_STROKE,
          "line-width": 0.35,
          "line-opacity": streetFadeOut(0.25) as never,
        },
      });
    } else {
      map.setFilter("world-context-line", notFocused as never);
    }
    enforceLayerOrder(map);
  });
}

async function setWorldLayer(
  map: MaplibreMap,
  countries: CountrySummary[],
  isCurrent?: () => boolean,
) {
  let geo: GeoJSON.FeatureCollection;
  try {
    geo = await loadWorldCountryCollection();
  } catch (err) {
    console.error("[maplibre] failed to load world boundaries", err);
    return;
  }
  // Leaving /world invalidates this — don't overwrite US/CA state polygons.
  if (isCurrent && !isCurrent()) return;
  const byNumeric = new Map(countries.map((c) => [String(c.isoNumeric).padStart(3, "0"), c]));
  for (const f of geo.features) {
    const num = String(f.id ?? "").padStart(3, "0");
    const summary = byNumeric.get(num);
    const cfg = getCountryByNumeric(num);
    const count = summary?.churchCount ?? 0;
    // Supported + populated countries drill into their region choropleth (US states,
    // CA provinces, etc.). Others stay visible but aren't click targets.
    const clickable = !!cfg && !!summary?.isPopulated;
    f.properties = {
      ...f.properties,
      isoNumeric: num,
      countryCode: cfg?.code ?? null,
      clickable,
      count,
      fill: getTierForCount(WORLD_COUNT_TIERS, count).color,
    };
    if (clickable && cfg?.code) prefetchRegionFeatures(cfg.code);
  }
  whenStyleReady(map, () => {
    if (isCurrent && !isCurrent()) return;
    // Drop the country underlay / counties so they can't stack over the world
    // choropleth (async races used to leave both and paint purple slabs).
    clearWorldContextLayer(map);
    if (map.getLayer("counties-line")) map.removeLayer("counties-line");
    if (map.getLayer("counties-fill")) map.removeLayer("counties-fill");
    if (map.getSource("counties")) map.removeSource("counties");

    // Antimeridian rings are pre-cut in loadWorldCountryCollection. Use a normal
    // tile buffer so geojson-vt doesn't paint the faint lat/lng seam grid across
    // land (buffer: 0 caused those hairlines on available and coming-soon countries).
    upsertPolygonSource(map, "states", geo, {
      buffer: 128,
      layerIds: ["states-fill", "states-line"],
    });
    if (!map.getLayer("states-fill")) {
      map.addLayer({
        id: "states-fill",
        type: "fill",
        source: "states",
        paint: { "fill-color": ["get", "fill"], "fill-opacity": 1 as never },
      });
    } else {
      map.setPaintProperty("states-fill", "fill-color", ["get", "fill"] as never);
      map.setPaintProperty("states-fill", "fill-opacity", 1 as never);
    }
    if (!map.getLayer("states-line")) {
      map.addLayer({
        id: "states-line",
        type: "line",
        source: "states",
        paint: { "line-color": STATE_STROKE, "line-width": 0.4, "line-opacity": 0.5 as never },
      });
    } else {
      map.setPaintProperty("states-line", "line-width", 0.4);
      map.setPaintProperty("states-line", "line-opacity", 0.5 as never);
    }
    enforceLayerOrder(map);
  });
}

async function setStatesLayer(
  map: MaplibreMap,
  states: StateInfo[],
  countryCode: string,
  focusedState: string | null = null,
  /** Skip applying if a newer choropleth update has started. */
  isCurrent?: () => boolean,
) {
  let geo: GeoJSON.FeatureCollection;
  try {
    geo = await loadRegionFeatures(countryCode);
  } catch (err) {
    console.error("[maplibre] failed to load region boundaries", err);
    return;
  }
  if (isCurrent && !isCurrent()) return;

  const tiers = getCountry(countryCode)?.countTiers ?? WORLD_COUNT_TIERS;
  const countByAbbrev = new Map(states.map((s) => [s.abbrev, s.churchCount]));
  for (const f of geo.features) {
    const abbrev = f.properties?.abbrev as string | undefined;
    const count = abbrev ? countByAbbrev.get(abbrev) ?? 0 : 0;
    f.properties = { ...f.properties, abbrev, count, fill: states.length ? getTierForCount(tiers, count).color : STATE_FILL };
  }

  whenStyleReady(map, () => {
    if (isCurrent && !isCurrent()) return;
    // Concurrent calls can both reach here before either adds the source, so
    // guard the source and each layer independently.
    upsertPolygonSource(map, "states", geo, {
      buffer: 128,
      layerIds: ["states-fill", "states-line"],
    });

    if (!map.getLayer("states-fill")) {
      map.addLayer({
        id: "states-fill",
        type: "fill",
        source: "states",
        // Recedes entirely at church-level zoom so the streets show through.
        paint: {
          "fill-color": statesFillExpression(focusedState, null) as never,
          "fill-opacity": streetFadeOut(0) as never,
        },
      });
    } else {
      // World view used a constant opacity / fill; restore country choropleth paint.
      map.setPaintProperty("states-fill", "fill-opacity", streetFadeOut(0) as never);
      applyStatePaint(map, focusedState, null);
    }
    if (!map.getLayer("states-line")) {
      map.addLayer({
        id: "states-line",
        type: "line",
        source: "states",
        // Borders stay as faint context once the streets take over.
        paint: {
          "line-color": STATE_STROKE,
          "line-width": 0.75,
          "line-opacity": streetFadeOut(0.55) as never,
        },
      });
    } else {
      // Coming from world (thinner country outlines) — restore region separators.
      map.setPaintProperty("states-line", "line-color", STATE_STROKE);
      map.setPaintProperty("states-line", "line-width", 0.75);
      map.setPaintProperty("states-line", "line-opacity", streetFadeOut(0.55) as never);
    }
    enforceLayerOrder(map);
  });
}

/**
 * State fill: focus wins over hover (matching MapCanvas, where hover only
 * highlights in the national view), otherwise fall back to the tier color.
 */
function statesFillExpression(focusedState: string | null, hoveredState: string | null) {
  if (focusedState) {
    // Sibling hover: lift a dimmed neighbor so it reads as a click target.
    if (hoveredState && hoveredState !== focusedState) {
      return [
        "case",
        ["==", ["get", "abbrev"], focusedState], STATE_FOCUSED_FILL,
        ["==", ["get", "abbrev"], hoveredState], STATE_HOVER_FILL,
        STATE_DIMMED_FILL,
      ];
    }
    return ["case", ["==", ["get", "abbrev"], focusedState], STATE_FOCUSED_FILL, STATE_DIMMED_FILL];
  }
  if (hoveredState) {
    return ["case", ["==", ["get", "abbrev"], hoveredState], STATE_HOVER_FILL, ["get", "fill"]];
  }
  return ["get", "fill"];
}

/**
 * County fill: focused county highlights; siblings dim (same cue as state focus).
 * Hover still highlights when no county is focused, or over a dim sibling.
 */
function countiesFillExpression(hoveredCounty: string | null, focusedCounty: string | null) {
  if (focusedCounty) {
    const cases: unknown[] = ["case", ["==", ["get", "fips"], focusedCounty], COUNTY_HOVER_FILL];
    if (hoveredCounty && hoveredCounty !== focusedCounty) {
      cases.push(["==", ["get", "fips"], hoveredCounty], STATE_HOVER_FILL);
    }
    cases.push(COUNTY_DIMMED_FILL);
    return cases;
  }
  if (hoveredCounty) {
    return ["case", ["==", ["get", "fips"], hoveredCounty], COUNTY_HOVER_FILL, ["get", "fill"]];
  }
  return ["get", "fill"];
}

function applyStatePaint(map: MaplibreMap, focusedState: string | null, hoveredState: string | null) {
  whenStyleReady(map, () => {
    if (!map.getLayer("states-fill")) return;
    map.setPaintProperty("states-fill", "fill-color", statesFillExpression(focusedState, hoveredState) as never);
  });
}

function applyCountyPaint(map: MaplibreMap, hoveredCounty: string | null, focusedCounty: string | null) {
  whenStyleReady(map, () => {
    if (!map.getLayer("counties-fill")) return;
    map.setPaintProperty(
      "counties-fill",
      "fill-color",
      countiesFillExpression(hoveredCounty, focusedCounty) as never,
    );
  });
}

/**
 * Show admin-2 polygons for the focused region (US counties / CA census
 * divisions). Source and filter come from CountryConfig.hasAdmin2.
 */
async function setCountyLayer(
  map: MaplibreMap,
  focusedState: string | null,
  countyStats: CountyStats | null,
  hoveredCounty: string | null,
  focusedCounty: string | null,
  countryCode: string = DEFAULT_COUNTRY_CODE,
) {
  const clear = () => {
    whenStyleReady(map, () => {
      if (map.getLayer("counties-line")) map.removeLayer("counties-line");
      if (map.getLayer("counties-fill")) map.removeLayer("counties-fill");
      if (map.getSource("counties")) map.removeSource("counties");
    });
  };

  const cfg = getCountry(countryCode);
  if (!focusedState || !cfg?.hasAdmin2) return clear();

  let geo: GeoJSON.FeatureCollection;
  try {
    const all = await loadAdmin2Features(countryCode);
    geo = admin2CollectionForRegion(
      countryCode,
      focusedState,
      all,
      countyStats,
      COUNTY_FILL,
      getCountyPerCapitaColor,
    );
    if (!geo.features.length) return clear();
  } catch (err) {
    console.error("[maplibre] failed to load admin-2 boundaries", err);
    return;
  }

  whenStyleReady(map, () => {
    const src = map.getSource("counties") as GeoJSONSource | undefined;
    if (src) src.setData(geo);
    else map.addSource("counties", { type: "geojson", data: geo, buffer: 128 });

    if (!map.getLayer("counties-fill")) {
      map.addLayer({
        id: "counties-fill",
        type: "fill",
        source: "counties",
        paint: {
          "fill-color": countiesFillExpression(hoveredCounty, focusedCounty) as never,
          "fill-opacity": streetFadeOut(0) as never,
        },
      });
    } else {
      applyCountyPaint(map, hoveredCounty, focusedCounty);
    }
    if (!map.getLayer("counties-line")) {
      map.addLayer({
        id: "counties-line",
        type: "line",
        source: "counties",
        paint: {
          "line-color": COUNTY_STROKE,
          "line-width": 0.4,
          "line-opacity": streetFadeOut(0.35) as never,
        },
      });
    }
    enforceLayerOrder(map);
  });
}

/**
 * Render churches as a MapLibre circle layer. Replaces ChurchDots' SVG circles:
 * radius and color come from the same getSizeCategory() attendance bands, set as
 * feature properties for data-driven styling. MapLibre culls off-screen features
 * itself, so the manual viewport culling in ChurchDots is no longer needed.
 */
/** Paint for the individual-church dots; selection only changes these. */
function churchPaint(selectedChurchId: string | null) {
  // The selected church is drawn as a distinct "you are here" pin: deeper
  // purple with a white ring, matching the old ChurchDots active marker.
  const isSelected = ["==", ["get", "id"], selectedChurchId ?? "__no_selection__"];
  const radius = ["get", "radius"];
  // Region/county framing sits around zoom 5–8; the old 0.35–0.7 scale made
  // attendance dots into pinpricks on Ontario-sized views. Floor + higher mid
  // multipliers keep the initial region view readable without ballooning at
  // church-level zoom.
  const unselected = (factor: number, minPx: number) =>
    ["max", minPx, ["*", radius, factor]] as unknown[];
  return {
    // One zoom interpolation with the selection branch inside each stop —
    // MapLibre permits only a single zoom-based interpolate per expression, so
    // two of them under a `case` is rejected outright and nothing renders.
    //
    // Unselected dots keep the attendance scale, mirroring how the SVG dots
    // grew with zoom. The selected pin is a marker rather than a data point, so
    // it ramps gently: on the attendance scale it would exceed 30px at
    // church-view zoom, covering the building it is pointing at.
    "circle-radius": [
      "interpolate", ["linear"], ["zoom"],
      3, ["case", isSelected, 6, unselected(0.45, 2.5)],
      5, ["case", isSelected, 7, unselected(1.1, 3.5)],
      7, ["case", isSelected, 8, unselected(1.35, 4)],
      10, ["case", isSelected, 9, unselected(1.55, 4.5)],
      14, ["case", isSelected, 11, ["*", radius, 2.2]],
      16, ["case", isSelected, 12, ["*", radius, 2.2]],
    ],
    "circle-color": ["case", isSelected, ACTIVE_PIN_FILL, ["get", "color"]],
    "circle-opacity": ["case", isSelected, 1, 0.85],
    "circle-stroke-width": ["case", isSelected, 2, 0],
    "circle-stroke-color": "#FFFFFF",
  };
}

/**
 * Build the church source and its three layers.
 *
 * Every church is its own dot, sized by attendance — dense areas read as a
 * mass of overlapping dots, which is the intended texture.
 */
function setChurchData(map: MaplibreMap, churches: Church[], selectedChurchId: string | null) {
  const geo: GeoJSON.FeatureCollection = {
    type: "FeatureCollection",
    features: churches.map((ch) => {
      const cat = getSizeCategory(ch.attendance);
      return {
        type: "Feature",
        geometry: { type: "Point", coordinates: [ch.lng, ch.lat] },
        properties: { id: ch.id, name: ch.name, radius: cat.radius, color: cat.color },
      };
    }),
  };

  whenStyleReady(map, () => {
    const src = map.getSource("churches") as GeoJSONSource | undefined;
    if (src) src.setData(geo);
    else {
      map.addSource("churches", { type: "geojson", data: geo });
    }

    if (!map.getLayer("churches")) {
      map.addLayer({
        id: "churches",
        type: "circle",
        source: "churches",
        paint: churchPaint(selectedChurchId) as never,
      });
    }
    enforceLayerOrder(map);
  });
}

/** Selection changes paint only — never the source, which would re-tile everything. */
function setChurchSelection(map: MaplibreMap, selectedChurchId: string | null) {
  whenStyleReady(map, () => {
    if (!map.getLayer("churches")) return;
    for (const [prop, value] of Object.entries(churchPaint(selectedChurchId))) {
      map.setPaintProperty("churches", prop, value as never);
    }
  });
}

export const MapLibreCanvas = memo(function MapLibreCanvas({
  center = US_DEFAULT_CENTER,
  zoom = US_DEFAULT_ZOOM,
  countryCode = DEFAULT_COUNTRY_CODE,
  viewLevel = "country",
  countries = [],
  states,
  focusedState = null,
  cameraState,
  cameraCounty,
  churches,
  selectedChurchId = null,
  countyStats = null,
  focusedCounty = null,
  fitToFocusedState = true,
  bottomPadding = 0,
  rightPadding = 0,
  onMoveEnd,
  onStateClick,
  onCountryClick,
  onStateHover,
  onCountyClick,
  onCountyHover,
  onChurchClick,
  onChurchHover,
  onResetView,
  onZoomedOutPastRegion,
  apiRef,
}: MapLibreCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MaplibreMap | null>(null);

  // The map is the app's most motion-heavy surface, and the reports already
  // honour this preference — flying the camera across a state ignores it no
  // less than an animated chart would. Zero duration makes moves cut instantly.
  const reducedMotion = usePrefersReducedMotion();
  const transitionMs = reducedMotion ? 0 : VIEW_TRANSITION_MS;
  const zoomStepMs = reducedMotion ? 0 : ZOOM_STEP_MS;
  const transitionMsRef = useRef(transitionMs);
  transitionMsRef.current = transitionMs;
  const zoomStepMsRef = useRef(zoomStepMs);
  zoomStepMsRef.current = zoomStepMs;

  // Interaction state lives in refs so the map's event handlers (registered
  // once) always read current values without being re-bound on every render.
  const focusedStateRef = useRef<string | null>(focusedState);
  focusedStateRef.current = focusedState;
  const hoveredStateRef = useRef<string | null>(null);
  const hoveredCountyRef = useRef<string | null>(null);
  const focusedCountyRef = useRef<string | null>(focusedCounty);
  focusedCountyRef.current = focusedCounty;
  /** Bounds of the focused county, resolved asynchronously by the camera effect. */
  const countyBoundsRef = useRef<[[number, number], [number, number]] | null>(null);
  /** What the camera is framing (route-derived), for the zoom-out comparison. */
  const targetStateRef = useRef<string | null>(null);
  const countryCodeRef = useRef(countryCode);
  countryCodeRef.current = countryCode;
  const viewLevelRef = useRef(viewLevel);
  viewLevelRef.current = viewLevel;
  /** Previous viewLevel — used to clear stale region polys only on enter-world. */
  const prevViewLevelRef = useRef(viewLevel);
  /** Bumps on each choropleth effect so in-flight world clears can't wipe provinces. */
  const choroplethEpochRef = useRef(0);
  const targetCountyRef = useRef<string | null>(null);
  /**
   * Admin-2 id we've actually finished framing. Step-out compares the viewport
   * against countyBoundsRef only when this matches — otherwise a province-sized
   * view vs a newly-set tiny CD bbox immediately "exceeds" and jumps out.
   */
  const framedCountyRef = useRef<string | null>(null);
  /** Set before each camera move we initiate, so moveend can tell them apart. */
  const programmaticMoveRef = useRef(false);
  /** Min-zoom floor for the region being flown to, applied once it settles. */
  const pendingMinZoomRef = useRef<number | null>(null);
  /** Country-view framing zoom — pinch below this − delta steps out to /world. */
  const countryFrameZoomRef = useRef<number | null>(null);
  // Memoized: rebuilding this on every render meant re-creating a Map of tens
  // of thousands of entries for something as routine as a hover.
  const churchById = useMemo(
    () => new Map((churches ?? []).map((c) => [c.id, c])),
    [churches],
  );
  const churchByIdRef = useRef(churchById);
  churchByIdRef.current = churchById;
  // Church view is its own zoom level; stepping out from it is the panel's job,
  // not a side effect of zooming.
  const selectedChurchIdRef = useRef<string | null>(selectedChurchId);
  selectedChurchIdRef.current = selectedChurchId;
  const handlersRef = useRef({
    onStateClick, onCountryClick, onStateHover, onCountyClick, onCountyHover,
    onChurchClick, onChurchHover, onResetView, onMoveEnd, onZoomedOutPastRegion,
  });
  handlersRef.current = {
    onStateClick, onCountryClick, onStateHover, onCountyClick, onCountyHover,
    onChurchClick, onChurchHover, onResetView, onMoveEnd, onZoomedOutPastRegion,
  };

  // Initialize the map once.
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    // Start already framed for /world so we don't flash continental US → fly.
    const startCenter = viewLevel === "world" ? WORLD_CENTER : center;
    const startZoom = viewLevel === "world" ? WORLD_ZOOM : zoom;
    const map = new MaplibreMap({
      container: containerRef.current,
      style: BASEMAP_STYLE,
      center: startCenter,
      zoom: startZoom,
      // World-atlas countries (and Alaska) cross ±180°. With copies on, MapLibre
      // paints ghost slabs across the ocean — the “messed up world view”.
      renderWorldCopies: false,
      // No on-map attribution control — the basemap credit is shown in the
      // summary panel's data-source footer alongside OSM, ARDA and Census, so
      // it stays visible (OSM's ODbL and CARTO's terms require it) without a
      // badge pinned over the corner of the map.
      attributionControl: false,
    });
    // No NavigationControl: the app has its own zoom buttons bottom-left, which
    // drive the map through apiRef. MapLibre's default pair would duplicate them
    // in the opposite corner and in someone else's visual style.
    mapRef.current = map;

    const handleMoveEnd = () => {
      const c = map.getCenter();
      const b = map.getBounds();
      const view: [[number, number], [number, number]] = [
        [b.getWest(), b.getSouth()],
        [b.getEast(), b.getNorth()],
      ];

      // Our own flyTo/fitBounds must not trigger a step-out — they would undo
      // the view they just set. A flag is used rather than the event's
      // originalEvent, which wheel-zoom's inertial ease does not carry.
      const wasProgrammatic = programmaticMoveRef.current;
      programmaticMoveRef.current = false;

      // Apply the new floor only now the camera has settled, so it can't clip
      // the move that was still animating toward it.
      if (wasProgrammatic && pendingMinZoomRef.current != null) {
        map.setMinZoom(pendingMinZoomRef.current);
        pendingMinZoomRef.current = null;
      }

      if (wasProgrammatic) {
        // Camera settled on the target admin-2 — step-out may use its bounds now.
        framedCountyRef.current = targetCountyRef.current;
      }

      if (!wasProgrammatic && !selectedChurchIdRef.current) {
        // Compare against what the camera actually framed, not what the UI has
        // caught up to — they differ while a state is still loading.
        if (targetCountyRef.current || targetStateRef.current) {
          const countyId = targetCountyRef.current;
          const region = countyId
            ? (framedCountyRef.current === countyId ? countyBoundsRef.current : null)
            : boundsForState(targetStateRef.current!, countryCodeRef.current);
          if (region && viewportExceedsRegion(view, region, ZOOM_OUT_FACTOR)) {
            handlersRef.current.onZoomedOutPastRegion?.();
          }
        } else if (viewLevelRef.current === "country") {
          // Zoom-delta step-out: keeps working when the country bbox is huge (US).
          const framed = countryFrameZoomRef.current;
          if (framed != null && map.getZoom() < framed - COUNTRY_ZOOM_OUT_DELTA) {
            handlersRef.current.onZoomedOutPastRegion?.();
          }
        }
      }

      // Via the ref: this handler is registered once, so calling the prop
      // directly would invoke a stale closure from the first render.
      handlersRef.current.onMoveEnd?.([c.lng, c.lat], map.getZoom(), view);
    };
    map.on("moveend", handleMoveEnd);
    map.on("error", (e) => console.error("[maplibre]", (e as { error?: { message?: string } })?.error?.message ?? e));

    // Single delegated hit-test rather than per-layer listeners: a click on a
    // church dot would otherwise ALSO fire the state handler underneath it.
    const hitTest = (point: Point) => {
      const layers = HIT_LAYERS.filter((id) => map.getLayer(id));
      if (!layers.length) return [];
      try {
        return map.queryRenderedFeatures(point, { layers });
      } catch {
        return [];
      }
    };
    const topmost = (feats: ReturnType<typeof hitTest>, layerId: string) =>
      feats.find((f) => f.layer.id === layerId);

    const handleClick = (e: MapMouseEvent) => {
      const h = handlersRef.current;
      const feats = hitTest(e.point);

      const church = topmost(feats, "churches");
      if (church) {
        const found = churchByIdRef.current.get(String(church.properties?.id));
        if (found) return h.onChurchClick?.(found);
      }
      const county = topmost(feats, "counties-fill");
      if (county) {
        const admin2Id = propStr(county.properties?.fips) ?? propStr(county.properties?.id);
        if (admin2Id) return h.onCountyClick?.(admin2Id);
        // Fall through if the feature has no id — don't navigate to "undefined".
      }

      const state = topmost(feats, "states-fill");
      // World view: click a populated country → open its regions (same as a church dot).
      if (viewLevelRef.current === "world") {
        const countryCodeHit = propStr(state?.properties?.countryCode);
        if (countryCodeHit && propTruthy(state?.properties?.clickable)) {
          h.onCountryClick?.(countryCodeHit);
        }
        return;
      }
      const abbrev = propStr(state?.properties?.abbrev);
      if (!abbrev) return h.onResetView?.(); // clicked empty canvas / ocean
      // Region view: a neighboring state/province jumps straight there; clicking
      // the focused region is a no-op. Empty canvas still steps back out.
      if (focusedStateRef.current) {
        if (abbrev !== focusedStateRef.current) h.onStateClick?.(abbrev);
        return;
      }
      h.onStateClick?.(abbrev);
    };

    // Coalesce to one hit-test per frame. queryRenderedFeatures across four
    // layers on every mousemove is a lot of work to do dozens of times between
    // paints, and only the latest position can matter.
    let hoverFrame: number | null = null;
    let hoverPoint: Point | null = null;

    const handleMouseMove = (e: MapMouseEvent) => {
      hoverPoint = e.point;
      if (hoverFrame != null) return;
      hoverFrame = requestAnimationFrame(() => {
        hoverFrame = null;
        if (hoverPoint) processHover(hoverPoint);
      });
    };

    const processHover = (point: Point) => {
      const h = handlersRef.current;
      const feats = hitTest(point);

      const church = topmost(feats, "churches");
      const county = topmost(feats, "counties-fill");
      const state = topmost(feats, "states-fill");

      const worldClickable =
        viewLevelRef.current === "world" && state && propTruthy(state.properties?.clickable);
      map.getCanvas().style.cursor =
        church || county || (viewLevelRef.current === "world" ? worldClickable : state)
          ? "pointer"
          : "";

      // Church hover
      const churchObj = church
        ? churchByIdRef.current.get(String(church.properties?.id)) ?? null
        : null;
      h.onChurchHover?.(churchObj);

      // County hover
      const fips = county && !church ? String(county.properties?.fips) : null;
      if (fips !== hoveredCountyRef.current) {
        hoveredCountyRef.current = fips;
        applyCountyPaint(map, fips, focusedCountyRef.current);
        h.onCountyHover?.(fips);
      }

      // Region/country hover. World features use countryCode; admin1 uses abbrev.
      // Never String(undefined) — that becomes the literal label "undefined".
      const hoverId =
        state && !church && !county
          ? viewLevelRef.current === "world"
            ? propStr(state.properties?.countryCode)
            : propStr(state.properties?.abbrev)
          : null;
      if (hoverId !== hoveredStateRef.current) {
        hoveredStateRef.current = hoverId;
        if (viewLevelRef.current !== "world") {
          applyStatePaint(map, focusedStateRef.current, hoverId);
        } else if (hoverId && state && propTruthy(state.properties?.clickable)) {
          prefetchRegionFeatures(hoverId);
        }
        h.onStateHover?.(hoverId);
      }
    };

    const handleMouseOut = () => {
      const h = handlersRef.current;
      map.getCanvas().style.cursor = "";
      if (hoveredCountyRef.current !== null) {
        hoveredCountyRef.current = null;
        applyCountyPaint(map, null, focusedCountyRef.current);
        h.onCountyHover?.(null);
      }
      if (hoveredStateRef.current !== null) {
        hoveredStateRef.current = null;
        applyStatePaint(map, focusedStateRef.current, null);
        h.onStateHover?.(null);
      }
      h.onChurchHover?.(null);
    };

    map.on("click", handleClick);
    map.on("mousemove", handleMouseMove);
    map.on("mouseout", handleMouseOut);

    // The map can be constructed before its container has a measured size
    // (MapLibre then falls back to a 400×300 canvas that never grows). A
    // ResizeObserver keeps the canvas matched to the container.
    const ro = new ResizeObserver(() => map.resize());
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      if (hoverFrame != null) cancelAnimationFrame(hoverFrame);
      map.off("moveend", handleMoveEnd);
      map.remove();
      mapRef.current = null;
    };
    // Init-only: data and view changes are handled by the effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Camera padding: keeps the target clear of UI chrome (e.g. the mobile
  // detail panel), so MapLibre offsets the view instead of us fudging the
  // latitude by hand.
  const cameraPadding = {
    top: FIT_PADDING,
    bottom: FIT_PADDING + bottomPadding,
    left: FIT_PADDING,
    right: FIT_PADDING + rightPadding,
  };
  const paddingRef = useRef(cameraPadding);
  paddingRef.current = cameraPadding;

  // Publish imperative controls for the app's own zoom buttons.
  useEffect(() => {
    if (!apiRef) return;
    apiRef.current = {
      zoomIn: () => mapRef.current?.zoomIn({ duration: zoomStepMsRef.current }),
      zoomOut: () => mapRef.current?.zoomOut({ duration: zoomStepMsRef.current }),
    };
    return () => {
      apiRef.current = null;
    };
  }, [apiRef]);

  // Parent-driven camera. Skipped when self-driving, so the two never fight
  // over the view — exactly one owner at a time.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || fitToFocusedState) return;
    programmaticMoveRef.current = true;
    map.flyTo({
      center,
      zoom,
      padding: paddingRef.current,
      duration: transitionMs,
      essential: true,
    });
    // fitToFocusedState is config, not a trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [center, zoom]);

  // ── Camera ──
  // Declared BEFORE the layer effects on purpose. React runs effects in
  // declaration order, and focusedState/churches arrive in the same commit when
  // a state finishes loading — so if the layer work ran first, the camera would
  // not start moving until a FeatureCollection had been built for every church
  // in the state (tens of thousands for a large one). Flying first makes the
  // transition immediate and lets the dots populate during the animation.
  //
  // A single effect owns the view, resolving the most specific target first:
  // church > county > state > national. Separate fitBounds/flyTo calls spread
  // across effects would fight each other whenever more than one of these
  // changed in the same update (e.g. selecting a church inside a new county).
  //
  // Depend on the church's coordinates rather than the `churches` array so the
  // camera doesn't snap back when a state's church list finishes loading after
  // the user has already panned away.
  const selectedChurch = selectedChurchId ? churchByIdRef.current.get(selectedChurchId) : undefined;
  const selectedLng = selectedChurch?.lng;
  const selectedLat = selectedChurch?.lat;

  // Prefer the route-derived region so the camera moves the moment a state is
  // clicked, rather than waiting for the loading overlay to release
  // focusedState. Falls back to focusedState when no route hint is supplied.
  const targetState = cameraState !== undefined ? cameraState : focusedState;
  const targetCounty = cameraCounty !== undefined ? cameraCounty : focusedCounty;
  targetStateRef.current = targetState;
  targetCountyRef.current = targetCounty;

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !fitToFocusedState) return;
    let cancelled = false;

    // Clear any existing floor first: it belongs to the region we're leaving and
    // would otherwise clamp a move outward. The new floor is applied on moveend,
    // so it can't clip the animation itself.
    const fit = (bounds: [[number, number], [number, number]]) => {
      programmaticMoveRef.current = true;
      map.setMinZoom(0);
      const target = map.cameraForBounds(bounds, { padding: paddingRef.current });
      pendingMinZoomRef.current =
        target?.zoom != null ? Math.max(0, target.zoom - ZOOM_OUT_ALLOWANCE) : null;
      map.fitBounds(bounds, { padding: paddingRef.current, duration: transitionMs });
    };

    const apply = async () => {
      if (selectedLng != null && selectedLat != null) {
        programmaticMoveRef.current = true;
        map.flyTo({
          center: [selectedLng, selectedLat],
          zoom: CHURCH_VIEW_ZOOM,
          padding: paddingRef.current,
          duration: transitionMs,
          essential: true,
        });
        return;
      }
      if (targetCounty) {
        // Invalidate until this county is framed — avoids province viewport vs
        // tiny CD bounds triggering an immediate step-out.
        if (framedCountyRef.current !== targetCounty) {
          framedCountyRef.current = null;
          countyBoundsRef.current = null;
        }
        const bounds = await boundsForCounty(targetCounty, countryCode);
        // The target may have changed while admin-2 geo was in flight.
        if (cancelled) return;
        countyBoundsRef.current = bounds;
        if (bounds) return fit(bounds);
      } else {
        framedCountyRef.current = null;
        countyBoundsRef.current = null;
      }
      if (targetState) {
        const bounds = boundsForState(targetState, countryCode);
        if (bounds) return fit(bounds);
      }
      if (viewLevel === "world") {
        countryFrameZoomRef.current = null;
        programmaticMoveRef.current = true;
        map.setMinZoom(0);
        pendingMinZoomRef.current = 0.8;
        const c = map.getCenter();
        const alreadyFramed =
          Math.abs(map.getZoom() - WORLD_ZOOM) < 0.08 &&
          Math.abs(c.lng - WORLD_CENTER[0]) < 2 &&
          Math.abs(c.lat - WORLD_CENTER[1]) < 2;
        if (alreadyFramed) {
          // Constructed on /world (or settled) — skip flyTo to avoid a flicker.
          map.setMinZoom(0.8);
          pendingMinZoomRef.current = null;
          return;
        }
        map.flyTo({
          center: WORLD_CENTER,
          zoom: WORLD_ZOOM,
          padding: paddingRef.current,
          duration: transitionMs,
          essential: true,
        });
        return;
      }
      // Whole-country view. Non-US countries fit their own extent; the US keeps
      // its tuned center/zoom so the familiar framing is unchanged.
      // Floor sits below the country→world trigger so pinch-out can leave.
      if (countryCode !== "US") {
        const cb = boundsForCountry(countryCode);
        if (cb) {
          programmaticMoveRef.current = true;
          map.setMinZoom(0);
          const target = map.cameraForBounds(cb, { padding: paddingRef.current });
          const frameZoom = target?.zoom ?? map.getZoom();
          countryFrameZoomRef.current = frameZoom;
          pendingMinZoomRef.current = Math.max(
            0.5,
            frameZoom - COUNTRY_ZOOM_OUT_DELTA - COUNTRY_ZOOM_OUT_FLOOR_EXTRA,
          );
          map.fitBounds(cb, { padding: paddingRef.current, duration: transitionMs });
          return;
        }
      }
      countryFrameZoomRef.current = US_DEFAULT_ZOOM;
      programmaticMoveRef.current = true;
      map.setMinZoom(0);
      pendingMinZoomRef.current = Math.max(
        0.5,
        US_DEFAULT_ZOOM - COUNTRY_ZOOM_OUT_DELTA - COUNTRY_ZOOM_OUT_FLOOR_EXTRA,
      );
      map.flyTo({
        center: US_DEFAULT_CENTER,
        zoom: US_DEFAULT_ZOOM,
        padding: paddingRef.current,
        duration: transitionMs,
        essential: true,
      });
    };

    void apply();
    return () => {
      cancelled = true;
    };
    // fitToFocusedState is config, not a trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedChurchId, selectedLng, selectedLat, targetCounty, targetState, countryCode, viewLevel]);

  // Build/recolor the choropleth when church counts arrive or the view level changes.
  // Non-world views keep a gray world underlay so neighboring countries frame focus.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const epoch = ++choroplethEpochRef.current;
    const isCurrent = () => choroplethEpochRef.current === epoch;
    const prevLevel = prevViewLevelRef.current;
    const enteredWorld = viewLevel === "world" && prevLevel !== "world";
    const leftWorld = viewLevel !== "world" && prevLevel === "world";
    prevViewLevelRef.current = viewLevel;
    if (viewLevel === "world") {
      // Only when leaving country/region: wipe leftover polys so they don't sit
      // at world zoom while countries-110m loads. Don't clear on every recolor.
      if (enteredWorld) {
        whenStyleReady(map, () => {
          if (!isCurrent()) return;
          const src = map.getSource("states") as GeoJSONSource | undefined;
          if (src) src.setData({ type: "FeatureCollection", features: [] });
          clearWorldContextLayer(map);
          if (map.getLayer("counties-line")) map.removeLayer("counties-line");
          if (map.getLayer("counties-fill")) map.removeLayer("counties-fill");
          if (map.getSource("counties")) map.removeSource("counties");
        });
      }
      void setWorldLayer(map, countries ?? [], isCurrent);
    } else {
      // Clear solid world fills immediately, but never remove layers here —
      // a delayed remove used to race setStatesLayer and wipe provinces after
      // they painted (Canada looked like one blob until counts re-fetched).
      if (leftWorld) {
        whenStyleReady(map, () => {
          if (!isCurrent()) return;
          if (polygonSourceBuffer.get("states") !== 0) return;
          const src = map.getSource("states") as GeoJSONSource | undefined;
          if (src) src.setData({ type: "FeatureCollection", features: [] });
        });
      }
      // Warm admin-1 before paint; hover prefetch may already have it cached.
      prefetchRegionFeatures(countryCode);
      void setWorldContextLayer(map, countryCode, isCurrent);
      // focusedState paint is re-applied in the focus effect; pass it here so a
      // late setData after a region click doesn't flash tier colors over dim.
      void setStatesLayer(
        map,
        states ?? [],
        countryCode,
        focusedState ?? null,
        isCurrent,
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- focusedState paint is owned below
  }, [states, countries, countryCode, viewLevel]);

  // Focus: show the focused state's counties and dim the other states,
  // matching the SVG map's state view. (Camera is owned by the effect below.)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    applyStatePaint(map, focusedState, hoveredStateRef.current);
    void setCountyLayer(
      map,
      focusedState,
      countyStats,
      hoveredCountyRef.current,
      focusedCounty,
      countryCode,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusedState, countryCode]);

  // Rebuild the church source only when the churches themselves change.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    setChurchData(map, churches ?? [], selectedChurchIdRef.current);
    // selectedChurchId is handled by the paint-only effect below; including it
    // here would re-tile every dot in the state just to highlight one.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [churches]);

  // Selection is a paint change, not a data change.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    setChurchSelection(map, selectedChurchId);
  }, [selectedChurchId]);

  // Recolor counties when stats or the focused county change.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    void setCountyLayer(
      map,
      focusedState,
      countyStats,
      hoveredCountyRef.current,
      focusedCounty,
      countryCode,
    );
    // focusedState changes are handled by the focus effect above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [countyStats, focusedCounty, countryCode]);

  return <div ref={containerRef} style={{ width: "100%", height: "100%" }} />;
});

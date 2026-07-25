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
import { memo, useEffect, useRef, type MutableRefObject } from "react";
import {
  Map as MaplibreMap,
  type GeoJSONSource,
  type MapMouseEvent,
  type Point,
  type StyleSpecification,
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { feature } from "topojson-client";
import { geoBounds } from "d3-geo";
import {
  GEO_URL,
  COUNTIES_GEO_URL,
  FIPS_TO_STATE,
  STATE_TO_FIPS,
  STATE_BOUNDS,
  getStateTier,
  getCountyPerCapitaColor,
  STATE_COUNT_TIERS,
  ACTIVE_PIN_FILL,
} from "./map-constants";
import { getSizeCategory, type Church, type StateInfo } from "./church-data";

/** Per-county church counts and per-capita rates, keyed by 5-digit FIPS. */
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
// County choropleth defaults (match CountyGeographies in MapCanvas)
const COUNTY_FILL = "rgba(255, 255, 255, 0.8)";
const COUNTY_STROKE = "rgba(107, 33, 168, 0.25)";
const COUNTY_HOVER_FILL = "#D4B8E8";

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

interface MapLibreCanvasProps {
  /** [lng, lat] center. */
  center?: [number, number];
  /** MapLibre zoom (0–22). */
  zoom?: number;
  /** State list with church counts; drives the choropleth tier coloring. */
  states?: StateInfo[];
  /** Abbrev of the focused state; shows counties and dims other states. */
  focusedState?: string | null;
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
   * Extra bottom padding in px kept clear of the camera — used on mobile so the
   * selected church's pin sits above the detail panel. Replaces the
   * Albers/viewBox-specific getMobileLatOffset() math.
   */
  bottomPadding?: number;
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
function boundsForState(abbrev: string): [[number, number], [number, number]] | null {
  const b = STATE_BOUNDS[abbrev];
  if (!b) return null;
  const [south, west, north, east] = b;
  return [
    [west, south],
    [east, north],
  ];
}

/** Bounding box of a single county, from the cached counties TopoJSON. */
async function boundsForCounty(
  fips: string,
): Promise<[[number, number], [number, number]] | null> {
  try {
    const topo = await fetchTopo(COUNTIES_GEO_URL);
    const all = feature(topo, topo.objects.counties) as GeoJSON.FeatureCollection;
    const match = all.features.find((f) => String(f.id).padStart(5, "0") === fips);
    if (!match) return null;
    // d3-geo's geoBounds already returns [[west, south], [east, north]].
    return geoBounds(match as GeoJSON.Feature) as [[number, number], [number, number]];
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

/** Leaves room for the UI chrome around the fitted region. */
const FIT_PADDING = 40;
const VIEW_TRANSITION_MS = 800;
/** Web Mercator zoom for the church detail view (street level). */
const CHURCH_VIEW_ZOOM = 13;
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
const LAYER_ORDER = ["states-fill", "states-line", "counties-fill", "counties-line", "churches"];

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
async function setStatesLayer(map: MaplibreMap, states: StateInfo[]) {
  let geo: GeoJSON.FeatureCollection;
  try {
    const topo = await fetchTopo(GEO_URL);
    geo = feature(topo, topo.objects.states) as GeoJSON.FeatureCollection;
  } catch (err) {
    console.error("[maplibre] failed to load state boundaries", err);
    return;
  }

  const countByAbbrev = new Map(states.map((s) => [s.abbrev, s.churchCount]));
  for (const f of geo.features) {
    const fips = String(f.id).padStart(2, "0");
    const abbrev = FIPS_TO_STATE[fips];
    const count = abbrev ? countByAbbrev.get(abbrev) ?? 0 : 0;
    // No church data yet → keep the flat brand purple so the map still reads as
    // branded; otherwise color by the same tier scale as the SVG map.
    f.properties = { ...f.properties, abbrev, count, fill: states.length ? getStateTier(count).color : STATE_FILL };
  }

  whenStyleReady(map, () => {
    // Concurrent calls can both reach here before either adds the source, so
    // guard the source and each layer independently.
    const src = map.getSource("states") as GeoJSONSource | undefined;
    if (src) src.setData(geo);
    else map.addSource("states", { type: "geojson", data: geo });

    if (!map.getLayer("states-fill")) {
      map.addLayer({
        id: "states-fill",
        type: "fill",
        source: "states",
        // Recedes entirely at church-level zoom so the streets show through.
        paint: { "fill-color": ["get", "fill"], "fill-opacity": streetFadeOut(0) as never },
      });
    }
    if (!map.getLayer("states-line")) {
      map.addLayer({
        id: "states-line",
        type: "line",
        source: "states",
        // Borders stay as faint context once the streets take over.
        paint: {
          "line-color": STATE_STROKE,
          "line-width": 0.5,
          "line-opacity": streetFadeOut(0.35) as never,
        },
      });
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
    return ["case", ["==", ["get", "abbrev"], focusedState], STATE_FOCUSED_FILL, STATE_DIMMED_FILL];
  }
  if (hoveredState) {
    return ["case", ["==", ["get", "abbrev"], hoveredState], STATE_HOVER_FILL, ["get", "fill"]];
  }
  return ["get", "fill"];
}

/**
 * County fill: hover and focus both highlight (as in CountyGeographies),
 * otherwise use the per-capita color precomputed onto each feature.
 */
function countiesFillExpression(hoveredCounty: string | null, focusedCounty: string | null) {
  const base: unknown = ["get", "fill"];
  const cases: unknown[] = ["case"];
  if (focusedCounty) cases.push(["==", ["get", "fips"], focusedCounty], COUNTY_HOVER_FILL);
  if (hoveredCounty) cases.push(["==", ["get", "fips"], hoveredCounty], COUNTY_HOVER_FILL);
  if (cases.length === 1) return base;
  cases.push(base);
  return cases;
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
 * Show county polygons for the focused state (the app only renders counties in
 * state view). Counties come from the us-atlas counties TopoJSON, filtered by
 * the state's 2-digit FIPS prefix — the same rule CountyGeographies uses.
 * Per-capita choropleth shading follows once church-per-county stats are wired.
 */
async function setCountyLayer(
  map: MaplibreMap,
  focusedState: string | null,
  countyStats: CountyStats | null,
  hoveredCounty: string | null,
  focusedCounty: string | null,
) {
  const clear = () => {
    whenStyleReady(map, () => {
      if (map.getLayer("counties-line")) map.removeLayer("counties-line");
      if (map.getLayer("counties-fill")) map.removeLayer("counties-fill");
      if (map.getSource("counties")) map.removeSource("counties");
    });
  };

  const stateFips = focusedState ? STATE_TO_FIPS[focusedState] : undefined;
  if (!stateFips) return clear();

  let geo: GeoJSON.FeatureCollection;
  try {
    const topo = await fetchTopo(COUNTIES_GEO_URL);
    const all = feature(topo, topo.objects.counties) as GeoJSON.FeatureCollection;
    const sorted = countyStats?.sortedByPerCapita ?? [];
    geo = {
      type: "FeatureCollection",
      features: all.features
        .filter((f) => String(f.id).padStart(5, "0").slice(0, 2) === stateFips)
        .map((f) => {
          // Surface the 5-digit FIPS so hover/click can identify the county,
          // and precompute its per-capita color for data-driven styling.
          const fips = String(f.id).padStart(5, "0");
          const data = countyStats?.byFips[fips];
          const fill = data ? getCountyPerCapitaColor(data.perCapita, sorted) : COUNTY_FILL;
          return { ...f, properties: { ...f.properties, fips, fill } };
        }),
    };
  } catch (err) {
    console.error("[maplibre] failed to load county boundaries", err);
    return;
  }

  whenStyleReady(map, () => {
    const src = map.getSource("counties") as GeoJSONSource | undefined;
    if (src) src.setData(geo);
    else map.addSource("counties", { type: "geojson", data: geo });

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
function setChurchLayer(map: MaplibreMap, churches: Church[], selectedChurchId: string | null) {
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
    else map.addSource("churches", { type: "geojson", data: geo });

    // The selected church is drawn as a distinct "you are here" pin: deeper
    // purple with a white ring, matching ChurchDots' active marker.
    const sel = selectedChurchId ?? "__no_selection__";
    const isSelected = ["==", ["get", "id"], sel];
    const paint = {
      // Scale the per-category base radius with zoom, mirroring how the SVG
      // dots grew as you zoomed in.
      "circle-radius": [
        "interpolate", ["linear"], ["zoom"],
        3, ["*", ["case", isSelected, 14, ["get", "radius"]], 0.35],
        6, ["*", ["case", isSelected, 14, ["get", "radius"]], 0.7],
        10, ["*", ["case", isSelected, 14, ["get", "radius"]], 1.4],
        14, ["*", ["case", isSelected, 14, ["get", "radius"]], 2.2],
      ],
      "circle-color": ["case", isSelected, ACTIVE_PIN_FILL, ["get", "color"]],
      "circle-opacity": ["case", isSelected, 1, 0.8],
      "circle-stroke-width": ["case", isSelected, 2, 0],
      "circle-stroke-color": "#FFFFFF",
    };

    if (!map.getLayer("churches")) {
      map.addLayer({ id: "churches", type: "circle", source: "churches", paint: paint as never });
    } else {
      for (const [prop, value] of Object.entries(paint)) {
        map.setPaintProperty("churches", prop, value as never);
      }
    }
    enforceLayerOrder(map);
  });
}

export const MapLibreCanvas = memo(function MapLibreCanvas({
  center = US_DEFAULT_CENTER,
  zoom = US_DEFAULT_ZOOM,
  states,
  focusedState = null,
  churches,
  selectedChurchId = null,
  countyStats = null,
  focusedCounty = null,
  fitToFocusedState = true,
  bottomPadding = 0,
  onMoveEnd,
  onStateClick,
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
  /** Set before each camera move we initiate, so moveend can tell them apart. */
  const programmaticMoveRef = useRef(false);
  const churchByIdRef = useRef<Map<string, Church>>(new Map());
  churchByIdRef.current = new Map((churches ?? []).map((c) => [c.id, c]));
  // Church view is its own zoom level; stepping out from it is the panel's job,
  // not a side effect of zooming.
  const selectedChurchIdRef = useRef<string | null>(selectedChurchId);
  selectedChurchIdRef.current = selectedChurchId;
  const handlersRef = useRef({
    onStateClick, onStateHover, onCountyClick, onCountyHover,
    onChurchClick, onChurchHover, onResetView, onMoveEnd, onZoomedOutPastRegion,
  });
  handlersRef.current = {
    onStateClick, onStateHover, onCountyClick, onCountyHover,
    onChurchClick, onChurchHover, onResetView, onMoveEnd, onZoomedOutPastRegion,
  };

  // Initialize the map once.
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = new MaplibreMap({
      container: containerRef.current,
      style: BASEMAP_STYLE,
      center,
      zoom,
      attributionControl: { compact: true },
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

      if (!wasProgrammatic && !selectedChurchIdRef.current) {
        const region = focusedCountyRef.current
          ? countyBoundsRef.current
          : focusedStateRef.current
            ? boundsForState(focusedStateRef.current)
            : null;
        if (region && viewportExceedsRegion(view, region, ZOOM_OUT_FACTOR)) {
          handlersRef.current.onZoomedOutPastRegion?.();
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
      if (county) return h.onCountyClick?.(String(county.properties?.fips));

      const state = topmost(feats, "states-fill");
      const abbrev = state ? String(state.properties?.abbrev) : null;
      if (!abbrev) return h.onResetView?.(); // clicked empty canvas
      // In state view, clicking a different state resets; clicking the focused
      // one does nothing (matches StateGeographies' click rules).
      if (focusedStateRef.current) {
        if (abbrev !== focusedStateRef.current) h.onResetView?.();
        return;
      }
      h.onStateClick?.(abbrev);
    };

    const handleMouseMove = (e: MapMouseEvent) => {
      const h = handlersRef.current;
      const feats = hitTest(e.point);

      const church = topmost(feats, "churches");
      const county = topmost(feats, "counties-fill");
      const state = topmost(feats, "states-fill");

      map.getCanvas().style.cursor = church || county || state ? "pointer" : "";

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

      // State hover (only meaningful in the national view)
      const abbrev = state && !church && !county ? String(state.properties?.abbrev) : null;
      if (abbrev !== hoveredStateRef.current) {
        hoveredStateRef.current = abbrev;
        applyStatePaint(map, focusedStateRef.current, abbrev);
        h.onStateHover?.(abbrev);
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
    right: FIT_PADDING,
  };
  const paddingRef = useRef(cameraPadding);
  paddingRef.current = cameraPadding;

  // Publish imperative controls for the app's own zoom buttons.
  useEffect(() => {
    if (!apiRef) return;
    apiRef.current = {
      zoomIn: () => mapRef.current?.zoomIn({ duration: ZOOM_STEP_MS }),
      zoomOut: () => mapRef.current?.zoomOut({ duration: ZOOM_STEP_MS }),
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
      duration: VIEW_TRANSITION_MS,
      essential: true,
    });
    // fitToFocusedState is config, not a trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [center, zoom]);

  // Build/recolor the state choropleth when church counts arrive or change.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    void setStatesLayer(map, states ?? []);
  }, [states]);

  // Focus: show the focused state's counties and dim the other states,
  // matching the SVG map's state view. (Camera is owned by the effect below.)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    applyStatePaint(map, focusedState, hoveredStateRef.current);
    void setCountyLayer(map, focusedState, countyStats, hoveredCountyRef.current, focusedCounty);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusedState]);

  // Plot churches whenever the list or selection changes.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    setChurchLayer(map, churches ?? [], selectedChurchId);
  }, [churches, selectedChurchId]);

  // Recolor counties when stats or the focused county change.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    void setCountyLayer(map, focusedState, countyStats, hoveredCountyRef.current, focusedCounty);
    // focusedState changes are handled by the focus effect above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [countyStats, focusedCounty]);

  // ── Camera ──
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

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !fitToFocusedState) return;
    let cancelled = false;

    const fit = (bounds: [[number, number], [number, number]]) => {
      programmaticMoveRef.current = true;
      map.fitBounds(bounds, { padding: paddingRef.current, duration: VIEW_TRANSITION_MS });
    };

    const apply = async () => {
      if (selectedLng != null && selectedLat != null) {
        programmaticMoveRef.current = true;
        map.flyTo({
          center: [selectedLng, selectedLat],
          zoom: CHURCH_VIEW_ZOOM,
          padding: paddingRef.current,
          duration: VIEW_TRANSITION_MS,
          essential: true,
        });
        return;
      }
      if (focusedCounty) {
        const bounds = await boundsForCounty(focusedCounty);
        // The target may have changed while the TopoJSON was in flight.
        if (cancelled) return;
        countyBoundsRef.current = bounds;
        if (bounds) return fit(bounds);
      }
      if (focusedState) {
        const bounds = boundsForState(focusedState);
        if (bounds) return fit(bounds);
      }
      programmaticMoveRef.current = true;
      map.flyTo({
        center: US_DEFAULT_CENTER,
        zoom: US_DEFAULT_ZOOM,
        padding: paddingRef.current,
        duration: VIEW_TRANSITION_MS,
        essential: true,
      });
    };

    void apply();
    return () => {
      cancelled = true;
    };
    // fitToFocusedState is config, not a trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedChurchId, selectedLng, selectedLat, focusedCounty, focusedState]);

  return <div ref={containerRef} style={{ width: "100%", height: "100%" }} />;
});

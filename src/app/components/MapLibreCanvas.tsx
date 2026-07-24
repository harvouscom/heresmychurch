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
import { memo, useEffect, useRef } from "react";
import {
  Map as MaplibreMap,
  NavigationControl,
  type GeoJSONSource,
  type MapMouseEvent,
  type Point,
  type StyleSpecification,
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { feature } from "topojson-client";
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
import type { CountyStats } from "./MapCanvas";
import { getSizeCategory, type Church, type StateInfo } from "./church-data";

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

const BASEMAP_STYLE: StyleSpecification = {
  version: 8,
  sources: {},
  layers: [{ id: "bg", type: "background", paint: { "background-color": CREAM } }],
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

/** Leaves room for the UI chrome around the fitted region. */
const FIT_PADDING = 40;
const VIEW_TRANSITION_MS = 800;

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
        paint: { "fill-color": ["get", "fill"], "fill-opacity": 1 },
      });
    }
    if (!map.getLayer("states-line")) {
      map.addLayer({
        id: "states-line",
        type: "line",
        source: "states",
        paint: { "line-color": STATE_STROKE, "line-width": 0.5 },
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
        paint: { "fill-color": countiesFillExpression(hoveredCounty, focusedCounty) as never },
      });
    } else {
      applyCountyPaint(map, hoveredCounty, focusedCounty);
    }
    if (!map.getLayer("counties-line")) {
      map.addLayer({
        id: "counties-line",
        type: "line",
        source: "counties",
        paint: { "line-color": COUNTY_STROKE, "line-width": 0.4 },
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
  const churchByIdRef = useRef<Map<string, Church>>(new Map());
  churchByIdRef.current = new Map((churches ?? []).map((c) => [c.id, c]));
  const handlersRef = useRef({
    onStateClick, onStateHover, onCountyClick, onCountyHover,
    onChurchClick, onChurchHover, onResetView, onMoveEnd,
  });
  handlersRef.current = {
    onStateClick, onStateHover, onCountyClick, onCountyHover,
    onChurchClick, onChurchHover, onResetView, onMoveEnd,
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
    map.addControl(new NavigationControl({ showCompass: false }), "bottom-right");
    mapRef.current = map;

    const handleMoveEnd = () => {
      const c = map.getCenter();
      const b = map.getBounds();
      // Via the ref: this handler is registered once, so calling the prop
      // directly would invoke a stale closure from the first render.
      handlersRef.current.onMoveEnd?.(
        [c.lng, c.lat],
        map.getZoom(),
        [
          [b.getWest(), b.getSouth()],
          [b.getEast(), b.getNorth()],
        ],
      );
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

  // Fly to new center/zoom when props change (view transitions).
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.flyTo({
      center,
      zoom,
      padding: paddingRef.current,
      duration: VIEW_TRANSITION_MS,
      essential: true,
    });
  }, [center, zoom]);

  // Build/recolor the state choropleth when church counts arrive or change.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    void setStatesLayer(map, states ?? []);
  }, [states]);

  // Focus: show the focused state's counties, dim the other states, and move
  // the camera — matching the SVG map's state view.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    applyStatePaint(map, focusedState, hoveredStateRef.current);
    void setCountyLayer(map, focusedState, countyStats, hoveredCountyRef.current, focusedCounty);

    if (!fitToFocusedState) return;
    const bounds = focusedState ? boundsForState(focusedState) : null;
    if (bounds) {
      map.fitBounds(bounds, { padding: paddingRef.current, duration: VIEW_TRANSITION_MS });
    } else if (!focusedState) {
      map.flyTo({
        center: US_DEFAULT_CENTER,
        zoom: US_DEFAULT_ZOOM,
        padding: paddingRef.current,
        duration: VIEW_TRANSITION_MS,
        essential: true,
      });
    }
    // fitToFocusedState is config, not a trigger.
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

  return <div ref={containerRef} style={{ width: "100%", height: "100%" }} />;
});

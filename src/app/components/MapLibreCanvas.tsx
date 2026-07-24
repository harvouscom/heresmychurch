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
import { Map as MaplibreMap, NavigationControl, type GeoJSONSource, type StyleSpecification } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { feature } from "topojson-client";
import {
  GEO_URL,
  COUNTIES_GEO_URL,
  FIPS_TO_STATE,
  STATE_TO_FIPS,
  getStateTier,
  STATE_COUNT_TIERS,
} from "./map-constants";
import { getSizeCategory, type Church, type StateInfo } from "./church-data";

const CREAM = "#F5F0E8"; // --background (national view)
const STATE_FILL = STATE_COUNT_TIERS[0].color; // "not yet explored" tier, for states with no data
const STATE_STROKE = "#C9A0DC"; // brand purple borders (matches national view)
const STATE_FOCUSED_FILL = "#C9A0DC"; // focused state
const STATE_DIMMED_FILL = "#EDE4F3"; // non-focused states in state view
// County choropleth defaults (match CountyGeographies in MapCanvas)
const COUNTY_FILL = "rgba(255, 255, 255, 0.8)";
const COUNTY_STROKE = "rgba(107, 33, 168, 0.25)";

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
  /** Called after the user finishes moving the map. */
  onMoveEnd?: (center: [number, number], zoom: number) => void;
}

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

/** Dim non-focused states (state view) or restore the tier choropleth. */
function setStateFocusPaint(map: MaplibreMap, focusedState: string | null) {
  whenStyleReady(map, () => {
    if (!map.getLayer("states-fill")) return;
    map.setPaintProperty(
      "states-fill",
      "fill-color",
      focusedState
        ? ["case", ["==", ["get", "abbrev"], focusedState], STATE_FOCUSED_FILL, STATE_DIMMED_FILL]
        : ["get", "fill"],
    );
  });
}

/**
 * Show county polygons for the focused state (the app only renders counties in
 * state view). Counties come from the us-atlas counties TopoJSON, filtered by
 * the state's 2-digit FIPS prefix — the same rule CountyGeographies uses.
 * Per-capita choropleth shading follows once church-per-county stats are wired.
 */
async function setCountyLayer(map: MaplibreMap, focusedState: string | null) {
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
    geo = {
      type: "FeatureCollection",
      features: all.features.filter((f) => String(f.id).padStart(5, "0").slice(0, 2) === stateFips),
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
        paint: { "fill-color": COUNTY_FILL },
      });
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
function setChurchLayer(map: MaplibreMap, churches: Church[]) {
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

    if (!map.getLayer("churches")) {
      map.addLayer({
        id: "churches",
        type: "circle",
        source: "churches",
        paint: {
          // Scale the per-category base radius with zoom, mirroring how the SVG
          // dots grew as you zoomed in.
          "circle-radius": [
            "interpolate", ["linear"], ["zoom"],
            3, ["*", ["get", "radius"], 0.35],
            6, ["*", ["get", "radius"], 0.7],
            10, ["*", ["get", "radius"], 1.4],
            14, ["*", ["get", "radius"], 2.2],
          ],
          "circle-color": ["get", "color"],
          "circle-opacity": 0.8,
        },
      });
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
  onMoveEnd,
}: MapLibreCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MaplibreMap | null>(null);

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
      onMoveEnd?.([c.lng, c.lat], map.getZoom());
    };
    map.on("moveend", handleMoveEnd);
    map.on("error", (e) => console.error("[maplibre]", (e as { error?: { message?: string } })?.error?.message ?? e));

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

  // Fly to new center/zoom when props change (view transitions).
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.flyTo({ center, zoom, duration: 800, essential: true });
  }, [center, zoom]);

  // Build/recolor the state choropleth when church counts arrive or change.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    void setStatesLayer(map, states ?? []);
  }, [states]);

  // Focus: show the focused state's counties and dim the other states,
  // matching the SVG map's state view.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    setStateFocusPaint(map, focusedState);
    void setCountyLayer(map, focusedState);
  }, [focusedState]);

  // Plot churches whenever the list changes.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    setChurchLayer(map, churches ?? []);
  }, [churches]);

  return <div ref={containerRef} style={{ width: "100%", height: "100%" }} />;
});

/**
 * MapLibreCanvas — Phase 0 (worldwide support) map engine.
 *
 * Replacement-in-progress for MapCanvas (react-simple-maps / geoAlbersUsa).
 * MapLibre GL uses Web Mercator, which — unlike geoAlbersUsa — can plot any
 * coordinate on Earth, so it is the prerequisite for showing churches outside
 * the US. See docs/future/mapbox-migration.md.
 *
 * SCAFFOLD STATUS: renders the basemap with a free (no-API-key) CARTO style,
 * controlled by center/zoom props. State/county layers and church markers are
 * ported in subsequent steps. MapCanvas remains the live map until this reaches
 * parity and is wired into ChurchMap.
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
import type { StateInfo } from "./church-data";

// Here's My Church is a data visualization, not a street map: a cream canvas
// with purple choropleth regions — no roads or labels. So the base "style" is
// just the app's cream background. Region polygons are added as GeoJSON layers
// on top (see addStatesLayer). A subtle street basemap can be faded in only at
// high (church-level) zoom later, per docs/future/mapbox-migration.md.
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
  /** Called after the user finishes moving the map. */
  onMoveEnd?: (center: [number, number], zoom: number) => void;
}

/**
 * Add US state polygons as a branded GeoJSON choropleth (purple by church-count
 * tier on cream), matching the current SVG national view. us-atlas ships
 * TopoJSON, which we convert to GeoJSON with topojson-client, then join each
 * state to its church count (by FIPS→abbrev) and precompute the tier color as a
 * feature property so MapLibre can style it data-driven.
 */
async function addStatesLayer(map: MaplibreMap, states: StateInfo[]) {
  try {
    const topo = await (await fetch(GEO_URL)).json();
    const geo = feature(topo, topo.objects.states) as GeoJSON.FeatureCollection;
    const countByAbbrev = new Map(states.map((s) => [s.abbrev, s.churchCount]));
    for (const f of geo.features) {
      const fips = String(f.id).padStart(2, "0");
      const abbrev = FIPS_TO_STATE[fips];
      const count = abbrev ? countByAbbrev.get(abbrev) ?? 0 : 0;
      // No church data yet → keep the flat brand purple so the map still reads
      // as branded; otherwise color by the same tier scale as the SVG map.
      f.properties = { ...f.properties, abbrev, count, fill: states.length ? getStateTier(count).color : STATE_FILL };
    }
    if (map.getSource("states")) {
      (map.getSource("states") as GeoJSONSource).setData(geo);
      return;
    }
    map.addSource("states", { type: "geojson", data: geo });
    map.addLayer({
      id: "states-fill",
      type: "fill",
      source: "states",
      paint: { "fill-color": ["get", "fill"], "fill-opacity": 1 },
    });
    map.addLayer({
      id: "states-line",
      type: "line",
      source: "states",
      paint: { "line-color": STATE_STROKE, "line-width": 0.5 },
    });
  } catch (err) {
    console.error("[maplibre] failed to load states layer", err);
  }
}

/**
 * Show county polygons for the focused state (the app only renders counties in
 * state view). Counties come from the us-atlas counties TopoJSON, filtered by
 * the state's 2-digit FIPS prefix — the same rule CountyGeographies uses.
 * Per-capita choropleth shading follows once church-per-county stats are wired.
 */
async function setCountyLayer(map: MaplibreMap, focusedState: string | null) {
  const clear = () => {
    if (map.getLayer("counties-line")) map.removeLayer("counties-line");
    if (map.getLayer("counties-fill")) map.removeLayer("counties-fill");
    if (map.getSource("counties")) map.removeSource("counties");
  };
  try {
    if (!focusedState) return clear();
    const stateFips = STATE_TO_FIPS[focusedState];
    if (!stateFips) return clear();

    const topo = await (await fetch(COUNTIES_GEO_URL)).json();
    const all = feature(topo, topo.objects.counties) as GeoJSON.FeatureCollection;
    const geo: GeoJSON.FeatureCollection = {
      type: "FeatureCollection",
      features: all.features.filter(
        (f) => String(f.id).padStart(5, "0").slice(0, 2) === stateFips,
      ),
    };

    clear();
    map.addSource("counties", { type: "geojson", data: geo });
    map.addLayer({
      id: "counties-fill",
      type: "fill",
      source: "counties",
      paint: { "fill-color": COUNTY_FILL },
    });
    map.addLayer({
      id: "counties-line",
      type: "line",
      source: "counties",
      paint: { "line-color": COUNTY_STROKE, "line-width": 0.4 },
    });
  } catch (err) {
    console.error("[maplibre] failed to load county layer", err);
  }
}

export const MapLibreCanvas = memo(function MapLibreCanvas({
  center = US_DEFAULT_CENTER,
  zoom = US_DEFAULT_ZOOM,
  states,
  focusedState = null,
  onMoveEnd,
}: MapLibreCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MaplibreMap | null>(null);
  const statesRef = useRef<StateInfo[] | undefined>(states);
  statesRef.current = states;
  const loadedRef = useRef(false);

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
    map.on("load", () => { loadedRef.current = true; void addStatesLayer(map, statesRef.current ?? []); });

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
    // Init-only: center/zoom changes are handled by the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fly to new center/zoom when props change (view transitions).
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.flyTo({ center, zoom, duration: 800, essential: true });
  }, [center, zoom]);

  // Recolor the choropleth when state church-counts arrive/change.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loadedRef.current) return;
    void addStatesLayer(map, states ?? []);
  }, [states]);

  // Focus: show the focused state's counties and dim the other states,
  // matching the SVG map's state view.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loadedRef.current || !map.getLayer("states-fill")) return;
    map.setPaintProperty(
      "states-fill",
      "fill-color",
      focusedState
        ? ["case", ["==", ["get", "abbrev"], focusedState], STATE_FOCUSED_FILL, STATE_DIMMED_FILL]
        : ["get", "fill"],
    );
    void setCountyLayer(map, focusedState);
  }, [focusedState]);

  return <div ref={containerRef} style={{ width: "100%", height: "100%" }} />;
});

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
import { Map as MaplibreMap, NavigationControl, type StyleSpecification } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { feature } from "topojson-client";
import { GEO_URL } from "./map-constants";

// Here's My Church is a data visualization, not a street map: a cream canvas
// with purple choropleth regions — no roads or labels. So the base "style" is
// just the app's cream background. Region polygons are added as GeoJSON layers
// on top (see addStatesLayer). A subtle street basemap can be faded in only at
// high (church-level) zoom later, per docs/future/mapbox-migration.md.
const CREAM = "#F5F0E8"; // --background (national view)
const STATE_FILL = "#C9A0DC"; // brand purple
const STATE_STROKE = "#6B21A8"; // deep purple borders

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
  /** Called after the user finishes moving the map. */
  onMoveEnd?: (center: [number, number], zoom: number) => void;
}

/**
 * Add US state polygons as a branded GeoJSON layer (purple choropleth on cream),
 * matching the current SVG map's look. us-atlas ships TopoJSON, which we convert
 * to GeoJSON with topojson-client. This is step 1 of porting the app's layers;
 * region coloring by church-count tier and non-US sources come next.
 */
async function addStatesLayer(map: MaplibreMap) {
  try {
    const topo = await (await fetch(GEO_URL)).json();
    const geo = feature(topo, topo.objects.states) as GeoJSON.FeatureCollection;
    if (map.getSource("states")) return;
    map.addSource("states", { type: "geojson", data: geo });
    map.addLayer({
      id: "states-fill",
      type: "fill",
      source: "states",
      paint: { "fill-color": STATE_FILL, "fill-opacity": 0.85 },
    });
    map.addLayer({
      id: "states-line",
      type: "line",
      source: "states",
      paint: { "line-color": STATE_STROKE, "line-width": 0.6 },
    });
  } catch (err) {
    console.error("[maplibre] failed to load states layer", err);
  }
}

export const MapLibreCanvas = memo(function MapLibreCanvas({
  center = US_DEFAULT_CENTER,
  zoom = US_DEFAULT_ZOOM,
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
    map.on("load", () => { void addStatesLayer(map); });

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

  return <div ref={containerRef} style={{ width: "100%", height: "100%" }} />;
});

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

// Free RASTER basemap, no API key or token required (CARTO Positron "light_all",
// light palette that suits the app). Raster tiles render as plain images without
// MapLibre's vector-tile web worker, which makes them far more robust across
// environments than the vector style. Swappable for any raster/vector source.
const BASEMAP_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    basemap: {
      type: "raster",
      tiles: [
        "https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png",
        "https://b.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png",
        "https://c.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png",
      ],
      tileSize: 256,
      attribution: '© <a href="https://carto.com/">CARTO</a> © OpenStreetMap contributors',
    },
  },
  layers: [{ id: "basemap", type: "raster", source: "basemap" }],
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

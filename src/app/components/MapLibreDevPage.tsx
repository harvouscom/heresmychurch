/**
 * TEMPORARY dev harness for the Phase 0 MapLibre migration.
 * Route: /dev/maplibre. Remove before merging feature/maplibre-migration.
 */
import { useState } from "react";
import { MapLibreCanvas, US_DEFAULT_CENTER, US_DEFAULT_ZOOM } from "./MapLibreCanvas";

export function MapLibreDevPage() {
  const [view, setView] = useState<{ center: [number, number]; zoom: number }>({
    center: US_DEFAULT_CENTER,
    zoom: US_DEFAULT_ZOOM,
  });

  return (
    <div style={{ position: "fixed", inset: 0 }}>
      <div
        style={{
          position: "absolute",
          top: 12,
          left: 12,
          zIndex: 10,
          display: "flex",
          gap: 8,
          background: "rgba(255,255,255,0.9)",
          padding: 8,
          borderRadius: 8,
          fontSize: 13,
        }}
      >
        <button onClick={() => setView({ center: US_DEFAULT_CENTER, zoom: US_DEFAULT_ZOOM })}>
          USA
        </button>
        <button onClick={() => setView({ center: [-79.4, 43.7], zoom: 8 })}>Toronto, CA</button>
        <button onClick={() => setView({ center: [-0.12, 51.5], zoom: 8 })}>London, UK</button>
        <span style={{ alignSelf: "center", color: "#555" }}>
          MapLibre scaffold — flies anywhere on Earth (Web Mercator)
        </span>
      </div>
      <MapLibreCanvas
        center={view.center}
        zoom={view.zoom}
        onMoveEnd={(c, z) => console.log("[maplibre-dev] moveend", c, z)}
      />
    </div>
  );
}

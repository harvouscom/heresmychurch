/**
 * TEMPORARY dev harness for the Phase 0 MapLibre migration.
 * Route: /dev/maplibre. Remove before merging feature/maplibre-migration.
 */
import { useEffect, useState } from "react";
import { MapLibreCanvas, US_DEFAULT_CENTER, US_DEFAULT_ZOOM } from "./MapLibreCanvas";
import { fetchStates, fetchChurches } from "./api";
import type { Church, StateInfo } from "./church-data";

export function MapLibreDevPage() {
  const [view, setView] = useState<{ center: [number, number]; zoom: number }>({
    center: US_DEFAULT_CENTER,
    zoom: US_DEFAULT_ZOOM,
  });
  const [states, setStates] = useState<StateInfo[]>([]);
  const [focusedState, setFocusedState] = useState<string | null>(null);
  const [churches, setChurches] = useState<Church[]>([]);

  // Load churches for the focused state (mirrors useChurchMapData's behavior).
  useEffect(() => {
    if (!focusedState) {
      setChurches([]);
      return;
    }
    fetchChurches(focusedState)
      .then((r) => setChurches(r.churches))
      .catch((e) => console.error("[maplibre-dev] fetchChurches failed", e));
  }, [focusedState]);

  useEffect(() => {
    fetchStates()
      .then((r) => setStates(r.states))
      .catch((e) => console.error("[maplibre-dev] fetchStates failed", e));
  }, []);

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
        <button
          onClick={() => {
            setFocusedState(null);
            setView({ center: US_DEFAULT_CENTER, zoom: US_DEFAULT_ZOOM });
          }}
        >
          USA
        </button>
        <button
          onClick={() => {
            setFocusedState("TX");
            setView({ center: [-99.4, 31.3], zoom: 5.2 });
          }}
        >
          Texas (counties)
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
        states={states}
        focusedState={focusedState}
        churches={churches}
        onStateClick={(abbrev) => {
          console.log("[maplibre-dev] state click", abbrev);
          setFocusedState(abbrev);
        }}
        onCountyClick={(fips) => console.log("[maplibre-dev] county click", fips)}
        onChurchClick={(ch) => console.log("[maplibre-dev] church click", ch.name, ch.id)}
        onChurchHover={(ch) => ch && console.log("[maplibre-dev] church hover", ch.name)}
        onResetView={() => {
          console.log("[maplibre-dev] reset view");
          setFocusedState(null);
        }}
      />
    </div>
  );
}

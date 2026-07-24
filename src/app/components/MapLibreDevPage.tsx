/**
 * TEMPORARY dev harness for the Phase 0 MapLibre migration.
 * Route: /dev/maplibre. Remove before merging feature/maplibre-migration.
 */
import { useEffect, useMemo, useState } from "react";
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
  const [bounds, setBounds] = useState<[[number, number], [number, number]] | null>(null);
  const [selectedChurchId, setSelectedChurchId] = useState<string | null>(null);

  // Derived, not captured at moveend: churches often arrive *after* the camera
  // has settled, so the count must recompute when either bounds or data change.
  const inView = useMemo(() => {
    if (!bounds || churches.length === 0) return null;
    const [[w, s], [e, n]] = bounds;
    return churches.filter((ch) => ch.lng >= w && ch.lng <= e && ch.lat >= s && ch.lat <= n).length;
  }, [bounds, churches]);

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
        {/* Focus drives the camera via fitBounds — no manual center/zoom. */}
        <button onClick={() => setFocusedState(null)}>USA</button>
        <button onClick={() => setFocusedState("TX")}>Texas</button>
        <button onClick={() => setFocusedState("RI")}>Rhode Island</button>
        <button onClick={() => setFocusedState("AK")}>Alaska</button>
        <button onClick={() => setView({ center: [-79.4, 43.7], zoom: 8 })}>Toronto, CA</button>
        <button onClick={() => setView({ center: [-0.12, 51.5], zoom: 8 })}>London, UK</button>
        <span style={{ alignSelf: "center", color: "#555" }}>
          {inView === null
            ? "MapLibre scaffold — flies anywhere on Earth (Web Mercator)"
            : `${inView.toLocaleString()} of ${churches.length.toLocaleString()} churches in view`}
        </span>
      </div>
      <MapLibreCanvas
        center={view.center}
        zoom={view.zoom}
        states={states}
        focusedState={focusedState}
        churches={churches}
        // The map's real visible extent replaces MapSearchBar's geoAlbersUsa
        // projection math for "churches in view".
        onMoveEnd={(_c, _z, b) => setBounds(b)}
        onStateClick={(abbrev) => {
          console.log("[maplibre-dev] state click", abbrev);
          setFocusedState(abbrev);
        }}
        onCountyClick={(fips) => console.log("[maplibre-dev] county click", fips)}
        selectedChurchId={selectedChurchId}
        onChurchClick={(ch) => {
          console.log("[maplibre-dev] church click", ch.name, ch.id);
          setSelectedChurchId(ch.id);
        }}
        onChurchHover={(ch) => ch && console.log("[maplibre-dev] church hover", ch.name)}
        onResetView={() => {
          console.log("[maplibre-dev] reset view");
          setFocusedState(null);
        }}
      />
    </div>
  );
}

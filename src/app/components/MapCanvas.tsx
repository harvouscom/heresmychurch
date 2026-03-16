/**
 * MapCanvas — extracted from ChurchMap to reduce render-tree depth.
 * Contains ComposableMap, ZoomableGroup, state/county Geographies,
 * the background click-rect, ChurchDots, and StateActiveLabels.
 */
import { memo, useState, useCallback, useRef, useSyncExternalStore, useEffect } from "react";
import {
  ComposableMap,
  Geographies,
  Geography,
  ZoomableGroup,
  useMapContext,
  useZoomPanContext,
} from "react-simple-maps";
import { geoContains } from "d3-geo";
import { ChurchDots } from "./ChurchDots";
import type { Church, StateInfo } from "./church-data";
import {
  GEO_URL,
  COUNTIES_GEO_URL,
  FIPS_TO_STATE,
  STATE_TO_FIPS,
  getStateTier,
  getCountyPerCapitaColor,
} from "./map-constants";

export type CountyStats = {
  byFips: Record<string, { churchCount: number; population: number; perCapita: number; peoplePer: number; name: string }>;
  sortedByPerCapita: Array<{ fips: string; name: string; churchCount: number; population: number; perCapita: number; peoplePer: number }>;
};

interface MapCanvasProps {
  center: [number, number];
  zoom: number;
  minZoom?: number;
  maxZoom?: number;
  focusedState: string | null;
  hoveredState: string | null;
  states: StateInfo[];
  filteredChurches: Church[];
  selectedChurchId: string | null;
  onMoveEnd: (coords: [number, number], z: number) => void;
  onStateClick: (abbrev: string, e?: React.MouseEvent) => void;
  onResetView: () => void;
  onStateHover: (abbrev: string | null) => void;
  onChurchClick: (church: Church) => void;
  onChurchHover: (church: Church | null) => void;
  isTransitioning: boolean;
  zoomTransitioning?: boolean;
  onUserInteractionStart?: () => void;
  countyStats: CountyStats | null;
  hoveredCounty: string | null;
  onCountyHover: (fips: string | null) => void;
  focusedCounty: string | null;
  onCountyClick: (fips: string) => void;
  countyFeatures: Map<string, unknown> | null;
}

export const MapCanvas = memo(function MapCanvas({
  center,
  zoom,
  minZoom = 1,
  maxZoom = 500,
  focusedState,
  hoveredState,
  states,
  filteredChurches,
  selectedChurchId,
  onMoveEnd,
  onStateClick,
  onResetView,
  onStateHover,
  onChurchClick,
  onChurchHover,
  isTransitioning,
  zoomTransitioning = false,
  onUserInteractionStart,
  countyStats,
  hoveredCounty,
  onCountyHover,
  focusedCounty,
  onCountyClick,
  countyFeatures,
}: MapCanvasProps) {
  // Detect touch/hover-less device from first paint so we never show hover tooltips on mobile.
  // (hover: none) = primary input can't hover (e.g. phones). Fallback: (pointer: coarse) or first touch.
  const hoverNone = useSyncExternalStore(
    (cb) => {
      const m = window.matchMedia("(hover: none)");
      m.addEventListener("change", cb);
      return () => m.removeEventListener("change", cb);
    },
    () => typeof window !== "undefined" && window.matchMedia("(hover: none)").matches,
    () => false
  );
  const [touchSeen, setTouchSeen] = useState(false);
  const markTouch = useCallback(() => {
    setTouchSeen(true);
    // Clear any hover state set by synthetic mouse events from the tap
    onStateHover(null);
    onChurchHover(null);
    onCountyHover(null);
  }, [onStateHover, onChurchHover, onCountyHover]);
  const isTouchDevice = hoverNone || touchSeen;

  // County click when user clicks (no pan). We detect "click" via map's onMoveEnd: if the map
  // didn't move (same center), it was a click. Pan works because we never block mousedown.
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const centerRef = useRef(center);
  centerRef.current = center;
  const countyClickPendingRef = useRef<{ fips: string; startCenter: [number, number] } | null>(null);
  const onCountyClickRef = useRef(onCountyClick);
  onCountyClickRef.current = onCountyClick;

  useEffect(() => {
    const onMouseDown = (e: MouseEvent) => {
      const container = mapContainerRef.current;
      if (!container || !container.contains(e.target as Node)) return;
      const target = (e.target as Element)?.closest?.("[data-fips]");
      const fips = target?.getAttribute?.("data-fips") ?? (target as HTMLElement)?.dataset?.fips;
      if (fips) {
        countyClickPendingRef.current = { fips, startCenter: centerRef.current };
      } else {
        countyClickPendingRef.current = null;
      }
    };

    document.addEventListener("mousedown", onMouseDown, true);
    return () => document.removeEventListener("mousedown", onMouseDown, true);
  }, []);

  const handleMoveEnd = useCallback(
    (args: { coordinates: [number, number]; zoom: number }) => {
      const { coordinates, zoom: z } = args;
      if (coordinates && coordinates[0] != null && coordinates[1] != null) {
        onMoveEnd(coordinates, z);
      }
      const pending = countyClickPendingRef.current;
      countyClickPendingRef.current = null;
      if (pending && coordinates) {
        const [lon, lat] = coordinates;
        const [sLon, sLat] = pending.startCenter;
        const distSq = (lon - sLon) ** 2 + (lat - sLat) ** 2;
        if (distSq < 1e-8) {
          onCountyClickRef.current(pending.fips);
        }
      }
    },
    [onMoveEnd]
  );

  // On desktop (non-touch), prevent wheel from scrolling the page so only the map zooms.
  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      if (!isTouchDevice) e.preventDefault();
    },
    [isTouchDevice]
  );

  const transitionClass = isTransitioning ? 'map-transitioning' : zoomTransitioning ? 'map-zoom-transitioning' : '';

  return (
    <div
      ref={mapContainerRef}
      className={transitionClass}
      style={{ width: '100%', height: '100%', touchAction: 'none' }}
      onTouchStart={markTouch}
      onWheel={handleWheel}
    >
    <ComposableMap
      projection="geoAlbersUsa"
      style={{ width: "100%", height: "100%" }}
      projectionConfig={{ scale: 1000 }}
    >
      <ZoomableGroup
        center={center}
        zoom={zoom}
        minZoom={minZoom}
        maxZoom={maxZoom}
        onMoveStart={() => { if (onUserInteractionStart) onUserInteractionStart(); }}
        onMoveEnd={handleMoveEnd}
      >
        {focusedState && (
          <rect
            x={-500} y={-500} width={2000} height={2000}
            fill="transparent"
            onClick={onResetView}
            style={{ cursor: "pointer" }}
          />
        )}

        <StateGeographies
          focusedState={focusedState}
          hoveredState={hoveredState}
          states={states}
          onStateClick={onStateClick}
          onResetView={onResetView}
          onStateHover={onStateHover}
          disableHover={isTouchDevice}
        />

        {focusedState && countyFeatures?.size && (
          <CountyClickOverlay
            focusedState={focusedState}
            countyFeatures={countyFeatures}
            onCountyClick={onCountyClick}
          />
        )}
        {focusedState && (
          <CountyGeographies
            focusedState={focusedState}
            countyStats={countyStats}
            hoveredCounty={hoveredCounty}
            onCountyHover={onCountyHover}
            focusedCounty={focusedCounty}
            onCountyClick={onCountyClick}
            disableHover={isTouchDevice}
          />
        )}

        {filteredChurches.length > 0 && (
          <ChurchDots
            churches={filteredChurches}
            selectedChurchId={selectedChurchId}
            zoom={zoom}
            center={center}
            onChurchClick={onChurchClick}
            onChurchHover={onChurchHover}
            disableHover={isTouchDevice}
          />
        )}
      </ZoomableGroup>
    </ComposableMap>
    </div>
  );
});

/* ── County click overlay: hit-test so county click works even when dots or zoom capture the event ── */
function CountyClickOverlay({
  focusedState,
  countyFeatures,
}: {
  focusedState: string;
  countyFeatures: Map<string, unknown>;
  onCountyClick: (fips: string) => void;
}) {
  // Transparent overlay below county paths; county click is handled by path data-fips + div capture (click vs drag).
  return (
    <rect
      x={-2000}
      y={-2000}
      width={4000}
      height={4000}
      fill="transparent"
      pointerEvents="none"
      style={{ cursor: "pointer" }}
    />
  );
}

/* ── State boundaries ── */
const StateGeographies = memo(function StateGeographies({
  focusedState,
  hoveredState,
  states,
  onStateClick,
  onResetView,
  onStateHover,
  disableHover = false,
}: {
  focusedState: string | null;
  hoveredState: string | null;
  states: StateInfo[];
  onStateClick: (abbrev: string, e?: React.MouseEvent) => void;
  onResetView: () => void;
  onStateHover: (abbrev: string | null) => void;
  disableHover?: boolean;
}) {
  return (
    <Geographies geography={GEO_URL}>
      {({ geographies }: { geographies: any[] }) =>
        (geographies || []).map((geo) => {
          const fipsId = geo.id;
          const stateAbbrev = FIPS_TO_STATE[fipsId];
          const stateInfo = states.find((s) => s.abbrev === stateAbbrev);
          const isFocused = focusedState === stateAbbrev;
          const isHovered = !disableHover && hoveredState === stateAbbrev;

          const churchCount = stateInfo?.churchCount || 0;
          const tier = getStateTier(churchCount);
          let fill = tier.color;
          if (isFocused) fill = "#C9A0DC";
          else if (isHovered && !focusedState) fill = "#D4B8E8";
          else if (focusedState && !isFocused) fill = "#EDE4F3";

          return (
            <Geography
              key={geo.rsmKey}
              geography={geo}
              fill={fill}
              stroke={isFocused ? "#6B21A8" : "#C9A0DC"}
              strokeWidth={isFocused ? 1.5 : 0.5}
              onClick={(e: React.MouseEvent) => {
                if (stateAbbrev && !focusedState) {
                  onStateClick(stateAbbrev, e);
                } else if (focusedState && isFocused) {
                  e.stopPropagation();
                } else if (focusedState && !isFocused) {
                  onResetView();
                }
              }}
              onMouseEnter={disableHover ? undefined : () => onStateHover(stateAbbrev || null)}
              onMouseLeave={disableHover ? undefined : () => onStateHover(null)}
              style={{
                default: { outline: "none", cursor: focusedState && isFocused ? "default" : "pointer" },
                hover: { outline: "none", cursor: focusedState && isFocused ? "default" : "pointer" },
                pressed: { outline: "none", cursor: focusedState && isFocused ? "default" : "pointer" },
              }}
            />
          );
        })
      }
    </Geographies>
  );
});

/* ── County boundaries (choropleth by churches per capita) ── */
const CountyGeographies = memo(function CountyGeographies({
  focusedState,
  countyStats,
  hoveredCounty,
  onCountyHover,
  focusedCounty,
  onCountyClick,
  disableHover,
}: {
  focusedState: string;
  countyStats: CountyStats | null;
  hoveredCounty: string | null;
  onCountyHover: (fips: string | null) => void;
  focusedCounty: string | null;
  onCountyClick: (fips: string) => void;
  disableHover?: boolean;
}) {
  const stateFips = STATE_TO_FIPS[focusedState];
  if (!stateFips) return null;

  return (
    <Geographies geography={COUNTIES_GEO_URL}>
      {({ geographies }: { geographies: any[] }) =>
        (geographies || [])
          .filter((geo) => String(geo.id).padStart(5, "0").substring(0, 2) === stateFips)
          .map((geo) => {
            const fips = String(geo.id).padStart(5, "0");
            const data = countyStats?.byFips[fips];
            const fill = data
              ? getCountyPerCapitaColor(data.perCapita, countyStats?.sortedByPerCapita ?? [])
              : "rgba(255, 255, 255, 0.8)";
            const isHovered = !disableHover && hoveredCounty === fips;
            const isFocused = focusedCounty === fips;
            const effectiveFill = isFocused ? "#D4B8E8" : isHovered ? "#D4B8E8" : fill;
            const effectiveStroke = isFocused ? "rgba(107, 33, 168, 0.8)" : isHovered ? "rgba(107, 33, 168, 0.6)" : "rgba(107, 33, 168, 0.25)";
            const effectiveStrokeWidth = isFocused ? 1 : isHovered ? 0.8 : 0.4;
            return (
              <g key={geo.rsmKey} data-fips={fips} style={{ cursor: "pointer" }}>
                <Geography
                  geography={geo}
                  fill={effectiveFill}
                  stroke={effectiveStroke}
                  strokeWidth={effectiveStrokeWidth}
                  pointerEvents={disableHover ? "none" : "auto"}
                  onMouseEnter={disableHover ? undefined : () => onCountyHover(fips)}
                  onMouseLeave={disableHover ? undefined : () => onCountyHover(null)}
                  style={{
                    default: { outline: "none", cursor: "pointer" },
                    hover: { outline: "none", cursor: "pointer" },
                    pressed: { outline: "none", cursor: "pointer" },
                  }}
                />
              </g>
            );
          })
      }
    </Geographies>
  );
});
/**
 * MapCanvas — extracted from ChurchMap to reduce render-tree depth.
 * Contains ComposableMap, ZoomableGroup, state/county Geographies,
 * the background click-rect, and ChurchDots.
 */
import { memo } from "react";
import {
  ComposableMap,
  Geographies,
  Geography,
  ZoomableGroup,
} from "react-simple-maps";
import { ChurchDots } from "./ChurchDots";
import type { Church, StateInfo } from "./church-data";
import {
  GEO_URL,
  COUNTIES_GEO_URL,
  FIPS_TO_STATE,
  STATE_TO_FIPS,
  getStateTier,
} from "./map-constants";

interface MapCanvasProps {
  center: [number, number];
  zoom: number;
  focusedState: string | null;
  hoveredState: string | null;
  states: StateInfo[];
  filteredChurches: Church[];
  selectedChurchId: string | null;
  onMoveEnd: (coords: [number, number], z: number) => void;
  onStateClick: (abbrev: string) => void;
  onResetView: () => void;
  onStateHover: (abbrev: string | null) => void;
  onChurchClick: (church: Church) => void;
  onChurchHover: (church: Church | null) => void;
}

export const MapCanvas = memo(function MapCanvas({
  center,
  zoom,
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
}: MapCanvasProps) {
  return (
    <ComposableMap
      projection="geoAlbersUsa"
      style={{ width: "100%", height: "100%" }}
      projectionConfig={{ scale: 1000 }}
    >
      <ZoomableGroup
        center={center}
        zoom={zoom}
        minZoom={1}
        maxZoom={120}
        onMoveEnd={({ coordinates, zoom: z }: { coordinates: [number, number]; zoom: number }) => {
          if (coordinates && coordinates[0] != null && coordinates[1] != null) {
            onMoveEnd(coordinates, z);
          }
        }}
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
        />

        {focusedState && (
          <CountyGeographies focusedState={focusedState} />
        )}

        {filteredChurches.length > 0 && (
          <ChurchDots
            churches={filteredChurches}
            selectedChurchId={selectedChurchId}
            zoom={zoom}
            center={center}
            onChurchClick={onChurchClick}
            onChurchHover={onChurchHover}
          />
        )}
      </ZoomableGroup>
    </ComposableMap>
  );
});

/* ── State boundaries ── */
const StateGeographies = memo(function StateGeographies({
  focusedState,
  hoveredState,
  states,
  onStateClick,
  onResetView,
  onStateHover,
}: {
  focusedState: string | null;
  hoveredState: string | null;
  states: StateInfo[];
  onStateClick: (abbrev: string) => void;
  onResetView: () => void;
  onStateHover: (abbrev: string | null) => void;
}) {
  return (
    <Geographies geography={GEO_URL}>
      {({ geographies }: { geographies: any[] }) =>
        geographies.map((geo) => {
          const fipsId = geo.id;
          const stateAbbrev = FIPS_TO_STATE[fipsId];
          const stateInfo = states.find((s) => s.abbrev === stateAbbrev);
          const isFocused = focusedState === stateAbbrev;
          const isHovered = hoveredState === stateAbbrev;

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
                  onStateClick(stateAbbrev);
                } else if (focusedState && isFocused) {
                  e.stopPropagation();
                } else if (focusedState && !isFocused) {
                  onResetView();
                }
              }}
              onMouseEnter={() => onStateHover(stateAbbrev || null)}
              onMouseLeave={() => onStateHover(null)}
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

/* ── County boundaries ── */
const CountyGeographies = memo(function CountyGeographies({
  focusedState,
}: {
  focusedState: string;
}) {
  const stateFips = STATE_TO_FIPS[focusedState];
  if (!stateFips) return null;

  return (
    <Geographies geography={COUNTIES_GEO_URL}>
      {({ geographies }: { geographies: any[] }) =>
        geographies
          .filter((geo) => String(geo.id).padStart(5, "0").substring(0, 2) === stateFips)
          .map((geo) => (
            <Geography
              key={geo.rsmKey}
              geography={geo}
              fill="transparent"
              stroke="rgba(107, 33, 168, 0.25)"
              strokeWidth={0.4}
              pointerEvents="none"
              style={{
                default: { outline: "none", cursor: "default" },
                hover: { outline: "none", cursor: "default" },
                pressed: { outline: "none", cursor: "default" },
              }}
            />
          ))
      }
    </Geographies>
  );
});

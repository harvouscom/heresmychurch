/**
 * MapCanvas — extracted from ChurchMap to reduce render-tree depth.
 * Contains ComposableMap, ZoomableGroup, state/county Geographies,
 * the background click-rect, ChurchDots, and StateActiveLabels.
 */
import { memo, useState, useCallback } from "react";
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
  onUserInteractionStart?: () => void;
  countyStats: CountyStats | null;
  hoveredCounty: string | null;
  onCountyHover: (fips: string | null) => void;
}

export const MapCanvas = memo(function MapCanvas({
  center,
  zoom,
  minZoom = 1,
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
  onUserInteractionStart,
  countyStats,
  hoveredCounty,
  onCountyHover,
}: MapCanvasProps) {
  const [isTouchDevice, setIsTouchDevice] = useState(false);
  const markTouch = useCallback(() => setIsTouchDevice(true), []);

  return (
    <div
      className={isTransitioning ? 'map-transitioning' : ''}
      style={{ width: '100%', height: '100%', touchAction: 'none' }}
      onTouchStart={markTouch}
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
        maxZoom={200}
        onMoveStart={() => { if (onUserInteractionStart) onUserInteractionStart(); }}
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
          disableHover={isTouchDevice}
        />

        {focusedState && (
          <CountyGeographies
            focusedState={focusedState}
            countyStats={countyStats}
            hoveredCounty={hoveredCounty}
            onCountyHover={onCountyHover}
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
  disableHover,
}: {
  focusedState: string;
  countyStats: CountyStats | null;
  hoveredCounty: string | null;
  onCountyHover: (fips: string | null) => void;
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
            return (
              <Geography
                key={geo.rsmKey}
                geography={geo}
                fill={isHovered ? "#D4B8E8" : fill}
                stroke={isHovered ? "rgba(107, 33, 168, 0.6)" : "rgba(107, 33, 168, 0.25)"}
                strokeWidth={isHovered ? 0.8 : 0.4}
                pointerEvents={disableHover ? "none" : "auto"}
                onMouseEnter={disableHover ? undefined : () => onCountyHover(fips)}
                onMouseLeave={disableHover ? undefined : () => onCountyHover(null)}
                style={{
                  default: { outline: "none", cursor: "default" },
                  hover: { outline: "none", cursor: "default" },
                  pressed: { outline: "none", cursor: "default" },
                }}
              />
            );
          })
      }
    </Geographies>
  );
});
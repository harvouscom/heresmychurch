import { CloseButton } from "./ui/close-button";
import { sizeCategories } from "./church-data";
import type { StateInfo } from "./church-data";
import { STATE_COUNT_TIERS } from "./map-constants";
import { getCountry, WORLD_COUNT_TIERS, type CountTier } from "../config/countries";

interface MapLegendProps {
  focusedState: string | null;
  showLegend: boolean;
  setShowLegend: (v: boolean) => void;
  setShowSummary: (v: boolean) => void;
  setShowFilterPanel: (v: boolean) => void;
  allStatesLoaded: boolean;
  states: StateInfo[];
  filteredChurches: { length: number };
  sizeCounts: Record<string, number>;
  countryCode?: string;
  viewLevel?: "world" | "country" | "region";
}

export function MapLegend({
  focusedState,
  showLegend,
  setShowLegend,
  setShowSummary,
  setShowFilterPanel,
  allStatesLoaded,
  states,
  filteredChurches,
  sizeCounts,
  countryCode = "US",
  viewLevel = "country",
}: MapLegendProps) {
  const toggle = () => {
    setShowLegend(!showLegend);
    if (!showLegend) {
      setShowSummary(false);
      setShowFilterPanel(false);
    }
  };

  if (!showLegend) return null;

  return (
    <div
      className="absolute left-[58px] bottom-6 z-[35] rounded-xl shadow-2xl p-4 w-[260px] max-h-[70vh] overflow-y-auto"
      style={{ backgroundColor: "rgba(30, 16, 64, 0.96)" }}
    >
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-semibold text-white">Map Key</span>
        <CloseButton onClick={toggle} size="md" />
      </div>

      <span className="text-xs font-semibold text-purple-300 uppercase tracking-wider block mb-2">
        {focusedState
          ? "Attendance"
          : viewLevel === "world"
            ? "Churches per Country"
            : (getCountry(countryCode)?.legendHeading ?? "Churches per Region")}
      </span>
      {focusedState ? (
        <AttendanceLegend
          filteredChurchCount={filteredChurches.length}
          sizeCounts={sizeCounts}
        />
      ) : (
        <StateLegend
          allStatesLoaded={allStatesLoaded}
          states={states}
          tiers={
            viewLevel === "world"
              ? WORLD_COUNT_TIERS
              : (getCountry(countryCode)?.countTiers ?? STATE_COUNT_TIERS)
          }
        />
      )}
    </div>
  );
}

function AttendanceLegend({
  filteredChurchCount,
  sizeCounts,
}: {
  filteredChurchCount: number;
  sizeCounts: Record<string, number>;
}) {
  return (
    <>
      {sizeCategories.map((cat) => (
        <div key={cat.label} className="flex items-center gap-2.5 py-0.5">
          <div
            className="rounded-full flex-shrink-0"
            style={{
              width: Math.max(cat.radius * 1.5, 6),
              height: Math.max(cat.radius * 1.5, 6),
              backgroundColor: cat.color,
            }}
          />
          <span className="text-xs text-white/60">{cat.label}</span>
          <span className="text-xs text-white/30 ml-auto pl-3">
            {(() => {
              const count = sizeCounts[cat.label] || 0;
              if (filteredChurchCount === 0 || count === 0) return "0%";
              const pct = (count / filteredChurchCount) * 100;
              if (pct < 1) return "< 1%";
              return `${Math.round(pct)}%`;
            })()}
          </span>
        </div>
      ))}
    </>
  );
}

function StateLegend({
  allStatesLoaded,
  states,
  tiers,
}: {
  allStatesLoaded: boolean;
  states: StateInfo[];
  tiers: CountTier[];
}) {
  return (
    <>
      {tiers.map((tier) => {
        if (tier.min === 0 && tier.max === 0 && allStatesLoaded) return null;
        const count = states.filter((s) => {
          if (tier.min === 0 && tier.max === 0)
            return !s.isPopulated || s.churchCount === 0;
          return s.churchCount >= tier.min && s.churchCount <= tier.max;
        }).length;
        return (
          <div key={tier.label} className="flex items-center gap-2.5 py-0.5">
            <div
              className="w-3.5 h-2.5 rounded-sm flex-shrink-0"
              style={{ backgroundColor: tier.color }}
            />
            <span className="text-xs text-white/60">{tier.label}</span>
            {count > 0 && (
              <span className="text-xs text-white/30 ml-auto pl-3">
                {count}
              </span>
            )}
          </div>
        );
      })}
    </>
  );
}
import { ChevronDown, Key } from "lucide-react";
import { sizeCategories } from "./church-data";
import type { StateInfo } from "./church-data";
import { STATE_COUNT_TIERS } from "./map-constants";

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
}: MapLegendProps) {
  const toggle = () => {
    setShowLegend(!showLegend);
    if (!showLegend) {
      setShowSummary(false);
      setShowFilterPanel(false);
    }
  };

  return (
    <div className="w-fit">
      {!showLegend ? (
        <button
          type="button"
          onClick={toggle}
          title="Map Key"
          aria-label="Map Key"
          className="w-8 h-8 rounded-lg flex items-center justify-center shadow-md transition-colors hover:opacity-90"
          style={{ backgroundColor: "rgba(30, 16, 64, 0.93)" }}
        >
          <Key size={14} color="#C9A0DC" />
        </button>
      ) : (
        <div
          className="shadow-lg overflow-hidden rounded-xl w-fit min-w-[140px]"
          style={{ backgroundColor: "rgba(30, 16, 64, 0.93)" }}
        >
          <button
            type="button"
            onClick={toggle}
            className="flex flex-nowrap items-center justify-between gap-2 px-3 py-2 w-full text-left"
          >
            <span className="text-[11px] font-medium text-white uppercase tracking-wide whitespace-nowrap">
              Map Key
            </span>
            <ChevronDown size={12} className="text-white/50 rotate-180 flex-shrink-0" />
          </button>
          <div className="px-3 pb-3">
            <div className="pt-2 border-t border-white/10">
              <span className="text-[11px] font-medium text-purple-300 uppercase tracking-wide block mb-2">
                {focusedState ? "Attendance" : "Churches per State"}
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
                />
              )}
            </div>
          </div>
        </div>
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
}: {
  allStatesLoaded: boolean;
  states: StateInfo[];
}) {
  return (
    <>
      {STATE_COUNT_TIERS.map((tier) => {
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
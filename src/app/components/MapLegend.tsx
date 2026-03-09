import { ChevronDown } from "lucide-react";
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
  return (
    <div className="absolute bottom-6 right-4 z-20">
      <div
        className={`shadow-lg cursor-pointer overflow-hidden ${
          showLegend ? "rounded-xl" : "rounded-full"
        }`}
        style={{ backgroundColor: "rgba(30, 16, 64, 0.93)" }}
        onClick={() => {
          setShowLegend(!showLegend);
          if (!showLegend) {
            setShowSummary(false);
            setShowFilterPanel(false);
          }
        }}
      >
        <div className="flex items-center justify-between px-4 py-2.5">
          <span className="text-xs font-bold text-white uppercase tracking-widest whitespace-nowrap">
            Map Key
          </span>
          <ChevronDown
            size={14}
            className={`text-white/50 transition-transform duration-200 flex-shrink-0 ${
              showLegend ? "rotate-180" : ""
            }`}
          />
        </div>
        <div
          className="grid transition-[grid-template-rows] duration-200 ease-out"
          style={{ gridTemplateRows: showLegend ? "1fr" : "0fr" }}
        >
          <div className="overflow-hidden">
            <div className="px-4 pb-3">
              <div className="pt-2 border-t border-white/10">
                <span className="text-xs font-semibold text-purple-300 uppercase tracking-wide block mb-2">
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
        </div>
      </div>
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
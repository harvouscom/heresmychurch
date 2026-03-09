import { motion } from "motion/react";
import {
  X,
  Church as ChurchIcon,
  Users,
  Building2,
  Search,
  TrendingUp,
  BookOpen,
  BarChart3,
  MapPin,
  type LucideIcon,
} from "lucide-react";
import { sizeCategories } from "./church-data";
import type { StateInfo } from "./church-data";

type InterestingFact = {
  icon: string;
  label: string;
  primary: string;
  secondary: string;
  abbrev?: string;
};

const FACT_ICONS: Record<string, LucideIcon> = {
  users: Users,
  building: Building2,
  search: Search,
  trending: TrendingUp,
  book: BookOpen,
  chart: BarChart3,
  mapPin: MapPin,
};

interface StateSummaryData {
  type: "state";
  totalAttendance: number;
  topDenoms: [string, number][];
  topSizes: { label: string; color: string; count: number }[];
  interestingFacts: InterestingFact[];
}

interface NationalSummaryData {
  type: "national";
  populated: number;
  unpopulated: number;
  topStates: StateInfo[];
  interestingFacts: InterestingFact[];
}

export type SummaryStats = StateSummaryData | NationalSummaryData;

interface SummaryPanelProps {
  summaryStats: SummaryStats;
  focusedState: string | null;
  focusedStateName: string;
  churches: { length: number };
  totalChurches: number;
  allStatesLoaded: boolean;
  statePopulations: Record<string, number>;
  onClose: () => void;
  onNavigateToState: (abbrev: string) => void;
  onShowListModal: () => void;
  onShowAddChurch: () => void;
}

export function SummaryPanel({
  summaryStats,
  focusedState,
  focusedStateName,
  churches,
  totalChurches,
  allStatesLoaded,
  statePopulations,
  onClose,
  onNavigateToState,
  onShowListModal,
  onShowAddChurch,
}: SummaryPanelProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -8, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -8, scale: 0.97 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className="mt-2 rounded-2xl shadow-2xl overflow-hidden w-full md:w-[360px] max-h-[70vh] flex flex-col"
      style={{ backgroundColor: "rgba(30, 16, 64, 0.97)" }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-white/8 flex-shrink-0">
        <span className="text-xs font-bold text-white uppercase tracking-widest">
          {focusedState ? `${focusedStateName} Summary` : "Summary"}
        </span>
        <button
          onClick={onClose}
          className="w-6 h-6 rounded-full flex items-center justify-center hover:bg-white/10 transition-colors"
        >
          <X size={14} className="text-white/50" />
        </button>
      </div>

      <div className="px-5 py-4 space-y-4 overflow-y-auto flex-1 min-h-0">
        {summaryStats.type === "state" ? (
          <StateSummaryContent
            stats={summaryStats}
            focusedState={focusedState!}
            focusedStateName={focusedStateName}
            churchCount={churches.length}
            statePopulation={statePopulations[focusedState!]}
          />
        ) : (
          <NationalSummaryContent
            stats={summaryStats}
            totalChurches={totalChurches}
            allStatesLoaded={allStatesLoaded}
            onNavigateToState={onNavigateToState}
          />
        )}

        {/* Disclaimer + data source footer */}
        <div className="pt-2 border-t border-white/5 space-y-1.5">
          <p className="text-white/30 text-[10px] text-center leading-relaxed italic">
            Not all churches may be represented yet — our goal is for every church to be included.{" "}
            {focusedState
              ? "Find your church or add it below!"
              : "Click any state to find or add your church!"}
          </p>
          <p className="text-white/20 text-[10px] text-center leading-relaxed">
            Church data from OpenStreetMap via Overpass API{" "}&middot;{" "}
            Cross-referenced with The Association of Religion Data Archives (ARDA){" "}&middot;{" "}
            Population from U.S. Census Bureau{" "}&middot;{" "}
            Boundaries from Natural Earth / U.S. Census TIGER
          </p>
        </div>
      </div>

      {/* Action buttons — pinned bottom (state view only) */}
      {summaryStats.type === "state" && (
        <div className="px-5 pb-4 pt-3 border-t border-white/8 flex-shrink-0 flex gap-2">
          <button
            onClick={onShowListModal}
            className="flex-1 py-2.5 rounded-xl text-xs font-semibold text-purple-300 bg-purple-500/15 hover:bg-purple-500/25 border border-purple-500/20 transition-colors cursor-pointer"
          >
            View Church List
          </button>
          <button
            onClick={onShowAddChurch}
            className="flex-1 py-2.5 rounded-xl text-xs font-semibold text-purple-300 bg-purple-500/15 hover:bg-purple-500/25 border border-purple-500/20 transition-colors cursor-pointer"
          >
            + Add Your Church
          </button>
        </div>
      )}
    </motion.div>
  );
}

function StateSummaryContent({
  stats,
  focusedState,
  focusedStateName,
  churchCount,
  statePopulation,
}: {
  stats: StateSummaryData;
  focusedState: string;
  focusedStateName: string;
  churchCount: number;
  statePopulation?: number;
}) {
  return (
    <>
      <p className="text-white/70 text-xs leading-relaxed">
        There are <span className="font-bold text-white">{churchCount.toLocaleString()} churches</span> in{" "}
        <span className="font-bold text-purple-300">{focusedStateName}</span> with an estimated combined weekly attendance of{" "}
        <span className="font-bold text-white">~{stats.totalAttendance.toLocaleString()}</span>.
        {statePopulation && (
          <> That&apos;s roughly <span className="font-bold text-white">1 church per {Math.round(statePopulation / churchCount).toLocaleString()} people</span>.</>
        )}
      </p>

      {/* Interesting facts */}
      <FactsList facts={stats.interestingFacts} />

      {/* Top denominations */}
      <div>
        <span className="text-[10px] uppercase tracking-widest text-purple-400/70 font-bold block mb-1.5">
          Top Denominations
        </span>
        <div className="space-y-0.5">
          {stats.topDenoms.map(([label, count]) => {
            const pct = churchCount > 0 ? (count / churchCount) * 100 : 0;
            return (
              <div key={label} className="flex items-center gap-2 px-2 py-1 rounded-md bg-white/4">
                <span className="text-white text-[11px] font-medium truncate min-w-0 flex-1">{label}</span>
                <div className="w-16 h-1 rounded-full bg-white/8 overflow-hidden flex-shrink-0">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${Math.max(pct, 2)}%`,
                      background: "linear-gradient(90deg, #A855F7, #6B21A8)",
                    }}
                  />
                </div>
                <span className="text-white/40 text-[10px] flex-shrink-0 w-8 text-right">{pct < 1 ? "<1" : Math.round(pct)}%</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Size breakdown */}
      <div>
        <span className="text-[10px] uppercase tracking-widest text-purple-400/70 font-bold block mb-2">
          By Attendance Size
        </span>
        <div className="space-y-1">
          {stats.topSizes.filter(s => s.count > 0).map((s) => (
            <div key={s.label} className="flex items-center gap-2.5 px-3 py-1.5 rounded-lg bg-white/4">
              <div
                className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                style={{ backgroundColor: s.color }}
              />
              <span className="text-white/70 text-xs flex-1">{s.label}</span>
              <span className="text-white/40 text-xs font-medium">{s.count.toLocaleString()}</span>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

function NationalSummaryContent({
  stats,
  totalChurches,
  allStatesLoaded,
  onNavigateToState,
}: {
  stats: NationalSummaryData;
  totalChurches: number;
  allStatesLoaded: boolean;
  onNavigateToState: (abbrev: string) => void;
}) {
  return (
    <>
      <p className="text-white/70 text-xs leading-relaxed">
        {stats.populated > 0 ? (
          <>
            Currently tracking <span className="font-bold text-white">{totalChurches.toLocaleString()} churches</span> across{" "}
            <span className="font-bold text-purple-300">
              {allStatesLoaded ? "all 50 states" : `${stats.populated} states`}
            </span>.
            {!allStatesLoaded && stats.unpopulated > 0 && (
              <> <span className="text-white/50">{stats.unpopulated} states haven&apos;t been explored yet.</span></>
            )}
          </>
        ) : (
          <>Click any state on the map to fetch its church data from OpenStreetMap.</>
        )}
      </p>

      {/* Top 3 states by church count */}
      {stats.topStates.length > 0 && (
        <div>
          <span className="text-[10px] uppercase tracking-widest text-purple-400/70 font-bold block mb-2">
            Most Churches
          </span>
          <div className="space-y-1">
            {stats.topStates.map((st, i) => {
              const pct = totalChurches > 0 ? (st.churchCount / totalChurches) * 100 : 0;
              return (
                <button
                  key={st.abbrev}
                  onClick={() => onNavigateToState(st.abbrev)}
                  className="w-full rounded-lg bg-white/4 border border-white/5 px-3 py-2 hover:bg-white/8 transition-colors text-left group cursor-pointer"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-white/25 text-[10px] font-mono w-4">{i + 1}.</span>
                      <span className="text-white text-xs font-semibold group-hover:text-purple-300 transition-colors">
                        {st.name}
                      </span>
                    </div>
                    <span className="text-white/40 text-[11px]">
                      {st.churchCount.toLocaleString()}
                    </span>
                  </div>
                  <div className="mt-1.5 h-1 rounded-full bg-white/8 overflow-hidden ml-6">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${Math.max(pct, 2)}%`,
                        background: "linear-gradient(90deg, #A855F7, #6B21A8)",
                      }}
                    />
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Interesting facts */}
      <FactsList facts={stats.interestingFacts} onNavigateToState={onNavigateToState} />

      {/* Unloaded states hint */}
      {stats.unpopulated > 0 && (
        <div className="rounded-lg bg-purple-900/20 border border-purple-500/10 px-3 py-2.5">
          <p className="text-white/40 text-[11px] leading-relaxed text-center">
            {stats.unpopulated} state{stats.unpopulated > 1 ? "s" : ""} remaining — click any state to fetch its data from OpenStreetMap
          </p>
        </div>
      )}
    </>
  );
}

function FactsList({
  facts,
  onNavigateToState,
}: {
  facts: InterestingFact[];
  onNavigateToState?: (abbrev: string) => void;
}) {
  if (!facts || facts.length === 0) return null;

  return (
    <div>
      <span className="text-[10px] uppercase tracking-widest text-purple-400/70 font-bold block mb-2">
        Interesting Finds
      </span>
      <div className="space-y-1.5">
        {facts.map((fact) => {
          const IconComp = FACT_ICONS[fact.icon] || ChurchIcon;
          const isClickable = !!fact.abbrev && !!onNavigateToState;
          const Tag = isClickable ? "button" : "div";
          return (
            <Tag
              key={(fact.abbrev || "") + fact.label}
              {...(isClickable
                ? { onClick: () => onNavigateToState!(fact.abbrev!) }
                : {})}
              className={`w-full rounded-lg bg-white/4 border border-white/5 px-3 py-2.5 text-left group ${
                isClickable ? "hover:bg-white/8 transition-colors cursor-pointer" : ""
              }`}
            >
              <div className="flex items-start gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-purple-500/15 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <IconComp size={14} className="text-purple-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <span className="text-white/50 text-[10px] uppercase tracking-wide font-medium block">
                    {fact.label}
                  </span>
                  <div className="flex items-center justify-between mt-0.5">
                    <span
                      className={`text-white text-xs font-semibold ${
                        isClickable ? "group-hover:text-purple-300" : ""
                      } transition-colors`}
                    >
                      {fact.primary}
                    </span>
                    <span className="text-purple-300/70 text-[11px] font-medium">
                      {fact.secondary}
                    </span>
                  </div>
                </div>
              </div>
            </Tag>
          );
        })}
      </div>
    </div>
  );
}
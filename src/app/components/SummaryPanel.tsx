import { motion } from "motion/react";
import {
  Church as ChurchIcon,
  Users,
  Building2,
  Search,
  TrendingUp,
  BookOpen,
  BarChart3,
  ChevronDown,
  FileText,
  MapPin,
  ShieldCheck,
  Check,
  Globe,
  type LucideIcon,
} from "lucide-react";
import { useState, useEffect } from "react";
import { Link } from "react-router";
import { sizeCategories } from "./church-data";
import type { StateInfo, SeasonalReportSummary } from "./church-data";
import { fetchCommunityStats, fetchReportList } from "./api";
import type { CommunityStats } from "./api";
import { StateFlag } from "./StateFlag";
import { CloseButton } from "./ui/close-button";

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
  globe: Globe,
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
  nationalPeoplePer?: number;
  populationMillions?: string;
}

export type SummaryStats = StateSummaryData | NationalSummaryData;

export type CountyStatsForSummary = {
  byFips: Record<string, { churchCount: number; population: number; perCapita: number; peoplePer: number; name: string }>;
  sortedByPerCapita: Array<{ fips: string; name: string; churchCount: number; population: number; perCapita: number; peoplePer: number }>;
};

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
  onShowVerification?: () => void;
  countyStats?: CountyStatsForSummary | null;
  /** When in focused county view, show county-level summary. */
  focusedCounty?: string | null;
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
  onShowVerification,
  countyStats,
  focusedCounty = null,
}: SummaryPanelProps) {
  const [latestReportSlug, setLatestReportSlug] = useState<string>("launch-2026");
  const [seasonalReports, setSeasonalReports] = useState<SeasonalReportSummary[]>([]);
  useEffect(() => {
    fetchReportList()
      .then((reports) => {
        setSeasonalReports(reports);
        const latest = reports[reports.length - 1];
        if (latest?.slug) setLatestReportSlug(latest.slug);
      })
      .catch(() => {});
  }, []);
  const previousNationalReports =
    seasonalReports.length > 1
      ? seasonalReports.slice(0, -1).reverse()
      : [];
  const countyData = focusedCounty && countyStats?.byFips[focusedCounty];
  return (
    <motion.div
      initial={{ opacity: 0, y: -8, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -8, scale: 0.97 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className="mt-2 rounded-2xl shadow-2xl overflow-hidden w-[min(360px,calc(100vw-3.5rem))] max-h-[70vh] flex flex-col"
      style={{ backgroundColor: "rgba(30, 16, 64, 0.97)" }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-white/8 flex-shrink-0">
        <span className="flex items-center gap-1.5 text-xs font-medium text-white uppercase tracking-widest">
          {focusedState && <StateFlag abbrev={focusedState} size="sm" />}
          {focusedCounty && countyData
            ? `${countyData.name.includes("County") ? countyData.name : `${countyData.name} County`}, ${focusedStateName}`
            : focusedState
              ? `${focusedStateName} Summary`
              : "Summary"}
        </span>
        <CloseButton onClick={onClose} />
      </div>

      <div className="px-5 py-4 space-y-4 overflow-y-auto flex-1 min-h-0">
        {focusedCounty && countyData ? (
          <CountySummaryContent
            countyName={countyData.name}
            churchCount={churches.length}
            population={countyData.population}
            peoplePer={countyData.peoplePer}
            stats={summaryStats.type === "state" ? summaryStats : undefined}
          />
        ) : summaryStats.type === "state" ? (
          <StateSummaryContent
            stats={summaryStats}
            focusedState={focusedState!}
            focusedStateName={focusedStateName}
            churchCount={churches.length}
            statePopulation={statePopulations[focusedState!]}
            countyStats={countyStats ?? null}
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
        <div className="pt-2 border-t border-white/5 space-y-1.5 text-pretty">
          <p className="text-white/30 text-[10px] text-center leading-relaxed italic">
            Not all churches may be represented yet — our goal is for every church to be included.{" "}
            {focusedState
              ? "Find your church or add it below!"
              : "Click any state to find or add your church!"}
          </p>
          <p className="text-white/20 text-[10px] text-center leading-relaxed">
            Church data and building footprints from OpenStreetMap via Overpass API{" "}&middot;{" "}
            Cross-referenced with The Association of Religion Data Archives (ARDA){" "}&middot;{" "}
            Population from U.S. Census Bureau{" "}&middot;{" "}
            Boundaries from Natural Earth / U.S. Census TIGER
          </p>
        </div>
      </div>

      {/* National report — pinned bottom (matches state report CTA styling) */}
      {summaryStats.type === "national" && (
        <div className="px-5 pb-4 pt-3 border-t border-white/8 flex-shrink-0 space-y-2">
          <Link
            to={`/report/${latestReportSlug}`}
            className="w-full py-2.5 rounded-xl text-xs font-semibold text-white bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/20 transition-colors cursor-pointer flex items-center justify-center gap-2"
            onClick={onClose}
          >
            <FileText size={13} />
            View U.S. Report
          </Link>
          <NationalPreviousReportsExpand
            previous={previousNationalReports}
            onNavigate={onClose}
          />
          <Link
            to="/reports"
            onClick={onClose}
            className="w-full py-2.5 rounded-xl text-xs font-semibold text-white bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/20 transition-colors cursor-pointer flex items-center justify-center"
            role="button"
          >
            All reports
          </Link>
        </div>
      )}

      {/* Action buttons — pinned bottom (state view only) */}
      {summaryStats.type === "state" && (
        <div className="px-5 pb-4 pt-3 border-t border-white/8 flex-shrink-0 space-y-2">
          {focusedState && (
            <Link
              to={`/report/state/${focusedState}/${latestReportSlug}`}
              className="w-full py-2.5 rounded-xl text-xs font-semibold text-white bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/20 transition-colors cursor-pointer flex items-center justify-center gap-2"
              onClick={onClose}
            >
              <FileText size={13} />
              View {focusedState} Report
            </Link>
          )}
          <Link
            to="/reports"
            onClick={onClose}
            className="w-full py-2 rounded-xl text-[11px] font-semibold text-white/70 hover:text-purple-200 bg-white/5 hover:bg-white/10 border border-white/10 transition-colors cursor-pointer flex items-center justify-center"
            role="button"
          >
            All reports
          </Link>
          <div className="flex flex-wrap gap-2">
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
          {onShowVerification && (
            <button
              onClick={() => { onClose(); onShowVerification(); }}
              className="w-full py-2.5 rounded-xl text-xs font-semibold text-white bg-pink-500/10 hover:bg-pink-500/20 border border-pink-500/15 transition-colors cursor-pointer flex items-center justify-center gap-2"
            >
              <ShieldCheck size={13} />
              Churches Needing Review
            </button>
          )}
        </div>
      )}
    </motion.div>
  );
}

function CountySummaryContent({
  countyName,
  churchCount,
  population,
  peoplePer,
  stats,
}: {
  countyName: string;
  churchCount: number;
  population: number;
  peoplePer: number;
  stats?: StateSummaryData;
}) {
  const displayName = countyName.includes("County") ? countyName : `${countyName} County`;
  const countyFacts = stats?.interestingFacts?.filter(
    (f) => f.label !== "County that could use more churches"
  ) ?? [];

  return (
    <>
      <p className="text-white/70 text-xs leading-relaxed">
        <span className="font-medium text-purple-300">{displayName}</span> has{" "}
        <span className="font-medium text-white">{churchCount.toLocaleString()} churches</span>
        {population > 0 && (
          <> and a population of <span className="font-medium text-white">{population.toLocaleString()}</span> — about{" "}
            <span className="font-medium text-white">1 church per {peoplePer.toLocaleString()} people</span>.</>
        )}
      </p>
      {stats && stats.totalAttendance > 0 && (
        <p className="text-white/70 text-xs leading-relaxed">
          Estimated combined weekly attendance:{" "}
          <span className="font-medium text-white">~{stats.totalAttendance.toLocaleString()}</span>.
        </p>
      )}

      <FactsList facts={countyFacts} />

      {stats && stats.topDenoms.length > 0 && (
        <div>
          <span className="text-[10px] uppercase tracking-widest text-purple-400/70 font-medium block mb-1.5">
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
      )}

      {stats && stats.topSizes.some((s) => s.count > 0) && (
        <div>
          <span className="text-[10px] uppercase tracking-widest text-purple-400/70 font-medium block mb-2">
            By Attendance Size
          </span>
          <div className="space-y-1">
            {stats.topSizes.filter((s) => s.count > 0).map((s) => (
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
      )}
    </>
  );
}

function StateSummaryContent({
  stats,
  focusedState,
  focusedStateName,
  churchCount,
  statePopulation,
  countyStats,
}: {
  stats: StateSummaryData;
  focusedState: string;
  focusedStateName: string;
  churchCount: number;
  statePopulation?: number;
  countyStats?: CountyStatsForSummary | null;
}) {
  return (
    <>
      <p className="text-white/70 text-xs leading-relaxed">
        There are <span className="font-medium text-white">{churchCount.toLocaleString()} churches</span> in{" "}
        <span className="font-medium text-purple-300">{focusedStateName}</span> with an estimated combined weekly attendance of{" "}
        <span className="font-medium text-white">~{stats.totalAttendance.toLocaleString()}</span>.
        {statePopulation && (
          <> That&apos;s roughly <span className="font-medium text-white">1 church per {Math.round(statePopulation / churchCount).toLocaleString()} people</span>.</>
        )}
      </p>

      {/* Community impact (state-scoped) */}
      <CommunityStatsCard key={focusedState} stateAbbrev={focusedState} />

      {/* Interesting facts */}
      <FactsList facts={stats.interestingFacts} />

      {/* County ranking by churches per capita */}
      {countyStats && countyStats.sortedByPerCapita.length > 0 && (
        <div>
          <span className="text-[10px] uppercase tracking-widest text-purple-400/70 font-medium block mb-1.5">
            Counties by churches per capita
          </span>
          <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[11px]">
            <div>
              <div className="text-white/50 mb-0.5">Most</div>
              {countyStats.sortedByPerCapita.slice(0, 5).map((c, i) => (
                <div key={c.fips} className="text-white/80 truncate" title={`${c.churchCount} churches, 1 per ${c.peoplePer.toLocaleString()} people`}>
                  {i + 1}. {c.name} — 1 per {c.peoplePer.toLocaleString()}
                </div>
              ))}
            </div>
            <div>
              <div className="text-white/50 mb-0.5">Fewest</div>
              {countyStats.sortedByPerCapita.slice(-5).reverse().map((c, i) => (
                <div key={c.fips} className="text-white/80 truncate" title={`${c.churchCount} churches, 1 per ${c.peoplePer.toLocaleString()} people`}>
                  {i + 1}. {c.name} — 1 per {c.peoplePer.toLocaleString()}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Top denominations */}
      <div>
        <span className="text-[10px] uppercase tracking-widest text-purple-400/70 font-medium block mb-1.5">
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
        <span className="text-[10px] uppercase tracking-widest text-purple-400/70 font-medium block mb-2">
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
            Currently tracking <span className="font-medium text-white">{totalChurches.toLocaleString()} churches</span> across{" "}
            <span className="font-medium text-purple-300">
              {allStatesLoaded ? "50 states" : `${stats.populated} states`}
            </span>.
            {stats.nationalPeoplePer != null && stats.populationMillions != null && (
              <> That&apos;s about <span className="font-medium text-white">1 church per {stats.nationalPeoplePer.toLocaleString()} people</span>, covering <span className="font-medium text-white">{stats.populationMillions} million people</span>.</>
            )}
            {!allStatesLoaded && stats.unpopulated > 0 && (
              <> <span className="text-white/50">{stats.unpopulated} states haven&apos;t been explored yet.</span></>
            )}
          </>
        ) : (
          <>Click any state on the map to fetch its church data from OpenStreetMap.</>
        )}
      </p>

      {/* Community impact (nation-wide totals) */}
      <CommunityStatsCard key="national" />

      {/* Top 3 states by church count — podium style */}
      {stats.topStates.length > 0 && (
        <div>
          <span className="text-[10px] uppercase tracking-widest text-purple-400/70 font-medium block mb-2">
            Most Churches
          </span>
          <div className="flex flex-wrap gap-1.5">
            {stats.topStates.map((st) => (
                <button
                  key={st.abbrev}
                  onClick={() => onNavigateToState(st.abbrev)}
                  className="flex-1 rounded-lg bg-white/4 border border-white/5 px-2 py-2.5 hover:bg-white/8 transition-colors text-center group cursor-pointer flex flex-col items-center"
                >
                  <StateFlag abbrev={st.abbrev} size="md" />
                  <span className="text-white text-[13px] font-semibold group-hover:text-purple-300 transition-colors block truncate mt-1 w-full">
                    {st.name}
                  </span>
                  <span className="text-white/45 text-[10px] tabular-nums block mt-0.5">
                    {st.churchCount.toLocaleString()}
                  </span>
                </button>
            ))}
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

/** Older national seasonal reports — expand sits under View U.S. Report in the pinned footer. */
function NationalPreviousReportsExpand({
  previous,
  onNavigate,
}: {
  previous: SeasonalReportSummary[];
  onNavigate: () => void;
}) {
  const [open, setOpen] = useState(false);
  if (previous.length === 0) return null;
  return (
    <div className="space-y-1.5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full py-2 rounded-xl text-xs font-semibold text-white/85 bg-indigo-500/5 hover:bg-indigo-500/12 border border-indigo-500/20 transition-colors flex items-center justify-center gap-2 cursor-pointer"
        aria-expanded={open}
      >
        <ChevronDown
          size={14}
          className={`text-indigo-300/90 shrink-0 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
          aria-hidden
        />
        {previous.length} previous report{previous.length > 1 ? "s" : ""}
      </button>
      {open && (
        <div className="max-h-36 overflow-y-auto space-y-0.5 rounded-xl border border-indigo-500/15 bg-indigo-500/5 p-1.5">
          {previous.map((r) => (
            <Link
              key={r.slug}
              to={`/report/${r.slug}`}
              onClick={onNavigate}
              className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-[12px] text-white/70 hover:text-white hover:bg-white/8 transition-colors"
            >
              <BarChart3 size={11} className="text-indigo-400/70 shrink-0" />
              <span className="min-w-0 truncate">{r.title}</span>
              <span className="ml-auto shrink-0 text-[10px] text-white/35 tabular-nums">
                {r.totalChurches.toLocaleString()}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function CommunityStatsCard({ stateAbbrev }: { stateAbbrev?: string }) {
  const [stats, setStats] = useState<CommunityStats | null>(null);
  useEffect(() => {
    fetchCommunityStats(stateAbbrev).then(setStats).catch(() => {});
  }, [stateAbbrev]);
  if (!stats || (stats.totalCorrections === 0 && stats.churchesImproved === 0)) return null;
  return (
    <div className="rounded-xl bg-green-500/5 border border-green-500/10 px-4 py-3.5">
      <div className="flex items-center gap-2 mb-2">
        <ShieldCheck size={12} className="text-green-400 flex-shrink-0" />
        <span className="text-[10px] uppercase tracking-widest text-green-400/70 font-medium block">Community Impact</span>
      </div>
      <div className="flex items-center gap-x-4 gap-y-2 text-sm flex-wrap">
        {stats.totalCorrections > 0 && (
          <span className="flex items-center gap-2 text-white/50 whitespace-nowrap flex-shrink-0">
            <Check size={16} className="text-green-400/60 flex-shrink-0" />
            <span className="text-white/70 font-medium">{stats.totalCorrections}</span> corrections
          </span>
        )}
        {stats.churchesImproved > 0 && (
          <span className="flex items-center gap-2 text-white/50 whitespace-nowrap flex-shrink-0">
            <ChurchIcon size={16} className="text-green-400/60 flex-shrink-0" />
            <span className="text-white/70 font-medium">{stats.churchesImproved}</span> churches improved
          </span>
        )}
      </div>
    </div>
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
      <span className="text-[10px] uppercase tracking-widest text-purple-400/70 font-medium block mb-2">
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
                  <div className="flex items-center justify-between mt-0.5 gap-2">
                    <span className="flex items-center gap-1.5 min-w-0">
                      {fact.abbrev && <StateFlag abbrev={fact.abbrev} size="sm" />}
                      <span
                        className={`text-white text-xs font-semibold truncate ${
                          isClickable ? "group-hover:text-purple-300" : ""
                        } transition-colors`}
                      >
                        {fact.primary}
                      </span>
                    </span>
                    {fact.secondary ? (
                      <span className="text-white/55 text-[11px] font-medium flex-shrink-0">
                        {fact.secondary}
                      </span>
                    ) : null}
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
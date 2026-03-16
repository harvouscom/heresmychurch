import { useState, useMemo, useEffect } from "react";
import { motion } from "motion/react";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronRight,
  Church as ChurchIcon,
  MapPin,
  Plus,
  Search,
  ShieldCheck,
} from "lucide-react";
import type { Church } from "./church-data";
import { CloseButton } from "./ui/close-button";
import { churchNeedsReview, getTier1Completeness } from "./church-data";
import { fetchCommunityStats, type CommunityStats, type NationalReviewStatsResponse } from "./api";
import { StateFlag } from "./StateFlag";
import { STATE_NAMES } from "./map-constants";

// Green Community Impact block (national or state-scoped)
function CommunityImpactCard({
  stateAbbrev,
  className = "",
}: {
  stateAbbrev?: string;
  className?: string;
}) {
  const [stats, setStats] = useState<CommunityStats | null>(null);
  useEffect(() => {
    fetchCommunityStats(stateAbbrev).then(setStats).catch(() => {});
  }, [stateAbbrev]);
  if (!stats || (stats.totalCorrections === 0 && stats.churchesImproved === 0)) return null;
  return (
    <div className={`rounded-xl bg-green-500/5 border border-green-500/10 px-4 py-3.5 ${className}`.trim()}>
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

interface VerificationModalProps {
  stateAbbrev: string;
  stateName: string;
  churches: Church[];
  /** When set, modal is scoped to this county (churches list and header reflect county). */
  countyName?: string | null;
  /** When provided, use this church's data for stats when it appears in churches (e.g. after edit or detail load). */
  selectedChurch?: Church | null;
  onClose: () => void;
  onChurchClick?: (church: Church) => void;
  filterChurchId?: string | null;
  onOpenCorrections?: () => void;
  onAddChurch?: () => void;
}

export function VerificationModal({
  stateAbbrev,
  stateName,
  churches,
  countyName = null,
  selectedChurch,
  onClose,
  onChurchClick,
  onAddChurch,
}: VerificationModalProps) {
  // Churches that need review: missing 2+ of address, service times, denomination
  const incompleteChurches = useMemo(() => churches.filter(churchNeedsReview), [churches]);

  const incompleteTotal = incompleteChurches.length;
  const scopeLabel = countyName ? "county" : "state";
  const headerSubtitle = countyName
    ? (countyName.includes("County") ? `${countyName}, ${stateName}` : `${countyName} County, ${stateName}`)
    : stateName;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        transition={{ duration: 0.2, ease: "easeOut" }}
        className="relative w-full max-w-lg max-h-[80vh] rounded-2xl shadow-2xl overflow-hidden flex flex-col"
        style={{ backgroundColor: "#1E1040" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-white/8 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-pink-500/15 flex items-center justify-center">
              <AlertTriangle size={18} className="text-white" />
            </div>
            <div>
              <h2 className="text-white font-semibold text-lg leading-tight">
                Churches Needing Review
              </h2>
              <p className="text-white/40 text-xs mt-0.5">
                {headerSubtitle} &middot; {incompleteTotal} church{incompleteTotal !== 1 ? "es" : ""} missing 2+ critical fields
              </p>
            </div>
          </div>
          <CloseButton onClick={onClose} size="md" />
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto min-h-0 px-5 py-3">
          {!countyName && <CommunityImpactCard stateAbbrev={stateAbbrev} className="mb-3" />}
          <IncompleteChurchesList
            churches={incompleteChurches}
            scopeLabel={scopeLabel}
            onChurchClick={(church) => {
              onClose();
              onChurchClick?.(church);
            }}
            onAddChurch={onAddChurch}
          />
        </div>

        {/* Footer */}
        <div className="flex-shrink-0 px-5 py-3 border-t border-white/6 text-pretty">
          <p className="text-white/25 text-[10px] text-center leading-relaxed">
            Critical fields: address, service times, denomination. Click a church to update its info.
          </p>
        </div>
      </motion.div>
    </div>
  );
}

// ── Incomplete Churches List ──

function IncompleteChurchesList({
  churches,
  scopeLabel = "state",
  onChurchClick,
  onAddChurch,
}: {
  churches: Church[];
  scopeLabel?: "state" | "county";
  onChurchClick?: (church: Church) => void;
  onAddChurch?: () => void;
}) {
  const [search, setSearch] = useState("");
  const DISPLAY_CAP = 50;

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return churches;
    const tokens = q.split(/\s+/).filter(Boolean);
    return churches.filter((ch) => {
      const haystack = `${ch.name} ${ch.city} ${ch.denomination} ${ch.address || ""}`.toLowerCase();
      return tokens.every((t) => haystack.includes(t));
    });
  }, [search, churches]);

  const isSearching = search.trim().length > 0;
  const displayed = isSearching ? filtered : filtered.slice(0, DISPLAY_CAP);

  if (churches.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-3">
        <CheckCircle2 size={32} className="text-green-400/40" />
        <p className="text-white/40 text-sm font-medium">All caught up!</p>
        <p className="text-white/25 text-xs text-center max-w-[240px]">
          No churches are missing critical information in this {scopeLabel}.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {/* Search input */}
      <div className="relative mb-3">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search churches needing review..."
          className="w-full pl-9 pr-3 py-2 rounded-full bg-white/[0.05] border border-white/8 text-white text-xs placeholder:text-white/25 focus:outline-none focus:border-purple-500/40 transition-colors"
        />
      </div>

      {displayed.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 gap-3">
          <p className="text-white/40 text-xs">
            No churches needing review found for &ldquo;{search}&rdquo;
          </p>
          {onAddChurch && (
            <button
              onClick={onAddChurch}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-purple-500/20 text-purple-300 text-xs font-medium hover:bg-purple-500/30 transition-colors"
            >
              <Plus size={13} />
              Add your church
            </button>
          )}
        </div>
      ) : (
        <>
          {displayed.map((ch) => {
            const t1 = getTier1Completeness(ch);
            const missing: string[] = [];
            if (t1.missingAddress) missing.push("Address");
            if (t1.missingServiceTimes) missing.push("Service Times");
            if (t1.missingDenomination) missing.push("Denomination");

            return (
              <div
                key={ch.id}
                className={`rounded-xl bg-white/[0.03] border border-white/6 px-3.5 py-2.5 ${
                  onChurchClick ? "cursor-pointer hover:bg-white/[0.05] transition-colors group" : ""
                }`}
                onClick={() => onChurchClick && onChurchClick(ch)}
              >
                <div className="flex items-center gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="text-white text-sm font-medium truncate group-hover:text-purple-300 transition-colors">
                        {ch.name}
                      </h3>
                      {ch.city && (
                        <span className="text-white/25 text-[10px] flex items-center gap-0.5 flex-shrink-0">
                          <MapPin size={8} />
                          {ch.city}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 mt-1">
                      {missing.map((field) => (
                        <span
                          key={field}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-pink-500/8 border border-pink-500/15 text-white text-[10px] font-medium"
                        >
                          <AlertTriangle size={8} className="flex-shrink-0" />
                          {field}
                        </span>
                      ))}
                    </div>
                  </div>
                  {onChurchClick && (
                    <ChevronRight size={14} className="text-white/20 flex-shrink-0 group-hover:text-white/40 transition-colors" />
                  )}
                </div>
              </div>
            );
          })}
          {!isSearching && churches.length > DISPLAY_CAP && (
            <div className="text-white/40 text-[10px] text-center leading-relaxed mt-2">
              Showing {DISPLAY_CAP} of {churches.length} churches needing review. Use search to find a specific church.
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── National Review Modal (states needing review) ──

export interface NationalReviewModalProps {
  stats: NationalReviewStatsResponse | null;
  onClose: () => void;
  onSelectState: (abbrev: string) => void;
}

export function NationalReviewModal({ stats, onClose, onSelectState }: NationalReviewModalProps) {
  const [search, setSearch] = useState("");

  const stateEntries = useMemo(
    () =>
      stats
        ? Object.entries(stats.states)
            .filter(([, s]) => s.needsReview > 0)
            .sort((a, b) => {
              const pctA = a[1].total > 0 ? a[1].needsReview / a[1].total : 0;
              const pctB = b[1].total > 0 ? b[1].needsReview / b[1].total : 0;
              return pctB - pctA; // descending by percentage
            })
        : [],
    [stats]
  );

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return stateEntries;
    const tokens = q.split(/\s+/).filter(Boolean);
    return stateEntries.filter(([abbrev]) => {
      const name = (STATE_NAMES[abbrev] || abbrev).toLowerCase();
      return tokens.every((t) => name.includes(t));
    });
  }, [search, stateEntries]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        transition={{ duration: 0.2, ease: "easeOut" }}
        className="relative w-full max-w-lg max-h-[80vh] rounded-2xl shadow-2xl overflow-hidden flex flex-col"
        style={{ backgroundColor: "#1E1040" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-white/8 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-pink-500/15 flex items-center justify-center">
              <AlertTriangle size={18} className="text-white" />
            </div>
            <div>
              <h2 className="text-white font-semibold text-lg leading-tight">
                States Needing Review
              </h2>
              <p className="text-white/40 text-xs mt-0.5">
                {stats
                  ? `Nationwide · ${stats.totalNeedsReview.toLocaleString()} church${stats.totalNeedsReview !== 1 ? "es" : ""} missing 2+ critical fields (${stats.percentage}%)`
                  : "Review stats could not be loaded."}
              </p>
            </div>
          </div>
          <CloseButton onClick={onClose} size="md" />
        </div>

        <div className="flex-1 overflow-y-auto min-h-0 px-5 py-3">
          {!stats ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <AlertTriangle size={32} className="text-pink-400/60" />
              <p className="text-white/60 text-sm font-medium text-center max-w-[260px]">
                National review stats could not be loaded. The review-stats API may not be deployed yet, or there was a network error.
              </p>
              <p className="text-white/40 text-xs text-center max-w-[260px]">
                You can still open any state and use the state-level &ldquo;need review&rdquo; pill to see churches needing review there.
              </p>
            </div>
          ) : (
            <>
              <CommunityImpactCard className="mb-3" />

              <div className="space-y-2">
                <div className="relative mb-3">
                  <Search size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search states..."
                    className="w-full pl-10 pr-3 py-3 rounded-full bg-white/[0.05] border border-white/8 text-white text-[15px] placeholder:text-white/25 focus:outline-none focus:border-purple-500/40 transition-colors"
                  />
                </div>

                {stateEntries.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 gap-3">
                <CheckCircle2 size={32} className="text-green-400/40" />
                <p className="text-white/40 text-sm font-medium">All caught up!</p>
                <p className="text-white/25 text-xs text-center max-w-[240px]">
                  No states have churches missing critical information.
                </p>
              </div>
            ) : filtered.length === 0 ? (
              <p className="text-white/40 text-xs py-6 text-center">
                No states found for &ldquo;{search}&rdquo;
              </p>
            ) : (
              filtered.map(([abbrev, s]) => {
                const stateName = STATE_NAMES[abbrev] || abbrev;
                const pct = s.total > 0 ? Math.round((s.needsReview / s.total) * 1000) / 10 : 0;
                return (
                  <div
                    key={abbrev}
                    className="rounded-xl bg-white/[0.03] border border-white/6 px-3.5 py-2.5 cursor-pointer hover:bg-white/[0.05] transition-colors group flex items-center gap-3"
                    onClick={() => {
                      onClose();
                      onSelectState(abbrev);
                    }}
                  >
                    <StateFlag abbrev={abbrev} size="sm" />
                    <div className="flex-1 min-w-0 flex items-center gap-2 text-sm">
                      <span className="text-white font-medium truncate group-hover:text-purple-300 transition-colors">
                        {stateName}
                      </span>
                      <span className="text-white/40 whitespace-nowrap">
                        {pct}% need review
                      </span>
                    </div>
                    <ChevronRight size={14} className="text-white/20 flex-shrink-0 group-hover:text-white/40 transition-colors" />
                  </div>
                );
              })
            )}
              </div>
            </>
          )}
        </div>

        <div className="flex-shrink-0 px-5 py-3 border-t border-white/6 text-pretty">
          <p className="text-white/25 text-[10px] text-center leading-relaxed">
            Click a state to open its churches needing review. Critical fields: address, service times, denomination.
          </p>
        </div>
      </motion.div>
    </div>
  );
}

import { useState, useMemo, useEffect } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  MapPin,
  Plus,
  Search,
  ShieldCheck,
} from "lucide-react";
import type { Church } from "./church-data";
import { CloseButton } from "./ui/close-button";
import { churchNeedsReview, getTier1Completeness } from "./church-data";
import { fetchCommunityStats, type CommunityStats, type NationalReviewStatsResponse } from "./api";
import { PlaceFlag } from "./PlaceFlag";
import { STATE_NAMES } from "./map-constants";
import { getCountry, getRegion } from "../config/countries";
import { HmcDialog, HmcDialogBody, HmcDialogTitle } from "./ui/hmc-dialog";

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
  if (!stats) return null;
  const trending = !stateAbbrev ? stats.topStatesTrending30d?.filter((t) => t.uniqueChurches > 0) ?? [] : [];
  if (stats.totalCorrections === 0 && stats.churchesImproved === 0 && trending.length === 0) return null;
  return (
    <section className={`review-impact ${className}`.trim()} aria-label="Community impact">
      <div className="review-impact-heading">
        <span className="review-impact-symbol"><ShieldCheck size={16} /></span>
        <div><h3 className="text-xs font-medium text-emerald-100">Community impact</h3><p className="text-caption text-white/50 mt-0.5">A more accurate map, together.</p></div>
      </div>
      <div className="review-impact-metrics">
        <div className="review-impact-metric"><CheckCircle2 size={15} className="text-emerald-300/80" /><strong>{stats.totalCorrections.toLocaleString()}</strong><span>corrections</span></div>
        <div className="review-impact-metric"><MapPin size={15} className="text-purple-300" /><strong>{stats.churchesImproved.toLocaleString()}</strong><span>churches improved</span></div>
      </div>
      {trending.length > 0 && <div className="mt-2 pt-2 border-t border-white/8">
        <p className="text-xs text-white/40 mb-1.5">Updated in the last 30 days</p>
        <div className="flex flex-wrap gap-x-3 gap-y-1">{trending.slice(0, 3).map(t => <span key={t.abbrev} className="inline-flex items-center gap-1.5 text-xs text-white/65">
          <PlaceFlag abbrev={t.abbrev} countryCode="US" size="sm" />{STATE_NAMES[t.abbrev] || t.abbrev}<span className="text-emerald-200/80 tabular-nums">{t.uniqueChurches.toLocaleString()}</span>
        </span>)}</div>
      </div>}
    </section>
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
  // Churches that need review: missing name or meaningful street address
  const incompleteChurches = useMemo(() => churches.filter(churchNeedsReview), [churches]);

  const incompleteTotal = incompleteChurches.length;
  const scopeLabel = countyName ? "county" : "state";
  const headerSubtitle = countyName
    ? `${countyName}, ${stateName}`
    : stateName;

  return (
    <HmcDialog onClose={onClose} className="max-w-xl review-dialog">
        {/* Header */}
        <div className="review-modal-header flex items-start justify-between gap-3 px-5 py-5 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-purple-400/15 flex items-center justify-center">
              <AlertTriangle size={18} className="text-white" />
            </div>
            <div>
              <HmcDialogTitle className="text-white font-semibold text-lg leading-tight">
                Churches needing review
              </HmcDialogTitle>
              <p className="text-white/60 text-xs mt-0.5">
                {headerSubtitle} &middot; {incompleteTotal.toLocaleString()} church{incompleteTotal !== 1 ? "es" : ""} need review
              </p>
            </div>
          </div>
          <CloseButton onClick={onClose} size="md" />
        </div>

        {/* Content */}
        <HmcDialogBody className="px-5 py-3">
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
        </HmcDialogBody>

        {/* Footer */}
        <div className="flex-shrink-0 px-5 py-3 border-t border-white/6 text-pretty">
          <p className="text-white/55 text-caption text-center leading-relaxed">
            A complete listing has a name and street address.
          </p>
        </div>
    </HmcDialog>
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
        <p className="text-white/60 text-sm font-medium">All caught up!</p>
        <p className="text-white/55 text-xs text-center max-w-[240px]">
          No churches are missing critical information in this {scopeLabel}.
        </p>
      </div>
    );
  }

  return (
    <div>
      {/* Search input */}
      <div className="relative mb-3">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/55" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search churches needing review..."
          aria-label="Search churches needing review" className="review-search-field w-full pl-9 pr-3 py-2.5 text-sm"
        />
      </div>

      {displayed.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 gap-3">
          <p className="text-white/60 text-xs">
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
            if (t1.missingName) missing.push("Name");
            if (t1.missingAddress) missing.push("Address");

            return (
              <button
                type="button"
                disabled={!onChurchClick}
                key={ch.id}
                className={`review-church-row w-full text-left px-3 py-2 disabled:cursor-default ${
                  onChurchClick ? "cursor-pointer hover:bg-white/[0.05] transition-colors group" : ""
                }`}
                onClick={() => onChurchClick && onChurchClick(ch)}
              >
                <div className="flex items-center gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                      <h3 className="review-church-name text-white text-sm font-medium group-hover:text-purple-300 transition-colors">
                        {ch.name || "Unnamed church"}
                      </h3>
                      {ch.city && (
                        <span className="text-white/45 text-caption flex items-center gap-0.5">
                          <MapPin size={8} />
                          {ch.city}
                        </span>
                      )}
                    </div>
                    <p className="text-caption text-white/45 mt-0.5">Missing {missing.map(field => field.toLowerCase()).join(" & ")}</p>
                  </div>
                  {onChurchClick && (
                    <ChevronRight size={14} className="text-white/50 flex-shrink-0 group-hover:text-white/60 transition-colors" />
                  )}
                </div>
              </button>
            );
          })}
          {!isSearching && churches.length > DISPLAY_CAP && (
            <div className="text-white/60 text-caption text-center leading-relaxed mt-2">
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
  countryCode?: string;
  regionNoun?: { one: string; many: string };
}

export function NationalReviewModal({
  stats,
  onClose,
  onSelectState,
  countryCode = "US",
  regionNoun = { one: "state", many: "states" },
}: NationalReviewModalProps) {
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState("share");
  const regionOne = regionNoun.one;
  const regionMany = regionNoun.many;
  const isWorld = countryCode === "WORLD";
  const regionName = (abbrev: string) =>
    isWorld
      ? (getCountry(abbrev)?.name || abbrev)
      : (getRegion(countryCode, abbrev)?.name || STATE_NAMES[abbrev] || abbrev);

  const stateEntries = useMemo(
    () =>
      stats
        ? Object.entries(stats.states)
            .filter(([, s]) => s.needsReview > 0)
            .sort((a, b) => {
              if (sortBy === "count") return b[1].needsReview - a[1].needsReview;
              if (sortBy === "name") return regionName(a[0]).localeCompare(regionName(b[0]));
              const pctA = a[1].total > 0 ? a[1].needsReview / a[1].total : 0;
              const pctB = b[1].total > 0 ? b[1].needsReview / b[1].total : 0;
              return pctB - pctA; // descending by percentage
            })
        : [],
    [stats, sortBy, countryCode]
  );

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return stateEntries;
    const tokens = q.split(/\s+/).filter(Boolean);
    return stateEntries.filter(([abbrev]) => {
      const name = regionName(abbrev).toLowerCase();
      return tokens.every((t) => name.includes(t));
    });
  }, [search, stateEntries, countryCode]);

  return (
    <HmcDialog onClose={onClose} className="max-w-xl review-dialog">
      <header className="review-modal-header px-5 py-4 shrink-0">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <HmcDialogTitle className="text-white text-xl font-medium leading-tight">
              {regionMany.charAt(0).toUpperCase() + regionMany.slice(1)} needing review
            </HmcDialogTitle>
            <p className="text-white/55 text-sm mt-1.5">
              {stats ? `${stats.totalNeedsReview.toLocaleString()} churches could use your local knowledge.` : "Review information is unavailable right now."}
            </p>
          </div>
          <CloseButton onClick={onClose} size="md" />
        </div>
        {stats && <div className="mt-4 flex items-center gap-3">
          <div className="flex-1 h-1 rounded-full bg-white/10 overflow-hidden" aria-hidden="true"><div className="h-full rounded-full bg-gradient-to-r from-violet-400 to-pink-300" style={{ width: `${Math.min(100, Math.max(0, Number(stats.percentage)))}%` }} /></div>
          <span className="text-xs text-purple-200/75 tabular-nums">{stats.percentage}% need review</span>
        </div>}
      </header>
      {stats && <div className="px-5 pt-3 pb-2 shrink-0 border-b border-white/6">
        <label className="relative block">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
          <input type="search" aria-label={`Search ${regionMany}`} value={search} onChange={e => setSearch(e.target.value)} placeholder={`Find a ${regionOne}…`} className="review-search-field w-full pl-10 pr-3 py-2.5 text-sm" />
        </label>
        <div className="flex items-center justify-between gap-3 mt-2 text-xs text-white/45">
          <span aria-live="polite">{filtered.length} {filtered.length === 1 ? regionOne : regionMany}</span>
          <select aria-label={`Sort ${regionMany}`} value={sortBy} onChange={e => setSortBy(e.target.value)} className="review-sort rounded-lg px-2 py-1 text-white/65 focus-visible:outline-2 focus-visible:outline-purple-400">
            <option value="share">Highest share first</option><option value="count">Most listings first</option><option value="name">Name A–Z</option>
          </select>
        </div>
      </div>}
      <HmcDialogBody className="px-5 py-4">
        {!stats ? <p className="py-10 text-center text-sm text-white/60">Try again shortly, or open a {regionOne} on the map to review its churches.</p> : <>
          {countryCode === "US" && <CommunityImpactCard className="mb-4" />}
          {stateEntries.length === 0 ? <div className="py-10 text-center"><CheckCircle2 size={28} className="mx-auto mb-3 text-emerald-300/60" /><p className="text-white/80 text-sm">All caught up!</p><p className="mt-1 text-xs text-white/45">No {regionMany} have listings missing a name or street address.</p></div>
          : !filtered.length ? <p className="py-10 text-center text-sm text-white/50">No {regionMany} found for “{search}”</p>
          : <div className="space-y-1.5">{filtered.map(([abbrev, state]) => {
            const pct = state.total ? Math.round(state.needsReview / state.total * 1000) / 10 : 0;
            return <button type="button" key={abbrev} className="review-region-row w-full flex items-center gap-3 rounded-xl px-3 py-3 text-left group" onClick={() => { onClose(); onSelectState(abbrev); }}>
              <span className="flex items-center justify-center w-9 h-9 rounded-xl bg-white/5 shrink-0"><PlaceFlag abbrev={abbrev} countryCode={countryCode} size="sm" /></span>
              <span className="flex-1 min-w-0"><span className="block text-sm text-white font-medium truncate group-hover:text-purple-200">{regionName(abbrev)}</span><span className="block text-caption text-white/45 mt-0.5 tabular-nums">{state.needsReview.toLocaleString()} of {state.total.toLocaleString()} listings</span></span>
              <span className="text-sm text-purple-200 tabular-nums font-medium">{pct}%</span><ChevronRight size={14} className="text-white/30 shrink-0" />
            </button>;
          })}</div>}
        </>}
      </HmcDialogBody>
      <footer className="shrink-0 px-5 py-3 border-t border-white/6"><p className="text-white/45 text-xs leading-relaxed">Choose a {regionOne} to help. A complete listing has a name and street address.</p></footer>
    </HmcDialog>
  );
}

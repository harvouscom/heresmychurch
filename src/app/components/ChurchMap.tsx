import { AnimatePresence } from "motion/react";
import {
  Church as ChurchIcon,
  ArrowLeft,
  ChevronDown,
  Info,
  X,
  Check,
  ShieldCheck,
} from "lucide-react";
import type { Church } from "./church-data";
import { ChurchListModal } from "./ChurchListModal";
import { MapSearchBar } from "./MapSearchBar";
import { ChurchDetailPanel } from "./ChurchDetailPanel";
import { AddChurchForm } from "./AddChurchForm";
import { SummaryPanel } from "./SummaryPanel";
import type { SummaryStats } from "./SummaryPanel";
import { FilterPanel } from "./FilterPanel";
import { MapLegend } from "./MapLegend";
import { MapControls } from "./MapControls";
import { MapCanvas } from "./MapCanvas";
import { VerificationModal } from "./VerificationModal";
import {
  LoadingOverlay,
  ErrorOverlay,
  ErrorBanner,
  StateTooltip,
  ChurchTooltip,
} from "./MapOverlays";
import { useChurchMapData } from "./useChurchMapData";
import { useReducer, useEffect, useMemo } from "react";
import { fetchPendingChurches, fetchPendingSuggestions } from "./api";
import type { PendingChurchData, PendingSuggestion } from "./api";
import logoImg from "../../assets/a94bce1cf0860483364d5d9c353899b7da8233e7.png";

/* eslint-disable @refresh/only-export-components -- force clean re-mount after hook changes */

interface ChurchMapProps {
  routeStateAbbrev: string | null;
  routeChurchId: string | null;
  navigateToState: (abbrev: string) => void;
  navigateToChurch: (stateAbbrev: string, churchId: string) => void;
  navigateToNational: () => void;
}

export function ChurchMap({
  routeStateAbbrev,
  routeChurchId,
  navigateToState,
  navigateToChurch,
  navigateToNational,
}: ChurchMapProps) {
  const d = useChurchMapData({
    routeStateAbbrev,
    routeChurchId,
    navigateToState,
    navigateToChurch,
    navigateToNational,
  });

  const isLoadingVisible = d.loading || d.populating || d.forceLoadingVisible;
  const showErrorOverlay = d.error && d.focusedState && !d.loading && !d.populating && !d.forceLoadingVisible && d.churches.length === 0;
  const showErrorBanner = d.error && (d.churches.length > 0 || !d.focusedState);

  const anyOverlayOpen = d.showSummary || d.showFilterPanel || d.showLegend || !d.searchCollapsed;
  // Plain closures (no useCallback — saves 5 hooks)
  const dismissAllOverlays = () => {
    d.setShowSummary(false);
    d.setShowFilterPanel(false);
    d.setShowLegend(false);
    d.setSearchCollapsed(true);
  };

  const handleMoveEnd = (coords: [number, number], z: number) => {
    if (Date.now() < d.moveEndSuppressedUntilRef.current.moveEndSuppressedUntil) return;
    d.setCenter(coords);
    d.setZoom(z);
  };

  // Consolidated local state (was 6 useState — saves 5 hooks)
  const hasSeenAbout = typeof document !== "undefined" && document.cookie.includes("hmc_seen_about=1");
  const [local, localDispatch] = useReducer(localReducer, {
    showVerificationModal: false,
    verificationFilterChurchId: null as string | null,
    pendingReviewCount: 0,
    pendingSuggestions: [] as PendingSuggestion[],
    forceEditForm: false,
    showAbout: !hasSeenAbout && !routeStateAbbrev,
  });

  const dismissAbout = () => {
    localDispatch({ type: "SET", key: "showAbout", value: false });
    document.cookie = "hmc_seen_about=1; path=/; max-age=31536000; SameSite=Lax";
  };

  // Compute churches with incomplete minimum data
  const incompleteChurches = useMemo(() => {
    return d.churches.filter((c) => {
      const noDenom = !c.denomination || c.denomination === "Unknown" || c.denomination === "Other";
      const noAddress = !c.address;
      const noServiceTimes = !c.serviceTimes;
      return noDenom || noAddress || noServiceTimes;
    });
  }, [d.churches]);

  // Fetch pending review counts when state changes
  useEffect(() => {
    if (!d.focusedState) { localDispatch({ type: "SET", key: "pendingReviewCount", value: 0 }); return; }
    let cancelled = false;
    Promise.all([
      fetchPendingChurches(d.focusedState).catch(() => ({ churches: [] as PendingChurchData[] })),
      fetchPendingSuggestions(d.focusedState).catch(() => ({ pending: [] as PendingSuggestion[] })),
    ]).then(([cRes, sRes]) => {
      if (cancelled) return;
      const unapproved = (cRes.churches ?? []).filter((c: PendingChurchData) => !c.approved);
      const churchIds = new Set<string>();
      unapproved.forEach((c: PendingChurchData) => churchIds.add(c.id ?? c.name));
      (sRes.pending ?? []).forEach((s: PendingSuggestion) => churchIds.add(s.churchId));
      incompleteChurches.forEach((c) => churchIds.add(c.id));
      localDispatch({ type: "SET", key: "pendingReviewCount", value: churchIds.size });
      localDispatch({ type: "SET", key: "pendingSuggestions", value: sRes.pending ?? [] });
    });
    return () => { cancelled = true; };
  }, [d.focusedState, incompleteChurches.length]);

  const onShowVerification = () => {
    localDispatch({ type: "SET", key: "verificationFilterChurchId", value: null });
    localDispatch({ type: "SET", key: "showVerificationModal", value: true });
  };
  const onShowAbout = () => localDispatch({ type: "SET", key: "showAbout", value: true });

  return (
    <div
      className={`relative size-full overflow-hidden flex ${d.selectedChurch ? 'flex-col md:flex-row' : ''}`}
      style={{ fontFamily: "'Livvic', sans-serif" }}
      onMouseMove={d.handleMouseMove}
    >
      {/* Map area — pure render, no hooks */}
      <MapArea
        d={d}
        isLoadingVisible={isLoadingVisible}
        showErrorOverlay={!!showErrorOverlay}
        showErrorBanner={!!showErrorBanner}
        anyOverlayOpen={anyOverlayOpen}
        dismissAllOverlays={dismissAllOverlays}
        handleMoveEnd={handleMoveEnd}
        navigateToState={navigateToState}
        navigateToChurch={navigateToChurch}
        onShowVerification={onShowVerification}
        pendingReviewCount={local.pendingReviewCount}
        showAbout={local.showAbout}
        onDismissAbout={dismissAbout}
        onShowAbout={onShowAbout}
      />

      {/* Modals (rendered outside map area to reduce nesting depth) */}
      {d.showListModal && d.focusedState && (
        <ChurchListModal
          churches={d.churches}
          stateName={d.focusedStateName}
          stateAbbrev={d.focusedState}
          statePopulation={d.statePopulations[d.focusedState] || null}
          onClose={() => d.setShowListModal(false)}
          onChurchClick={(church: Church) => {
            d.setShowListModal(false);
            if (d.focusedState) navigateToChurch(d.focusedState, church.id);
          }}
        />
      )}

      {d.showAddChurchFromSummary && d.focusedState && (
        <AddChurchForm
          stateAbbrev={d.focusedState}
          stateName={d.focusedStateName}
          onClose={() => d.setShowAddChurchFromSummary(false)}
        />
      )}

      {local.showVerificationModal && d.focusedState && (
        <VerificationModal
          stateAbbrev={d.focusedState}
          stateName={d.focusedStateName}
          churches={d.churches}
          onClose={() => localDispatch({ type: "SET", key: "showVerificationModal", value: false })}
          onChurchClick={(church: Church) => {
            localDispatch({ type: "SET", key: "showVerificationModal", value: false });
            if (d.focusedState) navigateToChurch(d.focusedState, church.id);
          }}
          filterChurchId={local.verificationFilterChurchId}
          onOpenCorrections={() => {
            localDispatch({ type: "SET", key: "forceEditForm", value: true });
          }}
        />
      )}

      {d.selectedChurch && (
        <div className="h-[55vh] md:h-full md:w-[380px] flex-shrink-0 overflow-hidden">
          <ChurchDetailPanel
            church={d.selectedChurch}
            allChurches={d.filteredChurches}
            onClose={() => {
              if (d.focusedState) navigateToState(d.focusedState);
              else navigateToNational();
            }}
            onChurchClick={(church: Church) => {
              if (d.focusedState) navigateToChurch(d.focusedState, church.id);
            }}
            pendingCorrectionCount={
              local.pendingSuggestions
                .filter((s) => s.churchId === d.selectedChurch?.id)
                .reduce((sum, s) => sum + Object.keys(s.fields).length, 0)
            }
            onReviewCorrections={() => {
              localDispatch({ type: "SET", key: "verificationFilterChurchId", value: d.selectedChurch?.id ?? null });
              localDispatch({ type: "SET", key: "showVerificationModal", value: true });
            }}
            externalShowEditForm={local.forceEditForm}
            onEditFormClosed={() => localDispatch({ type: "SET", key: "forceEditForm", value: false })}
          />
        </div>
      )}
    </div>
  );
}

// ── Local state reducer for ChurchMap (replaces 6 useState — saves 5 hooks) ──
type LocalState = {
  showVerificationModal: boolean;
  verificationFilterChurchId: string | null;
  pendingReviewCount: number;
  pendingSuggestions: PendingSuggestion[];
  forceEditForm: boolean;
  showAbout: boolean;
};
type LocalAction = { type: "SET"; key: keyof LocalState; value: any };
function localReducer(state: LocalState, action: LocalAction): LocalState {
  if (state[action.key] === action.value) return state;
  return { ...state, [action.key]: action.value };
}

// ── MapArea: the map + all overlays — ZERO hooks (pure render) ──
function MapArea({
  d,
  isLoadingVisible,
  showErrorOverlay,
  showErrorBanner,
  anyOverlayOpen,
  dismissAllOverlays,
  handleMoveEnd,
  navigateToState,
  navigateToChurch,
  onShowVerification,
  pendingReviewCount,
  showAbout,
  onDismissAbout,
  onShowAbout,
}: {
  d: ReturnType<typeof useChurchMapData>;
  isLoadingVisible: boolean;
  showErrorOverlay: boolean;
  showErrorBanner: boolean;
  anyOverlayOpen: boolean;
  dismissAllOverlays: () => void;
  handleMoveEnd: (coords: [number, number], z: number) => void;
  navigateToState: (abbrev: string) => void;
  navigateToChurch: (stateAbbrev: string, churchId: string) => void;
  onShowVerification: () => void;
  pendingReviewCount: number;
  showAbout: boolean;
  onDismissAbout: () => void;
  onShowAbout: () => void;
}) {
  return (
    <div className={`${d.selectedChurch ? 'h-[45vh] md:h-full md:flex-1' : 'flex-1'} relative`} style={{ backgroundColor: "#F5F0E8" }}>
      {/* Top header pill + summary dropdown — pushed down on mobile when back button is visible */}
      <div className={`absolute left-1/2 -translate-x-1/2 z-30 flex flex-col items-center md:max-w-[75vw] ${d.focusedState ? 'top-16 md:top-4' : 'top-4'}`} ref={d.summaryRef}>
        <HeaderPill
          focusedState={d.focusedState}
          focusedStateName={d.focusedStateName}
          filteredCount={d.filteredChurches.length}
          totalChurches={d.totalChurches}
          allStatesLoaded={d.allStatesLoaded}
          populatedCount={d.states.filter((s) => s.isPopulated).length}
          showSummary={d.showSummary}
          pendingReviewCount={pendingReviewCount}
          onShowVerification={onShowVerification}
          onToggle={() => {
            d.setShowSummary((v) => {
              if (!v) { d.setShowFilterPanel(false); d.setShowLegend(false); }
              return !v;
            });
          }}
        />

        {/* About blurb — national view only */}
        {!d.focusedState && !d.showSummary && (
          <button
            onClick={onShowAbout}
            className="mt-1.5 flex items-center gap-1.5 px-3 py-1 rounded-full transition-all hover:opacity-70"
          >
            <Info size={11} className="text-[rgba(30,16,64,0.92)]" />
            <span className="text-[rgba(30,16,64,0.92)] text-[11px] font-normal">
              An open-source map of every U.S. church
            </span>
          </button>
        )}

        <AnimatePresence>
          {d.showSummary && (
            <SummaryPanel
              summaryStats={d.summaryStats as SummaryStats}
              focusedState={d.focusedState}
              focusedStateName={d.focusedStateName}
              churches={d.churches}
              totalChurches={d.totalChurches}
              allStatesLoaded={d.allStatesLoaded}
              statePopulations={d.statePopulations}
              onClose={() => d.setShowSummary(false)}
              onNavigateToState={(abbrev) => {
                d.setShowSummary(false);
                navigateToState(abbrev);
              }}
              onShowListModal={() => {
                d.setShowSummary(false);
                d.setShowListModal(true);
              }}
              onShowAddChurch={() => {
                d.setShowSummary(false);
                d.setShowAddChurchFromSummary(true);
              }}
              onShowVerification={onShowVerification}
            />
          )}
        </AnimatePresence>
      </div>

      {/* About Modal */}
      {showAbout && <AboutModal onClose={onDismissAbout} />}

      {/* Back button */}
      {d.focusedState && (
        <div className="absolute top-4 left-4 z-20 flex items-center gap-2">
          <button
            onClick={d.handleResetView}
            className="flex items-center gap-2 px-4 py-2 rounded-full shadow-lg text-white text-xs font-normal transition-colors hover:bg-purple-700"
            style={{ backgroundColor: "rgba(107, 33, 168, 0.9)" }}
          >
            <ArrowLeft size={14} />
            All States
          </button>
        </div>
      )}

      {/* Map canvas */}
      <MapCanvas
        center={d.center}
        zoom={d.zoom}
        focusedState={d.focusedState}
        hoveredState={d.hoveredState}
        states={d.states}
        filteredChurches={d.filteredChurches}
        selectedChurchId={d.selectedChurch?.id ?? null}
        onMoveEnd={handleMoveEnd}
        onStateClick={navigateToState}
        onResetView={d.handleResetView}
        onStateHover={d.setHoveredState}
        onChurchClick={d.handleChurchDotClick}
        onChurchHover={d.setHoveredChurch}
      />

      {/* Tooltips */}
      {d.hoveredState && !d.focusedState && !d.hoveredChurch && (
        <StateTooltip hoveredState={d.hoveredState} states={d.states} tooltipPos={d.tooltipPos} />
      )}
      {d.hoveredChurch && d.hoveredChurch.id !== d.selectedChurch?.id && (
        <ChurchTooltip church={d.hoveredChurch} tooltipPos={d.tooltipPos} />
      )}

      {/* Click-catcher: dismiss all overlays */}
      {anyOverlayOpen && (
        <div
          className="absolute inset-0 z-[15]"
          onClick={dismissAllOverlays}
          onTouchEnd={dismissAllOverlays}
        />
      )}

      {isLoadingVisible && (
        <LoadingOverlay loadingStateName={d.loadingStateName} sayingIndex={d.sayingIndex} />
      )}

      {showErrorOverlay && (
        <ErrorOverlay
          focusedStateName={d.focusedStateName}
          error={d.error!}
          onRetry={() => { d.setError(null); d.loadStateData(d.focusedState!); }}
          onGoBack={d.handleResetView}
        />
      )}
      {showErrorBanner && (
        <ErrorBanner error={d.error!} onDismiss={() => d.setError(null)} />
      )}

      {!isLoadingVisible && (
        <MapControls
          focusedState={d.focusedState}
          showFilterPanel={d.showFilterPanel}
          onZoomIn={d.handleZoomIn}
          onZoomOut={d.handleZoomOut}
          onResetView={d.handleResetView}
          onToggleFilter={() => {
            d.setShowFilterPanel((v) => {
              if (!v) { d.setShowSummary(false); d.setShowLegend(false); d.setSearchCollapsed(true); }
              return !v;
            });
          }}
          zoom={d.zoom}
        />
      )}

      {d.showFilterPanel && (
        <FilterPanel
          activeSize={d.activeSize}
          toggleSize={d.toggleSize}
          showSizeFilters={d.showSizeFilters}
          setShowSizeFilters={d.setShowSizeFilters}
          activeDenominations={d.activeDenominations}
          toggleDenom={d.toggleDenom}
          showDenomFilters={d.showDenomFilters}
          setShowDenomFilters={d.setShowDenomFilters}
          denomCounts={d.denomCounts}
          languageFilter={d.languageFilter}
          setLanguageFilter={d.setLanguageFilter}
          showLanguageFilters={d.showLanguageFilters}
          setShowLanguageFilters={d.setShowLanguageFilters}
          languageStats={d.languageStats}
          churchCount={d.churches.length}
          onClose={() => d.setShowFilterPanel(false)}
        />
      )}

      {!isLoadingVisible && (
        <MapSearchBar
          churches={d.churches}
          states={d.states}
          focusedState={d.focusedState}
          focusedStateName={d.focusedStateName}
          navigateToChurch={navigateToChurch}
          onPreloadChurch={d.preloadChurch}
          collapsed={d.searchCollapsed}
          onExpand={() => { d.setSearchCollapsed(false); d.setShowFilterPanel(false); }}
          onAddChurch={d.focusedState ? () => { d.setShowAddChurchFromSummary(true); } : undefined}
          detectedState={d.detectedState}
        />
      )}

      {!isLoadingVisible && (
        <MapLegend
          focusedState={d.focusedState}
          showLegend={d.showLegend}
          setShowLegend={(v) => d.setShowLegend(v)}
          setShowSummary={(v) => d.setShowSummary(v)}
          setShowFilterPanel={(v) => d.setShowFilterPanel(v)}
          allStatesLoaded={d.allStatesLoaded}
          states={d.states}
          filteredChurches={d.filteredChurches}
          sizeCounts={d.sizeCounts}
        />
      )}
    </div>
  );
}

// --- Header Pill ---
function HeaderPill({
  focusedState,
  focusedStateName,
  filteredCount,
  totalChurches,
  allStatesLoaded,
  populatedCount,
  showSummary,
  pendingReviewCount,
  onShowVerification,
  onToggle,
}: {
  focusedState: string | null;
  focusedStateName: string;
  filteredCount: number;
  totalChurches: number;
  allStatesLoaded: boolean;
  populatedCount: number;
  showSummary: boolean;
  pendingReviewCount: number;
  onShowVerification: () => void;
  onToggle: () => void;
}) {
  return (
    <div
      className="flex flex-col items-center rounded-full shadow-lg transition-all hover:shadow-xl cursor-pointer min-w-[85vw] md:min-w-0 overflow-hidden"
      style={{ backgroundColor: "rgba(30, 16, 64, 0.92)" }}
    >
      {/* Main row — toggles summary */}
      <div
        onClick={onToggle}
        className="flex items-center justify-center gap-3 px-5 py-2.5 w-full"
      >
        <ChurchIcon size={18} className="text-purple-300" />
        {focusedState ? (
          <span className="text-white text-sm text-balance">
            <span className="font-medium">
              {filteredCount.toLocaleString()} churches
            </span>{" "}
            in{" "}
            <span className="text-purple-300 font-medium">
              {focusedStateName}
            </span>
          </span>
        ) : (
          <span className="text-white text-sm text-balance">
            <span className="font-medium">
              {totalChurches.toLocaleString()} churches
            </span>{" "}
            across{" "}
            <span className="text-purple-300 font-medium">
              {allStatesLoaded ? "50 states" : `${populatedCount} states`}
            </span>
          </span>
        )}
        <ChevronDown
          size={16}
          className={`text-white/40 transition-transform duration-200 ${showSummary ? "rotate-180" : ""}`}
        />
      </div>

      {/* Review row — only in state view when there are pending items */}
      {focusedState && pendingReviewCount > 0 && (
        <div
          onClick={(e) => { e.stopPropagation(); onShowVerification(); }}
          className="flex items-center justify-center gap-1.5 w-full px-5 pb-1.5 -mt-1.5 hover:opacity-80 transition-opacity"
        >
          <span className="text-pink-300/90 text-[11px] font-medium">
            {pendingReviewCount.toLocaleString()} need review
          </span>
        </div>
      )}
    </div>
  );
}

// --- About Modal ---
function AboutModal({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="absolute inset-0 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 backdrop-blur-sm" />

      {/* Modal */}
      <div
        className="relative w-full max-w-md rounded-2xl shadow-2xl overflow-hidden max-h-[85vh] flex flex-col"
        style={{ backgroundColor: "#1E1040" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="relative flex flex-col items-center text-center px-6 pt-6 pb-4 border-b border-white/10 flex-shrink-0">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center hover:bg-white/10 transition-colors"
          >
            <X size={16} className="text-white/50" />
          </button>
          <div className="w-16 h-16 rounded-xl overflow-hidden mb-3">
            <img src={logoImg} alt="Here's My Church" className="w-full h-full object-cover" />
          </div>
          <h2 className="text-white font-medium text-[22px] leading-tight">Here's My Church</h2>
          <p className="text-white/60 text-sm leading-relaxed mt-3 text-balance">An interactive map of Christian churches in the U.S. Find your church or find a new church.</p>
        </div>

        {/* Content */}
        <div className="px-6 py-5 overflow-y-auto flex-1 min-h-0">
          <div className="flex items-center justify-center gap-2 mb-4 px-3 py-2 rounded-lg bg-white/5">
            <span className="text-purple-300 text-xs">{"\u2726"}</span>
            <p className="text-white/60 text-xs text-balance">100% free and crowd-sourced</p>
          </div>
          <p className="text-white/40 text-[11px] uppercase tracking-wider font-medium mb-3">What you can do</p>
          <ul className="space-y-2.5">
            {[
              "Browse Christian churches in the U.S.",
              "Search and filter by name, denomination, size, or language",
              "View church info like address, website, and service times",
              "Easily add a church and make any corrections",
            ].map((item, i) => (
              <li key={i} className="flex items-start gap-2.5">
                <span className="mt-0.5 flex-shrink-0 w-4 h-4 rounded-full bg-purple-500/20 flex items-center justify-center">
                  <Check size={10} className="text-purple-300" />
                </span>
                <span className="text-white/70 text-sm leading-snug">{item}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Footer button */}
        <div className="px-6 pb-5 flex-shrink-0">
          <button
            onClick={onClose}
            className="w-full py-3 rounded-xl text-white text-sm font-medium transition-colors"
            style={{ backgroundColor: "rgba(107, 33, 168, 0.9)" }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "rgba(107, 33, 168, 1)")}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "rgba(107, 33, 168, 0.9)")}
          >
            Start Finding Churches
          </button>
          <p className="text-white/30 text-[11px] text-center mt-2.5 text-balance">Started by Derek Castelli, who's also building a Bible notes app called <a href="https://harvous.com" target="_blank" rel="noopener noreferrer" className="underline hover:text-white/50 transition-colors">Harvous</a>. If you need any help email <a href="mailto:hey@heresmychurch.com" className="underline hover:text-white/50 transition-colors">hey@heresmychurch.com</a></p>
        </div>
      </div>
    </div>
  );
}
import { AnimatePresence, motion } from "motion/react";
import {
  Church as ChurchIcon,
  ArrowLeft,
  ChevronDown,
  Check,
  ShieldCheck,
} from "lucide-react";
import type { Church } from "./church-data";
import { churchNeedsReview } from "./church-data";
import { ChurchListModal } from "./ChurchListModal";
import { MapSearchBar } from "./MapSearchBar";
import { ChurchDetailPanel } from "./ChurchDetailPanel";
import { AddChurchForm } from "./AddChurchForm";
import { SummaryPanel } from "./SummaryPanel";
import type { SummaryStats } from "./SummaryPanel";
import { FilterPanel } from "./FilterPanel";
import { MapLegend } from "./MapLegend";
import { MapControls } from "./MapControls";
import { HelpModal } from "./HelpModal";
import { MapCanvas } from "./MapCanvas";
import { VerificationModal, NationalReviewModal } from "./VerificationModal";
import { StateFlag } from "./StateFlag";
import { CloseButton } from "./ui/close-button";
import { useActiveUsers } from "./hooks/useActiveUsers";
import {
  LoadingOverlay,
  ErrorOverlay,
  ErrorBanner,
  StateTooltip,
  ChurchTooltip,
  CountyTooltip,
} from "./MapOverlays";
import { useChurchMapData } from "./useChurchMapData";
import { getChurchUrlSegment } from "./url-utils";
import type { ChurchClickTarget } from "./ChurchDetailPanel";
import { fetchNationalReviewStats } from "./api";
import type { NationalReviewStatsResponse } from "./api";
import { useIsMobile } from "./ui/use-mobile";
import { PendingAlertsPill } from "./PendingAlertsPill";
import { AnnouncementsPill } from "./AnnouncementsPill";
import { reportIssueEnabled } from "../config/pendingAlerts";
import { useReducer, useEffect, useMemo, useState } from "react";
import logoImg from "../../assets/a94bce1cf0860483364d5d9c353899b7da8233e7.png";

/** Set to true to temporarily hide All States button, Map Key, and action controls (zoom/filter). */
const HIDE_MAP_UI = false;

/* eslint-disable @refresh/only-export-components -- force clean re-mount after hook changes */

interface ChurchMapProps {
  routeStateAbbrev: string | null;
  routeChurchShortId: string | null;
  routeLegacyChurchId: string | null;
  openReviewModalFromQuery?: boolean;
  clearReviewQueryParam?: () => void;
  navigateToState: (abbrev: string) => void;
  navigateToStateWithReview: (abbrev: string) => void;
  navigateToChurch: (stateAbbrev: string, churchShortId: string, options?: { replace?: boolean }) => void;
  navigateToNational: () => void;
}

export function ChurchMap({
  routeStateAbbrev,
  routeChurchShortId,
  routeLegacyChurchId,
  openReviewModalFromQuery = false,
  clearReviewQueryParam,
  navigateToState,
  navigateToStateWithReview,
  navigateToChurch,
  navigateToNational,
}: ChurchMapProps) {
  const isMobile = useIsMobile();

  const d = useChurchMapData({
    routeStateAbbrev,
    routeChurchShortId,
    routeLegacyChurchId,
    navigateToState,
    navigateToChurch,
    navigateToNational,
    isMobile,
  });

  const isLoadingVisible = d.loading || d.populating || d.forceLoadingVisible;
  const showErrorOverlay = d.error && d.focusedState && !d.loading && !d.populating && !d.forceLoadingVisible && d.churches.length === 0;
  const showErrorBanner = d.error && (d.churches.length > 0 || !d.focusedState);
  // When Filter or Map Key panel is open, collapse search (same as filter behavior). Otherwise: state/church view always show full search; national collapsed only on mobile.
  const effectiveSearchCollapsed =
    d.showFilterPanel || d.showLegend
      ? true
      : (d.focusedState || d.selectedChurch ? false : (d.searchCollapsed && isMobile));
  // Only count search as "overlay open" on national + mobile (so map tap can collapse the pill). Desktop national and state/church always show full search — no overlay for search.
  const isNationalView = !d.focusedState && !d.selectedChurch;

  const handleMoveEnd = (coords: [number, number], z: number) => {
    if (Date.now() < d.moveEndSuppressedUntilRef.current.moveEndSuppressedUntil) return;
    d.setCenter(coords);
    d.setZoom(z);
  };

  // Consolidated local state (was 6 useState — saves 5 hooks)
  const hasSeenAbout = typeof document !== "undefined" && document.cookie.includes("hmc_seen_about=1");
  const [local, localDispatch] = useReducer(localReducer, {
    showVerificationModal: false,
    showNationalReviewModal: false,
    pendingReviewCount: 0,
    nationalReviewStats: null,
    nationalReviewStatsLoading: false,
    forceEditForm: false,
    showAbout: !hasSeenAbout && !routeStateAbbrev,
    showHelp: false,
    showAlertsPanel: false,
    showAnnouncementsPanel: false,
  alertsPanelOpenedViaReportIssue: false,
  });

  const anyOverlayOpen = d.showSummary || d.showFilterPanel || d.showLegend || local.showAlertsPanel || local.showAnnouncementsPanel || (isNationalView && isMobile && !effectiveSearchCollapsed);
  const dismissAllOverlays = () => {
    d.setShowSummary(false);
    d.setShowFilterPanel(false);
    d.setShowLegend(false);
    d.setSearchCollapsed(true);
    localDispatch({ type: "SET", key: "showAlertsPanel", value: false });
    localDispatch({ type: "SET", key: "showAnnouncementsPanel", value: false });
    localDispatch({ type: "SET", key: "alertsPanelOpenedViaReportIssue", value: false });
  };

  const dismissAbout = () => {
    localDispatch({ type: "SET", key: "showAbout", value: false });
    document.cookie = "hmc_seen_about=1; path=/; max-age=31536000; SameSite=Lax";
  };

  // Compute churches that need review (missing 2+ of address, service times, denomination)
  const incompleteChurches = useMemo(() => {
    return d.churches.filter(churchNeedsReview);
  }, [d.churches]);

  // Set review count based on incomplete churches
  useEffect(() => {
    localDispatch({ type: "SET", key: "pendingReviewCount", value: incompleteChurches.length });
  }, [incompleteChurches.length]);

  const onShowVerification = () => {
    localDispatch({ type: "SET", key: "showVerificationModal", value: true });
  };
  const onShowAbout = () => localDispatch({ type: "SET", key: "showAbout", value: true });
  const onShowHelp = () => localDispatch({ type: "SET", key: "showHelp", value: true });
  const onDismissHelp = () => localDispatch({ type: "SET", key: "showHelp", value: false });

  // Fetch national review stats when at national level
  useEffect(() => {
    if (!d.focusedState) {
      localDispatch({ type: "SET", key: "nationalReviewStatsLoading", value: true });
      fetchNationalReviewStats()
        .then((stats: NationalReviewStatsResponse) => {
          localDispatch({ type: "SET", key: "nationalReviewStats", value: stats });
          localDispatch({ type: "SET", key: "nationalReviewStatsLoading", value: false });
        })
        .catch(() => {
          localDispatch({ type: "SET", key: "nationalReviewStats", value: null });
          localDispatch({ type: "SET", key: "nationalReviewStatsLoading", value: false });
        });
    }
  }, [d.focusedState]);

  // Refetch state churches when opening the verification modal so stats use latest API data (incl. merged corrections)
  useEffect(() => {
    if (local.showVerificationModal && d.focusedState) {
      d.refetchCurrentStateChurches();
    }
  }, [local.showVerificationModal, d.focusedState]);

  // Auto-open state review modal when navigating from national modal (?review=true)
  useEffect(() => {
    if (
      openReviewModalFromQuery &&
      clearReviewQueryParam &&
      d.focusedState &&
      d.churches.length > 0 &&
      !d.loading &&
      !d.populating
    ) {
      localDispatch({ type: "SET", key: "showVerificationModal", value: true });
      clearReviewQueryParam();
    }
  }, [openReviewModalFromQuery, clearReviewQueryParam, d.focusedState, d.churches.length, d.loading, d.populating]);

  const { people: activePeople, bots: activeBots } = useActiveUsers();
  const [isLocalhost, setIsLocalhost] = useState(false);
  useEffect(() => {
    if (typeof window !== "undefined") setIsLocalhost(window.location.hostname === "localhost");
  }, []);

  const isStateOrChurchView = !!d.focusedState || !!d.selectedChurch;
  useEffect(() => {
    const color = isStateOrChurchView ? "#EDE4F3" : "#F5F0E8";
    document.documentElement.style.backgroundColor = color;
    document.body.style.backgroundColor = color;
    return () => {
      document.documentElement.style.backgroundColor = "";
      document.body.style.backgroundColor = "";
    };
  }, [isStateOrChurchView]);

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
        onShowNationalReviewModal={() => localDispatch({ type: "SET", key: "showNationalReviewModal", value: true })}
        pendingReviewCount={local.pendingReviewCount}
        nationalReviewStats={local.nationalReviewStats}
        nationalReviewStatsLoading={local.nationalReviewStatsLoading}
        showAbout={local.showAbout}
        onDismissAbout={dismissAbout}
        onShowAbout={onShowAbout}
        showHelp={local.showHelp}
        onDismissHelp={onDismissHelp}
        onShowHelp={onShowHelp}
        showReportIssue={reportIssueEnabled}
        onReportIssue={reportIssueEnabled ? () => {
          onDismissHelp();
          localDispatch({ type: "SET", key: "alertsPanelOpenedViaReportIssue", value: true });
          localDispatch({ type: "SET", key: "showAlertsPanel", value: true });
        } : undefined}
        showAlertsPanel={local.showAlertsPanel}
        showProposeForm={local.alertsPanelOpenedViaReportIssue}
        onAlertsPanelChange={(open) => {
          localDispatch({ type: "SET", key: "showAlertsPanel", value: open });
          if (!open) localDispatch({ type: "SET", key: "alertsPanelOpenedViaReportIssue", value: false });
        }}
        showAnnouncementsPanel={local.showAnnouncementsPanel}
        onAnnouncementsPanelChange={(open) => {
          localDispatch({ type: "SET", key: "showAnnouncementsPanel", value: open });
        }}
        activePeople={activePeople}
        activeBots={activeBots}
        isLocalhost={isLocalhost}
        searchCollapsed={effectiveSearchCollapsed}
        isMobile={isMobile}
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
            if (d.focusedState) navigateToChurch(d.focusedState, getChurchUrlSegment(church, d.focusedState));
          }}
          onSelectChurchForEdit={(church: Church) => {
            d.setShowListModal(false);
            d.setSelectedChurch(church);
            if (d.focusedState) navigateToChurch(d.focusedState, getChurchUrlSegment(church, d.focusedState));
            setTimeout(() => localDispatch({ type: "SET", key: "forceEditForm", value: true }), 50);
          }}
          onChurchAdded={(state, shortId) => {
            d.setShowListModal(false);
            d.refetchCurrentStateChurches().then(() => navigateToChurch(state, shortId));
          }}
        />
      )}

      {d.showAddChurchFromSummary && d.focusedState && (
        <AddChurchForm
          stateAbbrev={d.focusedState}
          stateName={d.focusedStateName}
          onClose={() => { d.setShowAddChurchFromSummary(false); d.setAddChurchForState(null); }}
          churches={d.churches}
          onSelectChurch={(church) => {
            d.setShowAddChurchFromSummary(false);
            d.setAddChurchForState(null);
            d.setSelectedChurch(church);
            if (d.focusedState) navigateToChurch(d.focusedState, getChurchUrlSegment(church, d.focusedState));
            setTimeout(() => localDispatch({ type: "SET", key: "forceEditForm", value: true }), 50);
          }}
          onChurchAdded={(state, shortId) => {
            d.setShowAddChurchFromSummary(false);
            d.setAddChurchForState(null);
            d.refetchCurrentStateChurches().then(() => navigateToChurch(state, shortId));
          }}
        />
      )}

      {d.addChurchForState && (
        <AddChurchForm
          stateAbbrev={d.addChurchForState}
          stateName={d.states.find((s) => s.abbrev === d.addChurchForState)?.name ?? d.addChurchForState}
          onClose={() => { d.setShowAddChurchFromSummary(false); d.setAddChurchForState(null); }}
          churches={[]}
          onSelectChurch={(church) => {
            const stateAbbrev = d.addChurchForState;
            d.setAddChurchForState(null);
            if (stateAbbrev) {
              d.setSelectedChurch(church);
              navigateToChurch(stateAbbrev, getChurchUrlSegment(church, stateAbbrev));
              setTimeout(() => localDispatch({ type: "SET", key: "forceEditForm", value: true }), 50);
            }
          }}
          onChurchAdded={(state, shortId) => {
            d.setAddChurchForState(null);
            navigateToChurch(state, shortId);
          }}
        />
      )}

      {local.showVerificationModal && d.focusedState && (
        <VerificationModal
          stateAbbrev={d.focusedState}
          stateName={d.focusedStateName}
          churches={d.churches}
          selectedChurch={d.selectedChurch}
          onClose={() => localDispatch({ type: "SET", key: "showVerificationModal", value: false })}
          onChurchClick={(church: Church) => {
            localDispatch({ type: "SET", key: "showVerificationModal", value: false });
            if (d.focusedState) navigateToChurch(d.focusedState, getChurchUrlSegment(church, d.focusedState));
            // Defer so the new ChurchDetailPanel mounts before the flag is set
            setTimeout(() => localDispatch({ type: "SET", key: "forceEditForm", value: true }), 50);
          }}
          onAddChurch={() => {
            localDispatch({ type: "SET", key: "showVerificationModal", value: false });
            d.setShowAddChurchFromSummary(true);
          }}
        />
      )}

      {local.showNationalReviewModal && (
        <NationalReviewModal
          stats={local.nationalReviewStats}
          onClose={() => localDispatch({ type: "SET", key: "showNationalReviewModal", value: false })}
          onSelectState={(abbrev) => navigateToStateWithReview(abbrev)}
        />
      )}

      <AnimatePresence mode="wait">
        {d.selectedChurch && (
          <motion.div
            key={`church-detail-panel-${isMobile ? "mobile" : "desktop"}`}
            className={`flex-shrink-0 overflow-hidden ${isMobile ? 'absolute bottom-0 left-0 right-0 z-40' : ''}`}
            style={{ backgroundColor: "#EDE4F3", ...(isMobile ? { height: "55vh" } : {}) }}
            initial={isMobile ? { y: "100%" } : { width: 0, height: "100%" }}
            animate={isMobile ? { y: 0 } : { width: 396, height: "100%" }}
            exit={isMobile ? { y: "100%" } : { width: 0, height: "100%" }}
            transition={{ type: "spring", damping: 28, stiffness: 300 }}
          >
            <div className="pr-4 pb-4 pt-0 pl-4 md:pl-0 md:pt-4 md:pr-4 md:pb-4" style={{ width: isMobile ? "100%" : 396, height: isMobile ? "55vh" : "100%" }}>
              <ChurchDetailPanel
                church={d.selectedChurch}
                allChurches={d.filteredChurches}
                onClose={() => {
                  if (d.focusedState) navigateToState(d.focusedState);
                  else navigateToNational();
                }}
                onChurchClick={(target: ChurchClickTarget) => {
                  const state = target.state;
                  const shortId = "shortId" in target && target.shortId ? target.shortId : getChurchUrlSegment(target as Church, state);
                  if (state) navigateToChurch(state, shortId);
                }}
                externalShowEditForm={local.forceEditForm}
                onEditFormClosed={() => localDispatch({ type: "SET", key: "forceEditForm", value: false })}
                onChurchUpdated={d.refetchCurrentStateChurches}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Local state reducer for ChurchMap (replaces 6 useState — saves 5 hooks) ──
type LocalState = {
  showVerificationModal: boolean;
  showNationalReviewModal: boolean;
  pendingReviewCount: number;
  nationalReviewStats: NationalReviewStatsResponse | null;
  nationalReviewStatsLoading: boolean;
  forceEditForm: boolean;
  showAbout: boolean;
  showHelp: boolean;
  showAlertsPanel: boolean;
  showAnnouncementsPanel: boolean;
  alertsPanelOpenedViaReportIssue: boolean;
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
  onShowNationalReviewModal,
  pendingReviewCount,
  nationalReviewStats,
  nationalReviewStatsLoading,
  showAbout,
  onDismissAbout,
  onShowAbout,
  showHelp,
  onDismissHelp,
  onShowHelp,
  showReportIssue,
  onReportIssue,
  showAlertsPanel,
  showProposeForm,
  onAlertsPanelChange,
  showAnnouncementsPanel,
  onAnnouncementsPanelChange,
  activePeople,
  activeBots,
  isLocalhost,
  searchCollapsed,
  isMobile,
}: {
  d: ReturnType<typeof useChurchMapData>;
  isLoadingVisible: boolean;
  showErrorOverlay: boolean;
  showErrorBanner: boolean;
  anyOverlayOpen: boolean;
  dismissAllOverlays: () => void;
  handleMoveEnd: (coords: [number, number], z: number) => void;
  navigateToState: (abbrev: string) => void;
  navigateToChurch: (stateAbbrev: string, churchShortId: string, options?: { replace?: boolean }) => void;
  onShowVerification: () => void;
  onShowNationalReviewModal: () => void;
  pendingReviewCount: number;
  nationalReviewStats: NationalReviewStatsResponse | null;
  nationalReviewStatsLoading: boolean;
  showAbout: boolean;
  onDismissAbout: () => void;
  onShowAbout: () => void;
  showHelp: boolean;
  onDismissHelp: () => void;
  onShowHelp: () => void;
  showReportIssue: boolean;
  onReportIssue?: () => void;
  showAlertsPanel: boolean;
  showProposeForm: boolean;
  onAlertsPanelChange: (open: boolean) => void;
  showAnnouncementsPanel: boolean;
  onAnnouncementsPanelChange: (open: boolean) => void;
  activePeople: number;
  activeBots: number;
  isLocalhost: boolean;
  searchCollapsed: boolean;
  isMobile: boolean;
}) {
  return (
    <div className="flex-1 relative" style={{ backgroundColor: "#F5F0E8" }}>
      {/* Top row: header pill only (secondary controls moved to bottom-left cluster); z-40 so summary stacks above All states + MapControls (z-30). pointer-events-none so click-outside hits the catcher. */}
      {!isLoadingVisible && d.states.length > 0 && (
      <div className="absolute top-4 left-4 right-4 z-40 flex flex-row items-center justify-center animate-in fade-in duration-300 pointer-events-none">
        <div className="flex flex-col items-center justify-center min-w-0 overflow-hidden max-w-full pointer-events-auto" ref={d.summaryRef}>
          <HeaderPill
            focusedState={d.focusedState}
            focusedStateName={d.focusedStateName}
            filteredCount={d.filteredChurches.length}
            totalChurches={d.totalChurches}
            allStatesLoaded={d.allStatesLoaded}
            populatedCount={d.states.filter((s) => s.isPopulated).length}
            showSummary={d.showSummary}
            pendingReviewCount={pendingReviewCount}
            nationalReviewStats={nationalReviewStats}
            nationalReviewStatsLoading={nationalReviewStatsLoading}
            onShowVerification={onShowVerification}
            onShowNationalReviewModal={onShowNationalReviewModal}
            onToggle={() => {
              d.setShowSummary((v) => {
                if (!v) { d.setShowFilterPanel(false); d.setShowLegend(false); }
                return !v;
              });
            }}
          />

          {/* Pending errors + announcements — below header pill */}
          {!d.showSummary && (
            <div className="mt-1.5 flex flex-wrap items-center justify-center gap-2">
              <PendingAlertsPill
                open={showAlertsPanel}
                onOpenChange={onAlertsPanelChange}
                showProposeForm={showProposeForm}
                showReportIssue={showReportIssue}
              />
              <AnnouncementsPill
                open={showAnnouncementsPanel}
                onOpenChange={onAnnouncementsPanelChange}
              />
            </div>
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
                countyStats={d.countyStats ?? null}
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
      </div>
      )}

      {/* About Modal */}
      {showAbout && <AboutModal onClose={onDismissAbout} />}

      {/* Help Modal */}
      {showHelp && (
        <HelpModal
          onClose={onDismissHelp}
          showReportIssue={showReportIssue}
          onReportIssue={onReportIssue}
        />
      )}

      {/* Map canvas */}
      <MapCanvas
        center={d.center}
        zoom={d.zoom}
        minZoom={d.minZoom}
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
        isTransitioning={d.isTransitioning}
        onUserInteractionStart={d.clearTransition}
        countyStats={d.countyStats ?? null}
        hoveredCounty={d.hoveredCounty ?? null}
        onCountyHover={d.setHoveredCounty}
      />

      {/* Tooltips */}
      {d.hoveredState && !d.focusedState && !(d.previewChurch ?? d.hoveredChurch) && (
        <StateTooltip hoveredState={d.hoveredState} states={d.states} tooltipPos={d.tooltipPos} />
      )}
      {(d.previewChurch ?? d.hoveredChurch) && (d.previewChurch ?? d.hoveredChurch)!.id !== d.selectedChurch?.id && (
        <ChurchTooltip
          church={(d.previewChurch ?? d.hoveredChurch)!}
          tooltipPos={d.tooltipPos}
          pinned={d.previewPinned}
          onViewChurch={d.previewPinned ? d.onViewChurch : undefined}
          onClose={d.previewPinned ? d.clearPreview : undefined}
        />
      )}
      {d.focusedState && d.hoveredCounty && d.countyStats && !(d.previewChurch ?? d.hoveredChurch) && (
        <CountyTooltip countyFips={d.hoveredCounty} countyStats={d.countyStats} tooltipPos={d.tooltipPos} />
      )}

      {/* Click-outside backdrop: dismiss pinned church preview */}
      {d.previewPinned && (
        <div
          className="absolute inset-0 z-[45]"
          aria-hidden
          onClick={d.clearPreview}
          onTouchEnd={(e) => { e.preventDefault(); d.clearPreview(); }}
        />
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
        <div className="absolute left-4 bottom-4 z-30 flex flex-col gap-2 items-start pointer-events-none">
          <div className="pointer-events-auto flex flex-col gap-2 items-start">
          {(d.focusedState || d.selectedChurch) && (
            <button
              onClick={d.handleResetView}
              title="All states"
              aria-label="All states"
              className="flex items-center gap-1.5 h-8 pl-2 pr-2.5 rounded-full shadow-md transition-colors hover:opacity-90 text-white text-xs font-medium"
              style={{ backgroundColor: "rgba(107, 33, 168, 0.9)" }}
            >
              <ArrowLeft size={14} color="#fff" />
              All states
            </button>
          )}
          {!d.selectedChurch && (
          <MapControls
            focusedState={d.focusedState}
            showFilterPanel={d.showFilterPanel}
            showLegend={d.showLegend}
            onZoomIn={d.handleZoomIn}
            onZoomOut={d.handleZoomOut}
            onResetView={d.handleResetView}
            minZoom={d.minZoom}
            onToggleFilter={() => {
              d.setShowFilterPanel((v) => {
                if (!v) { d.setShowSummary(false); d.setShowLegend(false); d.setSearchCollapsed(true); }
                return !v;
              });
            }}
            onToggleLegend={() => {
              const willOpen = !d.showLegend;
              d.setShowLegend((v) => !v);
              if (willOpen) {
                d.setShowSummary(false);
                d.setShowFilterPanel(false);
                d.setSearchCollapsed(true);
              }
            }}
            onShowAbout={onShowAbout}
            onShowHelp={onShowHelp}
            zoom={d.zoom}
            compact
          />
          )}
          </div>
        </div>
      )}

      {d.showLegend && (
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

      {!isLoadingVisible && !d.showFilterPanel && !d.showLegend && (
        <div
          className={`absolute left-6 right-6 md:left-12 md:right-12 z-40 flex flex-col items-center gap-2.5 pointer-events-none ${d.selectedChurch ? (isMobile ? "top-[80px] md:top-auto md:bottom-8" : "md:bottom-8") : "bottom-3 md:bottom-8"}`}
        >
          {/* People with you now — bottom of map; hidden on church view (mobile and desktop) */}
          {!d.selectedChurch && ((activePeople + activeBots) > 1 || (isLocalhost && (activePeople + activeBots) >= 1)) && (() => {
            const withYou = (activePeople + activeBots) - 1;
            const label = withYou === 0 ? "0 people with you now" : withYou === 1 ? "1 person with you now" : `${withYou.toLocaleString()} people with you now`;
            return (
              <div className="pointer-events-auto flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-full min-w-0 truncate bg-green-500/5 border border-green-500/10 backdrop-blur-md" style={{ boxShadow: "inset 0 1px 0 0 rgba(255, 255, 255, 0.2), inset 0 -1px 0 0 rgba(0, 0, 0, 0.1)" }}>
                <span className="relative flex h-1.5 w-1.5 flex-shrink-0" aria-hidden>
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-600 opacity-75" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-green-600" />
                </span>
                <span className="text-green-700 text-[11px] font-medium truncate">{label}</span>
              </div>
            );
          })()}
          {!d.selectedChurch && (
            <div className="pointer-events-auto w-full max-w-full flex flex-col items-center">
            <MapSearchBar
              churches={d.churches}
              states={d.states}
              focusedState={d.focusedState}
              focusedStateName={d.focusedStateName}
              navigateToChurch={navigateToChurch}
              onPreloadChurch={d.preloadChurch}
              collapsed={searchCollapsed}
              onExpand={() => { d.setSearchCollapsed(false); d.setShowFilterPanel(false); d.setShowLegend(false); }}
              onAddChurch={d.focusedState ? () => { d.setShowAddChurchFromSummary(true); } : undefined}
              onAddChurchForState={!d.focusedState ? (stateAbbrev) => d.setAddChurchForState(stateAbbrev) : undefined}
              detectedState={d.detectedState}
              zoom={d.zoom}
              center={d.center}
            />
            </div>
          )}
        </div>
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
  nationalReviewStats,
  nationalReviewStatsLoading,
  onShowVerification,
  onShowNationalReviewModal,
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
  nationalReviewStats: NationalReviewStatsResponse | null;
  nationalReviewStatsLoading: boolean;
  onShowVerification: () => void;
  onShowNationalReviewModal: () => void;
  onToggle: () => void;
}) {
  const nationalReviewPercentage = nationalReviewStats?.percentage ?? 0;
  const showNationalReviewRow = !focusedState;
  return (
    <div
      className="flex flex-col items-center rounded-full shadow-lg transition-all hover:shadow-xl cursor-pointer w-auto overflow-hidden"
      style={{ backgroundColor: "rgba(30, 16, 64, 0.92)" }}
    >
      {/* Main row — toggles summary */}
      <div
        onClick={onToggle}
        className="flex items-center justify-center gap-3 px-5 py-2.5 w-full min-w-0"
      >
        <ChurchIcon size={18} className="text-purple-300 flex-shrink-0" />
        {focusedState ? (
          <span className="text-white text-sm text-pretty min-w-0 truncate flex items-center gap-1.5">
            <span className="font-medium whitespace-nowrap">
              {filteredCount === 0 ? "Loading churches" : `${filteredCount.toLocaleString()} churches`}
              {" in "}
            </span>
            <span className="text-white font-medium flex items-center gap-1.5">
              <StateFlag abbrev={focusedState} size="sm" />
              {focusedStateName}
            </span>
          </span>
        ) : (
          <span className="text-white text-sm text-pretty min-w-0 truncate">
            <span className="font-medium">
              {totalChurches === 0 ? "Loading churches" : `${totalChurches.toLocaleString()} churches`}
            </span>{" "}
            across{" "}
            <span className="text-purple-300 font-medium">
              {allStatesLoaded ? "50 states" : `${populatedCount} states`}
            </span>
          </span>
        )}
        <ChevronDown
          size={16}
          className={`text-white/40 transition-transform duration-200 flex-shrink-0 ${showSummary ? "rotate-180" : ""}`}
        />
      </div>

      {/* Review row — state view: count; national view: percentage */}
      {focusedState && pendingReviewCount > 0 && (
        <div
          onClick={(e) => { e.stopPropagation(); onShowVerification(); }}
          className="flex items-center justify-center gap-1.5 w-full min-w-0 px-5 pb-1.5 -mt-1.5 hover:opacity-80 transition-opacity"
        >
          <span className="text-pink-300 text-[11px] font-medium min-w-0 truncate">
            {pendingReviewCount.toLocaleString()} need review
          </span>
        </div>
      )}
      {showNationalReviewRow && (
        <div
          onClick={(e) => { e.stopPropagation(); onShowNationalReviewModal(); }}
          className="flex items-center justify-center gap-1.5 w-full min-w-0 px-5 pb-1.5 -mt-1.5 hover:opacity-80 transition-opacity"
        >
          <span className="text-pink-300 text-[11px] font-medium min-w-0 truncate inline-flex items-center gap-1">
            {nationalReviewStatsLoading
              ? <><ThreeDotLoader /> <span>of them need reviewed</span></>
              : nationalReviewStats !== null
                ? `${nationalReviewPercentage}% of them need reviewed`
                : "—% of them need reviewed"}
          </span>
        </div>
      )}
    </div>
  );
}

// --- Three-dot triangle loading animation ---
function ThreeDotLoader() {
  return (
    <span
      className="inline-flex items-center"
      style={{ width: 10, height: 10, position: "relative", animation: "triangleSpin 1.5s linear infinite" }}
    >
      {/* Top dot */}
      <span
        className="absolute w-[3px] h-[3px] rounded-full bg-pink-300"
        style={{ top: 0, left: "50%", transform: "translateX(-50%)", animation: "dotPulse 1.2s ease-in-out infinite", animationDelay: "0s" }}
      />
      {/* Bottom-left dot */}
      <span
        className="absolute w-[3px] h-[3px] rounded-full bg-pink-300"
        style={{ bottom: 0, left: 0, animation: "dotPulse 1.2s ease-in-out infinite", animationDelay: "0.2s" }}
      />
      {/* Bottom-right dot */}
      <span
        className="absolute w-[3px] h-[3px] rounded-full bg-pink-300"
        style={{ bottom: 0, right: 0, animation: "dotPulse 1.2s ease-in-out infinite", animationDelay: "0.4s" }}
      />
      <style>{`@keyframes dotPulse { 0%, 80%, 100% { opacity: 0.25; transform: scale(0.8); } 40% { opacity: 1; transform: scale(1.2); } } @keyframes triangleSpin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </span>
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
          <CloseButton
            onClick={onClose}
            size="md"
            className="absolute top-4 right-4"
          />
          <div className="w-16 h-16 rounded-xl overflow-hidden mb-3">
            <img src={logoImg} alt="Here's My Church" className="w-full h-full object-cover" />
          </div>
          <h2 className="text-white font-medium text-[22px] leading-tight">Here's My Church</h2>
          <p className="text-white/60 text-sm leading-relaxed mt-3 text-pretty">An interactive map of Christian churches in the U.S. Find your church or find a new church.</p>
        </div>

        {/* Content */}
        <div className="px-6 py-5 overflow-y-auto flex-1 min-h-0">
          <div className="flex items-center justify-center gap-2 mb-4 px-3 py-2 rounded-lg bg-white/5">
            <span className="text-purple-300 text-xs">{"\u2726"}</span>
            <p className="text-white/60 text-xs text-pretty">100% free and crowd-sourced</p>
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
          <p className="text-white/30 text-[11px] text-center mt-2.5 text-pretty">Started by Derek Castelli, who's also building a Bible notes app called <a href="https://harvous.com" target="_blank" rel="noopener noreferrer" className="underline hover:text-white/50 transition-colors">Harvous</a>. If you need any help email <a href="mailto:hey@heresmychurch.com" className="underline hover:text-white/50 transition-colors">hey@heresmychurch.com</a></p>
        </div>
      </div>
    </div>
  );
}
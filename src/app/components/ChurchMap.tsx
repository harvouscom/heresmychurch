import { AnimatePresence } from "motion/react";
import {
  Church as ChurchIcon,
  ArrowLeft,
  ChevronDown,
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
import {
  LoadingOverlay,
  ErrorOverlay,
  ErrorBanner,
  StateTooltip,
  ChurchTooltip,
} from "./MapOverlays";
import { useChurchMapData } from "./useChurchMapData";
import { useCallback } from "react";

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
  const dismissAllOverlays = useCallback(() => {
    d.setShowSummary(false);
    d.setShowFilterPanel(false);
    d.setShowLegend(false);
    d.setSearchCollapsed(true);
  }, [d.setShowSummary, d.setShowFilterPanel, d.setShowLegend, d.setSearchCollapsed]);

  const handleMoveEnd = useCallback((coords: [number, number], z: number) => {
    d.setCenter(coords);
    d.setZoom(z);
  }, [d.setCenter, d.setZoom]);

  return (
    <div
      className={`relative size-full overflow-hidden flex ${d.selectedChurch ? 'flex-col md:flex-row' : ''}`}
      style={{ fontFamily: "'Livvic', sans-serif" }}
      onMouseMove={d.handleMouseMove}
    >
      {/* Map area */}
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
          />
        </div>
      )}
    </div>
  );
}

// ── MapArea: the map + all overlays (extracted to reduce ChurchMap's JSX depth) ──
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
}) {
  return (
    <div className={`${d.selectedChurch ? 'h-[45vh] md:h-full md:flex-1' : 'flex-1'} relative`} style={{ backgroundColor: "#F5F0E8" }}>
      {/* Top header pill + summary dropdown */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-30 flex flex-col items-center max-w-[90vw] md:max-w-[75vw]" ref={d.summaryRef}>
        <HeaderPill
          focusedState={d.focusedState}
          focusedStateName={d.focusedStateName}
          filteredCount={d.filteredChurches.length}
          totalChurches={d.totalChurches}
          allStatesLoaded={d.allStatesLoaded}
          populatedCount={d.states.filter((s) => s.isPopulated).length}
          showSummary={d.showSummary}
          onToggle={() => {
            d.setShowSummary((v) => {
              if (!v) { d.setShowFilterPanel(false); d.setShowLegend(false); }
              return !v;
            });
          }}
        />

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
            />
          )}
        </AnimatePresence>
      </div>

      {/* Back button */}
      {d.focusedState && (
        <button
          onClick={d.handleResetView}
          className="absolute top-4 left-4 z-20 flex items-center gap-2 px-4 py-2 rounded-full shadow-lg text-white text-xs font-medium transition-colors hover:bg-purple-700"
          style={{ backgroundColor: "rgba(107, 33, 168, 0.9)" }}
        >
          <ArrowLeft size={14} />
          All States
        </button>
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
  onToggle,
}: {
  focusedState: string | null;
  focusedStateName: string;
  filteredCount: number;
  totalChurches: number;
  allStatesLoaded: boolean;
  populatedCount: number;
  showSummary: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      className="flex items-center justify-center gap-3 px-5 py-2.5 rounded-full shadow-lg transition-all hover:shadow-xl cursor-pointer min-w-[85vw] md:min-w-0"
      style={{ backgroundColor: "rgba(30, 16, 64, 0.92)" }}
    >
      <ChurchIcon size={18} className="text-purple-300" />
      {focusedState ? (
        <span className="text-white text-sm">
          <span className="font-semibold">
            {filteredCount.toLocaleString()} churches
          </span>{" "}
          in{" "}
          <span className="text-purple-300 font-semibold">
            {focusedStateName}
          </span>
        </span>
      ) : (
        <span className="text-white text-sm">
          <span className="font-semibold">
            {totalChurches.toLocaleString()} churches
          </span>{" "}
          {allStatesLoaded ? "across all" : "across"}{" "}
          <span className="text-purple-300 font-semibold">
            {allStatesLoaded ? "50 states" : `${populatedCount} states`}
          </span>
        </span>
      )}
      <ChevronDown
        size={16}
        className={`text-white/40 transition-transform duration-200 ${showSummary ? "rotate-180" : ""}`}
      />
    </button>
  );
}

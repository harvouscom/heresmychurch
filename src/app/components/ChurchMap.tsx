import { AnimatePresence, motion } from "motion/react";
import {
  Church as ChurchIcon,
  ArrowLeft,
  ChevronDown,
  Check,
  CheckCheck,
} from "lucide-react";
import type { Church, StateInfo } from "./church-data";
import { churchMeetsVerifiedListingCriteria, churchNeedsReview } from "./church-data";
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
import { AuditModal } from "./AuditModal";
import { MapLibreCanvas, type MapLibreHandle } from "./MapLibreCanvas";
import {
  fetchRegions,
  fetchChurches as fetchChurchesApi,
  fetchChurchByShortId,
  fetchCountries,
  type CountrySummary,
} from "./api";
import { getCountry, getRegion, resolveRegionByAbbrev } from "../config/countries";
import { VerificationModal, NationalReviewModal } from "./VerificationModal";
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
import { buildRegionSummaryStats, computeNationalSummary, computeWorldSummary } from "./hooks/useChurchFilters";
import { findCountyNameForPoint } from "./county-resolve";
import { churchMatchesRouteSegment, getChurchUrlSegment } from "./url-utils";
import {
  clearNavigationChurchPreload,
  matchNavigationChurchPreload,
  setNavigationChurchPreload,
} from "./church-navigation-preload";
import { getStateZoom, REVIEW_SAYINGS } from "./map-constants";
import {
  buildAdmin2Stats,
  filterChurchesToAdmin2,
  loadAdmin2Features,
  type Admin2Feature,
} from "./admin2";
import type { CountyStats } from "./MapLibreCanvas";
import type { ChurchClickTarget } from "./ChurchDetailPanel";
import { fetchNationalReviewStats, fetchModeratorPending, fetchSpecialReportEaster2026 } from "./api";
import type { SpecialReportEaster2026Church } from "./api";
import type { NationalReviewStatsResponse, ModeratorPendingResponse } from "./api";
import { useIsMobile } from "./ui/use-mobile";
import { PendingAlertsPill } from "./PendingAlertsPill";
import { ThreeDotLoader } from "./ThreeDotLoader";
import { AnnouncementsPill } from "./AnnouncementsPill";
import { ReviewPill } from "./ReviewPill";

type ModerationPendingData = Pick<
  ModeratorPendingResponse,
  "pendingSuggestions" | "pendingChurches" | "inReviewSuggestions" | "inReviewChurches"
>;
import { reportIssueEnabled } from "../config/pendingAlerts";
import { useReducer, useEffect, useMemo, useState, useCallback, useRef } from "react";
import logoImg from "../../assets/a94bce1cf0860483364d5d9c353899b7da8233e7.png";
import { Easter2026SpecialReportBlurbModal } from "./special-report/Easter2026SpecialReportBlurbModal";
/** Set to true to temporarily hide All States button, Map Key, and action controls (zoom/filter). */
const HIDE_MAP_UI = false;

/** Desktop detail-panel width; the map camera insets by this so the selected
 *  church centres in the space the panel leaves visible. */
const DETAIL_PANEL_WIDTH = 396;

/** Sample per-state active counts for testing on localhost (see tooltip + on-map labels). */
const SAMPLE_ACTIVE_BY_STATE: Record<string, number> = {
  CA: 2, TX: 3, NY: 1, FL: 4, IL: 2, OH: 1, GA: 2, NC: 1, WA: 1,
};

/* eslint-disable @refresh/only-export-components -- force clean re-mount after hook changes */

interface ChurchMapProps {
  viewLevel?: "world" | "country" | "region";
  countryCode?: string;
  navigateToWorld: () => void;
  navigateToCountry: (countryCode: string) => void;
  routeStateAbbrev: string | null;
  routeCountyFips: string | null;
  routeChurchShortId: string | null;
  routeLegacyChurchId: string | null;
  openReviewModalFromQuery?: boolean;
  showVerifiedDotsFromQuery?: boolean;
  clearReviewQueryParam?: () => void;
  moderatorKey?: string | null;
  onExitReviewView?: () => void;
  navigateToState: (abbrev: string) => void;
  navigateToStateWithReview: (abbrev: string) => void;
  navigateToChurch: (
    stateAbbrev: string,
    churchShortId: string,
    options?: { replace?: boolean; countyFips?: string; countryCode?: string },
  ) => void;
  navigateToNational: () => void;
  navigateToCounty: (stateAbbrev: string, countyFips: string) => void;
  navigateToStateOnly: (stateAbbrev: string) => void;
}

export function ChurchMap({
  viewLevel = "country",
  countryCode = "US",
  navigateToWorld,
  navigateToCountry,
  routeStateAbbrev,
  routeCountyFips,
  routeChurchShortId,
  routeLegacyChurchId,
  openReviewModalFromQuery = false,
  showVerifiedDotsFromQuery = false,
  clearReviewQueryParam,
  moderatorKey,
  onExitReviewView,
  navigateToState,
  navigateToStateWithReview,
  navigateToChurch,
  navigateToNational,
  navigateToCounty,
  navigateToStateOnly,
}: ChurchMapProps) {
  const isMobile = useIsMobile();
  const isWorld = viewLevel === "world";

  // Country mode. useChurchMapData is US-shaped end to end — it looks regions up
  // in a 50-state list — so non-US browsing runs on its own data path. Admin-2
  // (CA census divisions / AU LGAs) is layered on here when CountryConfig.hasAdmin2.
  const isIntl = !isWorld && countryCode !== "US";
  const countryCfg = getCountry(countryCode);
  const hasAdmin2 = !!countryCfg?.hasAdmin2;
  const [intlRegions, setIntlRegions] = useState<StateInfo[]>([]);
  const [intlChurches, setIntlChurches] = useState<Church[]>([]);
  const [worldCountries, setWorldCountries] = useState<CountrySummary[]>([]);
  const [worldLoading, setWorldLoading] = useState(() => isWorld);
  const [intlRegionsLoading, setIntlRegionsLoading] = useState(false);
  const [intlChurchesLoading, setIntlChurchesLoading] = useState(false);
  const [intlAdmin2Features, setIntlAdmin2Features] = useState<Map<string, Admin2Feature> | null>(null);
  const [intlHoveredAdmin2, setIntlHoveredAdmin2] = useState<string | null>(null);
  /** Search/deep-link selection for non-US routes — opens the detail panel before the region list loads. */
  const [intlSelectedChurch, setIntlSelectedChurch] = useState<Church | null>(null);

  useEffect(() => {
    if (!isWorld) return;
    let cancelled = false;
    setWorldLoading(true);
    fetchCountries()
      .then((r) => { if (!cancelled) setWorldCountries(r.countries); })
      .catch((e) => console.error("[ChurchMap] fetchCountries failed", e))
      .finally(() => { if (!cancelled) setWorldLoading(false); });
    return () => { cancelled = true; };
  }, [isWorld]);

  useEffect(() => {
    if (!isIntl) { setIntlRegions([]); setIntlRegionsLoading(false); return; }
    let cancelled = false;
    setIntlRegionsLoading(true);
    setIntlRegions([]);
    fetchRegions(countryCode)
      .then((r) => { if (!cancelled) setIntlRegions(r.regions); })
      .catch((e) => console.error("[ChurchMap] fetchRegions failed", e))
      .finally(() => { if (!cancelled) setIntlRegionsLoading(false); });
    return () => { cancelled = true; };
  }, [isIntl, countryCode]);

  useEffect(() => {
    if (!isIntl || !routeStateAbbrev) {
      setIntlChurches([]);
      setIntlChurchesLoading(false);
      return;
    }
    let cancelled = false;
    setIntlChurchesLoading(true);
    setIntlChurches([]);
    fetchChurchesApi(routeStateAbbrev)
      .then((r) => { if (!cancelled) setIntlChurches(r.churches); })
      .catch((e) => console.error("[ChurchMap] fetchChurches failed", e))
      .finally(() => { if (!cancelled) setIntlChurchesLoading(false); });
    return () => { cancelled = true; };
  }, [isIntl, routeStateAbbrev]);

  useEffect(() => {
    if (!isIntl || !hasAdmin2) {
      setIntlAdmin2Features(null);
      return;
    }
    let cancelled = false;
    loadAdmin2Features(countryCode)
      .then((m) => { if (!cancelled) setIntlAdmin2Features(m); })
      .catch((e) => console.error("[ChurchMap] loadAdmin2Features failed", e));
    return () => { cancelled = true; };
  }, [isIntl, hasAdmin2, countryCode]);

  const d = useChurchMapData({
    // Country mode keeps its route params away from this hook. It resolves a
    // region against a hardcoded 50-state list and resets to the national view
    // when the lookup misses — which bounced /CA/PE straight back to /.
    routeStateAbbrev: isIntl || isWorld ? null : routeStateAbbrev,
    routeCountyFips: isIntl || isWorld ? null : routeCountyFips,
    routeChurchShortId: isIntl || isWorld ? null : routeChurchShortId,
    routeLegacyChurchId: isIntl || isWorld ? null : routeLegacyChurchId,
    navigateToState,
    navigateToChurch,
    navigateToNational,
    navigateToCounty,
    navigateToStateOnly,
    isMobile,
  });

  const intlFocusedAdmin2 =
    isIntl && hasAdmin2 && routeStateAbbrev && routeCountyFips ? routeCountyFips : null;
  const intlCountyStats: CountyStats | null = useMemo(() => {
    if (!isIntl || !hasAdmin2 || !routeStateAbbrev) return null;
    return buildAdmin2Stats(countryCode, routeStateAbbrev, intlChurches, intlAdmin2Features);
  }, [isIntl, hasAdmin2, countryCode, routeStateAbbrev, intlChurches, intlAdmin2Features]);
  const intlChurchesForMap = useMemo(
    () => filterChurchesToAdmin2(intlChurches, intlFocusedAdmin2, intlAdmin2Features),
    [intlChurches, intlFocusedAdmin2, intlAdmin2Features],
  );
  const mapCountyStats = countryCode === "US" ? (d.countyStats ?? null) : intlCountyStats;
  const mapFocusedCounty = countryCode === "US" ? (d.focusedCounty ?? null) : intlFocusedAdmin2;
  const mapCountyFeatures =
    countryCode === "US" ? d.countyFeatures : intlAdmin2Features;

  // Intl church view is URL-driven (useChurchMapData ignores intl route church ids).
  // Prefer the loaded region list; fall back to search preload (state + module
  // cache) so the detail panel opens immediately instead of waiting on a full
  // region fetch — including across /world → country remounts.
  const selectedChurch = useMemo(() => {
    if (isIntl) {
      if (!routeChurchShortId || !routeStateAbbrev) return null;
      const fromList = intlChurches.find((c) =>
        churchMatchesRouteSegment(c, routeChurchShortId, routeStateAbbrev, countryCode),
      );
      if (fromList) return fromList;
      if (
        intlSelectedChurch &&
        churchMatchesRouteSegment(
          intlSelectedChurch,
          routeChurchShortId,
          routeStateAbbrev,
          countryCode,
        )
      ) {
        return intlSelectedChurch;
      }
      return (
        matchNavigationChurchPreload(routeChurchShortId, routeStateAbbrev, countryCode) ?? null
      );
    }
    return d.selectedChurch;
  }, [
    isIntl,
    routeChurchShortId,
    routeStateAbbrev,
    intlChurches,
    intlSelectedChurch,
    countryCode,
    d.selectedChurch,
  ]);

  const handlePreloadChurch = useCallback(
    (church: Church) => {
      setNavigationChurchPreload(church);
      d.preloadChurch(church);
      setIntlSelectedChurch(church);
    },
    [d.preloadChurch],
  );

  // Drop intl selection when leaving a church route. Do not clear the module
  // preload while still on /world — search writes it there before navigate, and
  // ChurchMap remounts on the country route entry.
  useEffect(() => {
    if (!isIntl) {
      setIntlSelectedChurch(null);
      return;
    }
    if (!routeChurchShortId) {
      setIntlSelectedChurch(null);
      clearNavigationChurchPreload();
    }
  }, [isIntl, routeChurchShortId]);

  // After remount (world → country route entry), recover search preload so the
  // detail panel opens immediately; upgrade to the full record when the region
  // list arrives.
  useEffect(() => {
    if (!isIntl || !routeChurchShortId || !routeStateAbbrev) return;

    const fromList = intlChurches.find((c) =>
      churchMatchesRouteSegment(c, routeChurchShortId, routeStateAbbrev, countryCode),
    );
    if (fromList) {
      setIntlSelectedChurch(fromList);
      clearNavigationChurchPreload();
      return;
    }

    const fromNav = matchNavigationChurchPreload(
      routeChurchShortId,
      routeStateAbbrev,
      countryCode,
    );
    if (fromNav) setIntlSelectedChurch(fromNav);
  }, [isIntl, routeChurchShortId, routeStateAbbrev, countryCode, intlChurches]);

  // Deep links (no search preload): fetch one church in parallel with the region list.
  useEffect(() => {
    if (!isIntl || !routeChurchShortId || !routeStateAbbrev) return;
    if (selectedChurch) return;

    let cancelled = false;
    fetchChurchByShortId(routeStateAbbrev, routeChurchShortId)
      .then(({ church }) => {
        if (cancelled || !church) return;
        setIntlSelectedChurch(church);
      })
      .catch((e) => {
        console.warn(
          `[ChurchMap] intl fetchChurchByShortId failed for ${routeStateAbbrev}/${routeChurchShortId}:`,
          e,
        );
      });
    return () => {
      cancelled = true;
    };
  }, [isIntl, routeChurchShortId, routeStateAbbrev, selectedChurch]);

  useEffect(() => {
    if (!isIntl || !selectedChurch) return;
    const place = selectedChurch.city || routeStateAbbrev || countryCode;
    document.title = `${selectedChurch.name} -- ${place} | Here's My Church`;
  }, [isIntl, selectedChurch, routeStateAbbrev, countryCode]);

  const handleIntlCountyClick = useCallback(
    (admin2Id: string) => {
      if (!routeStateAbbrev) return;
      navigateToCounty(routeStateAbbrev, admin2Id);
    },
    [routeStateAbbrev, navigateToCounty],
  );

  // When in county view, preserve county in URL when navigating to a church
  const navigateToChurchWithContext = useCallback(
    (stateAbbrev: string, churchShortId: string, options?: { replace?: boolean }) => {
      navigateToChurch(stateAbbrev, churchShortId, {
        ...options,
        countyFips: mapFocusedCounty ?? undefined,
        countryCode,
      });
    },
    [navigateToChurch, mapFocusedCounty, countryCode],
  );

  const handleChurchDotClick = useCallback(
    (church: Church, e?: { clientX: number; clientY: number }) => {
      if (!isIntl) {
        d.handleChurchDotClick(church, e);
        return;
      }
      d.setHoveredChurch(null);
      const st = (routeStateAbbrev ?? church.state ?? "").toUpperCase();
      if (!st) return;
      if (isMobile) {
        // Preview pin on mobile — same UX as US; confirm opens church view.
        d.handleChurchDotClick(church, e);
        return;
      }
      navigateToChurchWithContext(st, getChurchUrlSegment(church, st, countryCode));
    },
    [
      isIntl,
      isMobile,
      routeStateAbbrev,
      countryCode,
      navigateToChurchWithContext,
      d.handleChurchDotClick,
      d.setHoveredChurch,
    ],
  );

  const onViewChurch = useCallback(
    (church: Church) => {
      if (!isIntl) {
        d.onViewChurch(church);
        return;
      }
      d.clearPreview();
      const st = (routeStateAbbrev ?? church.state ?? "").toUpperCase();
      if (st) {
        navigateToChurchWithContext(st, getChurchUrlSegment(church, st, countryCode));
      }
    },
    [
      isIntl,
      routeStateAbbrev,
      countryCode,
      navigateToChurchWithContext,
      d.onViewChurch,
      d.clearPreview,
    ],
  );

  // Prefer HeaderPill "Loading churches…" for normal loads; keep the full-screen
  // verse overlay only for slow first-time populate jobs.
  const isLoadingVisible = d.populating && d.forceLoadingVisible;
  const showErrorOverlay = d.error && d.focusedState && !d.loading && !d.populating && !d.forceLoadingVisible && d.churches.length === 0;
  const showErrorBanner = d.error && (d.churches.length > 0 || !d.focusedState);
  // When Filter or Map Key panel is open, collapse search (same as filter behavior). Otherwise: state/church view always show full search; national collapsed only on mobile.
  const effectiveSearchCollapsed =
    d.showFilterPanel || d.showLegend
      ? true
      : (d.focusedState || routeStateAbbrev || selectedChurch ? false : (d.searchCollapsed && isMobile));
  // Only count search as "overlay open" on national + mobile (so map tap can collapse the pill). Desktop national and state/church always show full search — no overlay for search.
  const isNationalView = !d.focusedState && !routeStateAbbrev && !selectedChurch;

  // Verified-dots mode (national view): use a compact, pre-aggregated payload.
  const [verifiedDotsEnabled, setVerifiedDotsEnabled] = useState(false);
  const [verifiedChurches, setVerifiedChurches] = useState<Church[] | null>(null);

  useEffect(() => {
    if (!showVerifiedDotsFromQuery) return;
    if (routeStateAbbrev) return;
    if (moderatorKey) return;
    setVerifiedDotsEnabled(true);
  }, [showVerifiedDotsFromQuery, routeStateAbbrev, moderatorKey]);

  const exitVerifiedMode = useCallback(() => {
    setVerifiedDotsEnabled(false);
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete("verified");
      const next = url.pathname + (url.searchParams.toString() ? `?${url.searchParams.toString()}` : "");
      window.history.replaceState(null, "", next);
    } catch {
      // ignore
    }
  }, []);

  const enableVerifiedMode = useCallback(() => {
    if (moderatorKey) return;
    setVerifiedDotsEnabled(true);
    // Only persist verified state in URL on national view (state/county should be a local filter only).
    if (routeStateAbbrev) return;
    try {
      const url = new URL(window.location.href);
      url.searchParams.set("verified", "1");
      window.history.replaceState(null, "", url.pathname + `?${url.searchParams.toString()}`);
    } catch {
      // ignore
    }
  }, [moderatorKey, routeStateAbbrev]);

  useEffect(() => {
    if (!verifiedDotsEnabled) return;
    if (verifiedChurches) return;
    let cancelled = false;
    fetchSpecialReportEaster2026()
      .then((r) => {
        if (cancelled) return;
        const asChurch = (c: SpecialReportEaster2026Church): Church | null => {
          const lat = typeof c.lat === "number" ? c.lat : null;
          const lng = typeof c.lng === "number" ? c.lng : null;
          if (lat == null || lng == null) return null;
          return {
            id: c.id,
            shortId: c.shortId,
            name: c.name,
            city: c.city,
            state: c.state,
            lat,
            lng,
            attendance: c.attendance || 0,
            denomination: c.denomination || "Unknown",
            address: c.address,
            website: c.website,
            serviceTimes: c.serviceTimes,
            ministries: c.ministries,
            lastVerified: c.lastVerified,
          };
        };
        const verified = (r.churches || [])
          .map(asChurch)
          .filter(Boolean)
          .map((x) => x as Church)
          .filter((c) => churchMeetsVerifiedListingCriteria(c));
        setVerifiedChurches(verified);
      })
      .catch(() => {
        if (!cancelled) setVerifiedChurches([]);
      });
    return () => {
      cancelled = true;
    };
  }, [verifiedDotsEnabled, verifiedChurches]);

  // If we have a session location, nudge map center/zoom on national view when verified mode is enabled.
  useEffect(() => {
    if (!verifiedDotsEnabled) return;
    if (!isNationalView) return;
    try {
      const raw = sessionStorage.getItem("hmc_easter_loc");
      if (!raw) return;
      const { lat, lng } = JSON.parse(raw) as { lat?: number; lng?: number };
      if (typeof lat !== "number" || typeof lng !== "number") return;
      d.setCenter([lng, lat]);
      d.setZoom(3.5);
    } catch {
      // ignore
    }
  }, [verifiedDotsEnabled, isNationalView]);

  // Consolidated local state (was 6 useState — saves 5 hooks)
  const hasSeenAbout = typeof document !== "undefined" && document.cookie.includes("hmc_seen_about=1");
  const hasSeenSpecialEaster =
    typeof document !== "undefined" && document.cookie.includes("hmc_seen_special_easter_2026=1");
  const [local, localDispatch] = useReducer(localReducer, {
    showVerificationModal: false,
    showNationalReviewModal: false,
    pendingReviewCount: 0,
    nationalReviewStats: null,
    nationalReviewStatsLoading: false,
    forceEditForm: false,
    showAbout: !hasSeenAbout && !routeStateAbbrev,
    showSpecialReport: false,
    showHelp: false,
    showAudit: false,
    showAlertsPanel: false,
    showAnnouncementsPanel: false,
    alertsPanelOpenedViaReportIssue: false,
    moderationMode: false,
    moderationPending: null,
    moderationLoading: false,
    moderationError: null,
    showModerationPanel: false,
  });

  // State-view search: when user types in search, map shows only dots for search results
  const [stateViewSearchResultIds, setStateViewSearchResultIds] = useState<Set<string> | null>(null);
  useEffect(() => {
    if (!d.focusedState) setStateViewSearchResultIds(null);
  }, [d.focusedState]);

  // Clear region hover/preview when leaving the world map or switching countries so
  // a country code like "US" doesn't linger as a bare-abbrev tooltip.
  useEffect(() => {
    d.setHoveredState(null);
    d.clearStatePreview();
  }, [viewLevel, countryCode]); // intentionally omit d — only reset on geography change

  const churchesToShowOnMap = useMemo(() => {
    // National view: verified filter swaps in the pre-fetched verified dataset
    if (verifiedDotsEnabled && !d.focusedState) return verifiedChurches ?? [];

    // State/county view: apply verified filter on top of existing filtered churches
    let base = d.filteredChurches;
    if (verifiedDotsEnabled && d.focusedState) {
      base = base.filter((c) => churchMeetsVerifiedListingCriteria(c));
    }

    if (!d.focusedState || stateViewSearchResultIds === null) return base;
    return base.filter((c) => stateViewSearchResultIds.has(c.id));
  }, [verifiedDotsEnabled, verifiedChurches, d.focusedState, d.filteredChurches, stateViewSearchResultIds]);

  const anyOverlayOpen = d.showSummary || d.showFilterPanel || d.showLegend || local.showAlertsPanel || local.showAnnouncementsPanel || local.showModerationPanel || (isNationalView && isMobile && !effectiveSearchCollapsed);
  const dismissAllOverlays = () => {
    d.setShowSummary(false);
    d.setShowFilterPanel(false);
    d.setShowLegend(false);
    d.setSearchCollapsed(true);
    localDispatch({ type: "SET", key: "showAlertsPanel", value: false });
    localDispatch({ type: "SET", key: "showAnnouncementsPanel", value: false });
    localDispatch({ type: "SET", key: "alertsPanelOpenedViaReportIssue", value: false });
    localDispatch({ type: "SET", key: "showModerationPanel", value: false });
  };

  const dismissAbout = () => {
    localDispatch({ type: "SET", key: "showAbout", value: false });
    document.cookie = "hmc_seen_about=1; path=/; max-age=31536000; SameSite=Lax";
  };

  const dismissSpecialReport = () => {
    localDispatch({ type: "SET", key: "showSpecialReport", value: false });
  };

  // Pending suggestion field names for the selected church (so all visitors see "updates pending review")
  const pendingFieldsForChurch = useMemo(() => {
    if (!selectedChurch?.id || !d.statePendingSuggestions?.length) return [];
    const p = d.statePendingSuggestions.find((x) => x.churchId === selectedChurch.id);
    return p ? Object.keys(p.fields) : [];
  }, [selectedChurch?.id, d.statePendingSuggestions]);

  // Compute churches that need review (missing 2+ of address, service times, denomination)
  // When in county/admin-2 view, scope to that area; otherwise region/state
  const incompleteChurches = useMemo(() => {
    if (isWorld) return [];
    if (isIntl) {
      const list = intlFocusedAdmin2 ? intlChurchesForMap : intlChurches;
      return list.filter(churchNeedsReview);
    }
    const list = d.focusedCounty ? d.filteredChurches : d.churches;
    return list.filter(churchNeedsReview);
  }, [
    isWorld,
    isIntl,
    intlFocusedAdmin2,
    intlChurchesForMap,
    intlChurches,
    d.focusedCounty,
    d.filteredChurches,
    d.churches,
  ]);

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
  const onShowAudit = () => localDispatch({ type: "SET", key: "showAudit", value: true });
  const onDismissAudit = () => localDispatch({ type: "SET", key: "showAudit", value: false });

  const handleExitReviewView = useCallback(() => {
    localDispatch({ type: "SET", key: "moderationMode", value: false });
    localDispatch({ type: "SET", key: "moderationPending", value: null });
    localDispatch({ type: "SET", key: "showModerationPanel", value: false });
    onExitReviewView?.();
  }, [onExitReviewView]);

  // Fetch review stats: world rollup, or country-level when not in a region
  useEffect(() => {
    const atCountryLevel = isIntl ? !routeStateAbbrev : !d.focusedState;
    if (!isWorld && !atCountryLevel) return;
    let cancelled = false;
    localDispatch({ type: "SET", key: "nationalReviewStatsLoading", value: true });
    fetchNationalReviewStats(isWorld ? "WORLD" : countryCode)
      .then((stats: NationalReviewStatsResponse) => {
        if (cancelled) return;
        localDispatch({ type: "SET", key: "nationalReviewStats", value: stats });
        localDispatch({ type: "SET", key: "nationalReviewStatsLoading", value: false });
      })
      .catch(() => {
        if (cancelled) return;
        localDispatch({ type: "SET", key: "nationalReviewStats", value: null });
        localDispatch({ type: "SET", key: "nationalReviewStatsLoading", value: false });
      });
    return () => { cancelled = true; };
  }, [isWorld, isIntl, countryCode, routeStateAbbrev, d.focusedState]);

  // Refetch state churches when opening the verification modal so stats use latest API data (incl. merged corrections)
  useEffect(() => {
    if (local.showVerificationModal && d.focusedState) {
      d.refetchCurrentStateChurches();
    }
  }, [local.showVerificationModal, d.focusedState]);

  // Validate reviewer key and load pending items
  const refreshModeration = useMemo(() => {
    if (!moderatorKey) return () => {};
    return () => {
      localDispatch({ type: "SET", key: "moderationLoading", value: true });
      fetchModeratorPending(moderatorKey)
        .then((data) => {
          localDispatch({ type: "SET", key: "moderationMode", value: true });
          localDispatch({
            type: "SET",
            key: "moderationPending",
            value: {
              pendingSuggestions: data.pendingSuggestions,
              pendingChurches: data.pendingChurches,
              inReviewSuggestions: data.inReviewSuggestions ?? [],
              inReviewChurches: data.inReviewChurches ?? [],
            },
          });
          localDispatch({ type: "SET", key: "moderationError", value: null });
          localDispatch({ type: "SET", key: "moderationLoading", value: false });
        })
        .catch((err) => {
          localDispatch({ type: "SET", key: "moderationError", value: err.message || "Invalid key" });
          localDispatch({ type: "SET", key: "moderationLoading", value: false });
        });
    };
  }, [moderatorKey]);

  useEffect(() => {
    if (moderatorKey) {
      refreshModeration();
      // When reviewer key is present, show login modal (replacing about)
      if (!local.moderationMode) {
        localDispatch({ type: "SET", key: "showAbout", value: true });
      }
    }
  }, [moderatorKey]);

  // Auto-dismiss login modal only after key is successfully validated (we have pending data)
  useEffect(() => {
    if (moderatorKey && local.showAbout && local.moderationPending !== null) {
      dismissAbout();
    }
  }, [moderatorKey, local.showAbout, local.moderationPending]);

  // Exit review mode when key is removed from URL (key is the sole source of truth for review mode)
  useEffect(() => {
    if (!moderatorKey) {
      localDispatch({ type: "SET", key: "moderationMode", value: false });
      localDispatch({ type: "SET", key: "moderationPending", value: null });
      localDispatch({ type: "SET", key: "showModerationPanel", value: false });
    }
  }, [moderatorKey]);

  // Auto-open state review modal when navigating from national modal (?review=true, no key)
  useEffect(() => {
    if (
      openReviewModalFromQuery &&
      !moderatorKey &&
      clearReviewQueryParam &&
      d.focusedState &&
      d.churches.length > 0 &&
      !d.loading &&
      !d.populating
    ) {
      localDispatch({ type: "SET", key: "showVerificationModal", value: true });
      clearReviewQueryParam();
    }
  }, [openReviewModalFromQuery, moderatorKey, clearReviewQueryParam, d.focusedState, d.churches.length, d.loading, d.populating]);

  const { people: activePeople, bots: activeBots, byState: activeByState } = useActiveUsers(
    selectedChurch?.state ?? routeStateAbbrev ?? d.focusedState ?? null
  );
  const [isLocalhost, setIsLocalhost] = useState(false);
  useEffect(() => {
    if (typeof window !== "undefined") setIsLocalhost(window.location.hostname === "localhost");
  }, []);

  const displayActiveByState = isLocalhost
    ? { ...SAMPLE_ACTIVE_BY_STATE, ...activeByState }
    : activeByState;

  const isStateOrChurchView = !!d.focusedState || !!routeStateAbbrev || !!selectedChurch;
  useEffect(() => {
    const color = isStateOrChurchView ? "#EDE4F3" : "#F5F0E8";
    document.documentElement.style.backgroundColor = color;
    document.body.style.backgroundColor = color;
    return () => {
      document.documentElement.style.backgroundColor = "";
      document.body.style.backgroundColor = "";
    };
  }, [isStateOrChurchView]);

  const resolvedCountyForSelectedChurch = useMemo(() => {
    if (!selectedChurch || !mapCountyFeatures?.size) return null;
    const st = (selectedChurch.state || routeStateAbbrev || "").toUpperCase();
    if (!st) return null;
    return findCountyNameForPoint(st, selectedChurch.lng, selectedChurch.lat, mapCountyFeatures);
  }, [selectedChurch, mapCountyFeatures, routeStateAbbrev]);

  const churchTooltipChurch = d.previewChurch ?? d.hoveredChurch;
  const churchTooltipCountyName = useMemo(() => {
    if (!churchTooltipChurch || !mapCountyFeatures?.size) return null;
    const st = (churchTooltipChurch.state || routeStateAbbrev || "").toUpperCase();
    if (!st) return null;
    return findCountyNameForPoint(st, churchTooltipChurch.lng, churchTooltipChurch.lat, mapCountyFeatures);
  }, [churchTooltipChurch, mapCountyFeatures, routeStateAbbrev]);

  return (
    <div
      className={`relative size-full overflow-hidden flex ${selectedChurch ? 'flex-col md:flex-row' : ''}`}
      style={{ fontFamily: "'Livvic', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif" }}
      onMouseMove={d.handleMouseMove}
      onMouseLeave={d.handleMouseLeave}
    >
      {/* Map area — pure render, no hooks */}
      <MapArea
        d={d}
        selectedChurch={selectedChurch}
        onChurchDotClick={handleChurchDotClick}
        onViewChurch={onViewChurch}
        isLoadingVisible={isLoadingVisible}
        showErrorOverlay={!!showErrorOverlay}
        showErrorBanner={!!showErrorBanner}
        anyOverlayOpen={anyOverlayOpen}
        dismissAllOverlays={dismissAllOverlays}
        verifiedDotsEnabled={verifiedDotsEnabled}
        navigateToState={navigateToState}
        navigateToChurch={navigateToChurchWithContext}
        navigateToCounty={navigateToCounty}
        navigateToStateOnly={navigateToStateOnly}
        routeStateAbbrev={routeStateAbbrev}
        routeCountyFips={routeCountyFips}
        viewLevel={viewLevel}
        countryCode={countryCode}
        navigateToWorld={navigateToWorld}
        navigateToCountry={navigateToCountry}
        worldCountries={worldCountries}
        worldLoading={worldLoading}
        intlRegions={intlRegions}
        intlRegionsLoading={intlRegionsLoading}
        intlChurches={intlChurchesForMap}
        intlChurchesLoading={intlChurchesLoading}
        mapCountyStats={mapCountyStats}
        mapFocusedCounty={mapFocusedCounty}
        mapCountyFeatures={mapCountyFeatures}
        intlHoveredAdmin2={intlHoveredAdmin2}
        onIntlCountyHover={setIntlHoveredAdmin2}
        onIntlCountyClick={handleIntlCountyClick}
        onShowVerification={onShowVerification}
        onShowNationalReviewModal={() => localDispatch({ type: "SET", key: "showNationalReviewModal", value: true })}
        pendingReviewCount={local.pendingReviewCount}
        nationalReviewStats={local.nationalReviewStats}
        nationalReviewStatsLoading={local.nationalReviewStatsLoading}
        showAbout={local.showAbout}
        onDismissAbout={dismissAbout}
        onShowAbout={onShowAbout}
        showSpecialReport={local.showSpecialReport}
        onDismissSpecialReport={dismissSpecialReport}
        showHelp={local.showHelp}
        onDismissHelp={onDismissHelp}
        onShowHelp={onShowHelp}
        showAudit={local.showAudit}
        onShowAudit={onShowAudit}
        onDismissAudit={onDismissAudit}
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
        moderationMode={local.moderationMode}
        moderatorKey={moderatorKey || ""}
        moderationPending={local.moderationPending}
        moderationLoading={local.moderationLoading}
        moderationError={local.moderationError}
        showModerationPanel={local.showModerationPanel}
        onModerationPanelChange={(open) => {
          localDispatch({ type: "SET", key: "showModerationPanel", value: open });
        }}
        onRefreshModeration={refreshModeration}
        onExitReviewView={handleExitReviewView}
        activePeople={activePeople}
        activeBots={activeBots}
        activeByState={displayActiveByState}
        isLocalhost={isLocalhost}
        searchCollapsed={effectiveSearchCollapsed}
        isMobile={isMobile}
        churchesToShowOnMap={churchesToShowOnMap}
        onStateViewSearchResultsChange={setStateViewSearchResultIds}
        verifiedChurches={verifiedChurches}
        onToggleVerified={() => verifiedDotsEnabled ? exitVerifiedMode() : enableVerifiedMode()}
        churchTooltipCountyName={churchTooltipCountyName}
        onPreloadChurch={handlePreloadChurch}
      />

      {/* Modals (rendered outside map area to reduce nesting depth) */}
      {d.showListModal && (isIntl ? routeStateAbbrev : d.focusedState) && (
        <ChurchListModal
          churches={
            isIntl
              ? (intlFocusedAdmin2 ? intlChurchesForMap : intlChurches)
              : (d.focusedCounty ? d.filteredChurches : d.churches)
          }
          stateName={
            isIntl
              ? (intlRegions.find((r) => r.abbrev === routeStateAbbrev)?.name ?? routeStateAbbrev ?? "")
              : d.focusedStateName
          }
          stateAbbrev={(isIntl ? routeStateAbbrev : d.focusedState)!}
          countyName={
            isIntl
              ? (intlFocusedAdmin2 && mapCountyStats?.byFips[intlFocusedAdmin2]?.name) || null
              : (d.focusedCounty ? (d.countyStats?.byFips[d.focusedCounty]?.name ?? null) : null)
          }
          countyFeatures={mapCountyFeatures}
          statePopulation={isIntl ? null : (d.statePopulations[d.focusedState!] || null)}
          onClose={() => d.setShowListModal(false)}
          onChurchClick={(church: Church) => {
            d.setShowListModal(false);
            const st = isIntl ? routeStateAbbrev : d.focusedState;
            if (st) navigateToChurchWithContext(st, getChurchUrlSegment(church, st, countryCode));
          }}
          onSelectChurchForEdit={(church: Church) => {
            d.setShowListModal(false);
            const st = isIntl ? routeStateAbbrev : d.focusedState;
            if (!isIntl) d.setSelectedChurch(church);
            if (st) navigateToChurchWithContext(st, getChurchUrlSegment(church, st, countryCode));
            setTimeout(() => localDispatch({ type: "SET", key: "forceEditForm", value: true }), 50);
          }}
          onChurchAdded={(state, shortId) => {
            d.setShowListModal(false);
            if (isIntl) navigateToChurchWithContext(state, shortId);
            else d.refetchCurrentStateChurches().then(() => navigateToChurchWithContext(state, shortId));
          }}
        />
      )}

      {d.showAddChurchFromSummary && (isIntl ? routeStateAbbrev : d.focusedState) && (
        <AddChurchForm
          stateAbbrev={(isIntl ? routeStateAbbrev : d.focusedState)!}
          stateName={
            isIntl
              ? (intlRegions.find((r) => r.abbrev === routeStateAbbrev)?.name ?? routeStateAbbrev ?? "")
              : d.focusedStateName
          }
          onClose={() => { d.setShowAddChurchFromSummary(false); d.setAddChurchForState(null); }}
          churches={isIntl ? intlChurches : d.churches}
          onSelectChurch={(church) => {
            d.setShowAddChurchFromSummary(false);
            d.setAddChurchForState(null);
            const st = isIntl ? routeStateAbbrev : d.focusedState;
            if (!isIntl) d.setSelectedChurch(church);
            if (st) navigateToChurchWithContext(st, getChurchUrlSegment(church, st, countryCode));
            setTimeout(() => localDispatch({ type: "SET", key: "forceEditForm", value: true }), 50);
          }}
          onChurchAdded={(state, shortId) => {
            d.setShowAddChurchFromSummary(false);
            d.setAddChurchForState(null);
            if (isIntl) navigateToChurchWithContext(state, shortId);
            else d.refetchCurrentStateChurches().then(() => navigateToChurchWithContext(state, shortId));
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
              navigateToChurchWithContext(stateAbbrev, getChurchUrlSegment(church, stateAbbrev));
              setTimeout(() => localDispatch({ type: "SET", key: "forceEditForm", value: true }), 50);
            }
          }}
          onChurchAdded={(state, shortId) => {
            d.setAddChurchForState(null);
            navigateToChurchWithContext(state, shortId);
          }}
        />
      )}

      {local.showVerificationModal && (isIntl ? routeStateAbbrev : d.focusedState) && (
        <VerificationModal
          stateAbbrev={(isIntl ? routeStateAbbrev : d.focusedState)!}
          stateName={
            isIntl
              ? (intlRegions.find((r) => r.abbrev === routeStateAbbrev)?.name
                ?? getRegion(countryCode, routeStateAbbrev ?? undefined)?.name
                ?? routeStateAbbrev
                ?? "")
              : d.focusedStateName
          }
          churches={
            isIntl
              ? (intlFocusedAdmin2 ? intlChurchesForMap : intlChurches)
              : (d.focusedCounty ? d.filteredChurches : d.churches)
          }
          countyName={
            isIntl
              ? (intlFocusedAdmin2 && mapCountyStats?.byFips[intlFocusedAdmin2]?.name) || null
              : (d.focusedCounty ? (d.countyStats?.byFips[d.focusedCounty]?.name ?? null) : null)
          }
          selectedChurch={selectedChurch}
          onClose={() => localDispatch({ type: "SET", key: "showVerificationModal", value: false })}
          onChurchClick={(church: Church) => {
            localDispatch({ type: "SET", key: "showVerificationModal", value: false });
            const st = isIntl ? routeStateAbbrev : d.focusedState;
            if (st) navigateToChurchWithContext(st, getChurchUrlSegment(church, st, countryCode));
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
          countryCode={isWorld ? "WORLD" : countryCode}
          regionNoun={
            isWorld
              ? { one: "country", many: "countries" }
              : (countryCfg?.regionNoun ?? { one: "state", many: "states" })
          }
          onClose={() => localDispatch({ type: "SET", key: "showNationalReviewModal", value: false })}
          onSelectState={(abbrev) => {
            if (isWorld) navigateToCountry(abbrev);
            else navigateToStateWithReview(abbrev);
          }}
        />
      )}

      {/* Detail panel — overlays the map on both breakpoints. As a desktop flex
          sibling it squeezed the map into the remaining width and filled the
          gutter with a flat panel colour; floating it lets the map run
          full-bleed underneath, and the camera offsets by the panel width so
          the selected church still centres in the visible area. */}
      <AnimatePresence mode="wait">
        {selectedChurch && (
          <motion.div
            key={`church-detail-panel-${isMobile ? "mobile" : "desktop"}`}
            className={`overflow-hidden absolute z-40 ${
              isMobile ? "bottom-0 left-0 right-0" : "top-0 right-0 bottom-0"
            }`}
            style={isMobile ? { height: "55vh" } : undefined}
            initial={isMobile ? { y: "100%" } : { width: 0, height: "100%" }}
            animate={isMobile ? { y: 0 } : { width: DETAIL_PANEL_WIDTH, height: "100%" }}
            exit={isMobile ? { y: "100%" } : { width: 0, height: "100%" }}
            transition={{ type: "spring", damping: 28, stiffness: 300 }}
          >
            <div className="pr-4 pb-4 pt-0 pl-4 md:pl-0 md:pt-4 md:pr-4 md:pb-4" style={{ width: isMobile ? "100%" : DETAIL_PANEL_WIDTH, height: isMobile ? "55vh" : "100%" }}>
              <ChurchDetailPanel
                church={selectedChurch}
                resolvedCountyName={resolvedCountyForSelectedChurch}
                allChurches={isIntl ? intlChurches : d.filteredChurches}
                onClose={() => {
                  if (isIntl) {
                    if (routeStateAbbrev) {
                      if (mapFocusedCounty) navigateToCounty(routeStateAbbrev, mapFocusedCounty);
                      else navigateToState(routeStateAbbrev);
                    } else {
                      navigateToCountry(countryCode);
                    }
                    return;
                  }
                  if (d.focusedState) {
                    if (d.focusedCounty) navigateToCounty(d.focusedState, d.focusedCounty);
                    else navigateToState(d.focusedState);
                  } else navigateToNational();
                }}
                onChurchClick={(target: ChurchClickTarget) => {
                  const state = target.state;
                  const shortId = "shortId" in target && target.shortId
                    ? target.shortId
                    : getChurchUrlSegment(target as Church, state, countryCode);
                  if (state) navigateToChurchWithContext(state, shortId);
                }}
                externalShowEditForm={local.forceEditForm}
                onEditFormClosed={() => localDispatch({ type: "SET", key: "forceEditForm", value: false })}
                onChurchUpdated={isIntl ? undefined : d.refetchCurrentStateChurches}
                moderationMode={local.moderationMode}
                moderationPending={local.moderationPending}
                moderatorKey={moderatorKey || ""}
                onModerationAction={refreshModeration}
                pendingFieldsForChurch={pendingFieldsForChurch}
                onPendingSubmitted={isIntl ? undefined : d.refetchStatePendingSuggestions}
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
  showSpecialReport: boolean;
  showHelp: boolean;
  showAudit: boolean;
  showAlertsPanel: boolean;
  showAnnouncementsPanel: boolean;
  alertsPanelOpenedViaReportIssue: boolean;
  moderationMode: boolean;
  moderationPending: ModerationPendingData | null;
  moderationLoading: boolean;
  moderationError: string | null;
  showModerationPanel: boolean;
};
type LocalAction = { type: "SET"; key: keyof LocalState; value: any };
function localReducer(state: LocalState, action: LocalAction): LocalState {
  if (state[action.key] === action.value) return state;
  return { ...state, [action.key]: action.value };
}

// ── MapArea: the map + all overlays — ZERO hooks (pure render) ──
function MapArea({
  d,
  selectedChurch,
  onChurchDotClick,
  onViewChurch,
  isLoadingVisible,
  showErrorOverlay,
  showErrorBanner,
  anyOverlayOpen,
  dismissAllOverlays,
  verifiedDotsEnabled,
  navigateToState,
  navigateToChurch,
  navigateToCounty,
  navigateToStateOnly,
  routeStateAbbrev,
  routeCountyFips,
  viewLevel,
  countryCode,
  navigateToWorld,
  navigateToCountry,
  worldCountries,
  worldLoading,
  intlRegions,
  intlRegionsLoading,
  intlChurches,
  intlChurchesLoading,
  mapCountyStats,
  mapFocusedCounty,
  mapCountyFeatures,
  intlHoveredAdmin2,
  onIntlCountyHover,
  onIntlCountyClick,
  onShowVerification,
  onShowNationalReviewModal,
  pendingReviewCount,
  nationalReviewStats,
  nationalReviewStatsLoading,
  showAbout,
  onDismissAbout,
  onShowAbout,
  showSpecialReport,
  onDismissSpecialReport,
  showHelp,
  onDismissHelp,
  onShowHelp,
  showAudit,
  onShowAudit,
  onDismissAudit,
  showReportIssue,
  onReportIssue,
  showAlertsPanel,
  showProposeForm,
  onAlertsPanelChange,
  showAnnouncementsPanel,
  onAnnouncementsPanelChange,
  moderationMode,
  moderatorKey,
  moderationPending,
  moderationLoading,
  moderationError,
  showModerationPanel,
  onModerationPanelChange,
  onRefreshModeration,
  onExitReviewView,
  activePeople,
  activeBots,
  activeByState,
  isLocalhost,
  searchCollapsed,
  isMobile,
  churchesToShowOnMap,
  onStateViewSearchResultsChange,
  verifiedChurches,
  onToggleVerified,
  churchTooltipCountyName,
  onPreloadChurch,
}: {
  d: ReturnType<typeof useChurchMapData>;
  selectedChurch: Church | null;
  onChurchDotClick: (church: Church, e?: { clientX: number; clientY: number }) => void;
  onViewChurch: (church: Church) => void;
  isLoadingVisible: boolean;
  showErrorOverlay: boolean;
  showErrorBanner: boolean;
  anyOverlayOpen: boolean;
  dismissAllOverlays: () => void;
  verifiedDotsEnabled: boolean;
  navigateToState: (abbrev: string) => void;
  navigateToChurch: (stateAbbrev: string, churchShortId: string, options?: { replace?: boolean; countyFips?: string }) => void;
  navigateToCounty: (stateAbbrev: string, countyFips: string) => void;
  navigateToStateOnly: (stateAbbrev: string) => void;
  routeStateAbbrev: string | null;
  routeCountyFips: string | null;
  viewLevel: "world" | "country" | "region";
  countryCode: string;
  navigateToWorld: () => void;
  navigateToCountry: (countryCode: string) => void;
  worldCountries: CountrySummary[];
  worldLoading: boolean;
  intlRegions: StateInfo[];
  intlRegionsLoading: boolean;
  intlChurches: Church[];
  intlChurchesLoading: boolean;
  mapCountyStats: CountyStats | null;
  mapFocusedCounty: string | null;
  mapCountyFeatures: Map<string, unknown> | null | undefined;
  intlHoveredAdmin2: string | null;
  onIntlCountyHover: (id: string | null) => void;
  onIntlCountyClick: (id: string) => void;
  onShowVerification: () => void;
  onShowNationalReviewModal: () => void;
  pendingReviewCount: number;
  nationalReviewStats: NationalReviewStatsResponse | null;
  nationalReviewStatsLoading: boolean;
  showAbout: boolean;
  onDismissAbout: () => void;
  onShowAbout: () => void;
  showSpecialReport: boolean;
  onDismissSpecialReport: () => void;
  showHelp: boolean;
  onDismissHelp: () => void;
  onShowHelp: () => void;
  showAudit: boolean;
  onShowAudit: () => void;
  onDismissAudit: () => void;
  showReportIssue: boolean;
  onReportIssue?: () => void;
  showAlertsPanel: boolean;
  showProposeForm: boolean;
  onAlertsPanelChange: (open: boolean) => void;
  showAnnouncementsPanel: boolean;
  onAnnouncementsPanelChange: (open: boolean) => void;
  moderationMode: boolean;
  moderatorKey: string;
  moderationPending: ModerationPendingData | null;
  moderationLoading: boolean;
  moderationError: string | null;
  showModerationPanel: boolean;
  onModerationPanelChange: (open: boolean) => void;
  onRefreshModeration: () => void;
  onExitReviewView?: () => void;
  activePeople: number;
  activeBots: number;
  activeByState: Record<string, number>;
  isLocalhost: boolean;
  searchCollapsed: boolean;
  isMobile: boolean;
  churchesToShowOnMap: Church[];
  onStateViewSearchResultsChange: (churchIds: Set<string> | null) => void;
  verifiedChurches: Church[] | null;
  onToggleVerified: () => void;
  churchTooltipCountyName: string | null;
  onPreloadChurch: (church: Church) => void;
}) {
  /** Imperative MapLibre controls, so the app's zoom buttons can drive it. */
  const mapLibreApi = useRef<MapLibreHandle | null>(null);
  /** MapLibre's visible extent, so search can filter to "churches in view". */
  const [mapLibreBounds, setMapLibreBounds] = useState<
    [[number, number], [number, number]] | null
  >(null);
  const isWorld = viewLevel === "world";
  const isIntl = !isWorld && countryCode !== "US";
  const countryCfg = getCountry(countryCode);
  const isNationalView = !d.focusedState;
  const verifiedCountForView = isNationalView
    ? (verifiedChurches?.length ?? null)
    : d.filteredChurches.reduce(
        (acc, c) => (churchMeetsVerifiedListingCriteria(c) ? acc + 1 : acc),
        0,
      );
  const verifiedTotalCountForView = isNationalView ? null : d.filteredChurches.length;

  // Prefer the URL region so the pill keeps the place name + loading state while
  // US `d.focusedState` is cleared during fetch (it only flips once data is ready).
  // Don't fall back to US `d.focusedState` on country overviews / intl — that briefly
  // showed a bare abbrev ("Loading churches in DE") during world→country transitions.
  const focusedRegionAbbrev = isWorld
    ? null
    : (routeStateAbbrev ?? (countryCode === "US" ? d.focusedState : null));
  const focusedRegionName = (() => {
    if (!focusedRegionAbbrev) return getCountry(countryCode)?.name ?? countryCode;
    if (countryCode === "US") {
      return (
        d.focusedStateName
        || d.states.find((s) => s.abbrev === focusedRegionAbbrev)?.name
        || getRegion("US", focusedRegionAbbrev)?.name
        || resolveRegionByAbbrev(focusedRegionAbbrev)?.region.name
        || focusedRegionAbbrev
      );
    }
    return (
      intlRegions.find((r) => r.abbrev === focusedRegionAbbrev)?.name
      || getRegion(countryCode, focusedRegionAbbrev)?.name
      || resolveRegionByAbbrev(focusedRegionAbbrev)?.region.name
      || focusedRegionAbbrev
    );
  })();
  // Admin-2 place name (US county / CA census division). Prefer geometry props so
  // empty divisions still label correctly — stats only include units with churches.
  const focusedAdmin2Feature = mapFocusedCounty
    ? mapCountyFeatures?.get(mapFocusedCounty) as { properties?: { name?: string } } | undefined
    : undefined;
  const focusedAdmin2Name = mapFocusedCounty
    ? (mapCountyStats?.byFips[mapFocusedCounty]?.name
      ?? focusedAdmin2Feature?.properties?.name
      ?? null)
    : null;
  const focusedAdmin2ChurchCount = mapFocusedCounty
    ? (mapCountyStats?.byFips[mapFocusedCounty]?.churchCount
      ?? (countryCode === "US" ? d.filteredChurches.length : intlChurches.length))
    : null;
  // Keep "Loading churches…" until region data is on the map — not merely until
  // the network call ends — so the pill covers the paint/settle gap.
  const headerLoading = isWorld
    ? worldLoading
    : routeStateAbbrev
      ? (countryCode === "US"
          ? (d.loading || d.populating || d.focusedState !== routeStateAbbrev)
          : (intlChurchesLoading || (intlRegions.length === 0 && intlRegionsLoading)))
      : (isIntl ? intlRegionsLoading : d.states.length === 0);

  return (
    <div className="flex flex-1 flex-col relative" style={{ backgroundColor: "#F5F0E8" }}>
      {/* Review banner — only when key is in URL (so it disappears on navigate without key) */}
      {moderatorKey && moderationMode && (
        <div className="flex-shrink-0 bg-pink-100 text-pink-800 text-[11px] py-1.5 px-4 backdrop-blur-sm font-medium tracking-wide flex items-center justify-center gap-3">
          <span>You're currently in review view</span>
          {onExitReviewView && (
            <button
              type="button"
              onClick={onExitReviewView}
              className="shrink-0 px-2 py-0.5 rounded border border-pink-300/80 bg-pink-50 hover:bg-pink-200/80 text-pink-800 text-[10px] font-medium transition-colors"
            >
              Exit review view
            </button>
          )}
        </div>
      )}

      <div className="flex-1 relative min-h-0">
      {/* Top row: header pill only (secondary controls moved to bottom-left cluster); z-40 so summary stacks above All states + MapControls (z-30). pointer-events-none so click-outside hits the catcher. */}
      <div className="absolute top-4 left-4 right-4 z-40 flex flex-row items-center justify-center animate-in fade-in duration-300 pointer-events-none">
        <div className="flex flex-col items-center justify-center min-w-0 max-w-full pointer-events-auto overflow-visible" ref={d.summaryRef}>
          {moderatorKey && moderationMode ? (
            <>
              <ReviewPill
                open={showModerationPanel}
                onOpenChange={onModerationPanelChange}
                moderatorKey={moderatorKey}
                pending={moderationPending ?? { pendingSuggestions: [], pendingChurches: [], inReviewSuggestions: [], inReviewChurches: [] }}
                onRefresh={onRefreshModeration}
                alwaysShow
                states={d.states}
                onOpenChurch={(churchId, churchShortId, churchState) => {
                  const stateAbbrev =
                    churchState ||
                    (churchId.startsWith("community-")
                      ? churchId.split("-")[1]
                      : churchId.split("-")[0]) ||
                    "";
                  const segment =
                    churchShortId && stateAbbrev
                      ? churchShortId
                      : getChurchUrlSegment({ id: churchId, shortId: churchShortId }, stateAbbrev);
                  if (stateAbbrev && segment) navigateToChurch(stateAbbrev, segment);
                }}
              />
            </>
          ) : (
            <>
              <HeaderPill
                focusedState={focusedRegionAbbrev}
                focusedStateName={focusedRegionName}
                focusedCountyName={focusedAdmin2Name}
                loading={headerLoading}
                filteredCount={
                  focusedAdmin2ChurchCount != null
                    ? focusedAdmin2ChurchCount
                    : selectedChurch && (d.focusedState || routeStateAbbrev) && (countryCode === "US" ? d.filteredChurches.length <= 1 : intlChurches.length <= 1)
                      ? (countryCode === "US"
                        ? (d.states.find(s => s.abbrev === d.focusedState)?.churchCount ?? d.filteredChurches.length)
                        : (intlRegions.find(r => r.abbrev === routeStateAbbrev)?.churchCount ?? intlChurches.length))
                      : (countryCode === "US" ? d.filteredChurches.length : intlChurches.length)
                }
                countryCode={countryCode}
                placeLabel={isWorld ? "the world" : undefined}
                showReviewPercentage={isWorld || !focusedRegionAbbrev}
                totalChurches={
                  isWorld
                    ? worldCountries.reduce((a, c) => a + (c.churchCount || 0), 0)
                    : countryCode === "US"
                      ? d.totalChurches
                      : intlRegions.reduce((a, r) => a + r.churchCount, 0)
                }
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

              {/* Pending errors + announcements — below header pill (not in review view) */}
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
                    summaryStats={
                      isWorld
                        ? computeWorldSummary(worldCountries, nationalReviewStats)
                        : isIntl
                          ? (routeStateAbbrev && intlChurches.length > 0
                              ? buildRegionSummaryStats(intlChurches, mapCountyStats)
                              : computeNationalSummary(intlRegions, {}))
                          : (d.summaryStats as SummaryStats)
                    }
                    focusedState={focusedRegionAbbrev}
                    focusedStateName={isWorld ? "the World" : focusedRegionName}
                    churches={
                      isIntl
                        ? intlChurches
                        : (d.focusedCounty ? d.filteredChurches : d.churches)
                    }
                    totalChurches={
                      isWorld
                        ? worldCountries.reduce((a, c) => a + (c.churchCount || 0), 0)
                        : isIntl
                          ? intlRegions.reduce((a, r) => a + r.churchCount, 0)
                          : d.totalChurches
                    }
                    allStatesLoaded={
                      isWorld
                        ? worldCountries.length > 0 && !worldLoading
                        : isIntl
                          ? intlRegions.length > 0 && !intlRegionsLoading
                          : d.allStatesLoaded
                    }
                    statePopulations={isIntl || isWorld ? {} : d.statePopulations}
                    countyStats={isIntl ? mapCountyStats : (d.countyStats ?? null)}
                    focusedCounty={mapFocusedCounty}
                    countryCode={isWorld ? "WORLD" : countryCode}
                    regionNoun={
                      isWorld
                        ? { one: "country", many: "countries" }
                        : (countryCfg?.regionNoun ?? { one: "state", many: "states" })
                    }
                    admin2Noun={countryCfg?.admin2Noun?.many ?? "counties"}
                    boundaryAttribution={
                      isWorld
                        ? "Boundaries: Natural Earth / U.S. Census TIGER via us-atlas"
                        : countryCfg?.boundaryAttribution
                    }
                    onClose={() => d.setShowSummary(false)}
                    onNavigateToState={(abbrev) => {
                      d.setShowSummary(false);
                      if (isWorld) navigateToCountry(abbrev);
                      else navigateToState(abbrev);
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
            </>
          )}
        </div>
      </div>

      {/* About Modal / Reviewer Login */}
      {showAbout && (moderatorKey && !moderationMode ? (
        <ReviewerLoginModal loading={moderationLoading} error={moderationError} onClose={onDismissAbout} />
      ) : showAbout ? (
        <AboutModal onClose={onDismissAbout} />
      ) : null)}

      {/* Help Modal */}
      {showHelp && (
        <HelpModal
          onClose={onDismissHelp}
          showReportIssue={showReportIssue}
          onReportIssue={onReportIssue}
        />
      )}

      {/* Audit / Change history modal (review mode) */}
      {showAudit && moderatorKey && (
        <AuditModal
          onClose={onDismissAudit}
          moderatorKey={moderatorKey}
          focusedStateAbbrev={d.focusedState}
          navigateToChurch={navigateToChurch}
        />
      )}

      {/* Map canvas.
          d.zoom/d.center are deliberately NOT passed: MapLibre uses Web Mercator
          zoom 0–22 while the app's state still holds the old 1–500 Albers scale,
          so those numbers would be meaningless here. The canvas drives its own
          camera from focusedState/focusedCounty/selectedChurch instead, which is
          why d.zoom stays frozen (MapControls and MapSearchBar compensate).
          See docs/future/mapbox-migration.md. */}
      <MapLibreCanvas
        apiRef={mapLibreApi}
        onMoveEnd={(_center, _zoom, bounds) => setMapLibreBounds(bounds)}
        // On mobile the detail panel covers the bottom 55vh, so keep that much
        // clear of the camera and the pin stays visible above it.
        bottomPadding={
          isMobile && selectedChurch ? Math.round(window.innerHeight * 0.55) : 0
        }
        rightPadding={!isMobile && selectedChurch ? DETAIL_PANEL_WIDTH : 0}
        viewLevel={viewLevel}
        countryCode={countryCode}
        countries={worldCountries}
        states={viewLevel === "world" ? [] : countryCode === "US" ? d.states : intlRegions}
        focusedState={
          viewLevel === "world" ? null : countryCode === "US" ? d.focusedState : routeStateAbbrev
        }
        // Camera follows the URL immediately; d.focusedState applies when the
        // church fetch finishes (same moment the header pill leaves loading).
        cameraState={viewLevel === "world" ? null : routeStateAbbrev}
        cameraCounty={viewLevel === "world" ? null : routeCountyFips}
        churches={
          viewLevel === "world"
            ? []
            : countryCode === "US"
              ? churchesToShowOnMap
              : (
                  selectedChurch && !intlChurches.some((c) => c.id === selectedChurch.id)
                    ? [...intlChurches, selectedChurch]
                    : intlChurches
                )
        }
        selectedChurchId={viewLevel === "world" ? null : (selectedChurch?.id ?? null)}
        countyStats={mapCountyStats}
        focusedCounty={mapFocusedCounty}
        onStateClick={(abbrev, e) => {
          if (!isIntl) {
            d.handleStateClick(abbrev, e);
            return;
          }
          // Neighbor jump when already in a region (hook's focusedState is always null for intl).
          if (routeStateAbbrev) {
            if (abbrev !== routeStateAbbrev) navigateToState(abbrev);
            return;
          }
          d.handleStateClick(abbrev, e);
        }}
        onCountryClick={(cc) => navigateToCountry(cc)}
        // Step up one level only: world←country←region←admin2. Never jump from
        // a province/CD click-miss straight to /world (that used handleResetView
        // → navigateToNational, which is now the world map).
        onResetView={() => {
          if (viewLevel === "world") return;
          if (mapFocusedCounty && (d.focusedState || routeStateAbbrev)) {
            navigateToStateOnly(d.focusedState ?? routeStateAbbrev!);
          } else if (routeStateAbbrev || d.focusedState) {
            navigateToCountry(countryCode);
          } else if (viewLevel === "country") {
            navigateToWorld();
          }
        }}
        onStateHover={d.setHoveredState}
        onChurchClick={onChurchDotClick}
        onChurchHover={d.setHoveredChurch}
        onCountyHover={isIntl ? onIntlCountyHover : d.setHoveredCounty}
        onCountyClick={isIntl ? onIntlCountyClick : d.handleCountyClick}
        // Pinch/scroll out past the focused region to step back up a level.
        onZoomedOutPastRegion={() => {
          if (viewLevel === "world") return;
          if (mapFocusedCounty && (d.focusedState || routeStateAbbrev)) {
            navigateToStateOnly(d.focusedState ?? routeStateAbbrev!);
          } else if (routeStateAbbrev || d.focusedState) navigateToCountry(countryCode);
          else navigateToWorld();
        }}
      />

      {/* Tooltips */}
      {!d.focusedState && !routeStateAbbrev && !(d.previewChurch ?? d.hoveredChurch) && (d.hoveredState || (d.previewStatePinned && d.previewState)) && (() => {
        const hoverId = d.previewStatePinned && d.previewState ? d.previewState : d.hoveredState!;
        if (!hoverId || hoverId === "undefined") return null;
        const tooltipRegions = isWorld
          ? worldCountries.map((c) => ({
              abbrev: c.code,
              name: c.name,
              isPopulated: !!c.isPopulated,
              churchCount: c.churchCount || 0,
            }))
          : isIntl
            ? intlRegions
            : d.states;
        // Drop stale world-map country codes (e.g. "US") once we've drilled into
        // a country — they aren't in the region list and flash as bare abbrevs.
        if (!tooltipRegions.some((r) => r.abbrev === hoverId)) return null;
        return (
          <StateTooltip
            hoveredState={hoverId}
            states={tooltipRegions}
            tooltipPos={d.tooltipPos}
            activeByState={isWorld || isIntl ? {} : activeByState}
            reviewCount={
              !isWorld && !isIntl && moderatorKey && moderationMode && nationalReviewStats
                ? (nationalReviewStats.states[hoverId]?.needsReview ?? 0)
                : undefined
            }
            pinned={d.previewStatePinned}
            unpopulatedLabel={isWorld ? "Coming soon" : "Click to explore"}
            viewLabel={isWorld ? "View country" : isIntl ? "View region" : "View state"}
            onViewState={
              d.previewStatePinned
                ? () => {
                    d.clearStatePreview();
                    if (isWorld) navigateToCountry(hoverId);
                    else navigateToState(hoverId);
                  }
                : undefined
            }
            onClose={d.previewStatePinned ? d.clearStatePreview : undefined}
          />
        );
      })()}
      {(d.previewChurch ?? d.hoveredChurch) && (d.previewChurch ?? d.hoveredChurch)!.id !== selectedChurch?.id && (
        <ChurchTooltip
          church={(d.previewChurch ?? d.hoveredChurch)!}
          resolvedCountyName={churchTooltipCountyName}
          tooltipPos={d.tooltipPos}
          showReviewStatus={!!(moderatorKey && moderationMode)}
          pinned={d.previewPinned}
          onViewChurch={d.previewPinned ? onViewChurch : undefined}
          onClose={d.previewPinned ? d.clearPreview : undefined}
        />
      )}
      {d.focusedState && d.previewCountyPinned && d.previewCounty && d.countyStats && !d.previewChurch && (
        <CountyTooltip
          countyFips={d.previewCounty}
          countyStats={d.countyStats}
          tooltipPos={d.tooltipPos}
          pinned
          viewLabel="View"
          onViewCounty={() => {
            const fips = d.previewCounty;
            d.clearCountyPreview();
            if (d.focusedState && fips) navigateToCounty(d.focusedState, fips);
          }}
          onClose={d.clearCountyPreview}
        />
      )}
      {d.focusedState && d.hoveredCounty && d.countyStats && !(d.previewChurch ?? d.hoveredChurch) && !d.previewCountyPinned && (
        <CountyTooltip countyFips={d.hoveredCounty} countyStats={d.countyStats} tooltipPos={d.tooltipPos} />
      )}
      {isIntl && routeStateAbbrev && intlHoveredAdmin2 && mapCountyStats && !(d.previewChurch ?? d.hoveredChurch) && (
        <CountyTooltip
          countyFips={intlHoveredAdmin2}
          countyStats={mapCountyStats}
          tooltipPos={d.tooltipPos}
        />
      )}

      {/* Click-outside backdrop: dismiss pinned church, state, or county preview */}
      {(d.previewPinned || d.previewStatePinned || d.previewCountyPinned) && (
        <div
          className="absolute inset-0 z-[45]"
          aria-hidden
          onClick={() => { d.clearPreview(); d.clearStatePreview(); d.clearCountyPreview(); }}
          onTouchEnd={(e) => { e.preventDefault(); d.clearPreview(); d.clearStatePreview(); d.clearCountyPreview(); }}
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
          {/* Location is the map (dimmed neighbors) + HeaderPill; zoom-out/reset goes up. */}
          {!selectedChurch && (
          <MapControls
            focusedState={d.focusedState || routeStateAbbrev}
            showFilterPanel={d.showFilterPanel}
            showLegend={d.showLegend}
            onZoomIn={() => mapLibreApi.current?.zoomIn()}
            onZoomOut={() => mapLibreApi.current?.zoomOut()}
            onResetView={d.handleResetView}
            // MapLibre owns its own zoom and clamps internally, so d.zoom never
            // moves — leave the bounds open or the buttons render permanently
            // disabled (d.zoom starts equal to d.minZoom).
            minZoom={-Infinity}
            maxZoom={Infinity}
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
            showAuditButton={!!(moderatorKey && moderationMode)}
            onShowAudit={onShowAudit}
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
          states={countryCode === "US" ? d.states : intlRegions}
          filteredChurches={d.filteredChurches}
          sizeCounts={d.sizeCounts}
          countryCode={countryCode}
          viewLevel={viewLevel}
        />
      )}

      {d.showFilterPanel && (
        <FilterPanel
          showVerified={verifiedDotsEnabled}
          onToggleVerified={onToggleVerified}
          verifiedCount={verifiedCountForView}
          verifiedTotalCount={verifiedTotalCountForView}
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
          className={`absolute left-6 right-6 md:left-12 md:right-12 z-40 flex flex-col items-center gap-2.5 pointer-events-none ${selectedChurch ? (isMobile ? "top-[80px] md:top-auto md:bottom-8" : "md:bottom-8") : "bottom-3 md:bottom-8"}`}
        >
          {/* People with you now — bottom of map; hidden on church view (mobile and desktop) */}
          {!selectedChurch && ((activePeople + activeBots) > 1 || (isLocalhost && (activePeople + activeBots) >= 1)) && (() => {
            const withYou = (activePeople + activeBots) - 1; // exclude self so "people with you" = others only
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
          {!selectedChurch && (
            <div className="pointer-events-none w-full max-w-full flex flex-col items-center">
            <MapSearchBar
              churches={
                isWorld
                  ? []
                  : countryCode === "US"
                    ? (d.focusedCounty ? d.filteredChurches : d.churches)
                    : intlChurches
              }
              states={
                isWorld
                  ? []
                  : countryCode === "US"
                    ? d.states
                    : intlRegions
              }
              focusedState={
                isWorld
                  ? null
                  : countryCode === "US"
                    ? d.focusedState
                    : routeStateAbbrev
              }
              focusedStateName={
                focusedAdmin2Name
                || (countryCode === "US"
                  ? d.focusedStateName
                  : (intlRegions.find((r) => r.abbrev === routeStateAbbrev)?.name ?? ""))
              }
              navigateToChurch={navigateToChurch}
              countryCode={isWorld ? "WORLD" : countryCode}
              isWorld={isWorld}
              countries={worldCountries}
              onPreloadChurch={onPreloadChurch}
              collapsed={searchCollapsed}
              onExpand={() => { d.setSearchCollapsed(false); d.setShowFilterPanel(false); d.setShowLegend(false); }}
              onAddChurch={(d.focusedState || routeStateAbbrev) ? () => { d.setShowAddChurchFromSummary(true); } : undefined}
              onAddChurchForState={
                !isWorld && !(d.focusedState || routeStateAbbrev)
                  ? (stateAbbrev) => d.setAddChurchForState(stateAbbrev)
                  : undefined
              }
              detectedState={isWorld ? null : d.detectedState}
              zoom={d.zoom}
              center={d.center}
              mapBounds={mapLibreBounds}
              onStateViewSearchResultsChange={onStateViewSearchResultsChange}
              countyFeatures={mapCountyFeatures as Map<string, unknown> | null | undefined}
            />
            </div>
          )}
        </div>
      )}

      </div>
    </div>
  );
}

// --- Header Pill ---
/** Minimum time the spinner stays up once loading starts (avoids flash on cache hits). */
const HEADER_LOADING_MIN_MS = 1100;
/** Extra hold after data is ready so county/church layers can paint before the count appears. */
const HEADER_LOADING_SETTLE_MS = 550;

function HeaderPill({
  focusedState,
  focusedStateName,
  focusedCountyName,
  loading = false,
  filteredCount,
  totalChurches,
  countryCode,
  placeLabel,
  showReviewPercentage,
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
  focusedCountyName?: string | null;
  /** True while churches/regions are fetching — shows "Loading churches" for every country. */
  loading?: boolean;
  filteredCount: number;
  totalChurches: number;
  countryCode: string;
  /** Override place name (e.g. "the world" on /world). */
  placeLabel?: string;
  /** Show national/world % needing review under the pill. Defaults to country view (no region focus). */
  showReviewPercentage?: boolean;
  showSummary: boolean;
  pendingReviewCount: number;
  nationalReviewStats: NationalReviewStatsResponse | null;
  nationalReviewStatsLoading: boolean;
  onShowVerification: () => void;
  onShowNationalReviewModal: () => void;
  onToggle: () => void;
}) {
  const [showLoading, setShowLoading] = useState(loading);
  const loadingStartedAt = useRef<number | null>(loading ? Date.now() : null);

  useEffect(() => {
    if (loading) {
      loadingStartedAt.current = Date.now();
      setShowLoading(true);
      return;
    }
    const started = loadingStartedAt.current ?? Date.now();
    const elapsed = Date.now() - started;
    // Honor the overall min, and always wait a settle window after ready so the
    // map's counties/dots aren't racing the pill's "N churches" reveal.
    const remaining = Math.max(
      HEADER_LOADING_SETTLE_MS,
      HEADER_LOADING_MIN_MS - elapsed,
    );
    const t = window.setTimeout(() => {
      loadingStartedAt.current = null;
      setShowLoading(false);
    }, remaining);
    return () => window.clearTimeout(t);
  }, [loading]);

  const nationalReviewPercentage = nationalReviewStats?.percentage ?? 0;
  const showNationalReviewRow =
    (showReviewPercentage ?? (!focusedState && !placeLabel)) && !showLoading;
  const countryLabel = placeLabel ?? getCountry(countryCode)?.name ?? countryCode;
  const readyCount = focusedState
    ? `${filteredCount.toLocaleString()} churches*`
    : `${totalChurches.toLocaleString()} churches*`;
  return (
    <div className="rounded-full shadow-lg transition-shadow hover:shadow-xl cursor-pointer w-auto max-w-full">
      <div
        className="flex flex-col items-center rounded-full w-full min-w-0 overflow-hidden"
        style={{ backgroundColor: "rgba(30, 16, 64, 0.92)" }}
      >
      {/* Main row — toggles summary */}
      <div
        onClick={onToggle}
        className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 px-5 py-2.5 w-full min-w-0"
      >
        <span className="relative flex h-[18px] w-[18px] flex-shrink-0 items-center justify-center text-purple-300">
          <ChurchIcon
            size={18}
            className={`absolute transition-opacity duration-300 ${showLoading ? "opacity-0" : "opacity-100"}`}
          />
          <span
            className={`absolute flex items-center justify-center transition-opacity duration-300 ${showLoading ? "opacity-100" : "opacity-0"}`}
            aria-hidden={!showLoading}
          >
            <ThreeDotLoader size={14} className="bg-purple-300" />
          </span>
        </span>
        {focusedState ? (
          <span className="text-white text-sm text-pretty min-w-0 truncate flex items-center gap-1.5">
            <span
              key={showLoading ? "loading" : "ready"}
              className="font-medium whitespace-nowrap animate-in fade-in duration-300"
            >
              {showLoading ? "Loading churches" : readyCount}
              {" in "}
            </span>
            <span className="text-white font-medium min-w-0 truncate">
              <span className="truncate">
                {focusedCountyName || focusedStateName}
              </span>
            </span>
          </span>
        ) : (
          <span className="text-white text-sm text-pretty min-w-0 truncate">
            <span
              key={showLoading ? "loading" : "ready"}
              className="font-medium animate-in fade-in duration-300"
            >
              {showLoading ? "Loading churches" : readyCount}
            </span>
            {" in "}
            <span className="text-purple-300 font-medium">
              {countryLabel}
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
    </div>
  );
}

// --- Reviewer Login Modal ---
function ReviewerLoginModal({ loading, error, onClose }: { loading: boolean; error: string | null; onClose: () => void }) {
  const [sayingIndex, setSayingIndex] = useState<number | null>(null);

  // Cycle scripture while validating key (same pattern as state loading overlay: first after 1s, then every 3.5s)
  useEffect(() => {
    if (!loading) {
      setSayingIndex(null);
      return;
    }
    const showTimer = setTimeout(() => {
      setSayingIndex(Math.floor(Math.random() * REVIEW_SAYINGS.length));
    }, 1000);
    const cycleTimer = setInterval(() => {
      setSayingIndex((prev) => {
        let next: number;
        do {
          next = Math.floor(Math.random() * REVIEW_SAYINGS.length);
        } while (next === prev && REVIEW_SAYINGS.length > 1);
        return next;
      });
    }, 3500);
    return () => {
      clearTimeout(showTimer);
      clearInterval(cycleTimer);
    };
  }, [loading]);

  return (
    <div
      className="absolute inset-0 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div className="absolute inset-0 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden p-6 flex flex-col items-center text-center transition-transform duration-300 ease-out"
        style={{
          backgroundColor: "#1E1040",
          boxShadow: "inset 0 1px 0 0 rgba(255, 255, 255, 0.06), inset 0 -1px 0 0 rgba(0, 0, 0, 0.2)",
          ...(loading
            ? { animation: "reviewerCardTilt 3s cubic-bezier(0.37, 0, 0.63, 1) infinite" }
            : { transform: "none" }),
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <style>{`@keyframes reviewerCardTilt {
          0%, 100% { transform: perspective(800px) rotateX(3deg) rotateY(-3deg); }
          50% { transform: perspective(800px) rotateX(-2deg) rotateY(3deg); }
        }`}</style>
        <div className="w-16 h-16 rounded-xl overflow-hidden mb-3">
          <img src={logoImg} alt="Here's My Church" className="w-full h-full object-cover" />
        </div>
        <div className="flex items-center justify-center gap-2 mb-4">
          <CheckCheck size={20} className="text-purple-400" />
          <h2 className="text-white text-lg font-semibold">Reviewer Access</h2>
        </div>
        {loading ? (
          <>
            <div className="flex items-center justify-center gap-2 py-4 text-white/60">
              <ThreeDotLoader size={16} />
              <span className="text-sm">Validating key...</span>
            </div>
            <div className="mt-2 pt-3 border-t border-white/10 max-w-[280px] text-center relative overflow-hidden" style={{ minHeight: 72 }}>
              <AnimatePresence mode="wait">
                {sayingIndex !== null && (
                  <motion.div
                    key={sayingIndex}
                    initial={{ opacity: 0, y: 12, filter: "blur(4px)" }}
                    animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                    exit={{ opacity: 0, y: -12, filter: "blur(4px)" }}
                    transition={{ duration: 0.5, ease: "easeInOut" }}
                  >
                    <p className="text-white/50 text-xs italic leading-relaxed">
                      &quot;{REVIEW_SAYINGS[sayingIndex].text}&quot;
                    </p>
                    <p className="text-purple-400/60 text-[10px] mt-1.5 font-medium">
                      -- {REVIEW_SAYINGS[sayingIndex].ref}
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </>
        ) : error ? (
          <div className="space-y-3 w-full">
            <p className="text-red-400 text-sm">{error}</p>
            <button
              onClick={onClose}
              className="w-full py-2 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-sm font-medium transition-colors"
            >
              Dismiss
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-center gap-2 py-4 text-white/60">
            <ThreeDotLoader size={16} />
            <span className="text-sm">Connecting...</span>
          </div>
        )}
      </div>
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
          <CloseButton
            onClick={onClose}
            size="md"
            className="absolute top-4 right-4"
          />
          <div className="w-16 h-16 rounded-xl overflow-hidden mb-3">
            <img src={logoImg} alt="Here's My Church" className="w-full h-full object-cover" />
          </div>
          <h2 className="text-white font-medium text-[22px] leading-tight">Here's My Church</h2>
          <p className="text-white/60 text-sm leading-relaxed mt-3 text-pretty">An interactive map of Christian churches worldwide — with the goal to be the place with the most accurate data.</p>
        </div>

        {/* Content */}
        <div className="px-6 py-5 overflow-y-auto flex-1 min-h-0">
          <div className="flex items-center justify-center gap-2 mb-4 px-3 py-2 rounded-lg bg-white/5">
            <span className="text-purple-300 text-xs">{"\u2726"}</span>
            <p className="text-white/60 text-xs text-pretty">100% free open-sourced project with crowd-sourced data</p>
          </div>
          <p className="text-white/40 text-[11px] uppercase tracking-wider font-medium mb-3">What you can do</p>
          <ul className="space-y-2.5">
            {[
              "Browse Christian churches by country and region",
              "Search and filter by name, denomination, size, or language",
              "View church info like address, website, and service times",
              "Easily add a church and make any corrections",
              "Update church info from any church in review",
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
          <p className="text-white/30 text-[11px] text-center mt-2.5 text-pretty">
            An open-source project by{" "}
            <a href="https://harvous.com/about" target="_blank" rel="noopener noreferrer" className="underline hover:text-white/50 transition-colors">Harvous</a>
            . Need help?{" "}
            <a href="mailto:hey@heresmychurch.com" className="underline hover:text-white/50 transition-colors">hey@heresmychurch.com</a>
          </p>
          <p className="text-white/25 text-[10px] text-center mt-1.5">Version {__APP_VERSION__}</p>
        </div>
      </div>
    </div>
  );
}
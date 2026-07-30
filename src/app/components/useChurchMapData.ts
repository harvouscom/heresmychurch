import { useMemo, useEffect, useRef, useReducer, useState } from "react";
import { geoContains } from "d3-geo";
import { feature } from "topojson-client";
import type { Church, StateInfo } from "./church-data";
import {
  fetchStates,
  fetchChurches,
  fetchChurchByShortId,
  populateState,
  fetchStatePopulations,
  fetchPendingSuggestions,
} from "./api";
import type { PendingSuggestion } from "./api";
import {
  GEO_URL,
  FIPS_TO_STATE,
  STATE_TO_FIPS,
  filterToStateBounds,
  getStateZoom,
  getCountyCenter,
  getCountyZoom,
} from "./map-constants";
import { churchMatchesRouteSegment, getChurchUrlSegment } from "./url-utils";
import {
  clearNavigationChurchPreload,
  matchNavigationChurchPreload,
  setNavigationChurchPreload,
} from "./church-navigation-preload";
import { getRegion } from "../config/countries";
import { syncChurchDocumentSeo } from "../lib/church-seo";
import {
  buildAdmin2Stats,
  filterChurchesToAdmin2,
  loadAdmin2Features,
} from "./admin2";
import { useLoadingOverlay } from "./hooks/useLoadingOverlay";
import { useUIState } from "./hooks/useUIState";
import { useChurchFilters } from "./hooks/useChurchFilters";

interface UseChurchMapDataArgs {
  routeStateAbbrev: string | null;
  routeCountyFips: string | null;
  routeChurchShortId: string | null;
  routeLegacyChurchId: string | null;
  navigateToState: (abbrev: string) => void;
  navigateToChurch: (stateAbbrev: string, churchShortId: string, options?: { replace?: boolean; countyFips?: string }) => void;
  navigateToNational: () => void;
  navigateToCounty: (stateAbbrev: string, countyFips: string) => void;
  navigateToStateOnly: (stateAbbrev: string) => void;
  isMobile?: boolean;
}

// ── Module-level pure function (was useCallback with [] deps) ──
function filterToStatePolygon(
  rawChurches: Church[],
  stateAbbrev: string,
  stateFeatures: Map<string, any>,
): Church[] {
  const feat = stateFeatures.get(stateAbbrev.toUpperCase());
  if (feat) {
    return rawChurches.filter((ch) => geoContains(feat, [ch.lng, ch.lat]));
  }
  return filterToStateBounds(rawChurches, stateAbbrev) as Church[];
}

export function useChurchMapData({
  routeStateAbbrev,
  routeCountyFips,
  routeChurchShortId,
  routeLegacyChurchId,
  navigateToState,
  navigateToChurch,
  navigateToNational,
  navigateToCounty,
  navigateToStateOnly,
  isMobile,
}: UseChurchMapDataArgs) {
  // ── Core data + map-view state (consolidated reducer — absorbs old useMapView) ──
  const [ds, dd] = useReducer(dataReducer, initialDataState);

  // Pending suggestions for current state (so visitors see "updates pending review")
  const [statePendingSuggestions, setStatePendingSuggestions] = useState<PendingSuggestion[]>([]);

  // Convenience aliases
  const {
    states, totalChurches, focusedState, focusedStateName, churches,
    loading, populating, error, selectedChurch, statePopulations,
    detectedState, loadingStateName, zoom, center, countyFeatures,
  } = ds;

  // Setter helpers — dd (dispatch) is guaranteed stable by React
  const setStates = (v: StateInfo[] | ((p: StateInfo[]) => StateInfo[])) => dd({ type: "SET_STATES", value: v });
  const setTotalChurches = (v: number | ((p: number) => number)) => dd({ type: "SET_TOTAL_CHURCHES", value: v });
  const setFocusedState = (v: string | null) => dd({ type: "SET_FOCUSED_STATE", value: v });
  const setFocusedStateName = (v: string) => dd({ type: "SET_FOCUSED_STATE_NAME", value: v });
  const setChurches = (v: Church[] | ((p: Church[]) => Church[])) => dd({ type: "SET_CHURCHES", value: v });
  const setLoading = (v: boolean) => dd({ type: "SET_LOADING", value: v });
  const setPopulating = (v: boolean) => dd({ type: "SET_POPULATING", value: v });
  const setError = (v: string | null) => dd({ type: "SET_ERROR", value: v });
  const setSelectedChurch = (v: Church | null) => dd({ type: "SET_SELECTED_CHURCH", value: v });
  const setStatePopulations = (v: Record<string, number>) => dd({ type: "SET_STATE_POPULATIONS", value: v });
  const setDetectedState = (v: string | null) => dd({ type: "SET_DETECTED_STATE", value: v });
  const setLoadingStateName = (v: string) => dd({ type: "SET_LOADING_STATE_NAME", value: v });
  const setZoom = (v: number | ((p: number) => number)) => dd({ type: "SET_ZOOM", value: v });
  const setCenter = (v: [number, number]) => dd({ type: "SET_CENTER", value: v });
  const setCountyFeatures = (v: Map<string, any> | null) => dd({ type: "SET_COUNTY_FEATURES", value: v });

  // ── Sub-hook: loading overlay ──
  const overlay = useLoadingOverlay(loading, populating);

  const refetchStatePendingSuggestions = useMemo(() => {
    return () => {
      if (!focusedState) return;
      fetchPendingSuggestions(focusedState)
        .then((res) => res.pending && setStatePendingSuggestions(res.pending))
        .catch(() => setStatePendingSuggestions([]));
    };
  }, [focusedState]);

  // Fetch pending suggestions for current state so all visitors see "updates pending review"
  useEffect(() => {
    if (!focusedState) {
      setStatePendingSuggestions([]);
      return;
    }
    let cancelled = false;
    fetchPendingSuggestions(focusedState)
      .then((res) => {
        if (!cancelled && res.pending) setStatePendingSuggestions(res.pending);
      })
      .catch(() => {
        if (!cancelled) setStatePendingSuggestions([]);
      });
    return () => { cancelled = true; };
  }, [focusedState]);

  // ── Sub-hook: UI state (filters, tooltips, modals) ──
  const ui = useUIState(focusedState);

  // County / admin-2 church counts and per-capita (point-in-polygon)
  const countyStats = useMemo(
    () => buildAdmin2Stats("US", focusedState ?? "", churches, countyFeatures),
    [focusedState, countyFeatures, churches],
  );

  // Focused county (when in state view and route has county segment)
  const focusedCounty = focusedState && routeCountyFips ? routeCountyFips : null;

  // When in county view, scope church list to county for filters + map
  const viewChurches = useMemo(
    () => filterChurchesToAdmin2(churches, focusedCounty, countyFeatures),
    [focusedCounty, countyFeatures, churches],
  );

  // ── Sub-hook: filtered churches + derived stats ──
  const filters = useChurchFilters(
    viewChurches,
    ui.activeSize,
    ui.activeDenominations,
    ui.languageFilter,
    focusedState,
    states,
    statePopulations,
    countyStats,
  );

  // ── Consolidated refs (single useRef — was 9+, saves ~8 hooks) ──
  const refs = useRef({
    focusedState: null as string | null,
    loadVersion: 0,
    preloadedChurch: null as Church | null,
    stateFeatures: new Map<string, any>(),
    countyFeatures: new Map<string, any>(),
    churchCache: new Map<string, Church[]>(),
    pendingTransition: null as {
      abbrev: string;
      name: string;
      lat: number;
      lng: number;
      churches: Church[];
    } | null,
    prevRouteState: null as string | null,
    prevRouteChurch: null as string | null,
    prevRouteCountyFips: null as string | null,
    statesLoaded: false,
    moveEndSuppressedUntil: 0,
    transitionVersion: 0,
    lastChurchViewAppliedId: null as string | null,
    churchLookupTriedKey: null as string | null,
  });

  // Keep ref in sync (no useEffect needed — direct assignment every render)
  refs.current.focusedState = focusedState;
  if (states.length > 0) refs.current.statesLoaded = true;

  // ── moveToView helper (replaces old useCallback from useMapView) ──
  const moveToView = (targetCenter: [number, number], targetZoom: number) => {
    refs.current.moveEndSuppressedUntil = Date.now() + 1100;
    const version = ++refs.current.transitionVersion;
    dd({ type: "SET_TRANSITIONING", value: true });
    setCenter(targetCenter);
    setZoom(targetZoom);
    setTimeout(() => {
      if (refs.current.transitionVersion === version) {
        dd({ type: "SET_TRANSITIONING", value: false });
      }
    }, 850);
  };

  // ── Mobile church-view offset: shifts pin above the 55vh detail panel ──
  const getMobileLatOffset = (targetZoom: number): number => {
    // The panel covers the bottom 55vh. The map SVG (viewBox 800×600,
    // geoAlbersUsa scale 1000) renders letterboxed inside the full viewport.
    // We shift the center south so the pin falls in the middle of the
    // visible area instead of behind the panel.
    const vh = window.innerHeight;
    const vw = window.innerWidth;
    const svgScale = Math.min(vw / 800, vh / 600);
    const renderedH = 600 * svgScale;
    const mapTop = (vh - renderedH) / 2;
    const mapCenter = mapTop + renderedH / 2;
    const panelTop = vh * 0.45;
    const visibleCenter = (Math.max(mapTop, 0) + Math.min(panelTop, mapTop + renderedH)) / 2;
    const shiftPx = mapCenter - visibleCenter;
    // Convert screen-px shift → projected SVG units → latitude degrees
    // (~16.8 projected units per degree for geoAlbersUsa at scale 1000)
    return shiftPx / (svgScale * targetZoom * 16.8);
  };

  // When church is provided and we have county features, zoom to the county that contains the church so the church view stays "within" the county.
  const moveToChurchView = (lng: number, lat: number, targetZoom: number, church?: Church | null) => {
    let center: [number, number] = [lng, lat];
    let zoom = targetZoom;
    if (church && focusedState && countyFeatures?.size) {
      const stateFips = STATE_TO_FIPS[focusedState];
      if (stateFips) {
        for (const [fips, feat] of countyFeatures.entries()) {
          if (String(fips).substring(0, 2) !== stateFips) continue;
          if (geoContains(feat, [church.lng, church.lat])) {
            center = getCountyCenter(feat);
            zoom = getCountyZoom(feat);
            break;
          }
        }
      }
    }
    if (!isMobile) {
      moveToView(center, zoom);
      return;
    }
    moveToView([center[0], center[1] - getMobileLatOffset(zoom)], zoom);
  };

  const allStatesLoaded = useMemo(
    () => states.length > 0 && states.every((s) => s.isPopulated),
    [states]
  );

  // ── Ref for load functions (avoids useCallback + stabilizes effect deps) ──
  const loadFnsRef = useRef<{
    loadStateData: ((s: string) => Promise<void>) | null;
    loadStateDataSilent: ((s: string, c: Church) => Promise<void>) | null;
    loadStateDataSilentForChurch: ((s: string, churchId: string) => Promise<void>) | null;
  }>({ loadStateData: null, loadStateDataSilent: null, loadStateDataSilentForChurch: null });

  // ── Load state data (plain function, stored in ref) ──
  const loadStateData = async (stateAbbrev: string) => {
    const stateInfo = states.find((s) => s.abbrev === stateAbbrev);
    if (!stateInfo) {
      console.error(`[ChurchMap] loadStateData: no stateInfo found for "${stateAbbrev}"`);
      return;
    }

    // Session cache hit: instant revisit
    const cached = refs.current.churchCache.get(stateAbbrev);
    if (cached && cached.length > 0) {
      console.log(`[ChurchMap] Cache hit for ${stateAbbrev} (${cached.length} churches) — instant load`);
      refs.current.loadVersion++;
      setFocusedState(stateAbbrev);
      setFocusedStateName(stateInfo.name);
      setChurches(cached);
      setSelectedChurch(null);
      setError(null);
      setLoading(false);
      setPopulating(false);
      refs.current.pendingTransition = null;
      setLoadingStateName("");
      overlay.setForceLoadingVisible(false);
      moveToView([stateInfo.lng, stateInfo.lat], getStateZoom(stateAbbrev));
      return;
    }

    const version = ++refs.current.loadVersion;
    const isStale = () => refs.current.loadVersion !== version;

    console.log(`[ChurchMap] Loading state: ${stateAbbrev} (${stateInfo.name}) [v${version}]`);

    // Keep the target region focused (so the pill/map don't flash national /
    // a previous state) but clear churches until the fetch finishes.
    setFocusedState(stateAbbrev);
    setFocusedStateName(stateInfo.name);
    setChurches([]);
    setSelectedChurch(null);
    setLoadingStateName(stateInfo.name);
    refs.current.pendingTransition = null;
    setLoading(true);
    setPopulating(false);
    setError(null);
    moveToView([stateInfo.lng, stateInfo.lat], getStateZoom(stateAbbrev));

    try {
      const data = await fetchChurches(stateAbbrev);
      if (isStale()) {
        console.log(`[ChurchMap] Discarding stale load for ${stateAbbrev} [v${version}]`);
        return;
      }

      if (data.churches && data.churches.length > 0) {
        const isTruncated = data.churches.length === 2000;
        const filtered = filterToStatePolygon(data.churches, stateAbbrev, refs.current.stateFeatures);

        if (isTruncated) {
          console.log(`${stateInfo.name} has exactly 2000 churches (likely truncated) -- refreshing...`);
          setChurches(filtered);
          setLoading(false);
          setPopulating(true);

          try {
            const result = await populateState(stateAbbrev, true);
            if (isStale()) return;
            if (!result.error) {
              const freshData = await fetchChurches(stateAbbrev);
              if (isStale()) return;
              if (freshData.churches && freshData.churches.length > 0) {
                setChurches(
                  filterToStatePolygon(freshData.churches, stateAbbrev, refs.current.stateFeatures),
                );
              }
              const statesData = await fetchStates();
              if (!isStale()) {
                setStates(statesData.states);
                setTotalChurches(statesData.totalChurches);
              }
            }
          } catch (refreshErr) {
            console.warn(`Background refresh failed for ${stateInfo.name}:`, refreshErr);
          } finally {
            if (!isStale()) {
              setPopulating(false);
              setLoadingStateName("");
            }
          }
        } else {
          setChurches(filtered);
          setLoading(false);
          setLoadingStateName("");
        }
        return;
      }

      // No cached data -- auto-populate
      setPopulating(true);
      setLoading(false);

      const result = await populateState(stateAbbrev);
      if (isStale()) return;
      if (result.error) {
        setError(result.error);
        setLoadingStateName("");
        overlay.setForceLoadingVisible(false);
        setPopulating(false);
        return;
      }

      const freshData = await fetchChurches(stateAbbrev);
      if (isStale()) return;
      setChurches(
        filterToStatePolygon(freshData.churches || [], stateAbbrev, refs.current.stateFeatures),
      );

      const statesData = await fetchStates();
      if (!isStale()) {
        setStates(statesData.states);
        setTotalChurches(statesData.totalChurches);
      }
    } catch (err) {
      if (isStale()) return;
      console.error(`Failed to load churches for ${stateAbbrev}:`, err);
      setError(
        `Failed to load churches for ${stateInfo.name}. This might be due to API rate limits -- try again in a moment.`
      );
      setLoadingStateName("");
      overlay.setForceLoadingVisible(false);
    } finally {
      if (!isStale()) {
        setLoading(false);
        setPopulating(false);
        setLoadingStateName("");
      }
    }
  };

  // ── Silent background load (plain function, stored in ref) ──
  const loadStateDataSilent = async (stateAbbrev: string, preloadedChurch: Church) => {
    const stateInfo = states.find((s) => s.abbrev === stateAbbrev);
    if (!stateInfo) return;

    const version = ++refs.current.loadVersion;
    const isStale = () => refs.current.loadVersion !== version;

    console.log(`[ChurchMap] Instant church: "${preloadedChurch.name}" in ${stateAbbrev} [v${version}]`);

    setFocusedState(stateAbbrev);
    setFocusedStateName(stateInfo.name);
    setChurches([preloadedChurch]);
    setSelectedChurch(preloadedChurch);
    const churchZoom = 8;
    const latOff = isMobile ? getMobileLatOffset(churchZoom) : 0;
    setCenter([preloadedChurch.lng, preloadedChurch.lat - latOff]);
    setZoom(churchZoom);
    setError(null);
    setLoading(false);
    setPopulating(false);
    refs.current.pendingTransition = null;
    setLoadingStateName("");
    overlay.setForceLoadingVisible(false);

    try {
      const data = await fetchChurches(stateAbbrev);
      if (isStale()) return;

      if (data.churches && data.churches.length > 0) {
        const filtered = filterToStatePolygon(data.churches, stateAbbrev, refs.current.stateFeatures);
        setChurches(filtered);

        const full = filtered.find((c) => c.id === preloadedChurch.id);
        if (full) setSelectedChurch(full);

        if (data.churches.length === 2000) {
          try {
            const result = await populateState(stateAbbrev, true);
            if (isStale()) return;
            if (!result.error) {
              const fresh = await fetchChurches(stateAbbrev);
              if (isStale()) return;
              if (fresh.churches?.length) {
                const ff = filterToStatePolygon(fresh.churches, stateAbbrev, refs.current.stateFeatures);
                setChurches(ff);
                const fc = ff.find((c) => c.id === preloadedChurch.id);
                if (fc) setSelectedChurch(fc);
              }
              const sd = await fetchStates();
              if (!isStale()) {
                setStates(sd.states);
                setTotalChurches(sd.totalChurches);
              }
            }
          } catch (e) {
            console.warn(`Background refresh failed for ${stateAbbrev}:`, e);
          }
        }
      } else {
        setPopulating(true);
        try {
          const result = await populateState(stateAbbrev);
          if (isStale()) return;
          if (!result.error) {
            const fresh = await fetchChurches(stateAbbrev);
            if (isStale()) return;
            const ff = filterToStatePolygon(fresh.churches || [], stateAbbrev, refs.current.stateFeatures);
            setChurches(ff);
            const fc = ff.find((c) => c.id === preloadedChurch.id);
            if (fc) setSelectedChurch(fc);
            const sd = await fetchStates();
            if (!isStale()) {
              setStates(sd.states);
              setTotalChurches(sd.totalChurches);
            }
          }
        } catch (e) {
          console.warn(`Background population failed for ${stateAbbrev}:`, e);
        } finally {
          if (!isStale()) setPopulating(false);
        }
      }
    } catch (err) {
      if (isStale()) return;
      console.warn(`[ChurchMap] Background load failed for ${stateAbbrev}:`, err);
    }
  };

  // ── Silent load for church page (no full overlay; state view then church when data arrives) ──
  const loadStateDataSilentForChurch = async (stateAbbrev: string, churchId: string) => {
    const stateInfo = states.find((s) => s.abbrev === stateAbbrev);
    if (!stateInfo) return;

    const cached = refs.current.churchCache.get(stateAbbrev);
    if (cached && cached.length > 0) {
      const church = cached.find((c) => churchMatchesRouteSegment(c, churchId, stateAbbrev));
      if (church) {
        refs.current.loadVersion++;
        setFocusedState(stateAbbrev);
        setFocusedStateName(stateInfo.name);
        setChurches(cached);
        setSelectedChurch(church);
        setError(null);
        setLoading(false);
        setPopulating(false);
        refs.current.pendingTransition = null;
        setLoadingStateName("");
        overlay.setForceLoadingVisible(false);
        moveToChurchView(church.lng, church.lat, Math.max(ds.zoom, 8), church);
        refs.current.lastChurchViewAppliedId = church.id;
        return;
      }
    }

    const version = ++refs.current.loadVersion;
    const isStale = () => refs.current.loadVersion !== version;

    console.log(`[ChurchMap] Church page load: ${stateAbbrev} / ${churchId} [v${version}]`);

    refs.current.churchLookupTriedKey = null;
    // Keep place name on the pill, but clear stale churches + mark loading so we
    // don't flash the previous state's count / review % while fetching.
    setFocusedState(stateAbbrev);
    setFocusedStateName(stateInfo.name);
    setChurches([]);
    setSelectedChurch(null);
    setError(null);
    setLoading(true);
    setPopulating(false);
    refs.current.pendingTransition = null;
    setLoadingStateName(stateInfo.name);
    overlay.setForceLoadingVisible(false);
    moveToView([stateInfo.lng, stateInfo.lat], getStateZoom(stateAbbrev));

    try {
      const data = await fetchChurches(stateAbbrev);
      if (isStale()) return;

      if (data.churches && data.churches.length > 0) {
        const filtered = filterToStatePolygon(data.churches, stateAbbrev, refs.current.stateFeatures);

        let church = filtered.find((c) => churchMatchesRouteSegment(c, churchId, stateAbbrev));
        if (!church) {
          const fromUnfiltered = data.churches.find((c) => churchMatchesRouteSegment(c, churchId, stateAbbrev));
          if (fromUnfiltered) { filtered.push(fromUnfiltered); church = fromUnfiltered; }
        }
        setChurches(filtered);

        if (church) {
          setSelectedChurch(church);
          moveToChurchView(church.lng, church.lat, Math.max(ds.zoom, 8), church);
          refs.current.lastChurchViewAppliedId = church.id;
        } else {
          // Church not found in state data (e.g. shortId collision changed its ID) — fetch directly
          try {
            const { church: fetched } = await fetchChurchByShortId(stateAbbrev, churchId);
            if (!isStale() && fetched) {
              setChurches((prev) => (prev.some((c) => c.id === fetched.id) ? prev : [...prev, fetched]));
              setSelectedChurch(fetched);
              moveToChurchView(fetched.lng, fetched.lat, Math.max(ds.zoom, 8), fetched);
              refs.current.lastChurchViewAppliedId = fetched.id;
            }
          } catch (e) {
            console.warn(`[ChurchMap] fetchChurchByShortId fallback failed for ${stateAbbrev}/${churchId}:`, e);
          }
        }

        if (!isStale()) {
          setLoading(false);
          setLoadingStateName("");
        }

        if (data.churches.length === 2000) {
          try {
            setPopulating(true);
            const result = await populateState(stateAbbrev, true);
            if (isStale()) return;
            if (!result.error) {
              const fresh = await fetchChurches(stateAbbrev);
              if (isStale()) return;
              if (fresh.churches?.length) {
                const ff = filterToStatePolygon(fresh.churches, stateAbbrev, refs.current.stateFeatures);
                let fc = ff.find((c) => churchMatchesRouteSegment(c, churchId, stateAbbrev));
                if (!fc) {
                  const fromUnfiltered = fresh.churches.find((c: any) => churchMatchesRouteSegment(c, churchId, stateAbbrev));
                  if (fromUnfiltered) { ff.push(fromUnfiltered); fc = fromUnfiltered; }
                }
                setChurches(ff);
                if (fc) {
                  setSelectedChurch(fc);
                  moveToChurchView(fc.lng, fc.lat, Math.max(ds.zoom, 8), fc);
                  refs.current.lastChurchViewAppliedId = fc.id;
                }
              }
              const sd = await fetchStates();
              if (!isStale()) {
                setStates(sd.states);
                setTotalChurches(sd.totalChurches);
              }
            }
          } catch (e) {
            console.warn(`Background refresh failed for ${stateAbbrev}:`, e);
          } finally {
            if (!isStale()) setPopulating(false);
          }
        }
        return;
      }

      setPopulating(true);
      setLoading(false);
      setLoadingStateName(stateInfo.name);
      try {
        const result = await populateState(stateAbbrev);
        if (isStale()) return;
        if (result.error) {
          setError(result.error);
          setFocusedState(stateAbbrev);
          setFocusedStateName(stateInfo.name);
          moveToView([stateInfo.lng, stateInfo.lat], getStateZoom(stateAbbrev));
          return;
        }
        const freshData = await fetchChurches(stateAbbrev);
        if (isStale()) return;
        const freshFiltered = filterToStatePolygon(freshData.churches || [], stateAbbrev, refs.current.stateFeatures);
        let church = freshFiltered.find((c) => churchMatchesRouteSegment(c, churchId, stateAbbrev));
        if (!church) {
          const fromUnfiltered = (freshData.churches || []).find((c: any) => churchMatchesRouteSegment(c, churchId, stateAbbrev));
          if (fromUnfiltered) { freshFiltered.push(fromUnfiltered); church = fromUnfiltered; }
        }
        setChurches(freshFiltered);
        if (church) {
          setSelectedChurch(church);
          moveToChurchView(church.lng, church.lat, Math.max(ds.zoom, 8), church);
          refs.current.lastChurchViewAppliedId = church.id;
        } else {
          try {
            const { church: fetched } = await fetchChurchByShortId(stateAbbrev, churchId);
            if (!isStale() && fetched) {
              setChurches((prev) => (prev.some((c) => c.id === fetched.id) ? prev : [...prev, fetched]));
              setSelectedChurch(fetched);
              moveToChurchView(fetched.lng, fetched.lat, Math.max(ds.zoom, 8), fetched);
              refs.current.lastChurchViewAppliedId = fetched.id;
            }
          } catch (e) {
            console.warn(`[ChurchMap] fetchChurchByShortId fallback failed for ${stateAbbrev}/${churchId}:`, e);
          }
        }
        const statesData = await fetchStates();
        if (!isStale()) {
          setStates(statesData.states);
          setTotalChurches(statesData.totalChurches);
        }
      } catch (e) {
        console.warn(`Background population failed for ${stateAbbrev}:`, e);
        if (!isStale()) {
          setError(
            `Failed to load churches for ${stateInfo.name}. This might be due to API rate limits -- try again in a moment.`
          );
        }
      } finally {
        if (!isStale()) {
          setPopulating(false);
          setLoading(false);
          setLoadingStateName("");
        }
      }
    } catch (err) {
      if (isStale()) return;
      console.error(`Failed to load churches for ${stateAbbrev}:`, err);
      setError(
        `Failed to load churches for ${stateInfo.name}. This might be due to API rate limits -- try again in a moment.`
      );
      setLoading(false);
      setPopulating(false);
      setLoadingStateName("");
    }
  };

  // ── Silent refetch of current state's churches (e.g. after edit) ──
  const refetchCurrentStateChurches = async () => {
    if (!focusedState) return;
    try {
      const data = await fetchChurches(focusedState);
      if (!data.churches?.length) return;
      const filtered = filterToStatePolygon(data.churches, focusedState, refs.current.stateFeatures);
      setChurches(filtered);
      if (selectedChurch) {
        const found = filtered.find((c) => c.id === selectedChurch.id);
        setSelectedChurch(found ?? selectedChurch);
      }
    } catch (e) {
      console.warn(`[ChurchMap] Refetch churches failed for ${focusedState}:`, e);
    }
  };

  // Store latest versions in ref (avoids useCallback, stabilizes effect deps)
  loadFnsRef.current.loadStateData = loadStateData;
  loadFnsRef.current.loadStateDataSilent = loadStateDataSilent;
  loadFnsRef.current.loadStateDataSilentForChurch = loadStateDataSilentForChurch;

  // ── Apply pending state transition once data is ready ──
  // Don't wait on forceLoadingVisible / verse min-time — the full-screen
  // overlay only shows for slow `populating` refreshes now; the header pill
  // already tracks loading. Holding focusedState/churches until verses finish
  // left the map without counties or dots after "Loading churches…" ended.
  useEffect(() => {
    if (!loading && !populating && refs.current.pendingTransition) {
      const p = refs.current.pendingTransition;
      refs.current.pendingTransition = null;
      setFocusedState(p.abbrev);
      setFocusedStateName(p.name);
      setChurches(p.churches);
      setLoadingStateName("");
      overlay.setForceLoadingVisible(false);
      moveToView([p.lng, p.lat], getStateZoom(p.abbrev));
    }
  }, [loading, populating]);

  // ── Sync local state churchCount with actual polygon-filtered count ──
  useEffect(() => {
    if (focusedState && churches.length > 0) {
      refs.current.churchCache.set(focusedState, churches);
      setStates((prev) => {
        const existing = prev.find((s) => s.abbrev === focusedState);
        if (existing && existing.churchCount !== churches.length) {
          const delta = churches.length - existing.churchCount;
          setTotalChurches((t) => t + delta);
          return prev.map((s) =>
            s.abbrev === focusedState ? { ...s, churchCount: churches.length } : s
          );
        }
        return prev;
      });
    }
  }, [focusedState, churches.length]);

  // ── Load states and populations on mount ──
  useEffect(() => {
    console.log("[ChurchMap] Fetching states on mount...");
    fetchStates()
      .then((data) => {
        const safeStates = Array.isArray(data.states) ? data.states : [];
        console.log(`[ChurchMap] Loaded ${safeStates.length} states, ${data.totalChurches} total churches`);
        setStates(safeStates);
        setTotalChurches(data.totalChurches || 0);
      })
      .catch((err) => {
        console.error("[ChurchMap] Failed to load states:", err);
        setError("Failed to load state data. Please refresh the page.");
      });

    fetch(GEO_URL)
      .then((res) => res.json())
      .then((topology: any) => {
        if (!topology || !topology.objects) {
          console.warn("[ChurchMap] Invalid topology data");
          return;
        }
        const geojson = feature(topology, topology.objects.states) as any;
        const featureMap = new Map<string, any>();
        if (geojson && Array.isArray(geojson.features)) {
          for (const f of geojson.features) {
            const abbrev = FIPS_TO_STATE[String(f.id).padStart(2, "0")];
            if (abbrev) featureMap.set(abbrev, f);
          }
        }
        refs.current.stateFeatures = featureMap;
        console.log(`[ChurchMap] Loaded topojson features for ${featureMap.size} states`);
      })
      .catch((err) =>
        console.warn("[ChurchMap] Failed to load topojson for polygon filtering:", err)
      );

    loadAdmin2Features("US")
      .then((countyMap) => {
        setCountyFeatures(countyMap);
        console.log(`[ChurchMap] Loaded admin-2 features for ${countyMap.size} US counties`);
      })
      .catch((err) =>
        console.warn("[ChurchMap] Failed to load US county geography:", err)
      );

    fetchStatePopulations()
      .then((data) => {
        setStatePopulations(data.populations);
        console.log(
          `[ChurchMap] Loaded populations for ${Object.keys(data.populations).length} states (source: ${data.source})`
        );
      })
      .catch((err) => {
        console.warn("[ChurchMap] Failed to load state populations:", err);
      });

    // Detect user's state from edge-injected meta (Netlify context.geo; DC → MD)
    const regionMeta = document.querySelector('meta[name="x-user-region"]');
    if (regionMeta) {
      let abbrev = regionMeta.getAttribute("content")?.toUpperCase() ?? "";
      if (abbrev === "DC") abbrev = "MD";
      // Validate against the US region registry (single source of truth).
      if (getRegion("US", abbrev)) {
        console.log(`[ChurchMap] Detected user state via geo: ${abbrev}`);
        setDetectedState(abbrev);
      }
    }
  }, []);

  // ── URL Sync: Route -> Internal State ──
  // Sync state route param (uses ref-stored loadFns to avoid unstable deps)
  useEffect(() => {
    if (!refs.current.statesLoaded || states.length === 0) return;

    if (routeStateAbbrev === refs.current.prevRouteState) return;
    refs.current.prevRouteState = routeStateAbbrev;

    if (!routeStateAbbrev) {
      refs.current.loadVersion++;
      const version = ++refs.current.transitionVersion;
      const fromChurchView = !!ds.selectedChurch;

      if (!fromChurchView) {
        dd({ type: "SET_TRANSITIONING", value: true });
      }
      dd({ type: "RESET_TO_NATIONAL" });
      ui.setShowFilterPanel(false);
      ui.setShowListModal(false);
      ui.setLanguageFilter("all");
      ui.setHoveredCounty(null);
      overlay.setForceLoadingVisible(false);
      refs.current.pendingTransition = null;
      refs.current.moveEndSuppressedUntil = Date.now() + 1100;
      // Safety net: re-assert national view after CSS transition settles
      setTimeout(() => {
        if (refs.current.transitionVersion === version) {
          dd({ type: "SET_TRANSITIONING", value: false });
        }
        if (!refs.current.focusedState) {
          dd({ type: "SET_CENTER", value: [-96, 38] as [number, number] });
          dd({ type: "SET_ZOOM", value: 1 });
        }
      }, fromChurchView ? 100 : 1050);
      return;
    }

    const stateInfo = states.find((s) => s.abbrev === routeStateAbbrev);
    if (!stateInfo) {
      console.warn(`[ChurchMap] Invalid state in URL: "${routeStateAbbrev}"`);
      navigateToNational();
      return;
    }

    if (refs.current.focusedState !== routeStateAbbrev) {
      const fromRef = refs.current.preloadedChurch;
      refs.current.preloadedChurch = null;
      const routeChurchKey = routeChurchShortId ?? routeLegacyChurchId ?? "";
      const fromNav =
        routeChurchKey
          ? matchNavigationChurchPreload(routeChurchKey, routeStateAbbrev, "US")
          : null;
      const preloaded =
        fromRef && fromRef.state === routeStateAbbrev
          ? fromRef
          : fromNav && fromNav.state === routeStateAbbrev
            ? fromNav
            : null;
      if (preloaded) {
        clearNavigationChurchPreload();
        loadFnsRef.current.loadStateDataSilent?.(routeStateAbbrev, preloaded);
      } else if (routeChurchShortId ?? routeLegacyChurchId) {
        loadFnsRef.current.loadStateDataSilentForChurch?.(routeStateAbbrev, routeChurchShortId ?? routeLegacyChurchId ?? "");
      } else {
        loadFnsRef.current.loadStateData?.(routeStateAbbrev);
      }
    }
  }, [routeStateAbbrev, routeChurchShortId, routeLegacyChurchId, states]);

  // Sync church route param + deferred selection; resolve by shortId or legacy id; redirect legacy URL to canonical
  const routeChurchKey = routeChurchShortId ?? routeLegacyChurchId ?? null;
  useEffect(() => {
    const isNewRoute = routeChurchKey !== refs.current.prevRouteChurch;
    if (isNewRoute) {
      refs.current.prevRouteChurch = routeChurchKey;
    }

    if (!routeChurchKey) {
      if (isNewRoute && selectedChurch) {
        setSelectedChurch(null);
        if (focusedState) {
          const si = states.find((s) => s.abbrev === focusedState);
          if (si) moveToView([si.lng, si.lat], getStateZoom(focusedState));
        }
      }
      return;
    }

    if (churches.length === 0) return;

    const church = churches.find((c) =>
      churchMatchesRouteSegment(c, routeChurchKey!, focusedState ?? "")
    );

    if (church) {
      // Don't overwrite correct selection when current church already matches route (e.g. from search preload)
      const currentMatchesRoute =
        selectedChurch &&
        churchMatchesRouteSegment(selectedChurch, routeChurchKey!, focusedState ?? "");
      if (currentMatchesRoute && selectedChurch!.id !== church.id) {
        if (routeLegacyChurchId && focusedState) {
          navigateToChurch(focusedState, getChurchUrlSegment(selectedChurch!, focusedState), {
            replace: true,
            countyFips: routeCountyFips ?? undefined,
          });
        }
        return;
      }
      if (!selectedChurch || selectedChurch.id !== church.id) {
        setSelectedChurch(church);
        moveToChurchView(church.lng, church.lat, Math.max(ds.zoom, 8), church);
        refs.current.lastChurchViewAppliedId = church.id;
      }
      // Redirect legacy URL to canonical (numeric segment)
      if (routeLegacyChurchId && focusedState) {
        navigateToChurch(focusedState, getChurchUrlSegment(church, focusedState), {
          replace: true,
          countyFips: routeCountyFips ?? undefined,
        });
      }
    }
  }, [routeChurchShortId, routeLegacyChurchId, routeChurchKey, routeCountyFips, churches, selectedChurch?.id, focusedState, navigateToChurch]);

  // Ensure church view: when route has church and selectedChurch matches, apply zoom once; or when church is in list but not selected yet, select and zoom; or fetch by shortId if not in list
  const stateForChurch = focusedState ?? routeStateAbbrev ?? null;
  useEffect(() => {
    if (!routeChurchKey) {
      refs.current.lastChurchViewAppliedId = null;
      refs.current.churchLookupTriedKey = null;
      return;
    }
    if (!stateForChurch) return;

    const church =
      selectedChurch && churchMatchesRouteSegment(selectedChurch, routeChurchKey, stateForChurch)
        ? selectedChurch
        : churches.find((c) => churchMatchesRouteSegment(c, routeChurchKey, stateForChurch));

    if (church) {
      if (refs.current.lastChurchViewAppliedId === church.id) return;
      if (!focusedState && church.state) setFocusedState(church.state);
      if (church.state && states.length > 0) {
        const info = states.find((s) => s.abbrev === church.state);
        if (info) setFocusedStateName(info.name);
      }
      if (!selectedChurch || selectedChurch.id !== church.id) {
        setSelectedChurch(church);
      }
      refs.current.lastChurchViewAppliedId = church.id;
      moveToChurchView(church.lng, church.lat, Math.max(zoom, 8), church);
      return;
    }

    // Church not in list: try once per routeChurchKey to fetch by shortId
    if (refs.current.churchLookupTriedKey === routeChurchKey) return;
    refs.current.churchLookupTriedKey = routeChurchKey;
    fetchChurchByShortId(stateForChurch, routeChurchKey).then(({ church: fetched }) => {
      if (!fetched) return;
      if (!focusedState && fetched.state) setFocusedState(fetched.state);
      if (fetched.state && states.length > 0) {
        const info = states.find((s) => s.abbrev === fetched.state);
        if (info) setFocusedStateName(info.name);
      }
      setChurches((prev) => (prev.some((c) => c.id === fetched.id) ? prev : [...prev, fetched]));
      setSelectedChurch(fetched);
      refs.current.lastChurchViewAppliedId = fetched.id;
      moveToChurchView(fetched.lng, fetched.lat, Math.max(zoom, 8), fetched);
    });
  }, [routeChurchKey, routeStateAbbrev, stateForChurch, churches.length, churches, selectedChurch, focusedState, states, zoom]);

  // Sync map view when entering or leaving county view (routeCountyFips or countyFeatures load)
  const lastMovedToCountyRef = useRef<string | null>(null);
  useEffect(() => {
    if (!focusedState) return;
    if (routeCountyFips && countyFeatures?.size) {
      // When URL has a church segment, never move to county view only — wait for church view to apply (or state view if no church)
      const routeChurchKey = routeChurchShortId ?? routeLegacyChurchId ?? null;
      if (routeChurchKey) {
        if (
          selectedChurch &&
          churchMatchesRouteSegment(selectedChurch, routeChurchKey, focusedState)
        ) {
          return;
        }
        // Church in URL but not selected yet (still loading): don't overwrite with county zoom
        return;
      }
      const feat = countyFeatures.get(routeCountyFips);
      if (feat && lastMovedToCountyRef.current !== routeCountyFips) {
        lastMovedToCountyRef.current = routeCountyFips;
        refs.current.prevRouteCountyFips = routeCountyFips;
        moveToView(getCountyCenter(feat), getCountyZoom(feat));
      }
    } else {
      if (refs.current.prevRouteCountyFips !== null) {
        refs.current.prevRouteCountyFips = null;
        lastMovedToCountyRef.current = null;
        const si = states.find((s) => s.abbrev === focusedState);
        if (si) moveToView([si.lng, si.lat], getStateZoom(focusedState));
      }
    }
  }, [routeCountyFips, routeChurchShortId, routeLegacyChurchId, focusedState, countyFeatures, states, selectedChurch]);

  // Mobile/desktop camera offset is owned by MapLibreCanvas padding now.
  // Recenter-on-isMobile used to fly the camera (and flash the map) whenever a
  // window resize crossed the breakpoint.

  // Update page title + church JSON-LD / OG meta (US map path)
  useEffect(() => {
    if (selectedChurch) {
      syncChurchDocumentSeo(selectedChurch, selectedChurch.country || "US");
    } else {
      syncChurchDocumentSeo(null);
      if (focusedState && focusedStateName) {
        document.title = `Churches in ${focusedStateName} | Here's My Church`;
      } else {
        document.title = "Here's My Church";
      }
    }
  }, [selectedChurch, focusedState, focusedStateName]);

  // ── Plain handler functions (no useCallback — only used from return object) ──
  const handlePopulate = async () => {
    if (!focusedState) return;
    setPopulating(true);
    setError(null);
    setLoadingStateName(focusedStateName);

    try {
      const result = await populateState(focusedState);
      if (result.error) {
        setError(result.error);
        return;
      }

      const data = await fetchChurches(focusedState);
      setChurches(filterToStatePolygon(data.churches || [], focusedState, refs.current.stateFeatures));

      const statesData = await fetchStates();
      setStates(statesData.states);
      setTotalChurches(statesData.totalChurches);
    } catch (err) {
      console.error(`Failed to populate ${focusedState}:`, err);
      setError(
        `Failed to populate churches. The Overpass API may be rate-limited -- please wait a moment and try again.`
      );
    } finally {
      setPopulating(false);
    }
  };

  const clearTransition = () => {
    dd({ type: "SET_TRANSITIONING", value: false });
    dd({ type: "SET_ZOOM_TRANSITIONING", value: false });
  };
  const handleResetView = () => navigateToNational();
  const handleBackToState = () => {
    if (focusedState) navigateToStateOnly(focusedState);
  };
  // In state/county view, don't allow zooming out past the initial view zoom.
  // When in county view, use state zoom as min so the user can zoom out to state level (then we navigate to state in handleMoveEnd).
  const minZoom = useMemo(() => {
    return focusedState ? getStateZoom(focusedState) : 1;
  }, [focusedState]);
  const ZOOM_TRANSITION_MS = 320;
  const handleZoomIn = () => {
    dd({ type: "SET_ZOOM_TRANSITIONING", value: true });
    setZoom((z) => Math.min(z * 1.5, 500));
    setTimeout(() => dd({ type: "SET_ZOOM_TRANSITIONING", value: false }), ZOOM_TRANSITION_MS);
  };
  const handleZoomOut = () => {
    dd({ type: "SET_ZOOM_TRANSITIONING", value: true });
    setZoom((z) => Math.max(z / 1.5, minZoom));
    setTimeout(() => dd({ type: "SET_ZOOM_TRANSITIONING", value: false }), ZOOM_TRANSITION_MS);
  };
  const preloadChurch = (church: Church) => {
    refs.current.preloadedChurch = church;
    setNavigationChurchPreload(church);
  };

  const handleChurchDotClick = (church: Church, e?: { clientX: number; clientY: number }) => {
    ui.setHoveredChurch(null);
    if (isMobile) {
      const pos = e ? { x: e.clientX, y: e.clientY } : ui.tooltipPos;
      ui.setPinnedPreview(church, pos);
    } else {
      const stateAbbrev = focusedState ?? church.state;
      if (stateAbbrev) {
        navigateToChurch(stateAbbrev, getChurchUrlSegment(church, stateAbbrev), {
          countyFips: routeCountyFips ?? undefined,
        });
      }
    }
  };

  const onViewChurch = (church: Church) => {
    ui.clearPreview();
    if (focusedState) {
      navigateToChurch(focusedState, getChurchUrlSegment(church, focusedState), {
        countyFips: routeCountyFips ?? undefined,
      });
    }
  };

  const handleStateClick = (abbrev: string, e?: { clientX: number; clientY: number }) => {
    // Already in a region: jump to a neighboring state/province instead of no-op.
    if (focusedState) {
      if (abbrev !== focusedState) navigateToState(abbrev);
      return;
    }
    if (isMobile) {
      const pos = e ? { x: e.clientX, y: e.clientY } : ui.tooltipPos;
      ui.setPinnedStatePreview(abbrev, pos);
    } else {
      navigateToState(abbrev);
    }
  };

  const handleCountyClick = (fips: string, e?: { clientX: number; clientY: number }) => {
    if (!focusedState) return;
    if (isMobile) {
      const pos = e ? { x: e.clientX, y: e.clientY } : ui.tooltipPos;
      ui.setPinnedCountyPreview(fips, pos);
    } else {
      navigateToCounty(focusedState, fips);
    }
  };

  return {
    // Map state (was in useMapView, now in data reducer)
    zoom, setZoom,
    minZoom,
    center, setCenter,
    isTransitioning: ds.isTransitioning,
    zoomTransitioning: ds.zoomTransitioning,
    clearTransition,
    moveEndSuppressedUntilRef: refs as { current: { moveEndSuppressedUntil: number } },
    // Data
    states,
    totalChurches,
    focusedState,
    focusedStateName,
    churches,
    loading,
    populating,
    error,
    setError,
    allStatesLoaded,
    // UI state (forwarded from useUIState)
    hoveredChurch: ui.hoveredChurch,
    setHoveredChurch: ui.setHoveredChurch,
    previewChurch: ui.previewChurch,
    previewPinned: ui.previewPinned,
    clearPreview: ui.clearPreview,
    hoveredState: ui.hoveredState,
    setHoveredState: ui.setHoveredState,
    previewState: ui.previewState,
    previewStatePinned: ui.previewStatePinned,
    setPinnedStatePreview: ui.setPinnedStatePreview,
    clearStatePreview: ui.clearStatePreview,
    handleStateClick,
    handleCountyClick,
    hoveredCounty: ui.hoveredCounty,
    setHoveredCounty: ui.setHoveredCounty,
    previewCounty: ui.previewCounty,
    previewCountyPinned: ui.previewCountyPinned,
    clearCountyPreview: ui.clearCountyPreview,
    tooltipPos: ui.tooltipPos,
    showFilterPanel: ui.showFilterPanel,
    setShowFilterPanel: ui.setShowFilterPanel,
    searchCollapsed: ui.searchCollapsed,
    setSearchCollapsed: ui.setSearchCollapsed,
    activeSize: ui.activeSize,
    toggleSize: ui.toggleSize,
    showSizeFilters: ui.showSizeFilters,
    setShowSizeFilters: ui.setShowSizeFilters,
    activeDenominations: ui.activeDenominations,
    toggleDenom: ui.toggleDenom,
    showDenomFilters: ui.showDenomFilters,
    setShowDenomFilters: ui.setShowDenomFilters,
    showLanguageFilters: ui.showLanguageFilters,
    setShowLanguageFilters: ui.setShowLanguageFilters,
    languageFilter: ui.languageFilter,
    setLanguageFilter: ui.setLanguageFilter,
    showListModal: ui.showListModal,
    setShowListModal: ui.setShowListModal,
    selectedChurch,
    setSelectedChurch,
    showAddChurchFromSummary: ui.showAddChurchFromSummary,
    setShowAddChurchFromSummary: ui.setShowAddChurchFromSummary,
    addChurchForState: ui.addChurchForState,
    setAddChurchForState: ui.setAddChurchForState,
    showSummary: ui.showSummary,
    setShowSummary: ui.setShowSummary,
    summaryRef: ui.summaryRef,
    showLegend: ui.showLegend,
    setShowLegend: ui.setShowLegend,
    statePopulations,
    detectedState,
    // Loading overlay
    sayingIndex: overlay.sayingIndex,
    forceLoadingVisible: overlay.forceLoadingVisible,
    loadingStateName,
    // Computed
    filteredChurches: filters.filteredChurches,
    languageStats: filters.languageStats,
    denomCounts: filters.denomCounts,
    sizeCounts: filters.sizeCounts,
    summaryStats: filters.summaryStats,
    countyStats,
    countyFeatures,
    focusedCounty,
    handleBackToState,
    // Actions
    loadStateData,
    refetchCurrentStateChurches,
    preloadChurch,
    handlePopulate,
    handleResetView,
    handleZoomIn,
    handleZoomOut,
    handleMouseMove: ui.handleMouseMove,
    handleMouseLeave: ui.handleMouseLeave,
    handleChurchDotClick,
    onViewChurch,
    statePendingSuggestions,
    refetchStatePendingSuggestions,
  };
}

// ── Data reducer (includes map-view state: zoom + center) ──
type DataState = {
  states: StateInfo[];
  totalChurches: number;
  focusedState: string | null;
  focusedStateName: string;
  churches: Church[];
  loading: boolean;
  populating: boolean;
  error: string | null;
  selectedChurch: Church | null;
  statePopulations: Record<string, number>;
  detectedState: string | null;
  loadingStateName: string;
  zoom: number;
  center: [number, number];
  isTransitioning: boolean;
  zoomTransitioning: boolean;
  countyFeatures: Map<string, any> | null;
};

type DataAction =
  | { type: "SET_STATES"; value: StateInfo[] | ((p: StateInfo[]) => StateInfo[]) }
  | { type: "SET_TOTAL_CHURCHES"; value: number | ((p: number) => number) }
  | { type: "SET_FOCUSED_STATE"; value: string | null }
  | { type: "SET_FOCUSED_STATE_NAME"; value: string }
  | { type: "SET_CHURCHES"; value: Church[] | ((p: Church[]) => Church[]) }
  | { type: "SET_LOADING"; value: boolean }
  | { type: "SET_POPULATING"; value: boolean }
  | { type: "SET_ERROR"; value: string | null }
  | { type: "SET_SELECTED_CHURCH"; value: Church | null }
  | { type: "SET_STATE_POPULATIONS"; value: Record<string, number> }
  | { type: "SET_DETECTED_STATE"; value: string | null }
  | { type: "SET_LOADING_STATE_NAME"; value: string }
  | { type: "SET_ZOOM"; value: number | ((p: number) => number) }
  | { type: "SET_CENTER"; value: [number, number] }
  | { type: "SET_TRANSITIONING"; value: boolean }
  | { type: "SET_ZOOM_TRANSITIONING"; value: boolean }
  | { type: "SET_COUNTY_FEATURES"; value: Map<string, any> | null }
  | { type: "RESET_TO_NATIONAL" };

const initialDataState: DataState = {
  states: [],
  totalChurches: 0,
  focusedState: null,
  focusedStateName: "",
  churches: [],
  loading: false,
  populating: false,
  error: null,
  selectedChurch: null,
  statePopulations: {},
  detectedState: null,
  loadingStateName: "",
  zoom: 1,
  center: [-96, 38] as [number, number],
  isTransitioning: false,
  zoomTransitioning: false,
  countyFeatures: null,
};

function dataReducer(state: DataState, action: DataAction): DataState {
  switch (action.type) {
    case "SET_STATES":
      return {
        ...state,
        states: typeof action.value === "function" ? action.value(state.states) : action.value,
      };
    case "SET_TOTAL_CHURCHES":
      return {
        ...state,
        totalChurches: typeof action.value === "function" ? action.value(state.totalChurches) : action.value,
      };
    case "SET_FOCUSED_STATE":
      return { ...state, focusedState: action.value };
    case "SET_FOCUSED_STATE_NAME":
      return { ...state, focusedStateName: action.value };
    case "SET_CHURCHES":
      return {
        ...state,
        churches: typeof action.value === "function" ? action.value(state.churches) : action.value,
      };
    case "SET_LOADING":
      return state.loading === action.value ? state : { ...state, loading: action.value };
    case "SET_POPULATING":
      return state.populating === action.value ? state : { ...state, populating: action.value };
    case "SET_ERROR":
      return { ...state, error: action.value };
    case "SET_SELECTED_CHURCH":
      return { ...state, selectedChurch: action.value };
    case "SET_STATE_POPULATIONS":
      return { ...state, statePopulations: action.value };
    case "SET_DETECTED_STATE":
      return { ...state, detectedState: action.value };
    case "SET_LOADING_STATE_NAME":
      return { ...state, loadingStateName: action.value };
    case "SET_ZOOM":
      return {
        ...state,
        zoom: typeof action.value === "function" ? action.value(state.zoom) : action.value,
      };
    case "SET_CENTER":
      return { ...state, center: action.value };
    case "SET_TRANSITIONING":
      return state.isTransitioning === action.value ? state : { ...state, isTransitioning: action.value };
    case "SET_ZOOM_TRANSITIONING":
      return state.zoomTransitioning === action.value ? state : { ...state, zoomTransitioning: action.value };
    case "SET_COUNTY_FEATURES":
      return { ...state, countyFeatures: action.value };
    case "RESET_TO_NATIONAL":
      return {
        ...state,
        focusedState: null,
        focusedStateName: "",
        churches: [],
        error: null,
        loading: false,
        populating: false,
        selectedChurch: null,
        loadingStateName: "",
        zoom: 1,
        center: [-96, 38] as [number, number],
      };
    default:
      return state;
  }
}

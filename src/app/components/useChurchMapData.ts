import { useMemo, useEffect, useRef, useReducer } from "react";
import { geoContains } from "d3-geo";
import { feature } from "topojson-client";
import type { Church, StateInfo } from "./church-data";
import {
  fetchStates,
  fetchChurches,
  populateState,
  fetchStatePopulations,
} from "./api";
import {
  GEO_URL,
  COUNTIES_GEO_URL,
  FIPS_TO_STATE,
  STATE_TO_FIPS,
  filterToStateBounds,
  getStateZoom,
} from "./map-constants";
import { COUNTY_POPULATIONS } from "./data/county-populations";
import { getChurchUrlSegment } from "./url-utils";

/** Match church by route segment (legacy id or numeric shortId). */
function churchMatchesRouteSegment(
  church: Church,
  segment: string,
  stateAbbrev: string
): boolean {
  return (
    church.id === segment ||
    church.shortId === segment ||
    getChurchUrlSegment(church, stateAbbrev) === segment
  );
}

import { useLoadingOverlay } from "./hooks/useLoadingOverlay";
import { useUIState } from "./hooks/useUIState";
import { useChurchFilters } from "./hooks/useChurchFilters";

interface UseChurchMapDataArgs {
  routeStateAbbrev: string | null;
  routeChurchShortId: string | null;
  routeLegacyChurchId: string | null;
  navigateToState: (abbrev: string) => void;
  navigateToChurch: (stateAbbrev: string, churchShortId: string, options?: { replace?: boolean }) => void;
  navigateToNational: () => void;
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
  routeChurchShortId,
  routeLegacyChurchId,
  navigateToState,
  navigateToChurch,
  navigateToNational,
  isMobile,
}: UseChurchMapDataArgs) {
  // ── Core data + map-view state (consolidated reducer — absorbs old useMapView) ──
  const [ds, dd] = useReducer(dataReducer, initialDataState);

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

  // ── Sub-hook: UI state (filters, tooltips, modals) ──
  const ui = useUIState(focusedState);

  // County-level church counts and per-capita (point-in-polygon vs county TopoJSON)
  const countyStats = useMemo(() => {
    if (!focusedState || !countyFeatures?.size || churches.length === 0) return null;
    const stateFips = STATE_TO_FIPS[focusedState];
    if (!stateFips) return null;
    const stateCounties = Array.from(countyFeatures.entries()).filter(([key]) => key.substring(0, 2) === stateFips);
    const countyNames: Record<string, string> = {};
    for (const [key, feat] of stateCounties) {
      countyNames[key] = (feat.properties?.name as string) ?? `County ${key}`;
    }
    const byFips: Record<string, { churchCount: number; population: number; perCapita: number; peoplePer: number; name: string }> = {};
    for (const church of churches) {
      let fips: string | null = null;
      for (const [key, feat] of stateCounties) {
        if (geoContains(feat, [church.lng, church.lat])) {
          fips = key;
          break;
        }
      }
      if (!fips) continue;
      const pop = COUNTY_POPULATIONS[fips] ?? 0;
      if (!byFips[fips]) {
        byFips[fips] = { churchCount: 0, population: pop, perCapita: 0, peoplePer: 0, name: countyNames[fips] ?? `County ${fips}` };
      }
      byFips[fips].churchCount += 1;
    }
    const sorted: Array<{ fips: string; name: string; churchCount: number; population: number; perCapita: number; peoplePer: number }> = [];
    for (const [fips, data] of Object.entries(byFips)) {
      const pop = data.population || 1;
      const perCapita = data.churchCount / pop;
      const peoplePer = Math.round(pop / data.churchCount);
      sorted.push({
        fips,
        name: data.name,
        churchCount: data.churchCount,
        population: data.population,
        perCapita,
        peoplePer,
      });
    }
    sorted.sort((a, b) => b.perCapita - a.perCapita);
    return {
      byFips: Object.fromEntries(
        Object.entries(byFips).map(([f, d]) => [
          f,
          { ...d, perCapita: d.churchCount / (d.population || 1), peoplePer: Math.round((d.population || 1) / d.churchCount) },
        ])
      ),
      sortedByPerCapita: sorted,
    };
  }, [focusedState, countyFeatures, churches]);

  // ── Sub-hook: filtered churches + derived stats ──
  const filters = useChurchFilters(
    churches,
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
    statesLoaded: false,
    moveEndSuppressedUntil: 0,
    transitionVersion: 0,
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

  const moveToChurchView = (lng: number, lat: number, targetZoom: number) => {
    if (!isMobile) {
      moveToView([lng, lat], targetZoom);
      return;
    }
    moveToView([lng, lat - getMobileLatOffset(targetZoom)], targetZoom);
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

    setFocusedState(null);
    setFocusedStateName("");
    setChurches([]);
    setSelectedChurch(null);
    setLoadingStateName(stateInfo.name);
    refs.current.pendingTransition = {
      abbrev: stateAbbrev,
      name: stateInfo.name,
      lat: stateInfo.lat,
      lng: stateInfo.lng,
      churches: [],
    };
    setLoading(true);
    setError(null);

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
          setLoading(false);
          setPopulating(true);

          try {
            const result = await populateState(stateAbbrev, true);
            if (isStale()) return;
            if (!result.error) {
              const freshData = await fetchChurches(stateAbbrev);
              if (isStale()) return;
              if (freshData.churches && freshData.churches.length > 0) {
                const freshFiltered = filterToStatePolygon(freshData.churches, stateAbbrev, refs.current.stateFeatures);
                if (refs.current.pendingTransition?.abbrev === stateAbbrev) {
                  refs.current.pendingTransition.churches = freshFiltered;
                }
              }
              const statesData = await fetchStates();
              if (!isStale()) {
                setStates(statesData.states);
                setTotalChurches(statesData.totalChurches);
              }
            } else {
              if (refs.current.pendingTransition?.abbrev === stateAbbrev) {
                refs.current.pendingTransition.churches = filtered;
              }
            }
          } catch (refreshErr) {
            console.warn(`Background refresh failed for ${stateInfo.name}:`, refreshErr);
            if (!isStale() && refs.current.pendingTransition?.abbrev === stateAbbrev) {
              refs.current.pendingTransition.churches = filtered;
            }
          } finally {
            if (!isStale()) setPopulating(false);
          }
        } else {
          if (refs.current.pendingTransition?.abbrev === stateAbbrev) {
            refs.current.pendingTransition.churches = filtered;
          }
          setLoading(false);
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
        setFocusedState(stateAbbrev);
        setFocusedStateName(stateInfo.name);
        moveToView([stateInfo.lng, stateInfo.lat], getStateZoom(stateAbbrev));
        refs.current.pendingTransition = null;
        setLoadingStateName("");
        overlay.setForceLoadingVisible(false);
        setPopulating(false);
        return;
      }

      const freshData = await fetchChurches(stateAbbrev);
      if (isStale()) return;
      const freshFiltered = filterToStatePolygon(freshData.churches || [], stateAbbrev, refs.current.stateFeatures);
      if (refs.current.pendingTransition?.abbrev === stateAbbrev) {
        refs.current.pendingTransition.churches = freshFiltered;
      }

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
      setFocusedState(stateAbbrev);
      setFocusedStateName(stateInfo.name);
      moveToView([stateInfo.lng, stateInfo.lat], getStateZoom(stateAbbrev));
      refs.current.pendingTransition = null;
      setLoadingStateName("");
      overlay.setForceLoadingVisible(false);
    } finally {
      if (!isStale()) {
        setLoading(false);
        setPopulating(false);
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
        moveToChurchView(church.lng, church.lat, Math.max(ds.zoom, 8));
        return;
      }
    }

    const version = ++refs.current.loadVersion;
    const isStale = () => refs.current.loadVersion !== version;

    console.log(`[ChurchMap] Church page load (silent): ${stateAbbrev} / ${churchId} [v${version}]`);

    setFocusedState(stateAbbrev);
    setFocusedStateName(stateInfo.name);
    setChurches([]);
    setSelectedChurch(null);
    setError(null);
    refs.current.pendingTransition = null;
    setLoadingStateName("");
    overlay.setForceLoadingVisible(false);
    moveToView([stateInfo.lng, stateInfo.lat], getStateZoom(stateAbbrev));

    try {
      const data = await fetchChurches(stateAbbrev);
      if (isStale()) return;

      if (data.churches && data.churches.length > 0) {
        const filtered = filterToStatePolygon(data.churches, stateAbbrev, refs.current.stateFeatures);
        setChurches(filtered);

        const church = filtered.find((c) => churchMatchesRouteSegment(c, churchId, stateAbbrev));
        if (church) {
          setSelectedChurch(church);
          moveToChurchView(church.lng, church.lat, Math.max(ds.zoom, 8));
        }

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
                const fc = ff.find((c) => churchMatchesRouteSegment(c, churchId, stateAbbrev));
                if (fc) {
                  setSelectedChurch(fc);
                  moveToChurchView(fc.lng, fc.lat, Math.max(ds.zoom, 8));
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
          }
        }
        return;
      }

      setPopulating(true);
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
        setChurches(freshFiltered);
        const church = freshFiltered.find((c) => churchMatchesRouteSegment(c, churchId, stateAbbrev));
        if (church) {
          setSelectedChurch(church);
          moveToChurchView(church.lng, church.lat, Math.max(ds.zoom, 8));
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
        if (!isStale()) setPopulating(false);
      }
    } catch (err) {
      if (isStale()) return;
      console.error(`Failed to load churches for ${stateAbbrev}:`, err);
      setError(
        `Failed to load churches for ${stateInfo.name}. This might be due to API rate limits -- try again in a moment.`
      );
      setLoading(false);
      setPopulating(false);
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

  // ── Apply pending state transition once loading overlay fully dismisses ──
  useEffect(() => {
    if (!overlay.forceLoadingVisible && !loading && !populating && refs.current.pendingTransition) {
      const p = refs.current.pendingTransition;
      refs.current.pendingTransition = null;
      setFocusedState(p.abbrev);
      setFocusedStateName(p.name);
      setChurches(p.churches);
      setLoadingStateName("");
      moveToView([p.lng, p.lat], getStateZoom(p.abbrev));
    }
  }, [overlay.forceLoadingVisible, loading, populating]);

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

    fetch(COUNTIES_GEO_URL)
      .then((res) => res.json())
      .then((topology: any) => {
        if (!topology?.objects?.counties) {
          console.warn("[ChurchMap] Invalid counties topology");
          return;
        }
        const geojson = feature(topology, topology.objects.counties) as any;
        const countyMap = new Map<string, any>();
        if (geojson?.features) {
          for (const f of geojson.features) {
            const fips = String(f.id ?? "").padStart(5, "0");
            if (fips.length === 5) countyMap.set(fips, f);
          }
        }
        setCountyFeatures(countyMap);
        console.log(`[ChurchMap] Loaded county features for ${countyMap.size} counties`);
      })
      .catch((err) =>
        console.warn("[ChurchMap] Failed to load county topojson:", err)
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
      const valid = new Set([
        "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA", "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD", "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ", "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC", "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY",
      ]);
      if (valid.has(abbrev)) {
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
      const preloaded = refs.current.preloadedChurch;
      refs.current.preloadedChurch = null;
      if (preloaded && preloaded.state === routeStateAbbrev) {
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
      if (!selectedChurch || selectedChurch.id !== church.id) {
        setSelectedChurch(church);
        moveToChurchView(church.lng, church.lat, Math.max(ds.zoom, 8));
      }
      // Redirect legacy URL to canonical (numeric segment)
      if (routeLegacyChurchId && focusedState) {
        navigateToChurch(focusedState, getChurchUrlSegment(church, focusedState), { replace: true });
      }
    }
  }, [routeChurchShortId, routeLegacyChurchId, routeChurchKey, churches, selectedChurch?.id, focusedState, navigateToChurch]);

  // Re-center map when isMobile changes while viewing a church
  const prevIsMobileRef = useRef(isMobile);
  useEffect(() => {
    if (prevIsMobileRef.current === isMobile) return;
    prevIsMobileRef.current = isMobile;
    if (!selectedChurch) return;
    if (isMobile) {
      setCenter([selectedChurch.lng, selectedChurch.lat - getMobileLatOffset(zoom)]);
    } else {
      setCenter([selectedChurch.lng, selectedChurch.lat]);
    }
  }, [isMobile]);

  // Update page title
  useEffect(() => {
    if (selectedChurch) {
      document.title = `${selectedChurch.name} -- ${selectedChurch.city || selectedChurch.state} | Here's My Church`;
    } else if (focusedState && focusedStateName) {
      document.title = `Churches in ${focusedStateName} | Here's My Church`;
    } else {
      document.title = "Here's My Church";
    }
  }, [selectedChurch, focusedState, focusedStateName]);

  // Inject or remove JSON-LD for selected church (SEO / rich results)
  const CHURCH_JSONLD_ID = "church-jsonld";
  useEffect(() => {
    let el = document.getElementById(CHURCH_JSONLD_ID) as HTMLScriptElement | null;
    if (selectedChurch && focusedState) {
      const url = `https://heresmychurch.com/state/${focusedState}/${getChurchUrlSegment(selectedChurch, focusedState)}`;
      const address =
        selectedChurch.address
          ? { "@type": "PostalAddress" as const, streetAddress: selectedChurch.address, addressLocality: selectedChurch.city || undefined, addressRegion: selectedChurch.state || undefined }
          : { "@type": "PostalAddress" as const, addressLocality: selectedChurch.city || undefined, addressRegion: selectedChurch.state || undefined };
      const payload: Record<string, unknown> = {
        "@context": "https://schema.org",
        "@type": "Place",
        name: selectedChurch.name,
        address,
        geo: {
          "@type": "GeoCoordinates",
          latitude: selectedChurch.lat,
          longitude: selectedChurch.lng,
        },
        url,
      };
      if (selectedChurch.website) payload.sameAs = selectedChurch.website;
      const json = JSON.stringify(payload);
      if (el) {
        el.textContent = json;
      } else {
        el = document.createElement("script");
        el.id = CHURCH_JSONLD_ID;
        el.type = "application/ld+json";
        el.textContent = json;
        document.head.appendChild(el);
      }
    } else {
      el?.remove();
    }
  }, [selectedChurch, focusedState]);

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

  const clearTransition = () => dd({ type: "SET_TRANSITIONING", value: false });
  const handleResetView = () => navigateToNational();
  // In state view, don't allow zooming out past the initial state zoom.
  const minZoom = focusedState ? getStateZoom(focusedState) : 1;
  const handleZoomIn = () => setZoom((z) => Math.min(z * 1.5, 120));
  const handleZoomOut = () => setZoom((z) => Math.max(z / 1.5, minZoom));
  const preloadChurch = (church: Church) => { refs.current.preloadedChurch = church; };

  const handleChurchDotClick = (church: Church) => {
    ui.setHoveredChurch(null);
    if (focusedState) {
      navigateToChurch(focusedState, getChurchUrlSegment(church, focusedState));
    }
  };

  return {
    // Map state (was in useMapView, now in data reducer)
    zoom, setZoom,
    minZoom,
    center, setCenter,
    isTransitioning: ds.isTransitioning,
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
    hoveredState: ui.hoveredState,
    setHoveredState: ui.setHoveredState,
    hoveredCounty: ui.hoveredCounty,
    setHoveredCounty: ui.setHoveredCounty,
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
    // Actions
    loadStateData,
    refetchCurrentStateChurches,
    preloadChurch,
    handlePopulate,
    handleResetView,
    handleZoomIn,
    handleZoomOut,
    handleMouseMove: ui.handleMouseMove,
    handleChurchDotClick,
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

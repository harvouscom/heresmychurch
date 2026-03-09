import React, { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { geoContains } from "d3-geo";
import { feature } from "topojson-client";
import {
  sizeCategories,
  getSizeCategory,
  DENOMINATION_GROUPS,
  getDenominationGroup,
  estimateBilingualProbability,
} from "./church-data";
import type { Church, StateInfo } from "./church-data";
import {
  fetchStates,
  fetchChurches,
  populateState,
  fetchStatePopulations,
} from "./api";
import {
  WAITING_SAYINGS,
  GEO_URL,
  FIPS_TO_STATE,
  filterToStateBounds,
  getStateZoom,
} from "./map-constants";

interface UseChurchMapDataArgs {
  routeStateAbbrev: string | null;
  routeChurchId: string | null;
  navigateToState: (abbrev: string) => void;
  navigateToChurch: (stateAbbrev: string, churchId: string) => void;
  navigateToNational: () => void;
}

export function useChurchMapData({
  routeStateAbbrev,
  routeChurchId,
  navigateToState,
  navigateToChurch,
  navigateToNational,
}: UseChurchMapDataArgs) {
  // Map state
  const [zoom, setZoom] = useState(1);
  const [center, setCenter] = useState<[number, number]>([-96, 38]);

  // Data state
  const [states, setStates] = useState<StateInfo[]>([]);
  const [totalChurches, setTotalChurches] = useState(0);
  const [focusedState, setFocusedState] = useState<string | null>(null);
  const [focusedStateName, setFocusedStateName] = useState<string>("");
  const [churches, setChurches] = useState<Church[]>([]);
  const [loading, setLoading] = useState(false);
  const [populating, setPopulating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Refs to avoid stale closures in async loadStateData
  const focusedStateRef = useRef<string | null>(null);
  const loadVersionRef = useRef(0);
  useEffect(() => { focusedStateRef.current = focusedState; }, [focusedState]);

  // Derived: are all states populated?
  const allStatesLoaded = useMemo(() => states.length > 0 && states.every((s) => s.isPopulated), [states]);

  // Tooltip
  const [hoveredChurch, setHoveredChurch] = useState<Church | null>(null);
  const [hoveredState, setHoveredState] = useState<string | null>(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });

  // Filters
  const [showFilterPanel, setShowFilterPanel] = useState(false);
  const [searchCollapsed, setSearchCollapsed] = useState(() => typeof window !== "undefined" && window.innerWidth < 768);
  const [activeSize, setActiveSize] = useState<Set<string>>(
    new Set(sizeCategories.map((c) => c.label))
  );
  const [activeDenominations, setActiveDenominations] = useState<Set<string>>(
    new Set(DENOMINATION_GROUPS.map((g) => g.label))
  );
  const [showSizeFilters, setShowSizeFilters] = useState(true);
  const [showDenomFilters, setShowDenomFilters] = useState(true);
  const [showLanguageFilters, setShowLanguageFilters] = useState(false);
  const [languageFilter, setLanguageFilter] = useState<string>("all");

  // Church list modal
  const [showListModal, setShowListModal] = useState(false);

  // Selected church for detail panel
  const [selectedChurch, setSelectedChurch] = useState<Church | null>(null);

  // Preloaded church
  const preloadedChurchRef = useRef<Church | null>(null);

  // Pending state transition
  const [loadingStateName, setLoadingStateName] = useState("");
  const pendingTransitionRef = useRef<{
    abbrev: string;
    name: string;
    lat: number;
    lng: number;
    churches: Church[];
  } | null>(null);

  // Add church form
  const [showAddChurchFromSummary, setShowAddChurchFromSummary] = useState(false);

  // Summary dropdown
  const [showSummary, setShowSummary] = useState(false);
  const summaryRef = useRef<HTMLDivElement>(null);
  const [showLegend, setShowLegend] = useState(false);

  // State populations
  const [statePopulations, setStatePopulations] = useState<Record<string, number>>({});

  // Point-in-polygon filtering: actual state boundary from topojson
  const stateFeaturesRef = useRef<Map<string, any>>(new Map());

  // Bible saying cycling for loading states
  const MIN_VERSES = 3;
  const [sayingIndex, setSayingIndex] = useState<number | null>(null);
  const [forceLoadingVisible, setForceLoadingVisible] = useState(false);
  const versesShownRef = useRef(0);
  const loadingRef = useRef(false);
  const populatingRef = useRef(false);

  useEffect(() => { loadingRef.current = loading; }, [loading]);
  useEffect(() => { populatingRef.current = populating; }, [populating]);

  // Smooth zoom
  const moveToView = useCallback((targetCenter: [number, number], targetZoom: number) => {
    setCenter(targetCenter);
    setZoom(targetZoom);
  }, []);

  // Filter churches using the actual state polygon
  const filterToStatePolygon = useCallback((rawChurches: Church[], stateAbbrev: string): Church[] => {
    const feat = stateFeaturesRef.current.get(stateAbbrev.toUpperCase());
    if (feat) {
      return rawChurches.filter(ch => geoContains(feat, [ch.lng, ch.lat]));
    }
    return filterToStateBounds(rawChurches, stateAbbrev) as Church[];
  }, []);

  // Close summary dropdown when clicking outside
  useEffect(() => {
    if (!showSummary) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (summaryRef.current && !summaryRef.current.contains(e.target as Node)) {
        setShowSummary(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showSummary]);

  // Close summary when navigating
  useEffect(() => {
    setShowSummary(false);
  }, [focusedState]);

  // When loading starts, reset verse counter and force visibility
  useEffect(() => {
    if (loading || populating) {
      versesShownRef.current = 0;
      setForceLoadingVisible(true);
      setSayingIndex(null);
    }
  }, [loading, populating]);

  // Cycle verses while loading overlay is showing
  useEffect(() => {
    const isActive = loading || populating || forceLoadingVisible;
    if (!isActive) {
      setSayingIndex(null);
      return;
    }

    const showTimer = setTimeout(() => {
      const first = Math.floor(Math.random() * WAITING_SAYINGS.length);
      setSayingIndex(first);
      versesShownRef.current = 1;
    }, 1000);

    const cycleTimer = setInterval(() => {
      setSayingIndex((prev) => {
        let next;
        do {
          next = Math.floor(Math.random() * WAITING_SAYINGS.length);
        } while (next === prev && WAITING_SAYINGS.length > 1);
        return next;
      });
      versesShownRef.current += 1;
      if (!loadingRef.current && !populatingRef.current && versesShownRef.current >= MIN_VERSES) {
        setForceLoadingVisible(false);
      }
    }, 3500);

    return () => {
      clearTimeout(showTimer);
      clearInterval(cycleTimer);
    };
  }, [loading, populating, forceLoadingVisible]);

  // Dismiss once data finishes and enough verses shown
  useEffect(() => {
    if (!loading && !populating && forceLoadingVisible && versesShownRef.current >= MIN_VERSES) {
      setForceLoadingVisible(false);
    }
  }, [loading, populating, forceLoadingVisible]);

  // Apply pending state transition once loading overlay fully dismisses
  useEffect(() => {
    if (!forceLoadingVisible && !loading && !populating && pendingTransitionRef.current) {
      const p = pendingTransitionRef.current;
      pendingTransitionRef.current = null;
      setFocusedState(p.abbrev);
      setFocusedStateName(p.name);
      setChurches(p.churches);
      setLoadingStateName("");
      moveToView([p.lng, p.lat], getStateZoom(p.abbrev));
    }
  }, [forceLoadingVisible, loading, populating, moveToView]);

  // Sync local state churchCount with actual polygon-filtered count
  useEffect(() => {
    if (focusedState && churches.length > 0) {
      setStates(prev => {
        const existing = prev.find(s => s.abbrev === focusedState);
        if (existing && existing.churchCount !== churches.length) {
          const delta = churches.length - existing.churchCount;
          setTotalChurches(t => t + delta);
          return prev.map(s =>
            s.abbrev === focusedState ? { ...s, churchCount: churches.length } : s
          );
        }
        return prev;
      });
    }
  }, [focusedState, churches.length]);

  // Load states and populations on mount
  useEffect(() => {
    console.log("[ChurchMap] Fetching states on mount...");
    fetchStates()
      .then((data) => {
        console.log(`[ChurchMap] Loaded ${data.states.length} states, ${data.totalChurches} total churches`);
        setStates(data.states);
        setTotalChurches(data.totalChurches);
      })
      .catch((err) => {
        console.error("[ChurchMap] Failed to load states:", err);
        setError("Failed to load state data. Please refresh the page.");
      });

    fetch(GEO_URL)
      .then(res => res.json())
      .then((topology: any) => {
        const geojson = feature(topology, topology.objects.states) as any;
        const featureMap = new Map<string, any>();
        for (const f of geojson.features) {
          const abbrev = FIPS_TO_STATE[String(f.id).padStart(2, "0")];
          if (abbrev) featureMap.set(abbrev, f);
        }
        stateFeaturesRef.current = featureMap;
        console.log(`[ChurchMap] Loaded topojson features for ${featureMap.size} states`);
      })
      .catch(err => console.warn("[ChurchMap] Failed to load topojson for polygon filtering:", err));

    fetchStatePopulations()
      .then((data) => {
        setStatePopulations(data.populations);
        console.log(`[ChurchMap] Loaded populations for ${Object.keys(data.populations).length} states (source: ${data.source})`);
      })
      .catch((err) => {
        console.warn("[ChurchMap] Failed to load state populations:", err);
      });
  }, []);

  // Filter churches
  const filteredChurches = useMemo(() => {
    return churches.filter((church) => {
      const sizeCat = getSizeCategory(church.attendance);
      const denomGroup = getDenominationGroup(church.denomination);
      if (!activeSize.has(sizeCat.label) || !activeDenominations.has(denomGroup)) return false;

      if (languageFilter !== "all") {
        const bilingual = estimateBilingualProbability(church);
        if (languageFilter === "bilingual") {
          const hasMultipleLanguages = church.languages && church.languages.length >= 2;
          return hasMultipleLanguages || bilingual.probability >= 0.15;
        } else {
          const hasConfirmed = church.languages?.includes(languageFilter);
          if (hasConfirmed) return true;
          return bilingual.detectedLanguage === languageFilter && bilingual.probability >= 0.25;
        }
      }

      return true;
    });
  }, [churches, activeSize, activeDenominations, languageFilter]);

  // Language/bilingual stats for filter panel
  const languageStats = useMemo(() => {
    let bilingualCount = 0;
    const langCounts: Record<string, number> = {};
    const detectedLangs: Record<string, number> = {};

    churches.forEach((ch) => {
      const bilingual = estimateBilingualProbability(ch);
      const hasMultipleLanguages = ch.languages && ch.languages.length >= 2;
      if (hasMultipleLanguages || bilingual.probability >= 0.15) {
        bilingualCount++;
      }
      if (ch.languages) {
        ch.languages.forEach((lang) => {
          langCounts[lang] = (langCounts[lang] || 0) + 1;
        });
      }
      if (bilingual.detectedLanguage && bilingual.probability >= 0.25) {
        detectedLangs[bilingual.detectedLanguage] = (detectedLangs[bilingual.detectedLanguage] || 0) + 1;
      }
    });

    const mergedLangs: Record<string, { confirmed: number; estimated: number }> = {};
    const allLangs = new Set([...Object.keys(langCounts), ...Object.keys(detectedLangs)]);
    allLangs.forEach((lang) => {
      if (lang === "English" || lang === "Bilingual" || lang === "Multilingual") return;
      mergedLangs[lang] = {
        confirmed: langCounts[lang] || 0,
        estimated: detectedLangs[lang] || 0,
      };
    });

    const sortedLangs = Object.entries(mergedLangs)
      .map(([lang, counts]) => ({ lang, total: counts.confirmed + counts.estimated, ...counts }))
      .filter((l) => l.total > 0)
      .sort((a, b) => b.total - a.total);

    return { bilingualCount, sortedLangs };
  }, [churches]);

  // Denomination counts
  const denomCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    churches.forEach((ch) => {
      const group = getDenominationGroup(ch.denomination);
      counts[group] = (counts[group] || 0) + 1;
    });
    return counts;
  }, [churches]);

  // Size category counts
  const sizeCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    filteredChurches.forEach((ch) => {
      const cat = getSizeCategory(ch.attendance);
      counts[cat.label] = (counts[cat.label] || 0) + 1;
    });
    return counts;
  }, [filteredChurches]);

  // Summary stats
  const summaryStats = useMemo(() => {
    if (focusedState && churches.length > 0) {
      return computeStateSummary(churches, denomCounts, sizeCounts);
    } else {
      return computeNationalSummary(states, statePopulations);
    }
  }, [focusedState, churches, states, denomCounts, sizeCounts, statePopulations]);

  // Load state data
  const loadStateData = useCallback(
    async (stateAbbrev: string) => {
      const stateInfo = states.find((s) => s.abbrev === stateAbbrev);
      if (!stateInfo) {
        console.error(`[ChurchMap] loadStateData: no stateInfo found for "${stateAbbrev}"`);
        return;
      }

      const version = ++loadVersionRef.current;
      const isStale = () => loadVersionRef.current !== version;

      console.log(`[ChurchMap] Loading state: ${stateAbbrev} (${stateInfo.name}) [v${version}]`);

      setFocusedState(null);
      setFocusedStateName("");
      setChurches([]);
      setSelectedChurch(null);
      setLoadingStateName(stateInfo.name);
      pendingTransitionRef.current = {
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
        if (isStale()) { console.log(`[ChurchMap] Discarding stale load for ${stateAbbrev} [v${version}]`); return; }

        if (data.churches && data.churches.length > 0) {
          const isTruncated = data.churches.length === 2000;
          const filtered = filterToStatePolygon(data.churches, stateAbbrev);

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
                  const freshFiltered = filterToStatePolygon(freshData.churches, stateAbbrev);
                  if (pendingTransitionRef.current?.abbrev === stateAbbrev) {
                    pendingTransitionRef.current.churches = freshFiltered;
                  }
                }
                const statesData = await fetchStates();
                if (!isStale()) {
                  setStates(statesData.states);
                  setTotalChurches(statesData.totalChurches);
                }
              } else {
                if (pendingTransitionRef.current?.abbrev === stateAbbrev) {
                  pendingTransitionRef.current.churches = filtered;
                }
              }
            } catch (refreshErr) {
              console.warn(`Background refresh failed for ${stateInfo.name}:`, refreshErr);
              if (!isStale() && pendingTransitionRef.current?.abbrev === stateAbbrev) {
                pendingTransitionRef.current.churches = filtered;
              }
            } finally {
              if (!isStale()) setPopulating(false);
            }
          } else {
            if (pendingTransitionRef.current?.abbrev === stateAbbrev) {
              pendingTransitionRef.current.churches = filtered;
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
          pendingTransitionRef.current = null;
          setLoadingStateName("");
          setForceLoadingVisible(false);
          setPopulating(false);
          return;
        }

        const freshData = await fetchChurches(stateAbbrev);
        if (isStale()) return;
        const freshFiltered = filterToStatePolygon(freshData.churches || [], stateAbbrev);
        if (pendingTransitionRef.current?.abbrev === stateAbbrev) {
          pendingTransitionRef.current.churches = freshFiltered;
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
        pendingTransitionRef.current = null;
        setLoadingStateName("");
        setForceLoadingVisible(false);
      } finally {
        if (!isStale()) {
          setLoading(false);
          setPopulating(false);
        }
      }
    },
    [states, moveToView, filterToStatePolygon]
  );

  // Silent background load
  const loadStateDataSilent = useCallback(
    async (stateAbbrev: string, preloadedChurch: Church) => {
      const stateInfo = states.find((s) => s.abbrev === stateAbbrev);
      if (!stateInfo) return;

      const version = ++loadVersionRef.current;
      const isStale = () => loadVersionRef.current !== version;

      console.log(`[ChurchMap] Instant church: "${preloadedChurch.name}" in ${stateAbbrev} [v${version}]`);

      setFocusedState(stateAbbrev);
      setFocusedStateName(stateInfo.name);
      setChurches([preloadedChurch]);
      setSelectedChurch(preloadedChurch);
      setCenter([preloadedChurch.lng, preloadedChurch.lat]);
      setZoom(8);
      setError(null);
      setLoading(false);
      setPopulating(false);
      pendingTransitionRef.current = null;
      setLoadingStateName("");
      setForceLoadingVisible(false);

      try {
        const data = await fetchChurches(stateAbbrev);
        if (isStale()) return;

        if (data.churches && data.churches.length > 0) {
          const filtered = filterToStatePolygon(data.churches, stateAbbrev);
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
                  const ff = filterToStatePolygon(fresh.churches, stateAbbrev);
                  setChurches(ff);
                  const fc = ff.find((c) => c.id === preloadedChurch.id);
                  if (fc) setSelectedChurch(fc);
                }
                const sd = await fetchStates();
                if (!isStale()) { setStates(sd.states); setTotalChurches(sd.totalChurches); }
              }
            } catch (e) { console.warn(`Background refresh failed for ${stateAbbrev}:`, e); }
          }
        } else {
          setPopulating(true);
          try {
            const result = await populateState(stateAbbrev);
            if (isStale()) return;
            if (!result.error) {
              const fresh = await fetchChurches(stateAbbrev);
              if (isStale()) return;
              const ff = filterToStatePolygon(fresh.churches || [], stateAbbrev);
              setChurches(ff);
              const fc = ff.find((c) => c.id === preloadedChurch.id);
              if (fc) setSelectedChurch(fc);
              const sd = await fetchStates();
              if (!isStale()) { setStates(sd.states); setTotalChurches(sd.totalChurches); }
            }
          } catch (e) { console.warn(`Background population failed for ${stateAbbrev}:`, e);
          } finally { if (!isStale()) setPopulating(false); }
        }
      } catch (err) {
        if (isStale()) return;
        console.warn(`[ChurchMap] Background load failed for ${stateAbbrev}:`, err);
      }
    },
    [states, filterToStatePolygon]
  );

  // Callback for search bar / modal to preload a church before navigating
  const preloadChurch = useCallback((church: Church) => {
    preloadedChurchRef.current = church;
  }, []);

  // URL Sync: Route -> Internal State
  const prevRouteStateRef = useRef<string | null>(null);
  const prevRouteChurchRef = useRef<string | null>(null);
  const statesLoadedRef = useRef(false);

  useEffect(() => {
    if (states.length > 0) statesLoadedRef.current = true;
  }, [states]);

  // Sync state route param
  useEffect(() => {
    if (!statesLoadedRef.current || states.length === 0) return;

    if (routeStateAbbrev === prevRouteStateRef.current) return;
    prevRouteStateRef.current = routeStateAbbrev;

    if (!routeStateAbbrev) {
      loadVersionRef.current++;
      setFocusedState(null);
      setFocusedStateName("");
      setChurches([]);
      setError(null);
      setLoading(false);
      setPopulating(false);
      setShowFilterPanel(false);
      setShowListModal(false);
      setSelectedChurch(null);
      setLanguageFilter("all");
      setLoadingStateName("");
      pendingTransitionRef.current = null;
      setForceLoadingVisible(false);
      moveToView([-96, 38], 1);
      return;
    }

    const stateInfo = states.find((s) => s.abbrev === routeStateAbbrev);
    if (!stateInfo) {
      console.warn(`[ChurchMap] Invalid state in URL: "${routeStateAbbrev}"`);
      navigateToNational();
      return;
    }

    if (focusedStateRef.current !== routeStateAbbrev) {
      const preloaded = preloadedChurchRef.current;
      preloadedChurchRef.current = null;
      if (preloaded && preloaded.state === routeStateAbbrev) {
        loadStateDataSilent(routeStateAbbrev, preloaded);
      } else {
        loadStateData(routeStateAbbrev);
      }
    }
  }, [routeStateAbbrev, states, loadStateData, loadStateDataSilent, moveToView, navigateToNational]);

  // Sync church route param
  useEffect(() => {
    if (routeChurchId === prevRouteChurchRef.current) return;
    prevRouteChurchRef.current = routeChurchId;

    if (!routeChurchId) {
      if (selectedChurch) {
        setSelectedChurch(null);
        if (focusedState) {
          const si = states.find((s) => s.abbrev === focusedState);
          if (si) moveToView([si.lng, si.lat], getStateZoom(focusedState));
        }
      }
      return;
    }

    if (churches.length > 0) {
      const church = churches.find((c) => c.id === routeChurchId);
      if (church) {
        setSelectedChurch(church);
        setCenter([church.lng, church.lat]);
        setZoom((z) => Math.max(z, 8));
      }
    }
  }, [routeChurchId, churches, selectedChurch, focusedState, states, moveToView]);

  // Deferred church selection
  useEffect(() => {
    if (routeChurchId && churches.length > 0 && !selectedChurch) {
      const church = churches.find((c) => c.id === routeChurchId);
      if (church) {
        setSelectedChurch(church);
        setCenter([church.lng, church.lat]);
        setZoom((z) => Math.max(z, 8));
      }
    }
  }, [churches, routeChurchId, selectedChurch]);

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

  // Populate state from Overpass API (manual retry)
  const handlePopulate = useCallback(async () => {
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
      setChurches(filterToStatePolygon(data.churches || [], focusedState));

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
  }, [focusedState, focusedStateName, filterToStatePolygon]);

  // Reset to national view
  const handleResetView = useCallback(() => {
    navigateToNational();
  }, [navigateToNational]);

  const handleZoomIn = useCallback(() => setZoom((z) => Math.min(z * 1.5, 120)), []);
  const handleZoomOut = useCallback(() => setZoom((z) => Math.max(z / 1.5, 1)), []);

  const toggleSize = useCallback((label: string) => {
    setActiveSize((prev) => {
      const next = new Set(prev);
      next.has(label) ? next.delete(label) : next.add(label);
      return next;
    });
  }, []);

  const toggleDenom = useCallback((label: string) => {
    setActiveDenominations((prev) => {
      const next = new Set(prev);
      next.has(label) ? next.delete(label) : next.add(label);
      return next;
    });
  }, []);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      setTooltipPos({ x: e.clientX, y: e.clientY });
    },
    []
  );

  const handleChurchDotClick = useCallback((church: Church) => {
    setHoveredChurch(null);
    if (focusedState) {
      navigateToChurch(focusedState, church.id);
    }
  }, [focusedState, navigateToChurch]);

  return {
    // Map state
    zoom, setZoom, center, setCenter,
    // Data
    states, totalChurches, focusedState, focusedStateName, churches,
    loading, populating, error, setError, allStatesLoaded,
    // UI state
    hoveredChurch, setHoveredChurch, hoveredState, setHoveredState, tooltipPos,
    showFilterPanel, setShowFilterPanel, searchCollapsed, setSearchCollapsed,
    activeSize, toggleSize, showSizeFilters, setShowSizeFilters,
    activeDenominations, toggleDenom, showDenomFilters, setShowDenomFilters,
    showLanguageFilters, setShowLanguageFilters, languageFilter, setLanguageFilter,
    showListModal, setShowListModal,
    selectedChurch, setSelectedChurch,
    showAddChurchFromSummary, setShowAddChurchFromSummary,
    showSummary, setShowSummary, summaryRef, showLegend, setShowLegend,
    statePopulations,
    // Loading overlay
    sayingIndex, forceLoadingVisible, loadingStateName,
    // Computed
    filteredChurches, languageStats, denomCounts, sizeCounts, summaryStats,
    // Actions
    loadStateData, preloadChurch, handlePopulate, handleResetView,
    handleZoomIn, handleZoomOut, handleMouseMove, handleChurchDotClick,
  };
}

// --- Helper: compute state-level summary stats ---
interface InterestingFact {
  icon: string;
  label: string;
  primary: string;
  secondary: string;
  abbrev?: string;
}

function computeStateSummary(
  churches: Church[],
  denomCounts: Record<string, number>,
  sizeCounts: Record<string, number>,
) {
  const totalAttendance = churches.reduce((sum, ch) => sum + ch.attendance, 0);
  const avgAttendance = Math.round(totalAttendance / churches.length);
  const topDenoms = Object.entries(denomCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6);
  const topSizes = sizeCategories.map((cat) => ({
    label: cat.label,
    color: cat.color,
    count: sizeCounts[cat.label] || 0,
  }));

  const facts: InterestingFact[] = [];

  const largest = [...churches].sort((a, b) => b.attendance - a.attendance)[0];
  if (largest) {
    facts.push({
      icon: "trending",
      label: "Largest congregation",
      primary: largest.name,
      secondary: `~${largest.attendance.toLocaleString()} weekly`,
    });
  }

  if (topDenoms.length > 0) {
    const [topDenom, topCount] = topDenoms[0];
    const pct = Math.round((topCount / churches.length) * 100);
    facts.push({
      icon: "book",
      label: "Most common denomination",
      primary: topDenom,
      secondary: `${topCount.toLocaleString()} churches (${pct}%)`,
    });
  }

  facts.push({
    icon: "chart",
    label: "Average weekly attendance",
    primary: `~${avgAttendance.toLocaleString()} per church`,
    secondary: `~${totalAttendance.toLocaleString()} total`,
  });

  const denomAttendance: Record<string, { total: number; count: number }> = {};
  for (const ch of churches) {
    const d = getDenominationGroup(ch.denomination);
    if (!denomAttendance[d]) denomAttendance[d] = { total: 0, count: 0 };
    denomAttendance[d].total += ch.attendance;
    denomAttendance[d].count += 1;
  }
  const denomAvgs = Object.entries(denomAttendance)
    .filter(([, v]) => v.count >= 5)
    .map(([d, v]) => ({ denom: d, avg: Math.round(v.total / v.count), count: v.count }))
    .sort((a, b) => b.avg - a.avg);
  if (denomAvgs.length > 0) {
    const top = denomAvgs[0];
    facts.push({
      icon: "users",
      label: "Highest-attending denomination",
      primary: top.denom,
      secondary: `~${top.avg.toLocaleString()} avg weekly across ${top.count.toLocaleString()} churches`,
    });
  }

  const cityCounts: Record<string, number> = {};
  for (const ch of churches) {
    const city = ch.city?.trim();
    if (city) cityCounts[city] = (cityCounts[city] || 0) + 1;
  }
  const topCity = Object.entries(cityCounts).sort((a, b) => b[1] - a[1])[0];
  if (topCity) {
    const pctOfState = Math.round((topCity[1] / churches.length) * 100);
    facts.push({
      icon: "mapPin",
      label: "Church capital",
      primary: topCity[0],
      secondary: `${topCity[1].toLocaleString()} churches (${pctOfState}% of state)`,
    });
  }

  return { type: "state" as const, totalAttendance, topDenoms, topSizes, interestingFacts: facts };
}

function computeNationalSummary(
  states: StateInfo[],
  statePopulations: Record<string, number>,
) {
  const populated = states.filter((s) => s.isPopulated && s.churchCount > 0);
  const unpopulated = states.length - populated.length;
  const topStates = [...populated]
    .sort((a, b) => b.churchCount - a.churchCount)
    .slice(0, 3);

  const facts: InterestingFact[] = [];

  const hasPop = Object.keys(statePopulations).length > 0;
  if (hasPop && populated.length > 0) {
    const withPerCapita = populated
      .filter((s) => statePopulations[s.abbrev] && statePopulations[s.abbrev] > 0)
      .map((s) => ({
        ...s,
        perCapita: s.churchCount / statePopulations[s.abbrev],
        peoplePer: Math.round(statePopulations[s.abbrev] / s.churchCount),
      }));
    if (withPerCapita.length > 0) {
      const densest = [...withPerCapita].sort((a, b) => b.perCapita - a.perCapita)[0];
      facts.push({
        icon: "users",
        label: "Most churches per capita",
        primary: densest.name,
        secondary: `1 per ${densest.peoplePer.toLocaleString()} people`,
        abbrev: densest.abbrev,
      });

      const sparsest = [...withPerCapita].sort((a, b) => a.perCapita - b.perCapita)[0];
      if (sparsest.abbrev !== densest.abbrev) {
        facts.push({
          icon: "building",
          label: "Fewest churches per capita",
          primary: sparsest.name,
          secondary: `1 per ${sparsest.peoplePer.toLocaleString()} people`,
          abbrev: sparsest.abbrev,
        });
      }
    }
  }

  const allLoaded = states.length > 0 && states.every((s) => s.isPopulated);
  if (!allLoaded && populated.length >= 3) {
    const smallest = [...populated].sort((a, b) => a.churchCount - b.churchCount)[0];
    if (!topStates.find((s) => s.abbrev === smallest.abbrev)) {
      facts.push({
        icon: "search",
        label: "Fewest churches so far",
        primary: smallest.name,
        secondary: `${smallest.churchCount.toLocaleString()} churches`,
        abbrev: smallest.abbrev,
      });
    }
  }

  if (hasPop && populated.length >= 2) {
    const totalChurchCount = populated.reduce((sum, s) => sum + s.churchCount, 0);
    const totalPop = populated.reduce((sum, s) => sum + (statePopulations[s.abbrev] || 0), 0);
    if (totalPop > 0) {
      const peoplePer = Math.round(totalPop / totalChurchCount);
      facts.push({
        icon: "chart",
        label: "National ratio",
        primary: `1 church per ${peoplePer.toLocaleString()} people`,
        secondary: `${totalChurchCount.toLocaleString()} churches across ${populated.length} states`,
      });
    }
  }

  return {
    type: "national" as const,
    populated: populated.length,
    unpopulated,
    topStates,
    interestingFacts: facts.slice(0, 4),
  };
}
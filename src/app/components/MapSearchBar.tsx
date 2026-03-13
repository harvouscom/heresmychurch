import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { Search, ChevronRight, MapPin, ChevronDown, Plus } from "lucide-react";
import { ThreeDotLoader } from "./ThreeDotLoader";
import { geoAlbersUsa } from "d3-geo";
import type { Church, StateInfo } from "./church-data";
import { getFallbackLocation, formatAddressWithCity } from "./church-data";
import { searchChurches } from "./api";
import type { SearchResult } from "./api";
import { getChurchUrlSegment } from "./url-utils";
import { scoreChurchMatch } from "./search-scoring";
import { StateFlag } from "./StateFlag";
import { STATE_NAMES } from "./map-constants";
import { CloseButton } from "./ui/close-button";

const VIEWPORT_ZOOM_THRESHOLD = 1.5;

interface MapSearchBarProps {
  churches: Church[];
  states: StateInfo[];
  focusedState: string | null;
  focusedStateName: string;
  navigateToChurch: (stateAbbrev: string, churchShortId: string, options?: { replace?: boolean }) => void;
  onPreloadChurch?: (church: Church) => void;
  collapsed?: boolean;
  onExpand?: () => void;
  onAddChurch?: () => void;
  /** When in national view with state filter, open Add Church for this state. */
  onAddChurchForState?: (stateAbbrev: string) => void;
  detectedState?: string | null;
  zoom?: number;
  center?: [number, number];
}

/** Max results for national (remote) search dropdown */
const MAX_RESULTS = 8;
/** Max results for state-view local search so users see more matches in-state */
const MAX_RESULTS_STATE_VIEW = 50;
/** Max results when searching with a state filter (national view, server search) */
const MAX_RESULTS_STATE_SCOPED = 100;
const DEBOUNCE_MS = 300;

export function MapSearchBar({
  churches,
  states,
  focusedState,
  focusedStateName,
  navigateToChurch,
  onPreloadChurch,
  collapsed,
  onExpand,
  onAddChurch,
  onAddChurchForState,
  detectedState,
  zoom = 1,
  center = [-96, 38],
}: MapSearchBarProps) {
  const [query, setQuery] = useState("");
  const [isFocused, setIsFocused] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [searchAllMode, setSearchAllMode] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // State filter for national view
  const [stateFilter, setStateFilter] = useState<string | null>(null);
  const [showStateDropdown, setShowStateDropdown] = useState(false);
  const stateDropdownRef = useRef<HTMLDivElement>(null);
  const detectedStateAppliedRef = useRef(false);
  const prevFocusedStateRef = useRef<string | null | undefined>(undefined);

  // Server-side search state (national view)
  const [remoteResults, setRemoteResults] = useState<SearchResult[]>([]);
  const [remoteLoading, setRemoteLoading] = useState(false);
  const [remoteSearched, setRemoteSearched] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null);
  const searchVersionRef = useRef(0);

  // Close on outside click
  useEffect(() => {
    if (!isFocused && !showStateDropdown) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsFocused(false);
        setShowStateDropdown(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [isFocused, showStateDropdown]);

  // Reset query when switching views
  useEffect(() => {
    // Skip initial mount (prevFocusedStateRef is undefined)
    if (prevFocusedStateRef.current === undefined) {
      prevFocusedStateRef.current = focusedState;
      return;
    }
    // Only reset if focusedState actually changed
    if (prevFocusedStateRef.current === focusedState) return;
    prevFocusedStateRef.current = focusedState;

    setQuery("");
    setSelectedIndex(-1);
    setRemoteResults([]);
    setRemoteSearched(false);
    setShowStateDropdown(false);
    // When returning to national view, restore detected state; otherwise clear
    if (!focusedState && detectedState) {
      setStateFilter(detectedState);
    } else {
      setStateFilter(null);
    }
  }, [focusedState, detectedState]);

  // Blur search when collapsed externally (e.g. clicking map background)
  useEffect(() => {
    if (collapsed) {
      setIsFocused(false);
      setShowStateDropdown(false);
      inputRef.current?.blur();
    }
  }, [collapsed]);

  // Reset "search all" mode when query or zoom changes so we re-apply viewport filter
  useEffect(() => {
    setSearchAllMode(false);
  }, [query, zoom]);

  // Apply detected state filter if available
  useEffect(() => {
    if (detectedState && !detectedStateAppliedRef.current) {
      setStateFilter(detectedState);
      detectedStateAppliedRef.current = true;
    }
  }, [detectedState]);

  // Populated states sorted alphabetically for the dropdown
  const populatedStates = useMemo(() => {
    return states
      .filter((s) => s.isPopulated)
      .sort((a, b) => (STATE_NAMES[a.abbrev] || a.abbrev).localeCompare(STATE_NAMES[b.abbrev] || b.abbrev));
  }, [states]);

  // Projection matching react-simple-maps (geoAlbersUsa, scale 1000) for viewport filtering
  const projection = useMemo(() => geoAlbersUsa().scale(1000), []);

  // Local search for state view (all matches, no viewport filter); ranked by name then city/address
  const localResultsRaw = useMemo(() => {
    if (!focusedState || churches.length === 0) return [];
    const q = query.toLowerCase().trim();
    if (!q) return [];
    const tokens = q.split(/\s+/).filter(Boolean);
    const matched: Church[] = [];
    for (const ch of churches) {
      const haystack = `${ch.name} ${ch.city} ${ch.denomination} ${ch.address || ""}`.toLowerCase();
      if (tokens.every((t) => haystack.includes(t))) {
        matched.push(ch);
      }
    }
    matched.sort(
      (a, b) =>
        scoreChurchMatch(q, b) - scoreChurchMatch(q, a) ||
        (a.name || "").localeCompare(b.name || "")
    );
    return matched.slice(0, MAX_RESULTS_STATE_VIEW);
  }, [query, focusedState, churches]);

  const isViewportSearchMode = zoom > VIEWPORT_ZOOM_THRESHOLD && !!focusedState;

  // Filter to churches in current viewport when zoomed in (same math as ChurchDots viewport culling)
  const churchesInView = useMemo(() => {
    if (!isViewportSearchMode || churches.length === 0) return null;
    const centerSvg = projection(center);
    if (!centerSvg) return new Set<string>();
    const halfW = (400 / zoom) * 1.5;
    const halfH = (300 / zoom) * 1.5;
    const cx = centerSvg[0];
    const cy = centerSvg[1];
    const inView = new Set<string>();
    for (const ch of churches) {
      const coords = projection([ch.lng, ch.lat]);
      if (!coords) continue;
      if (Math.abs(coords[0] - cx) < halfW && Math.abs(coords[1] - cy) < halfH) {
        inView.add(ch.id);
      }
    }
    return inView;
  }, [isViewportSearchMode, churches, center, zoom, projection]);

  const localResults = useMemo(() => {
    if (!isViewportSearchMode || searchAllMode || !churchesInView) return localResultsRaw;
    return localResultsRaw.filter((ch) => churchesInView.has(ch.id));
  }, [localResultsRaw, isViewportSearchMode, searchAllMode, churchesInView]);

  // Debounced server search for national view
  useEffect(() => {
    if (focusedState) return; // local search handles state view
    const q = query.trim();
    if (q.length < 2) {
      setRemoteResults([]);
      setRemoteSearched(false);
      setRemoteLoading(false);
      return;
    }

    setRemoteLoading(true);
    const version = ++searchVersionRef.current;

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const limit = stateFilter ? MAX_RESULTS_STATE_SCOPED : MAX_RESULTS;
        const data = await searchChurches(q, limit, stateFilter || undefined);
        if (searchVersionRef.current !== version) return;
        setRemoteResults(data.results);
        setRemoteSearched(true);
      } catch (err) {
        console.error("[MapSearchBar] Search failed:", err);
        if (searchVersionRef.current !== version) return;
        setRemoteResults([]);
        setRemoteSearched(true);
      } finally {
        if (searchVersionRef.current === version) {
          setRemoteLoading(false);
        }
      }
    }, DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, focusedState, stateFilter]);

  // Reset selected index when results change
  const resultCount = focusedState ? localResults.length : remoteResults.length;
  useEffect(() => {
    setSelectedIndex(-1);
  }, [resultCount, query]);

  const handleSelectLocal = useCallback(
    (church: Church) => {
      if (focusedState) {
        navigateToChurch(focusedState, getChurchUrlSegment(church, focusedState));
      }
      setQuery("");
      setIsFocused(false);
      inputRef.current?.blur();
    },
    [focusedState, navigateToChurch]
  );

  const handleSelectRemote = useCallback(
    (result: SearchResult) => {
      // Preload church data so the map can show it instantly without loading overlay
      if (onPreloadChurch && result.lat && result.lng) {
        onPreloadChurch({
          id: result.id,
          name: result.name,
          city: result.city,
          state: result.state,
          lat: result.lat,
          lng: result.lng,
          attendance: result.attendance,
          denomination: result.denomination,
          address: result.address || "",
        });
      }
      navigateToChurch(result.state, getChurchUrlSegment(result, result.state));
      setQuery("");
      setIsFocused(false);
      inputRef.current?.blur();
    },
    [navigateToChurch, onPreloadChurch]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const count = focusedState ? localResults.length : remoteResults.length;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, count - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, -1));
      } else if (e.key === "Enter" && selectedIndex >= 0) {
        e.preventDefault();
        if (focusedState && localResults[selectedIndex]) {
          handleSelectLocal(localResults[selectedIndex]);
        } else if (!focusedState && remoteResults[selectedIndex]) {
          handleSelectRemote(remoteResults[selectedIndex]);
        }
      } else if (e.key === "Escape") {
        setIsFocused(false);
        inputRef.current?.blur();
      }
    },
    [focusedState, localResults, remoteResults, selectedIndex, handleSelectLocal, handleSelectRemote]
  );

  const showDropdown = isFocused && query.trim().length > 0;
  const isNational = !focusedState;
  const hasPopulated = states.some((s) => s.isPopulated);
  const hasMultiplePopulated = populatedStates.length > 1;

  return (
    <div
      ref={containerRef}
      className="relative z-30 w-[min(440px,70svw)]"
    >
      {/* Collapsed state — just a search icon button */}
      {collapsed ? (
        <button
          onClick={() => {
            onExpand?.();
            setTimeout(() => inputRef.current?.focus(), 0);
          }}
          className="mx-auto flex items-center gap-2 pl-5 pr-[32px] py-3 rounded-full shadow-lg transition-all hover:shadow-xl backdrop-blur-md"
          style={{ backgroundColor: "rgba(30, 16, 64, 0.92)" }}
        >
          <Search size={17} className="text-purple-400" />
          <span className="text-white text-sm font-medium">
            {zoom > VIEWPORT_ZOOM_THRESHOLD ? "Search churches in view…" : "Search churches…"}
          </span>
        </button>
      ) : (
        <>
      {/* State filter dropdown — rendered above the results */}
      {showStateDropdown && isNational && hasMultiplePopulated && (
        <div
          ref={stateDropdownRef}
          className="mb-2 rounded-xl shadow-2xl overflow-hidden max-h-[40vh] overflow-y-auto"
          style={{ backgroundColor: "rgba(30, 16, 64, 0.97)" }}
        >
          <div className="px-3 py-2 text-[10px] font-medium text-white/30 uppercase tracking-wider border-b border-white/5">
            Filter by state
          </div>
          <button
            className={`w-full flex items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors ${
              !stateFilter ? "bg-purple-500/20 text-purple-300" : "text-white/70 hover:bg-white/5"
            }`}
            onClick={() => {
              setStateFilter(null);
              setShowStateDropdown(false);
            }}
          >
            <MapPin size={12} className="flex-shrink-0 opacity-50" />
            All states
          </button>
          {populatedStates.map((s) => (
            <button
              key={s.abbrev}
              className={`w-full flex items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors ${
                stateFilter === s.abbrev ? "bg-purple-500/20 text-purple-300" : "text-white/70 hover:bg-white/5"
              }`}
              onClick={() => {
                setStateFilter(s.abbrev);
                setShowStateDropdown(false);
                inputRef.current?.focus();
              }}
            >
              <StateFlag abbrev={s.abbrev} size="sm" />
              <span className="w-5 text-[10px] text-white/30 font-mono flex-shrink-0">{s.abbrev}</span>
              {STATE_NAMES[s.abbrev] || s.abbrev}
            </button>
          ))}
        </div>
      )}

      {/* Results dropdown — rendered above the input */}
      {showDropdown && !showStateDropdown && (
        <div
          className="mb-2 rounded-xl shadow-2xl overflow-hidden max-h-[50vh] overflow-y-auto"
          style={{ backgroundColor: "rgba(30, 16, 64, 0.97)" }}
        >
          {/* State view: local results */}
          {focusedState && (
            <>
              {localResults.length === 0 ? (
                <div className="px-4 py-4 text-center">
                  <p className="text-xs text-white/40">
                    {isViewportSearchMode && !searchAllMode && localResultsRaw.length > 0
                      ? "No churches in view for \u201c" + query + "\u201c"
                      : `No churches found for \u201c${query}\u201d`}
                  </p>
                  {isViewportSearchMode && !searchAllMode && localResultsRaw.length > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        setSearchAllMode(true);
                        setSelectedIndex(-1);
                      }}
                      className="mt-2.5 inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-purple-500/20 text-purple-300 text-xs font-medium hover:bg-purple-500/30 transition-colors"
                    >
                      {focusedState && <StateFlag abbrev={focusedState} size="sm" />}
                      <MapPin size={12} />
                      Search all of {focusedStateName}
                    </button>
                  )}
                  {onAddChurch && localResultsRaw.length === 0 && (
                    <button
                      onClick={() => {
                        setQuery("");
                        setIsFocused(false);
                        onAddChurch();
                      }}
                      className="mt-2.5 inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-purple-500/20 text-purple-300 text-xs font-medium hover:bg-purple-500/30 transition-colors"
                    >
                      <Plus size={13} />
                      Add your church
                    </button>
                  )}
                </div>
              ) : (
                <div className="py-1">
                  {localResults.map((ch, i) => (
                    <button
                      key={ch.id}
                      className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                        i === selectedIndex ? "bg-white/10" : "hover:bg-white/5"
                      }`}
                      onMouseEnter={() => setSelectedIndex(i)}
                      onClick={() => handleSelectLocal(ch)}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-white font-medium truncate">
                          {ch.name}
                        </div>
                        {(ch.address || ch.city || getFallbackLocation(ch)) && (
                          <div className="text-xs text-white/40 truncate">
                            {formatAddressWithCity(ch.address, ch.city) || getFallbackLocation(ch)}
                          </div>
                        )}
                      </div>
                      <ChevronRight size={14} className="text-white/20 flex-shrink-0" />
                    </button>
                  ))}
                  {localResults.length >= MAX_RESULTS_STATE_VIEW && (
                    <div className="px-4 py-2 text-xs text-white/30 text-center border-t border-white/5">
                      Keep typing to narrow results…
                    </div>
                  )}
                  {isViewportSearchMode && !searchAllMode && focusedState && (
                    <button
                      type="button"
                      onClick={() => {
                        setSearchAllMode(true);
                        setSelectedIndex(-1);
                      }}
                      className="w-full flex items-center gap-2 px-4 py-2.5 text-left text-xs text-purple-300 hover:bg-white/5 border-t border-white/5 transition-colors"
                    >
                      {focusedState && <StateFlag abbrev={focusedState} size="sm" />}
                      <MapPin size={12} className="flex-shrink-0 opacity-70" />
                      Search all of {focusedStateName}
                    </button>
                  )}
                  {onAddChurch && (
                    <button
                      type="button"
                      onClick={() => {
                        setQuery("");
                        setIsFocused(false);
                        onAddChurch();
                      }}
                      className="w-full flex items-center gap-2 px-4 py-2.5 text-left text-xs text-purple-300 hover:bg-white/5 border-t border-white/5 transition-colors"
                    >
                      <Plus size={12} className="flex-shrink-0 opacity-70" />
                      Add your church
                    </button>
                  )}
                </div>
              )}
            </>
          )}

          {/* National view: remote results */}
          {isNational && (
            <>
              {remoteLoading && !remoteSearched ? (
                <div className="px-4 py-3 flex items-center justify-center gap-2 text-white/40">
                  <ThreeDotLoader size={14} />
                  <span className="text-xs">Searching…</span>
                </div>
              ) : remoteSearched && remoteResults.length === 0 ? (
                <div className="px-4 py-4 text-center">
                  <p className="text-xs text-white/40">
                    {!hasPopulated
                      ? "Explore a state first to enable search"
                      : <>No churches found for &ldquo;{query}&rdquo;</>}
                  </p>
                  {hasPopulated && (onAddChurch || (stateFilter && onAddChurchForState)) && (
                    <button
                      onClick={() => {
                        setQuery("");
                        setIsFocused(false);
                        if (stateFilter && onAddChurchForState) onAddChurchForState(stateFilter);
                        else onAddChurch?.();
                      }}
                      className="mt-2.5 inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-purple-500/20 text-purple-300 text-xs font-medium hover:bg-purple-500/30 transition-colors"
                    >
                      <Plus size={13} />
                      Add your church
                    </button>
                  )}
                </div>
              ) : remoteResults.length > 0 ? (
                <div className="py-1">
                  {remoteResults.map((r, i) => (
                    <button
                      key={`${r.state}-${r.id}`}
                      className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                        i === selectedIndex ? "bg-white/10" : "hover:bg-white/5"
                      }`}
                      onMouseEnter={() => setSelectedIndex(i)}
                      onClick={() => handleSelectRemote(r)}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-white font-medium truncate">
                          {r.name}
                        </div>
                        {(r.address || r.city || r.state || getFallbackLocation(r)) && (
                          <div className="text-xs text-white/40 truncate">
                            {formatAddressWithCity(r.address, r.city) || (STATE_NAMES[r.state] || r.state) || getFallbackLocation(r)}
                          </div>
                        )}
                      </div>
                      <ChevronRight size={14} className="text-white/20 flex-shrink-0" />
                    </button>
                  ))}
                  {remoteResults.length >= (stateFilter ? MAX_RESULTS_STATE_SCOPED : MAX_RESULTS) && (
                    <div className="px-4 py-2 text-xs text-white/30 text-center border-t border-white/5">
                      Keep typing to narrow results…
                    </div>
                  )}
                  {remoteLoading && (
                    <div className="px-4 py-1.5 flex items-center justify-center border-t border-white/5 text-purple-400/50">
                      <ThreeDotLoader size={12} />
                    </div>
                  )}
                  {hasPopulated && (onAddChurch || (stateFilter && onAddChurchForState)) && (
                    <button
                      type="button"
                      onClick={() => {
                        setQuery("");
                        setIsFocused(false);
                        if (stateFilter && onAddChurchForState) onAddChurchForState(stateFilter);
                        else onAddChurch?.();
                      }}
                      className="w-full flex items-center gap-2 px-4 py-2.5 text-left text-xs text-purple-300 hover:bg-white/5 border-t border-white/5 transition-colors"
                    >
                      <Plus size={12} className="flex-shrink-0 opacity-70" />
                      Don&apos;t see your church? Add it
                    </button>
                  )}
                </div>
              ) : null}
            </>
          )}
        </div>
      )}

      {/* Search input */}
      <div
        className={`flex items-center gap-2.5 rounded-full shadow-lg px-4 py-3 transition-all backdrop-blur-md ${
          isFocused ? "ring-2 ring-purple-500/40 shadow-xl" : ""
        }`}
        style={{ backgroundColor: "rgba(30, 16, 64, 0.92)", "--tw-inset-shadow": "inset 0 1px 0 0 rgba(255, 255, 255, 0.2), inset 0 -1px 0 0 rgba(0, 0, 0, 0.1)" } as React.CSSProperties}
      >
        {/* State filter chip — national view only */}
        {isNational && hasMultiplePopulated && (
          <button
            onClick={() => setShowStateDropdown((v) => !v)}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium flex-shrink-0 transition-colors ${
              stateFilter
                ? "bg-purple-500/30 text-purple-200 hover:bg-purple-500/40"
                : "bg-white/8 text-white/40 hover:bg-white/12 hover:text-white/60"
            }`}
          >
            {stateFilter && <StateFlag abbrev={stateFilter} size="sm" />}
            {stateFilter ? stateFilter : "State"}
            <ChevronDown size={10} className={`transition-transform ${showStateDropdown ? "rotate-180" : ""}`} />
          </button>
        )}
        <Search size={17} className="text-purple-400 flex-shrink-0" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => { setIsFocused(true); setShowStateDropdown(false); }}
          onKeyDown={handleKeyDown}
          placeholder={
            focusedState
              ? zoom > VIEWPORT_ZOOM_THRESHOLD
                ? "Search churches in view…"
                : `Search churches in ${focusedStateName}…`
              : stateFilter
              ? `Search in ${STATE_NAMES[stateFilter] || stateFilter}…`
              : "Find a church…"
          }
          className="flex-1 bg-transparent text-white text-[15px] placeholder:text-white outline-none min-w-0"
        />
        {(query || stateFilter) && (
          <CloseButton
            ariaLabel="Clear search"
            onClick={() => {
              if (query) {
                setQuery("");
                inputRef.current?.focus();
              } else {
                setStateFilter(null);
              }
            }}
          />
        )}
      </div>
        </>
      )}
    </div>
  );
}
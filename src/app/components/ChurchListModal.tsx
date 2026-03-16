import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import {
  X,
  Search,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Church as ChurchIcon,
  MapPin,
  Users,
  Filter,
  ChevronDown,
  Plus,
  Heart,
  ThumbsUp,
  ThumbsDown,
} from "lucide-react";
import type { Church } from "./church-data";
import { CloseButton } from "./ui/close-button";
import { getFallbackLocation, formatAddressWithCity } from "./church-data";
import { fetchReactionsBulk } from "./api";
import type { ReactionCounts } from "./api";
import {
  sizeCategories,
  getSizeCategory,
  DENOMINATION_GROUPS,
  getDenominationGroup,
} from "./church-data";
import { AddChurchForm } from "./AddChurchForm";
import { StateFlag } from "./StateFlag";
import { FixedSizeList as List } from "react-window";
import { matchQueryToChurch } from "./church-search-match";

type SortField = "name" | "city" | "address" | "denomination" | "attendance";
type SortDir = "asc" | "desc";
type ReactionFilter = "any" | "love" | "like" | "mixed" | "none";

function getDominantReaction(counts: ReactionCounts): "love" | "like" | "mixed" | "none" {
  const total = counts.not_for_me + counts.like + counts.love;
  if (total === 0) return "none";
  if (counts.love >= counts.like && counts.love >= counts.not_for_me) return "love";
  if (counts.like >= counts.not_for_me) return "like";
  return "mixed";
}

interface ChurchListModalProps {
  churches: Church[];
  stateName: string;
  stateAbbrev: string;
  /** When set (e.g. from county view), list is county-filtered and title shows county name. */
  countyName?: string | null;
  statePopulation?: number | null;
  onClose: () => void;
  onChurchClick?: (church: Church) => void;
  /** When user chooses to update an existing church from AddChurchForm (similar-church flow). Close list, navigate, open edit form. */
  onSelectChurchForEdit?: (church: Church) => void;
  /** After successfully adding a church from the list modal, close and navigate to that church's page. */
  onChurchAdded?: (state: string, shortId: string) => void;
}

export function ChurchListModal({
  churches,
  stateName,
  stateAbbrev,
  countyName = null,
  statePopulation,
  onClose,
  onChurchClick,
  onSelectChurchForEdit,
  onChurchAdded,
}: ChurchListModalProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [sortField, setSortField] = useState<SortField>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [selectedDenominations, setSelectedDenominations] = useState<
    Set<string>
  >(new Set(DENOMINATION_GROUPS.map((g) => g.label)));
  const [selectedSizes, setSelectedSizes] = useState<Set<string>>(
    new Set(sizeCategories.map((c) => c.label))
  );
  const [showDenomDropdown, setShowDenomDropdown] = useState(false);
  const [showSizeDropdown, setShowSizeDropdown] = useState(false);
  const [showReactionDropdown, setShowReactionDropdown] = useState(false);
  const [showAddChurch, setShowAddChurch] = useState(false);
  const [reactionCountsByChurchId, setReactionCountsByChurchId] = useState<
    Record<string, ReactionCounts>
  >({});
  const [selectedReactionFilter, setSelectedReactionFilter] =
    useState<ReactionFilter>("any");
  const listContainerRef = useRef<HTMLDivElement>(null);
  const [listHeight, setListHeight] = useState(400);

  // Fetch reaction counts for the state when modal has churches
  useEffect(() => {
    if (churches.length === 0 || !stateAbbrev) return;
    fetchReactionsBulk(stateAbbrev)
      .then((data) => setReactionCountsByChurchId(data.counts))
      .catch(() => {});
  }, [churches.length, stateAbbrev]);

  useEffect(() => {
    const el = listContainerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const h = entry.contentRect.height;
        if (h > 0) setListHeight(h);
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Compute denomination counts from the full church list
  const denomCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    churches.forEach((ch) => {
      const group = getDenominationGroup(ch.denomination);
      counts[group] = (counts[group] || 0) + 1;
    });
    return counts;
  }, [churches]);

  // Size counts
  const sizeCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    churches.forEach((ch) => {
      const cat = getSizeCategory(ch.attendance);
      counts[cat.label] = (counts[cat.label] || 0) + 1;
    });
    return counts;
  }, [churches]);

  // Reaction (dominant) counts for filter
  const reactionFilterCounts = useMemo(() => {
    const counts: Record<Exclude<ReactionFilter, "any">, number> = {
      love: 0,
      like: 0,
      mixed: 0,
      none: 0,
    };
    churches.forEach((ch) => {
      const c = reactionCountsByChurchId[ch.id] ?? {
        not_for_me: 0,
        like: 0,
        love: 0,
      };
      counts[getDominantReaction(c)]++;
    });
    return counts;
  }, [churches, reactionCountsByChurchId]);

  // State overview stats: top denominations by % and median attendance
  const stateStats = useMemo(() => {
    if (churches.length === 0) return null;
    const total = churches.length;

    // Median attendance (more representative than mean for skewed data)
    const sortedAttendance = churches
      .map((ch) => ch.attendance)
      .sort((a, b) => a - b);
    const mid = Math.floor(sortedAttendance.length / 2);
    const medianAttendance =
      sortedAttendance.length % 2 === 0
        ? Math.round((sortedAttendance[mid - 1] + sortedAttendance[mid]) / 2)
        : sortedAttendance[mid];

    // Denomination stats — exclude "Other" so percentages reflect identified churches
    const identifiedEntries = Object.entries(denomCounts).filter(
      ([label]) => label !== "Other"
    );
    const identifiedTotal = identifiedEntries.reduce((s, [, c]) => s + c, 0);
    const otherCount = denomCounts["Other"] || 0;
    const otherPct = total > 0 ? Math.round((otherCount / total) * 100) : 0;

    // Sort identified denominations by count descending, take top 5
    const sorted = identifiedEntries
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
    const topDenoms = sorted.map(([label, count]) => ({
      label,
      count,
      pct:
        identifiedTotal > 0
          ? Math.round((count / identifiedTotal) * 100)
          : 0,
    }));

    return {
      medianAttendance,
      topDenoms,
      total,
      otherPct,
      identifiedTotal,
    };
  }, [churches, denomCounts]);

  // Filter and sort
  const filteredChurches = useMemo(() => {
    const q = searchQuery.trim();

    let result = churches.filter((ch) => {
      if (q) {
        const { matched } = matchQueryToChurch(q, {
          name: ch.name,
          city: ch.city,
          denomination: ch.denomination,
          address: ch.address || "",
        });
        if (!matched) return false;
      }

      // Denomination filter
      const denomGroup = getDenominationGroup(ch.denomination);
      if (!selectedDenominations.has(denomGroup)) return false;

      // Size filter
      const sizeCat = getSizeCategory(ch.attendance);
      if (!selectedSizes.has(sizeCat.label)) return false;

      // Reaction filter
      if (selectedReactionFilter !== "any") {
        const counts =
          reactionCountsByChurchId[ch.id] ??
          ({ not_for_me: 0, like: 0, love: 0 } as ReactionCounts);
        const dominant = getDominantReaction(counts);
        if (dominant !== selectedReactionFilter) return false;
      }

      return true;
    });

    // Sort
    result.sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case "name":
          cmp = a.name.localeCompare(b.name);
          break;
        case "city":
          cmp = (a.city || "").localeCompare(b.city || "");
          break;
        case "address":
          cmp = (a.address || "").localeCompare(b.address || "");
          break;
        case "denomination":
          cmp = a.denomination.localeCompare(b.denomination);
          break;
        case "attendance":
          cmp = a.attendance - b.attendance;
          break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });

    return result;
  }, [
    churches,
    searchQuery,
    sortField,
    sortDir,
    selectedDenominations,
    selectedSizes,
    selectedReactionFilter,
    reactionCountsByChurchId,
  ]);

  const handleSort = useCallback(
    (field: SortField) => {
      if (sortField === field) {
        setSortDir((d) => (d === "asc" ? "desc" : "asc"));
      } else {
        setSortField(field);
        setSortDir("asc");
      }
    },
    [sortField]
  );

  const toggleDenom = useCallback((label: string) => {
    setSelectedDenominations((prev) => {
      const next = new Set(prev);
      next.has(label) ? next.delete(label) : next.add(label);
      return next;
    });
  }, []);

  const toggleSize = useCallback((label: string) => {
    setSelectedSizes((prev) => {
      const next = new Set(prev);
      next.has(label) ? next.delete(label) : next.add(label);
      return next;
    });
  }, []);

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field)
      return <ArrowUpDown size={12} className="text-white/20" />;
    return sortDir === "asc" ? (
      <ArrowUp size={12} className="text-purple-400" />
    ) : (
      <ArrowDown size={12} className="text-purple-400" />
    );
  };

  const allDenomsSelected =
    selectedDenominations.size === DENOMINATION_GROUPS.length;
  const allSizesSelected = selectedSizes.size === sizeCategories.length;

  const activeFilterCount =
    (allDenomsSelected ? 0 : 1) +
    (allSizesSelected ? 0 : 1) +
    (selectedReactionFilter !== "any" ? 1 : 0);

  // Format large numbers compactly (e.g. 5.1M, 733K)
  function formatPopulation(pop: number): string {
    if (pop >= 1_000_000) {
      const m = pop / 1_000_000;
      return m >= 10 ? `${Math.round(m)}M` : `${m.toFixed(1)}M`;
    }
    if (pop >= 1_000) {
      const k = pop / 1_000;
      return k >= 100 ? `${Math.round(k)}K` : `${k.toFixed(0)}K`;
    }
    return pop.toLocaleString();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ fontFamily: "'Livvic', sans-serif" }}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div
        className="relative w-[95vw] max-w-[900px] max-h-[85vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden"
        style={{ backgroundColor: "#1A0E38" }}
      >
        {/* Header */}
        <div className="px-6 pt-5 pb-4 flex-shrink-0">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div
                className="w-9 h-9 rounded-xl flex items-center justify-center"
                style={{
                  background:
                    "linear-gradient(135deg, #6B21A8 0%, #A855F7 100%)",
                }}
              >
                <ChurchIcon size={18} className="text-white" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <StateFlag abbrev={stateAbbrev} size="sm" />
                  <h2 className="text-white font-semibold text-base leading-tight">
                    Churches in {countyName
                      ? (countyName.includes("County") ? countyName : `${countyName} County`)
                      : stateName}
                  </h2>
                </div>
                <p className="text-white/40 text-xs mt-0.5">
                  {filteredChurches.length.toLocaleString()} of{" "}
                  {churches.length.toLocaleString()} churches
                </p>
              </div>
            </div>
            <CloseButton onClick={onClose} size="md" />
          </div>

          {/* State overview stats */}
          {stateStats && (
            <div className="mb-4 rounded-xl border border-white/6 bg-white/[0.03] p-3.5">
              <div className="flex flex-col sm:flex-row gap-4">
                {/* Population stat */}
                {statePopulation != null && statePopulation > 0 && (
                  <div className="flex items-center gap-3 sm:border-r sm:border-white/8 sm:pr-5 flex-shrink-0">
                    <div className="w-8 h-8 rounded-lg bg-purple-500/15 flex items-center justify-center flex-shrink-0">
                      <MapPin size={15} className="text-purple-400" />
                    </div>
                    <div>
                      <p className="text-xs text-white/35 uppercase tracking-wider leading-none">
                        Est. Population
                      </p>
                      <p className="text-lg font-semibold text-white leading-tight mt-0.5">
                        {formatPopulation(statePopulation)}
                      </p>
                    </div>
                  </div>
                )}

                {/* Attendance stats */}
                <div className="flex items-center gap-3 sm:border-r sm:border-white/8 sm:pr-5 flex-shrink-0">
                  <div className="w-8 h-8 rounded-lg bg-purple-500/15 flex items-center justify-center flex-shrink-0">
                    <Users size={15} className="text-purple-400" />
                  </div>
                  <div>
                    <p className="text-xs text-white/35 uppercase tracking-wider leading-none">
                      Median Attendance
                    </p>
                    <p className="text-lg font-semibold text-white leading-tight mt-0.5">
                      ~{stateStats.medianAttendance.toLocaleString()}
                    </p>
                  </div>
                </div>

                {/* Top denominations */}
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-white/35 uppercase tracking-wider mb-2">
                    Top Denominations
                    {stateStats.otherPct > 0 && (
                      <span className="normal-case tracking-normal text-white/20 ml-1.5">
                        · {stateStats.otherPct}% unidentified
                      </span>
                    )}
                  </p>
                  <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                    {stateStats.topDenoms.map((d) => (
                      <div
                        key={d.label}
                        className="flex items-center gap-1.5"
                      >
                        <span
                          className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                          style={{ backgroundColor: "#A855F7" }}
                        />
                        <span className="text-xs text-white/60 truncate max-w-[140px]">
                          {d.label}
                        </span>
                        <span className="text-xs font-semibold text-purple-300">
                          {d.pct}%
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Search + Filters row */}
          <div className="flex gap-2 items-center">
            {/* Search */}
            <div className="relative flex-1">
              <Search
                size={15}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30"
              />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by name, city, denomination, or address..."
                className="w-full bg-white/6 text-white text-sm rounded-xl pl-10 pr-4 py-2.5 placeholder:text-white/25 border border-white/8 focus:outline-none focus:border-purple-500/50 transition-colors"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2"
                >
                  <X size={14} className="text-white/30 hover:text-white/60" />
                </button>
              )}
            </div>

            {/* Denomination dropdown */}
            <div className="relative">
              <button
                onClick={() => {
                  setShowDenomDropdown(!showDenomDropdown);
                  setShowSizeDropdown(false);
                  setShowReactionDropdown(false);
                }}
                className={`flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-xs font-medium border transition-colors ${
                  !allDenomsSelected
                    ? "bg-purple-600/20 border-purple-500/40 text-purple-300"
                    : "bg-white/6 border-white/8 text-white/50 hover:text-white/70"
                }`}
              >
                <Filter size={13} />
                <span className="hidden sm:inline">Denomination</span>
                <ChevronDown size={13} />
              </button>

              {showDenomDropdown && (
                <div
                  className="absolute right-0 top-full mt-2 w-64 rounded-xl shadow-2xl border border-white/10 p-3 z-50 max-h-[50vh] overflow-y-auto"
                  style={{ backgroundColor: "#231450" }}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-white/60 uppercase tracking-wider">
                      Denomination
                    </span>
                    <button
                      onClick={() =>
                        setSelectedDenominations(
                          allDenomsSelected
                            ? new Set()
                            : new Set(
                                DENOMINATION_GROUPS.map((g) => g.label)
                              )
                        )
                      }
                      className="text-xs text-purple-400 hover:text-purple-300"
                    >
                      {allDenomsSelected ? "Clear all" : "Select all"}
                    </button>
                  </div>
                  {DENOMINATION_GROUPS.map((group) => {
                    const count = denomCounts[group.label] || 0;
                    return (
                      <label
                        key={group.label}
                        className="flex items-center justify-between py-1.5 px-2 rounded-lg cursor-pointer hover:bg-white/5"
                      >
                        <div className="flex items-center gap-2.5">
                          <input
                            type="checkbox"
                            checked={selectedDenominations.has(group.label)}
                            onChange={() => toggleDenom(group.label)}
                            className="accent-purple-500 w-3.5 h-3.5"
                          />
                          <span className="text-xs text-white/70">
                            {group.label}
                          </span>
                        </div>
                        <span className="text-xs text-white/25">{count}</span>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Size dropdown */}
            <div className="relative">
              <button
                onClick={() => {
                  setShowSizeDropdown(!showSizeDropdown);
                  setShowDenomDropdown(false);
                  setShowReactionDropdown(false);
                }}
                className={`flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-xs font-medium border transition-colors ${
                  !allSizesSelected
                    ? "bg-purple-600/20 border-purple-500/40 text-purple-300"
                    : "bg-white/6 border-white/8 text-white/50 hover:text-white/70"
                }`}
              >
                <Users size={13} />
                <span className="hidden sm:inline">Size</span>
                <ChevronDown size={13} />
              </button>

              {showSizeDropdown && (
                <div
                  className="absolute right-0 top-full mt-2 w-56 rounded-xl shadow-2xl border border-white/10 p-3 z-50"
                  style={{ backgroundColor: "#231450" }}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-white/60 uppercase tracking-wider">
                      Attendance
                    </span>
                    <button
                      onClick={() =>
                        setSelectedSizes(
                          allSizesSelected
                            ? new Set()
                            : new Set(sizeCategories.map((c) => c.label))
                        )
                      }
                      className="text-xs text-purple-400 hover:text-purple-300"
                    >
                      {allSizesSelected ? "Clear all" : "Select all"}
                    </button>
                  </div>
                  {sizeCategories.map((cat) => {
                    const count = sizeCounts[cat.label] || 0;
                    return (
                      <label
                        key={cat.label}
                        className="flex items-center justify-between py-1.5 px-2 rounded-lg cursor-pointer hover:bg-white/5"
                      >
                        <div className="flex items-center gap-2.5">
                          <input
                            type="checkbox"
                            checked={selectedSizes.has(cat.label)}
                            onChange={() => toggleSize(cat.label)}
                            className="accent-purple-500 w-3.5 h-3.5"
                          />
                          <div
                            className="rounded-full"
                            style={{
                              width: Math.max(cat.radius * 1.4, 6),
                              height: Math.max(cat.radius * 1.4, 6),
                              backgroundColor: cat.color,
                            }}
                          />
                          <span className="text-xs text-white/70">
                            {cat.label}
                          </span>
                        </div>
                        <span className="text-xs text-white/25">{count}</span>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Community reaction dropdown */}
            <div className="relative">
              <button
                onClick={() => {
                  setShowReactionDropdown(!showReactionDropdown);
                  setShowDenomDropdown(false);
                  setShowSizeDropdown(false);
                }}
                className={`flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-xs font-medium border transition-colors ${
                  selectedReactionFilter !== "any"
                    ? "bg-purple-600/20 border-purple-500/40 text-purple-300"
                    : "bg-white/6 border-white/8 text-white/50 hover:text-white/70"
                }`}
              >
                <Heart size={13} />
                <span className="hidden sm:inline">Reaction</span>
                <ChevronDown size={13} />
              </button>

              {showReactionDropdown && (
                <div
                  className="absolute right-0 top-full mt-2 w-52 rounded-xl shadow-2xl border border-white/10 p-3 z-50"
                  style={{ backgroundColor: "#231450" }}
                >
                  <span className="text-xs font-semibold text-white/60 uppercase tracking-wider block mb-2">
                    Community reaction
                  </span>
                  {(
                    [
                      { value: "any" as const, label: "Any" },
                      {
                        value: "love" as const,
                        label: "People love it",
                        Icon: Heart,
                      },
                      {
                        value: "like" as const,
                        label: "People like it",
                        Icon: ThumbsUp,
                      },
                      { value: "mixed" as const, label: "Mixed", Icon: null },
                      {
                        value: "none" as const,
                        label: "No reactions yet",
                        Icon: null,
                      },
                    ] as const
                  ).map(({ value, label, Icon }) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => {
                        setSelectedReactionFilter(value);
                        setShowReactionDropdown(false);
                      }}
                      className="flex items-center justify-between w-full py-1.5 px-2 rounded-lg hover:bg-white/5 text-left gap-2"
                    >
                      <div className="flex items-center gap-2.5">
                        {Icon && <Icon size={14} className="text-white/50" />}
                        <span className="text-xs text-white/70">{label}</span>
                      </div>
                      {value !== "any" && (
                        <span className="text-xs text-white/25">
                          {reactionFilterCounts[value]}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Active filter tags */}
          {activeFilterCount > 0 && (
            <div className="flex items-center gap-2 mt-3 flex-wrap">
              {!allDenomsSelected && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-purple-600/20 border border-purple-500/30 text-xs text-purple-300">
                  {selectedDenominations.size} denomination
                  {selectedDenominations.size !== 1 ? "s" : ""}
                  <button
                    onClick={() =>
                      setSelectedDenominations(
                        new Set(DENOMINATION_GROUPS.map((g) => g.label))
                      )
                    }
                  >
                    <X size={11} />
                  </button>
                </span>
              )}
              {!allSizesSelected && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-purple-600/20 border border-purple-500/30 text-xs text-purple-300">
                  {selectedSizes.size} size
                  {selectedSizes.size !== 1 ? "s" : ""}
                  <button
                    onClick={() =>
                      setSelectedSizes(
                        new Set(sizeCategories.map((c) => c.label))
                      )
                    }
                  >
                    <X size={11} />
                  </button>
                </span>
              )}
              {selectedReactionFilter !== "any" && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-purple-600/20 border border-purple-500/30 text-xs text-purple-300">
                  {selectedReactionFilter === "love"
                    ? "People love it"
                    : selectedReactionFilter === "like"
                      ? "People like it"
                      : selectedReactionFilter === "mixed"
                        ? "Mixed"
                        : "No reactions yet"}
                  <button onClick={() => setSelectedReactionFilter("any")}>
                    <X size={11} />
                  </button>
                </span>
              )}
              <button
                onClick={() => {
                  setSelectedDenominations(
                    new Set(DENOMINATION_GROUPS.map((g) => g.label))
                  );
                  setSelectedSizes(
                    new Set(sizeCategories.map((c) => c.label))
                  );
                  setSelectedReactionFilter("any");
                }}
                className="text-xs text-white/30 hover:text-white/50 ml-1"
              >
                Reset all
              </button>
            </div>
          )}
        </div>

        {/* Table header */}
        <div className="flex-shrink-0 px-6 border-b border-white/6">
          <div className="grid grid-cols-[1fr_100px_1fr_140px_100px] gap-3 py-2.5">
            <button
              type="button"
              onClick={() => handleSort("name")}
              className="flex items-center gap-1.5 text-xs font-semibold text-white/40 uppercase tracking-wider hover:text-white/60 transition-colors text-left"
              style={{ boxShadow: "none" }}
            >
              Church Name <SortIcon field="name" />
            </button>
            <button
              type="button"
              onClick={() => handleSort("city")}
              className="flex items-center gap-1.5 text-xs font-semibold text-white/40 uppercase tracking-wider hover:text-white/60 transition-colors text-left"
              style={{ boxShadow: "none" }}
            >
              City <SortIcon field="city" />
            </button>
            <button
              type="button"
              onClick={() => handleSort("address")}
              className="flex items-center gap-1.5 text-xs font-semibold text-white/40 uppercase tracking-wider hover:text-white/60 transition-colors text-left"
              style={{ boxShadow: "none" }}
            >
              Address <SortIcon field="address" />
            </button>
            <button
              type="button"
              onClick={() => handleSort("denomination")}
              className="flex items-center gap-1.5 text-xs font-semibold text-white/40 uppercase tracking-wider hover:text-white/60 transition-colors text-left"
              style={{ boxShadow: "none" }}
            >
              Denomination <SortIcon field="denomination" />
            </button>
            <button
              type="button"
              onClick={() => handleSort("attendance")}
              className="flex items-center gap-1.5 text-xs font-semibold text-white/40 uppercase tracking-wider hover:text-white/60 transition-colors text-right justify-end"
              style={{ boxShadow: "none" }}
            >
              Attendance <SortIcon field="attendance" />
            </button>
          </div>
        </div>

        {/* Church list */}
        <div className="flex-1 overflow-hidden min-h-0" ref={listContainerRef}>
          {filteredChurches.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Search size={32} className="text-white/15 mb-3" />
              <p className="text-white/40 text-sm">No churches found</p>
              <p className="text-white/20 text-xs mt-1">
                Try adjusting your search or filters
              </p>
            </div>
          ) : (
            <List
              height={listHeight}
              itemCount={filteredChurches.length}
              itemSize={64}
              width="100%"
              overscanCount={10}
            >
              {({ index, style }) => {
                const church = filteredChurches[index];
                const cat = getSizeCategory(church.attendance);
                return (
                  <div style={style}>
                    <button
                      key={church.id}
                      onClick={() => onChurchClick?.(church)}
                      className={`w-full text-left grid grid-cols-[1fr_100px_1fr_140px_100px] gap-3 px-6 py-3 transition-colors hover:bg-white/5 h-full ${
                        index !== filteredChurches.length - 1
                          ? "border-b border-white/4"
                          : ""
                      }`}
                    >
                      {/* Name */}
                      <div className="min-w-0">
                        <div className="text-sm text-white font-medium truncate">
                          {church.name}
                        </div>
                      </div>

                      {/* City */}
                      <div className="text-xs text-white/50 self-center truncate">
                        {church.city || "\u2014"}
                      </div>

                      {/* Address */}
                      <div className="text-xs text-white/50 self-center truncate">
                        {formatAddressWithCity(church.address, church.city) || getFallbackLocation(church) || ""}
                      </div>

                      {/* Denomination */}
                      <div className="self-center">
                        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-white/5 text-xs text-white/50 max-w-full">
                          <span
                            className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                            style={{ backgroundColor: "#A855F7" }}
                          />
                          <span className="truncate">{church.denomination === "Other" || church.denomination === "Unknown" ? "Unspecified" : church.denomination}</span>
                        </span>
                      </div>

                      {/* Reaction + Attendance */}
                      <div className="flex items-center justify-end gap-2 self-center">
                        {(() => {
                          const counts =
                            reactionCountsByChurchId[church.id] ??
                            ({ not_for_me: 0, like: 0, love: 0 } as ReactionCounts);
                          const dominant = getDominantReaction(counts);
                          return dominant === "love" ? (
                            <Heart size={12} className="text-pink-400/80 flex-shrink-0" />
                          ) : dominant === "like" ? (
                            <ThumbsUp size={12} className="text-green-400/80 flex-shrink-0" />
                          ) : dominant === "mixed" ? (
                            <ThumbsDown size={12} className="text-white/30 flex-shrink-0" />
                          ) : null;
                        })()}
                        <span className="text-sm text-white/70 tabular-nums">
                          {church.attendance.toLocaleString()}
                        </span>
                        <div
                          className="rounded-full flex-shrink-0"
                          style={{
                            width: Math.max(cat.radius * 1.3, 6),
                            height: Math.max(cat.radius * 1.3, 6),
                            backgroundColor: cat.color,
                          }}
                        />
                      </div>
                    </button>
                  </div>
                );
              }}
            </List>
          )}
        </div>

        {/* Footer */}
        <div className="flex-shrink-0 px-6 py-3 border-t border-white/6 flex items-center justify-between">
          <span className="text-xs text-white/25">
            Showing {filteredChurches.length.toLocaleString()} of{" "}
            {churches.length.toLocaleString()}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowAddChurch(true)}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-medium text-purple-300 bg-purple-600/20 border border-purple-500/30 hover:bg-purple-600/30 transition-colors"
            >
              <Plus size={13} />
              Add a Church
            </button>
            <button
              onClick={onClose}
              className="px-4 py-1.5 rounded-lg text-xs text-white/50 hover:text-white/70 hover:bg-white/5 transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>

      {/* Add church modal */}
      {showAddChurch && (
        <AddChurchForm
          stateAbbrev={stateAbbrev}
          stateName={stateName}
          onClose={() => setShowAddChurch(false)}
          churches={churches}
          onSelectChurch={(church) => {
            setShowAddChurch(false);
            onSelectChurchForEdit?.(church);
          }}
          onChurchAdded={(state, shortId) => {
            setShowAddChurch(false);
            onChurchAdded?.(state, shortId);
          }}
        />
      )}
    </div>
  );
}
import {
  X,
  ChevronUp,
  ChevronDown,
  Languages,
} from "lucide-react";
import {
  sizeCategories,
  DENOMINATION_GROUPS,
} from "./church-data";

interface FilterPanelProps {
  // Size
  activeSize: Set<string>;
  toggleSize: (label: string) => void;
  showSizeFilters: boolean;
  setShowSizeFilters: (v: boolean) => void;
  // Denomination
  activeDenominations: Set<string>;
  toggleDenom: (label: string) => void;
  showDenomFilters: boolean;
  setShowDenomFilters: (v: boolean) => void;
  denomCounts: Record<string, number>;
  // Language
  languageFilter: string;
  setLanguageFilter: (v: string) => void;
  showLanguageFilters: boolean;
  setShowLanguageFilters: (v: boolean) => void;
  languageStats: {
    bilingualCount: number;
    sortedLangs: { lang: string; total: number; confirmed: number; estimated: number }[];
  };
  churchCount: number;
  // Actions
  onClose: () => void;
}

export function FilterPanel({
  activeSize,
  toggleSize,
  showSizeFilters,
  setShowSizeFilters,
  activeDenominations,
  toggleDenom,
  showDenomFilters,
  setShowDenomFilters,
  denomCounts,
  languageFilter,
  setLanguageFilter,
  showLanguageFilters,
  setShowLanguageFilters,
  languageStats,
  churchCount,
  onClose,
}: FilterPanelProps) {
  return (
    <div
      className="absolute left-16 bottom-6 z-20 rounded-xl shadow-2xl p-4 w-[260px] max-h-[70vh] overflow-y-auto"
      style={{ backgroundColor: "rgba(30, 16, 64, 0.96)" }}
    >
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-semibold text-white">Filters</span>
        <button onClick={onClose}>
          <X size={16} color="#C9A0DC" />
        </button>
      </div>

      {/* Size filters */}
      <button
        onClick={() => setShowSizeFilters(!showSizeFilters)}
        className="w-full flex items-center justify-between py-2 text-xs font-semibold text-purple-300 uppercase tracking-wider"
      >
        Attendance Size
        {showSizeFilters ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>
      {showSizeFilters && (
        <div className="mb-3">
          {sizeCategories.map((cat) => (
            <label
              key={cat.label}
              className="flex items-center gap-3 py-1.5 cursor-pointer hover:bg-white/5 px-2 rounded-md"
            >
              <input
                type="checkbox"
                checked={activeSize.has(cat.label)}
                onChange={() => toggleSize(cat.label)}
                className="accent-purple-500 w-3.5 h-3.5"
              />
              <div className="flex items-center gap-2">
                <div
                  className="rounded-full"
                  style={{
                    width: Math.max(cat.radius * 1.6, 6),
                    height: Math.max(cat.radius * 1.6, 6),
                    backgroundColor: cat.color,
                  }}
                />
                <span className="text-xs text-white/70">{cat.label}</span>
              </div>
            </label>
          ))}
        </div>
      )}

      {/* Denomination filters */}
      <button
        onClick={() => setShowDenomFilters(!showDenomFilters)}
        className="w-full flex items-center justify-between py-2 text-xs font-semibold text-purple-300 uppercase tracking-wider border-t border-white/10"
      >
        Denomination
        {showDenomFilters ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>
      {showDenomFilters && (
        <DenominationFilters
          activeDenominations={activeDenominations}
          toggleDenom={toggleDenom}
          denomCounts={denomCounts}
        />
      )}

      {/* Language filters */}
      <button
        onClick={() => setShowLanguageFilters(!showLanguageFilters)}
        className="w-full flex items-center justify-between py-2 text-xs font-semibold text-purple-300 uppercase tracking-wider border-t border-white/10"
      >
        <span className="flex items-center gap-1.5">
          <Languages size={12} />
          Languages
          {languageFilter !== "all" && (
            <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-blue-500/20 text-blue-400 font-semibold normal-case tracking-normal">
              active
            </span>
          )}
        </span>
        {showLanguageFilters ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>
      {showLanguageFilters && (
        <LanguageFilters
          languageFilter={languageFilter}
          setLanguageFilter={setLanguageFilter}
          languageStats={languageStats}
          churchCount={churchCount}
        />
      )}
    </div>
  );
}

function DenominationFilters({
  activeDenominations,
  toggleDenom,
  denomCounts,
}: {
  activeDenominations: Set<string>;
  toggleDenom: (label: string) => void;
  denomCounts: Record<string, number>;
}) {
  return (
    <div className="mb-2">
      {DENOMINATION_GROUPS.map((group) => {
        const count = denomCounts[group.label] || 0;
        return (
          <label
            key={group.label}
            className="flex items-center justify-between py-1.5 cursor-pointer hover:bg-white/5 px-2 rounded-md"
          >
            <div className="flex items-center gap-2.5">
              <input
                type="checkbox"
                checked={activeDenominations.has(group.label)}
                onChange={() => toggleDenom(group.label)}
                className="accent-purple-500 w-3.5 h-3.5"
              />
              <span className="text-xs text-white/70">{group.label}</span>
            </div>
            {count > 0 && (
              <span className="text-xs text-white/30">{count}</span>
            )}
          </label>
        );
      })}
      <div className="flex gap-2 mt-2 px-2">
        <button
          onClick={() => {
            DENOMINATION_GROUPS.forEach((g) => {
              if (!activeDenominations.has(g.label)) toggleDenom(g.label);
            });
          }}
          className="text-xs text-purple-300 hover:text-purple-200"
        >
          Select all
        </button>
        <span className="text-white/20">|</span>
        <button
          onClick={() => {
            DENOMINATION_GROUPS.forEach((g) => {
              if (activeDenominations.has(g.label)) toggleDenom(g.label);
            });
          }}
          className="text-xs text-purple-300 hover:text-purple-200"
        >
          Clear all
        </button>
      </div>
    </div>
  );
}

function LanguageFilters({
  languageFilter,
  setLanguageFilter,
  languageStats,
  churchCount,
}: {
  languageFilter: string;
  setLanguageFilter: (v: string) => void;
  languageStats: {
    bilingualCount: number;
    sortedLangs: { lang: string; total: number; confirmed: number; estimated: number }[];
  };
  churchCount: number;
}) {
  return (
    <div className="mb-2 space-y-1">
      {/* All churches */}
      <label className="flex items-center gap-2.5 py-1.5 cursor-pointer hover:bg-white/5 px-2 rounded-md">
        <input
          type="radio"
          name="langFilter"
          checked={languageFilter === "all"}
          onChange={() => setLanguageFilter("all")}
          className="accent-purple-500 w-3.5 h-3.5"
        />
        <span className="text-xs text-white/70">All churches</span>
        <span className="text-xs text-white/30 ml-auto">{churchCount}</span>
      </label>

      {/* Bilingual/multilingual */}
      <label className="flex items-center gap-2.5 py-1.5 cursor-pointer hover:bg-white/5 px-2 rounded-md">
        <input
          type="radio"
          name="langFilter"
          checked={languageFilter === "bilingual"}
          onChange={() => setLanguageFilter("bilingual")}
          className="accent-blue-500 w-3.5 h-3.5"
        />
        <span className="text-xs text-white/70">
          Bilingual / multilingual
        </span>
        <span className="text-xs text-white/30 ml-auto">{languageStats.bilingualCount}</span>
      </label>

      {/* Per-language options */}
      {languageStats.sortedLangs.length > 0 && (
        <>
          <div className="h-px bg-white/5 mx-2 my-1" />
          <p className="text-[9px] text-white/25 px-2 uppercase tracking-wider font-semibold">
            By language{" "}
            {languageStats.sortedLangs.some(
              (l) => l.estimated > 0 && l.confirmed === 0
            ) && (
              <span className="normal-case tracking-normal text-blue-400/50 font-normal ml-1">
                includes estimates
              </span>
            )}
          </p>
          {languageStats.sortedLangs.slice(0, 8).map(({ lang, total, confirmed, estimated }) => (
            <label
              key={lang}
              className="flex items-center gap-2.5 py-1 cursor-pointer hover:bg-white/5 px-2 rounded-md"
            >
              <input
                type="radio"
                name="langFilter"
                checked={languageFilter === lang}
                onChange={() => setLanguageFilter(lang)}
                className="accent-blue-500 w-3.5 h-3.5"
              />
              <span className="text-xs text-white/70 flex-1 truncate">{lang}</span>
              <span className="text-xs text-white/30 tabular-nums">
                {total}
                {estimated > 0 && confirmed < total && (
                  <span className="text-blue-400/40 text-[9px] ml-0.5">~</span>
                )}
              </span>
            </label>
          ))}
        </>
      )}

      {languageFilter !== "all" && (
        <button
          onClick={() => setLanguageFilter("all")}
          className="text-xs text-purple-300 hover:text-purple-200 px-2 mt-1"
        >
          Clear filter
        </button>
      )}
    </div>
  );
}

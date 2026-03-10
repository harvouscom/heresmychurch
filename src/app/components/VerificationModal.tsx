import { useState, useMemo } from "react";
import { motion } from "motion/react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  MapPin,
  Search,
  Plus,
} from "lucide-react";
import type { Church } from "./church-data";
import { CloseButton } from "./ui/close-button";
import { churchNeedsReview, getTier1Completeness } from "./church-data";

interface VerificationModalProps {
  stateAbbrev: string;
  stateName: string;
  churches: Church[];
  /** When provided, use this church's data for stats when it appears in churches (e.g. after edit or detail load). */
  selectedChurch?: Church | null;
  onClose: () => void;
  onChurchClick?: (church: Church) => void;
  filterChurchId?: string | null;
  onOpenCorrections?: () => void;
  onAddChurch?: () => void;
}

export function VerificationModal({
  stateName,
  churches,
  selectedChurch,
  onClose,
  onChurchClick,
  onAddChurch,
}: VerificationModalProps) {
  // Use best available data for stats: merge selectedChurch into list when it's in this state so percentages reflect edits/detail data
  const churchesForStats = useMemo(() => {
    if (!selectedChurch || !churches.some((c) => c.id === selectedChurch.id)) return churches;
    return churches.map((ch) => (ch.id === selectedChurch.id ? selectedChurch : ch));
  }, [churches, selectedChurch]);

  // Churches that need review: missing 2+ of address, service times, denomination
  const incompleteChurches = useMemo(() => churches.filter(churchNeedsReview), [churches]);

  const incompleteTotal = incompleteChurches.length;

  // Percentages of *all* state churches missing each core field (denominator = full list; use churchesForStats so selected church's real data counts)
  const coreStats = useMemo(() => {
    const total = churchesForStats.length;
    if (total === 0) return { total: 0, missingAddressPct: 0, missingServiceTimesPct: 0, missingDenominationPct: 0 };
    let missingAddress = 0, missingServiceTimes = 0, missingDenomination = 0;
    for (const ch of churchesForStats) {
      const t1 = getTier1Completeness(ch);
      if (t1.missingAddress) missingAddress++;
      if (t1.missingServiceTimes) missingServiceTimes++;
      if (t1.missingDenomination) missingDenomination++;
    }
    return {
      total,
      missingAddressPct: total > 0 ? (missingAddress / total) * 100 : 0,
      missingServiceTimesPct: total > 0 ? (missingServiceTimes / total) * 100 : 0,
      missingDenominationPct: total > 0 ? (missingDenomination / total) * 100 : 0,
    };
  }, [churchesForStats]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        transition={{ duration: 0.2, ease: "easeOut" }}
        className="relative w-full max-w-lg max-h-[80vh] rounded-2xl shadow-2xl overflow-hidden flex flex-col"
        style={{ backgroundColor: "#1E1040" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-white/8 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-pink-500/15 flex items-center justify-center">
              <AlertTriangle size={18} className="text-white" />
            </div>
            <div>
              <h2 className="text-white font-medium text-base leading-tight">
                Churches Needing Review
              </h2>
              <p className="text-white/40 text-xs mt-0.5">
                {stateName} &middot; {incompleteTotal} church{incompleteTotal !== 1 ? "es" : ""} missing 2+ critical fields
              </p>
            </div>
          </div>
          <CloseButton onClick={onClose} size="md" />
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto min-h-0 px-5 py-3">
          {churches.length > 0 && (
            <div className="mb-3">
              <span className="text-[10px] uppercase tracking-widest text-pink-400/70 font-medium block mb-2">
                % of churches missing key info
              </span>
              <div className="flex gap-1.5">
                <div className="flex-1 rounded-lg bg-white/4 border border-white/5 px-2 py-2.5 text-center flex flex-col items-center">
                  <span className="text-white/45 text-[10px] block">Address</span>
                  <span className="text-white text-[13px] font-semibold tabular-nums mt-0.5">{coreStats.missingAddressPct.toFixed(1)}%</span>
                </div>
                <div className="flex-1 rounded-lg bg-white/4 border border-white/5 px-2 py-2.5 text-center flex flex-col items-center">
                  <span className="text-white/45 text-[10px] block">Service times</span>
                  <span className="text-white text-[13px] font-semibold tabular-nums mt-0.5">{coreStats.missingServiceTimesPct.toFixed(1)}%</span>
                </div>
                <div className="flex-1 rounded-lg bg-white/4 border border-white/5 px-2 py-2.5 text-center flex flex-col items-center">
                  <span className="text-white/45 text-[10px] block">Denomination</span>
                  <span className="text-white text-[13px] font-semibold tabular-nums mt-0.5">{coreStats.missingDenominationPct.toFixed(1)}%</span>
                </div>
              </div>
            </div>
          )}
          <IncompleteChurchesList
            churches={incompleteChurches}
            onChurchClick={(church) => {
              onClose();
              onChurchClick?.(church);
            }}
            onAddChurch={onAddChurch}
          />
        </div>

        {/* Footer */}
        <div className="flex-shrink-0 px-5 py-3 border-t border-white/6 text-balance">
          <p className="text-white/25 text-[10px] text-center leading-relaxed">
            Critical fields: address, service times, denomination. Click a church to update its info.
          </p>
        </div>
      </motion.div>
    </div>
  );
}

// ── Incomplete Churches List ──

function IncompleteChurchesList({
  churches,
  onChurchClick,
  onAddChurch,
}: {
  churches: Church[];
  onChurchClick?: (church: Church) => void;
  onAddChurch?: () => void;
}) {
  const [search, setSearch] = useState("");
  const DISPLAY_CAP = 50;

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return churches;
    const tokens = q.split(/\s+/).filter(Boolean);
    return churches.filter((ch) => {
      const haystack = `${ch.name} ${ch.city} ${ch.denomination} ${ch.address || ""}`.toLowerCase();
      return tokens.every((t) => haystack.includes(t));
    });
  }, [search, churches]);

  const isSearching = search.trim().length > 0;
  const displayed = isSearching ? filtered : filtered.slice(0, DISPLAY_CAP);

  if (churches.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-3">
        <CheckCircle2 size={32} className="text-green-400/40" />
        <p className="text-white/40 text-sm font-medium">All caught up!</p>
        <p className="text-white/25 text-xs text-center max-w-[240px]">
          No churches are missing critical information in this state.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {/* Search input */}
      <div className="relative mb-1">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search churches needing review..."
          className="w-full pl-9 pr-3 py-2 rounded-full bg-white/[0.05] border border-white/8 text-white text-xs placeholder:text-white/25 focus:outline-none focus:border-purple-500/40 transition-colors"
        />
      </div>

      {displayed.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 gap-3">
          <p className="text-white/40 text-xs">
            No churches needing review found for &ldquo;{search}&rdquo;
          </p>
          {onAddChurch && (
            <button
              onClick={onAddChurch}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-purple-500/20 text-purple-300 text-xs font-medium hover:bg-purple-500/30 transition-colors"
            >
              <Plus size={13} />
              Add your church
            </button>
          )}
        </div>
      ) : (
        <>
          {displayed.map((ch) => {
            const t1 = getTier1Completeness(ch);
            const missing: string[] = [];
            if (t1.missingAddress) missing.push("Address");
            if (t1.missingServiceTimes) missing.push("Service Times");
            if (t1.missingDenomination) missing.push("Denomination");

            return (
              <div
                key={ch.id}
                className={`rounded-xl bg-white/[0.03] border border-white/6 px-3.5 py-2.5 ${
                  onChurchClick ? "cursor-pointer hover:bg-white/[0.05] transition-colors group" : ""
                }`}
                onClick={() => onChurchClick && onChurchClick(ch)}
              >
                <div className="flex items-center gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="text-white text-sm font-medium truncate group-hover:text-purple-300 transition-colors">
                        {ch.name}
                      </h3>
                      {ch.city && (
                        <span className="text-white/25 text-[10px] flex items-center gap-0.5 flex-shrink-0">
                          <MapPin size={8} />
                          {ch.city}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 mt-1">
                      {missing.map((field) => (
                        <span
                          key={field}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-pink-500/8 border border-pink-500/15 text-white text-[10px] font-medium"
                        >
                          <AlertTriangle size={8} className="flex-shrink-0" />
                          {field}
                        </span>
                      ))}
                    </div>
                  </div>
                  {onChurchClick && (
                    <ChevronRight size={14} className="text-white/20 flex-shrink-0 group-hover:text-white/40 transition-colors" />
                  )}
                </div>
              </div>
            );
          })}
          {!isSearching && churches.length > DISPLAY_CAP && (
            <div className="text-white/40 text-[10px] text-center leading-relaxed mt-2">
              Showing {DISPLAY_CAP} of {churches.length} churches needing review. Use search to find a specific church.
            </div>
          )}
        </>
      )}
    </div>
  );
}

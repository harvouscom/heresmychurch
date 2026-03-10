import { useState, useMemo } from "react";
import { motion } from "motion/react";
import {
  X,
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  MapPin,
  Search,
  Plus,
} from "lucide-react";
import type { Church } from "./church-data";

interface VerificationModalProps {
  stateAbbrev: string;
  stateName: string;
  churches: Church[];
  onClose: () => void;
  onChurchClick?: (church: Church) => void;
  filterChurchId?: string | null;
  onOpenCorrections?: () => void;
  onAddChurch?: () => void;
}

export function VerificationModal({
  stateName,
  churches,
  onClose,
  onChurchClick,
  onAddChurch,
}: VerificationModalProps) {
  // Compute incomplete churches (missing denomination, address, or service times)
  const incompleteChurches = useMemo(() => {
    return churches.filter((c) => {
      const noDenom = !c.denomination || c.denomination === "Unknown" || c.denomination === "Other";
      const noAddress = !c.address;
      const noServiceTimes = !c.serviceTimes;
      return noDenom || noAddress || noServiceTimes;
    });
  }, [churches]);

  const incompleteTotal = incompleteChurches.length;

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
              <AlertTriangle size={18} className="text-pink-400" />
            </div>
            <div>
              <h2 className="text-white font-medium text-base leading-tight">
                Incomplete Churches
              </h2>
              <p className="text-white/40 text-xs mt-0.5">
                {stateName} &middot; {incompleteTotal} church{incompleteTotal !== 1 ? "es" : ""} missing data
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-white/10 transition-colors"
          >
            <X size={16} className="text-white/50" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto min-h-0 px-5 py-3">
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
        <div className="flex-shrink-0 px-5 py-3 border-t border-white/6">
          <p className="text-white/25 text-[10px] text-center leading-relaxed">
            Help fill in missing data to improve accuracy. Click a church to update its info.
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
          placeholder="Search incomplete churches..."
          className="w-full pl-9 pr-3 py-2 rounded-full bg-white/[0.05] border border-white/8 text-white text-xs placeholder:text-white/25 focus:outline-none focus:border-purple-500/40 transition-colors"
        />
      </div>

      {displayed.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 gap-3">
          <p className="text-white/40 text-xs">
            No incomplete churches found for &ldquo;{search}&rdquo;
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
            const noDenom = !ch.denomination || ch.denomination === "Unknown" || ch.denomination === "Other";
            const noAddress = !ch.address;
            const noServiceTimes = !ch.serviceTimes;

            return (
              <div
                key={ch.id}
                className={`rounded-xl bg-white/[0.03] border border-white/6 p-3.5 ${
                  onChurchClick ? "cursor-pointer hover:bg-white/[0.05] transition-colors group" : ""
                }`}
                onClick={() => onChurchClick && onChurchClick(ch)}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <h3 className="text-white text-sm font-medium truncate group-hover:text-purple-300 transition-colors">
                      {ch.name}
                    </h3>
                    {ch.city && (
                      <span className="text-white/30 text-[11px] flex items-center gap-1 mt-0.5">
                        <MapPin size={9} />
                        {ch.city}
                      </span>
                    )}
                  </div>
                  {onChurchClick && (
                    <ChevronRight size={14} className="text-white/20 mt-1 flex-shrink-0 group-hover:text-white/40 transition-colors" />
                  )}
                </div>

                <div className="mt-2.5 space-y-1.5">
                  {noDenom && (
                    <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-pink-500/5 border border-pink-500/10">
                      <AlertTriangle size={10} className="text-pink-400/60 flex-shrink-0" />
                      <span className="text-white/50 text-[11px] font-medium">Denomination</span>
                      <span className="text-pink-400/60 text-[10px] ml-auto font-medium">Missing</span>
                    </div>
                  )}
                  {noAddress && (
                    <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-pink-500/5 border border-pink-500/10">
                      <AlertTriangle size={10} className="text-pink-400/60 flex-shrink-0" />
                      <span className="text-white/50 text-[11px] font-medium">Address</span>
                      <span className="text-pink-400/60 text-[10px] ml-auto font-medium">Missing</span>
                    </div>
                  )}
                  {noServiceTimes && (
                    <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-pink-500/5 border border-pink-500/10">
                      <AlertTriangle size={10} className="text-pink-400/60 flex-shrink-0" />
                      <span className="text-white/50 text-[11px] font-medium">Service Times</span>
                      <span className="text-pink-400/60 text-[10px] ml-auto font-medium">Missing</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
          {!isSearching && churches.length > DISPLAY_CAP && (
            <div className="text-white/40 text-[10px] text-center leading-relaxed mt-2">
              Showing {DISPLAY_CAP} of {churches.length} incomplete churches. Use search to find a specific church.
            </div>
          )}
        </>
      )}
    </div>
  );
}

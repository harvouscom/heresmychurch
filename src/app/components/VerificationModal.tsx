import { useState, useEffect, useCallback, useMemo } from "react";
import { motion } from "motion/react";
import {
  X,
  ShieldCheck,
  Church as ChurchIcon,
  FileEdit,
  CheckCircle2,
  Clock,
  ChevronRight,
  Loader2,
  MapPin,
  AlertCircle,
  AlertTriangle,
} from "lucide-react";
import type { Church } from "./church-data";
import type {
  PendingChurchData,
  PendingSuggestion,
} from "./api";
import {
  fetchPendingChurches,
  fetchPendingSuggestions,
  verifyChurch,
} from "./api";

const FIELD_LABELS: Record<string, string> = {
  website: "Website",
  address: "Address",
  attendance: "Est. Avg. Weekly Attendance",
  denomination: "Denomination",
  serviceTimes: "Service Times",
  languages: "Languages",
  ministries: "Ministries",
  pastorName: "Pastor",
  phone: "Phone",
  email: "Email",
};

interface VerificationModalProps {
  stateAbbrev: string;
  stateName: string;
  churches: Church[];
  onClose: () => void;
  onChurchClick?: (church: Church) => void;
  filterChurchId?: string | null;
  onOpenCorrections?: () => void;
}

export function VerificationModal({
  stateAbbrev,
  stateName,
  churches,
  onClose,
  onChurchClick,
  filterChurchId,
  onOpenCorrections,
}: VerificationModalProps) {
  const [activeTab, setActiveTab] = useState<"additions" | "corrections" | "incomplete">(
    filterChurchId ? "corrections" : "additions"
  );
  const [pendingChurches, setPendingChurches] = useState<PendingChurchData[]>([]);
  const [pendingSuggestions, setPendingSuggestions] = useState<PendingSuggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [verifyingId, setVerifyingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    Promise.all([
      fetchPendingChurches(stateAbbrev).catch((e) => {
        console.error("Failed to fetch pending churches:", e);
        return { state: stateAbbrev, churches: [] as PendingChurchData[] };
      }),
      fetchPendingSuggestions(stateAbbrev).catch((e) => {
        console.error("Failed to fetch pending suggestions:", e);
        return { state: stateAbbrev, pending: [] as PendingSuggestion[] };
      }),
    ]).then(([churchesRes, suggestionsRes]) => {
      if (cancelled) return;
      // Only show unapproved pending churches
      const unapproved = churchesRes.churches.filter((c) => !c.approved);
      setPendingChurches(unapproved);
      setPendingSuggestions(suggestionsRes.pending);
      // Auto-select the tab with content
      if (unapproved.length === 0 && suggestionsRes.pending.length > 0) {
        setActiveTab("corrections");
      } else if (unapproved.length === 0 && suggestionsRes.pending.length === 0) {
        setActiveTab("incomplete");
      }
      setLoading(false);
    });

    return () => { cancelled = true; };
  }, [stateAbbrev]);

  const handleVerify = useCallback(async (pendingId: string) => {
    setVerifyingId(pendingId);
    try {
      const res = await verifyChurch(pendingId);
      if (res.success) {
        setPendingChurches((prev) =>
          prev.map((c) =>
            c.id === pendingId
              ? { ...c, verificationCount: res.church?.verificationCount ?? c.verificationCount + 1, myVerification: true, approved: res.church?.approved ?? c.approved }
              : c
          )
        );
      }
    } catch (e) {
      console.error("Failed to verify church:", e);
      setError("Failed to verify. Please try again.");
    } finally {
      setVerifyingId(null);
    }
  }, []);

  // Look up church name from loaded churches for pending suggestions
  const getChurchName = useCallback(
    (churchId: string) => {
      const ch = churches.find((c) => c.id === churchId);
      return ch?.name || churchId.replace(/^[A-Z]{2}-/, "").replace(/-/g, " ");
    },
    [churches]
  );

  const getChurchCity = useCallback(
    (churchId: string) => {
      const ch = churches.find((c) => c.id === churchId);
      return ch?.city || "";
    },
    [churches]
  );

  const INCOMPLETE_CAP = 50;
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
  const cappedIncomplete = incompleteChurches.slice(0, INCOMPLETE_CAP);

  // Apply church filter if set
  const filteredSuggestions = filterChurchId
    ? pendingSuggestions.filter((s) => s.churchId === filterChurchId)
    : pendingSuggestions;

  const filterChurchName = filterChurchId ? getChurchName(filterChurchId) : null;

  const totalItems = filterChurchId
    ? filteredSuggestions.length
    : pendingChurches.length + pendingSuggestions.length + incompleteChurches.length;

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
              <ShieldCheck size={18} className="text-pink-400" />
            </div>
            <div>
              <h2 className="text-white font-medium text-base leading-tight">
                {filterChurchId ? "Pending Corrections" : "Needs Your Review"}
              </h2>
              <p className="text-white/40 text-xs mt-0.5">
                {filterChurchName
                  ? <><span className="text-pink-300/70">{filterChurchName}</span> &middot; {filteredSuggestions.reduce((sum, s) => sum + Object.keys(s.fields).length, 0)} field{filteredSuggestions.reduce((sum, s) => sum + Object.keys(s.fields).length, 0) !== 1 ? "s" : ""} pending</>
                  : <>{stateName} &middot; {totalItems} item{totalItems !== 1 ? "s" : ""} pending</>
                }
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

        {/* Tabs — hide when filtering to a specific church */}
        {!filterChurchId && (
          <div className="flex px-5 pt-3 gap-1 flex-shrink-0 overflow-x-auto">
            <button
              onClick={() => setActiveTab("additions")}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
                activeTab === "additions"
                  ? "bg-pink-500/15 text-pink-300"
                  : "text-white/40 hover:text-white/60 hover:bg-white/5"
              }`}
            >
              <ChurchIcon size={12} />
              New
              {pendingChurches.length > 0 && (
                <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-medium ${
                  activeTab === "additions" ? "bg-pink-500/20 text-pink-300" : "bg-white/10 text-white/40"
                }`}>
                  {pendingChurches.length}
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveTab("corrections")}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
                activeTab === "corrections"
                  ? "bg-pink-500/15 text-pink-300"
                  : "text-white/40 hover:text-white/60 hover:bg-white/5"
              }`}
            >
              <FileEdit size={12} />
              Corrections
              {filteredSuggestions.length > 0 && (
                <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-medium ${
                  activeTab === "corrections" ? "bg-pink-500/20 text-pink-300" : "bg-white/10 text-white/40"
                }`}>
                  {filteredSuggestions.length}
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveTab("incomplete")}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
                activeTab === "incomplete"
                  ? "bg-pink-500/15 text-pink-300"
                  : "text-white/40 hover:text-white/60 hover:bg-white/5"
              }`}
            >
              <AlertTriangle size={12} />
              Incomplete
              {incompleteTotal > 0 && (
                <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-medium ${
                  activeTab === "incomplete" ? "bg-pink-500/20 text-pink-300" : "bg-white/10 text-white/40"
                }`}>
                  {incompleteTotal > INCOMPLETE_CAP ? `${INCOMPLETE_CAP}+` : incompleteTotal}
                </span>
              )}
            </button>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto min-h-0 px-5 py-3">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <Loader2 size={24} className="text-purple-400 animate-spin" />
              <p className="text-white/40 text-xs">Loading review items...</p>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <AlertCircle size={24} className="text-red-400" />
              <p className="text-white/40 text-xs">{error}</p>
            </div>
          ) : activeTab === "additions" && !filterChurchId ? (
            <PendingChurchesList
              churches={pendingChurches}
              verifyingId={verifyingId}
              onVerify={handleVerify}
            />
          ) : activeTab === "incomplete" && !filterChurchId ? (
            <IncompleteChurchesList
              churches={cappedIncomplete}
              totalCount={incompleteTotal}
              onChurchClick={(church) => {
                onClose();
                onChurchClick?.(church);
              }}
            />
          ) : (
            <PendingCorrectionsList
              suggestions={filteredSuggestions}
              getChurchName={getChurchName}
              getChurchCity={getChurchCity}
              allChurches={churches}
              onChurchClick={(churchId) => {
                if (filterChurchId && onOpenCorrections) {
                  onClose();
                  onOpenCorrections();
                } else {
                  const ch = churches.find((c) => c.id === churchId);
                  if (ch && onChurchClick) {
                    onClose();
                    onChurchClick(ch);
                  }
                }
              }}
            />
          )}
        </div>

        {/* Footer */}
        <div className="flex-shrink-0 px-5 py-3 border-t border-white/6">
          {filterChurchId && onOpenCorrections && filteredSuggestions.length > 0 && !loading ? (
            <button
              onClick={() => { onClose(); onOpenCorrections(); }}
              className="w-full py-2.5 rounded-xl bg-pink-500/15 hover:bg-pink-500/25 border border-pink-500/20 text-pink-300 text-xs font-semibold transition-colors flex items-center justify-center gap-2 mb-2"
            >
              <FileEdit size={13} />
              View & vote on corrections
            </button>
          ) : null}
          <p className="text-white/25 text-[10px] text-center leading-relaxed">
            Community-sourced data requires {3} verifications to be approved.
            Help keep church info accurate by reviewing submissions.
          </p>
        </div>
      </motion.div>
    </div>
  );
}

// ── Pending Churches List ──

function PendingChurchesList({
  churches,
  verifyingId,
  onVerify,
}: {
  churches: PendingChurchData[];
  verifyingId: string | null;
  onVerify: (id: string) => void;
}) {
  if (churches.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-3">
        <CheckCircle2 size={32} className="text-green-400/40" />
        <p className="text-white/40 text-sm font-medium">All caught up!</p>
        <p className="text-white/25 text-xs text-center max-w-[240px]">
          No community-added churches are waiting for verification in this state.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {churches.map((ch) => {
        const isVerifying = verifyingId === ch.id;
        const progress = ch.verificationCount / ch.needed;

        return (
          <div
            key={ch.id}
            className="rounded-xl bg-white/[0.03] border border-white/6 p-3.5 group"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <h3 className="text-white text-sm font-medium truncate">{ch.name}</h3>
                <div className="flex items-center gap-2 mt-1">
                  {ch.city && (
                    <span className="text-white/30 text-[11px] flex items-center gap-1">
                      <MapPin size={9} />
                      {ch.city}
                    </span>
                  )}
                  {ch.denomination && ch.denomination !== "Unknown" && (
                    <span className="text-white/30 text-[11px]">{ch.denomination}</span>
                  )}
                  {ch.attendance > 0 && (
                    <span className="text-white/30 text-[11px]">~{ch.attendance}</span>
                  )}
                </div>
                {ch.address && (
                  <p className="text-white/20 text-[10px] mt-1 truncate">{ch.address}</p>
                )}
              </div>

              {ch.myVerification ? (
                <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-green-500/10 flex-shrink-0">
                  <CheckCircle2 size={12} className="text-green-400" />
                  <span className="text-green-400 text-[11px] font-medium">Verified</span>
                </div>
              ) : (
                <button
                  onClick={() => onVerify(ch.id)}
                  disabled={isVerifying}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-pink-500/15 text-pink-300 text-[11px] font-medium hover:bg-pink-500/25 transition-colors disabled:opacity-50 flex-shrink-0 cursor-pointer"
                >
                  {isVerifying ? (
                    <Loader2 size={11} className="animate-spin" />
                  ) : (
                    <ShieldCheck size={11} />
                  )}
                  Verify
                </button>
              )}
            </div>

            {/* Progress bar */}
            <div className="mt-2.5 flex items-center gap-2">
              <div className="flex-1 h-1 rounded-full bg-white/8 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-300"
                  style={{
                    width: `${Math.min(progress * 100, 100)}%`,
                    background: ch.approved
                      ? "#22C55E"
                      : "linear-gradient(90deg, #EC4899, #DB2777)",
                  }}
                />
              </div>
              <span className="text-white/30 text-[10px] flex-shrink-0">
                {ch.verificationCount}/{ch.needed}
              </span>
            </div>

            {/* Submitted time */}
            {ch.submittedAt && (
              <p className="text-white/15 text-[10px] mt-1.5">
                <Clock size={9} className="inline mr-1 relative -top-px" />
                Submitted {formatTimeAgo(ch.submittedAt)}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Incomplete Churches List ──

function IncompleteChurchesList({
  churches,
  totalCount,
  onChurchClick,
}: {
  churches: Church[];
  totalCount: number;
  onChurchClick?: (church: Church) => void;
}) {
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
      {churches.map((ch) => {
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
      {totalCount > churches.length && (
        <div className="text-white/40 text-[10px] text-center leading-relaxed mt-2">
          Showing {churches.length} of {totalCount} incomplete churches.
        </div>
      )}
    </div>
  );
}

// ── Pending Corrections List ──

function PendingCorrectionsList({
  suggestions,
  getChurchName,
  getChurchCity,
  allChurches,
  onChurchClick,
}: {
  suggestions: PendingSuggestion[];
  getChurchName: (id: string) => string;
  getChurchCity: (id: string) => string;
  allChurches: Church[];
  onChurchClick: (churchId: string) => void;
}) {
  if (suggestions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-3">
        <CheckCircle2 size={32} className="text-green-400/40" />
        <p className="text-white/40 text-sm font-medium">No pending corrections</p>
        <p className="text-white/25 text-xs text-center max-w-[240px]">
          All suggested edits have either reached consensus or no corrections have been submitted yet.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {suggestions.map((s) => {
        const name = getChurchName(s.churchId);
        const city = getChurchCity(s.churchId);
        const fieldEntries = Object.entries(s.fields);
        const isClickable = allChurches.some((c) => c.id === s.churchId);

        return (
          <div
            key={s.churchId}
            className={`rounded-xl bg-white/[0.03] border border-white/6 p-3.5 ${
              isClickable ? "cursor-pointer hover:bg-white/[0.05] transition-colors group" : ""
            }`}
            onClick={() => isClickable && onChurchClick(s.churchId)}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <h3 className="text-white text-sm font-medium truncate group-hover:text-purple-300 transition-colors">
                  {name}
                </h3>
                {city && (
                  <span className="text-white/30 text-[11px] flex items-center gap-1 mt-0.5">
                    <MapPin size={9} />
                    {city}
                  </span>
                )}
              </div>
              {isClickable && (
                <ChevronRight size={14} className="text-white/20 mt-1 flex-shrink-0 group-hover:text-white/40 transition-colors" />
              )}
            </div>

            <div className="mt-2.5 space-y-1.5">
              {fieldEntries.map(([field, data]) => (
                <div
                  key={field}
                  className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-white/[0.03]"
                >
                  <FileEdit size={10} className="text-pink-400/60 flex-shrink-0" />
                  <span className="text-white/50 text-[11px] font-medium min-w-[60px]">
                    {FIELD_LABELS[field] || field}
                  </span>
                  <span className="text-pink-300/80 text-[11px] truncate flex-1">
                    {data.topValue}
                  </span>
                  <span className="text-white/25 text-[10px] flex-shrink-0">
                    {data.votes}/{data.needed}
                  </span>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Utility ──

function formatTimeAgo(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return `${Math.floor(days / 7)}w ago`;
}
import { CheckCheck, ChevronDown, Check, X, Loader2, MapPin, Globe } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import {
  moderateApproveSuggestion,
  moderateRejectSuggestion,
  moderateApproveChurch,
  moderateRejectChurch,
} from "./api";
import type { PendingSuggestionItem, PendingChurchItem } from "./api";
import { CloseButton } from "./ui/close-button";

const FIELD_LABELS: Record<string, string> = {
  name: "Church Name",
  website: "Website",
  address: "Address",
};

export function ModerationPill({
  open,
  onOpenChange,
  moderatorKey,
  pending,
  onRefresh,
  alwaysShow = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  moderatorKey: string;
  pending: { pendingSuggestions: PendingSuggestionItem[]; pendingChurches: PendingChurchItem[] };
  onRefresh: () => void;
  alwaysShow?: boolean;
}) {
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const totalPending = pending.pendingSuggestions.length + pending.pendingChurches.length;

  const handleAction = async (actionFn: () => Promise<any>, actionId: string) => {
    setActionLoading(actionId);
    setError(null);
    try {
      await actionFn();
      onRefresh();
    } catch (err: any) {
      setError(err.message || "Action failed");
    } finally {
      setActionLoading(null);
    }
  };

  if (!alwaysShow && totalPending === 0 && !open) return null;

  const label = totalPending === 0 ? "No pending" : `${totalPending} pending`;

  return (
    <div className="flex flex-col items-center min-w-0 max-w-full">
      <button
        type="button"
        onClick={() => onOpenChange(!open)}
        className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-full min-w-0 truncate hover:opacity-90 transition-opacity cursor-pointer bg-purple-500/15 border border-purple-500/25 backdrop-blur-md"
        style={{
          boxShadow: "inset 0 1px 0 0 rgba(255, 255, 255, 0.2), inset 0 -1px 0 0 rgba(0, 0, 0, 0.1)",
        }}
        aria-expanded={open}
      >
        <CheckCheck size={12} className="text-purple-600 flex-shrink-0" aria-hidden />
        <span className="text-purple-800 text-[11px] font-medium truncate">{label}</span>
        <ChevronDown
          size={12}
          className={`text-purple-700/70 flex-shrink-0 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
          aria-hidden
        />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.97 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="relative mt-2 z-[60] rounded-2xl shadow-2xl overflow-hidden w-[min(400px,calc(100vw-3.5rem))] max-h-[70vh] flex flex-col border border-purple-500/20"
            style={{
              backgroundColor: "rgba(30, 16, 64, 0.97)",
              boxShadow: "inset 0 1px 0 0 rgba(255, 255, 255, 0.06), inset 0 -1px 0 0 rgba(0, 0, 0, 0.2)",
            }}
          >
            <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-purple-500/20 flex-shrink-0">
              <span className="flex items-center gap-1.5 text-xs font-medium text-white uppercase tracking-widest">
                <CheckCheck size={12} className="text-purple-400" />
                Moderation Queue
              </span>
              <CloseButton
                onClick={() => onOpenChange(false)}
                className="[&>svg]:text-white/60 hover:bg-purple-500/20"
              />
            </div>

            <div className="px-5 py-4 space-y-4 overflow-y-auto flex-1 min-h-0">
              {error && (
                <p className="text-red-400 text-[11px]">{error}</p>
              )}

              {totalPending === 0 ? (
                <p className="text-white/50 text-sm text-center py-4">No pending items</p>
              ) : (
                <>
                  {/* Field Corrections */}
                  {pending.pendingSuggestions.length > 0 && (
                    <div className="space-y-3">
                      <p className="text-[10px] uppercase tracking-widest text-purple-400/80 font-medium">
                        Field Corrections ({pending.pendingSuggestions.length})
                      </p>
                      {pending.pendingSuggestions.map((s) => {
                        const actionId = `s-${s.churchId}-${s.field}`;
                        const isActing = actionLoading === actionId;
                        return (
                          <div key={actionId} className="space-y-1.5 pb-3 border-b border-white/5 last:border-0">
                            <div className="flex items-center gap-2">
                              <span className="text-purple-300 text-[10px] uppercase tracking-wider font-semibold">
                                {FIELD_LABELS[s.field] || s.field}
                              </span>
                              <span className="text-white/30 text-[10px]">
                                {s.votes} vote{s.votes !== 1 ? "s" : ""}
                              </span>
                            </div>
                            <p className="text-white/40 text-[10px] truncate">{s.churchId}</p>
                            {s.currentValue && (
                              <p className="text-white/50 text-xs">
                                Current: <span className="text-white/70">{s.currentValue}</span>
                              </p>
                            )}
                            <p className="text-white text-xs">
                              Proposed: <span className="text-green-300 font-medium">{s.proposedValue}</span>
                            </p>
                            <div className="flex gap-2 pt-1">
                              <button
                                onClick={() => handleAction(() => moderateApproveSuggestion(moderatorKey, s.churchId, s.field), actionId)}
                                disabled={isActing}
                                className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-green-600/20 hover:bg-green-600/40 text-green-400 text-[11px] font-medium transition-colors disabled:opacity-50"
                              >
                                {isActing ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                                Approve
                              </button>
                              <button
                                onClick={() => handleAction(() => moderateRejectSuggestion(moderatorKey, s.churchId, s.field), actionId)}
                                disabled={isActing}
                                className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-red-600/20 hover:bg-red-600/40 text-red-400 text-[11px] font-medium transition-colors disabled:opacity-50"
                              >
                                <X size={12} />
                                Reject
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* New Churches */}
                  {pending.pendingChurches.length > 0 && (
                    <div className="space-y-3">
                      <p className="text-[10px] uppercase tracking-widest text-purple-400/80 font-medium">
                        New Churches ({pending.pendingChurches.length})
                      </p>
                      {pending.pendingChurches.map((ch) => {
                        const actionId = `c-${ch.id}`;
                        const isActing = actionLoading === actionId;
                        return (
                          <div key={ch.id} className="space-y-1.5 pb-3 border-b border-white/5 last:border-0">
                            <p className="text-white font-medium text-sm">{ch.name}</p>
                            <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-white/50">
                              {ch.address && (
                                <span className="flex items-center gap-1">
                                  <MapPin size={10} /> {ch.address}, {ch.city}, {ch.state}
                                </span>
                              )}
                              {ch.denomination && <span>{ch.denomination}</span>}
                              {ch.website && (
                                <span className="flex items-center gap-1">
                                  <Globe size={10} /> {ch.website}
                                </span>
                              )}
                            </div>
                            <p className="text-white/30 text-[10px]">
                              Submitted {new Date(ch.submittedAt).toLocaleDateString()}
                            </p>
                            <div className="flex gap-2 pt-1">
                              <button
                                onClick={() => handleAction(() => moderateApproveChurch(moderatorKey, ch.id), actionId)}
                                disabled={isActing}
                                className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-green-600/20 hover:bg-green-600/40 text-green-400 text-[11px] font-medium transition-colors disabled:opacity-50"
                              >
                                {isActing ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                                Approve
                              </button>
                              <button
                                onClick={() => handleAction(() => moderateRejectChurch(moderatorKey, ch.id), actionId)}
                                disabled={isActing}
                                className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-red-600/20 hover:bg-red-600/40 text-red-400 text-[11px] font-medium transition-colors disabled:opacity-50"
                              >
                                <X size={12} />
                                Reject
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

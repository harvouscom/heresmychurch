import { CheckCheck, ChevronDown, Check, X, MapPin, Globe, ChevronRight } from "lucide-react";
import { ThreeDotLoader } from "./ThreeDotLoader";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import {
  moderateApproveSuggestion,
  moderateRejectSuggestion,
  moderateApproveChurch,
  moderateRejectChurch,
  addToInReview,
  removeFromInReview,
} from "./api";
import type { PendingSuggestionItem, PendingChurchItem, InReviewSuggestionItem, InReviewChurchItem } from "./api";
import { CloseButton } from "./ui/close-button";
import { parseAddressValue, formatFullAddress } from "./AddressInput";

const FIELD_LABELS: Record<string, string> = {
  name: "Church Name",
  website: "Website",
  address: "Address",
};

function formatProposedDisplay(field: string, proposedValue: string): string {
  if (field === "address" && proposedValue?.trim().startsWith("{")) {
    try {
      const p = parseAddressValue(proposedValue.trim());
      return formatFullAddress(p.address, p.city, p.state);
    } catch {
      return proposedValue;
    }
  }
  return proposedValue;
}

type StateInfo = { abbrev: string; name: string; isPopulated: boolean; churchCount: number };

export function ReviewPill({
  open,
  onOpenChange,
  moderatorKey,
  pending,
  onRefresh,
  alwaysShow = false,
  onOpenChurch,
  states = [],
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  moderatorKey: string;
  pending: {
    pendingSuggestions: PendingSuggestionItem[];
    pendingChurches: PendingChurchItem[];
    inReviewSuggestions?: InReviewSuggestionItem[];
    inReviewChurches?: InReviewChurchItem[];
  };
  onRefresh: () => void;
  alwaysShow?: boolean;
  onOpenChurch?: (churchId: string, churchShortId?: string, churchState?: string) => void;
  states?: StateInfo[];
}) {
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"needing" | "inReview">("needing");

  const inReviewSugs = pending.inReviewSuggestions ?? [];
  const inReviewChs = pending.inReviewChurches ?? [];
  const inReviewSuggestionSet = new Set(inReviewSugs.map((x) => `${x.churchId}:${x.field}`));
  const inReviewChurchSet = new Set(inReviewChs.map((c) => (typeof c === "string" ? c : c.churchId)));
  const myReviewSuggestionSet = new Set(inReviewSugs.filter((x) => x.byMe).map((x) => `${x.churchId}:${x.field}`));
  const myReviewChurchSet = new Set(inReviewChs.filter((c): c is InReviewChurchItem => typeof c === "object" && c != null && c.byMe === true).map((c) => c.churchId));

  const needingSuggestions = pending.pendingSuggestions.filter(
    (s) => !inReviewSuggestionSet.has(`${s.churchId}:${s.field}`)
  );
  const needingChurches = pending.pendingChurches.filter((ch) => !inReviewChurchSet.has(ch.id));
  const inReviewSuggestionsList = pending.pendingSuggestions.filter((s) =>
    inReviewSuggestionSet.has(`${s.churchId}:${s.field}`)
  );
  const inReviewChurchesList = pending.pendingChurches.filter((ch) => inReviewChurchSet.has(ch.id));

  const needingCount = needingSuggestions.length + needingChurches.length;
  const inReviewCount = inReviewSuggestionsList.length + inReviewChurchesList.length;
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

  const label = totalPending === 0 ? "No items needing review" : `${needingCount} items needing review`;

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
              <span className="flex items-center gap-2 text-xs font-medium text-white uppercase tracking-widest">
                <CheckCheck size={12} className="text-purple-400" />
                Review Queue
              </span>
              <CloseButton
                onClick={() => onOpenChange(false)}
                className="[&>svg]:text-white/60 hover:bg-purple-500/20"
              />
            </div>

            <div className="overflow-y-auto flex-1 min-h-0 flex flex-col">
              {/* Tabs — sticky so they stay visible when scrolling */}
              <div
                className="sticky top-0 z-10 flex px-5 pt-2 pb-2 gap-2 flex-shrink-0"
                style={{ backgroundColor: "rgba(30, 16, 64, 0.97)" }}
              >
                <button
                  type="button"
                  onClick={() => setActiveTab("needing")}
                  className={`flex-1 py-2 px-3 rounded-full text-[11px] font-medium transition-colors ${
                    activeTab === "needing"
                      ? "bg-purple-500/30 text-white"
                      : "text-white/60 hover:text-white/80 hover:bg-white/5"
                  }`}
                >
                  Needing review ({needingCount})
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab("inReview")}
                  className={`flex-1 py-2 px-3 rounded-full text-[11px] font-medium transition-colors ${
                    activeTab === "inReview"
                      ? "bg-purple-500/30 text-white"
                      : "text-white/60 hover:text-white/80 hover:bg-white/5"
                  }`}
                >
                  In review ({inReviewCount})
                </button>
              </div>

            <div className="px-5 py-4 space-y-4">
              {error && (
                <p className="text-red-400 text-[11px]">{error}</p>
              )}

              {activeTab === "needing" && needingCount === 0 && (
                <p className="text-white/50 text-sm text-center py-4">No items needing review</p>
              )}
              {activeTab === "inReview" && inReviewCount === 0 && (
                <p className="text-white/50 text-sm text-center py-4">No items up next</p>
              )}

              {activeTab === "needing" && needingCount > 0 && (
                <>
                  {/* Needing: Field Corrections */}
                  {needingSuggestions.length > 0 && (
                    <div className="space-y-3">
                      {needingSuggestions.map((s) => {
                        const actionId = `s-${s.churchId}-${s.field}`;
                        const isActing = actionLoading === actionId;
                        const churchDisplayName = s.churchName || s.churchId;
                        const whereabouts = [s.churchCity, s.churchState].filter(Boolean).join(" \u00b7 ");
                        const proposedDisplay = formatProposedDisplay(s.field, s.proposedValue);
                        const isWebsite = s.field === "website";
                        return (
                          <div
                            key={actionId}
                            className="rounded-lg bg-white/4 hover:bg-white/8 transition-colors px-3.5 py-3 space-y-2 group"
                          >
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-purple-500/10 border border-purple-500/20 text-purple-300 text-[10px] font-medium uppercase tracking-wider">
                                {FIELD_LABELS[s.field] || s.field}
                              </span>
                              {onOpenChurch && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    onOpenChurch(s.churchId, s.churchShortId, s.churchState);
                                    onOpenChange(false);
                                  }}
                                  className="ml-auto inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-medium text-purple-300 bg-purple-500/15 border border-purple-500/25 hover:bg-purple-500/25 hover:text-purple-200 transition-colors"
                                >
                                  View church
                                  <ChevronRight size={10} />
                                </button>
                              )}
                            </div>
                            <div className="flex flex-col min-w-0">
                              <div className="text-white text-sm font-medium truncate">
                                {churchDisplayName}
                              </div>
                              {whereabouts && (
                                <div className="text-white/40 text-xs mt-0.5">{whereabouts}</div>
                              )}
                            </div>
                            {s.currentValue && (
                              <p className="text-white/60 text-sm">
                                Current: <span className="text-white/60">{s.currentValue}</span>
                              </p>
                            )}
                            <p className="text-white text-sm">
                              Proposed:{" "}
                              {isWebsite && /^https?:\/\//i.test(s.proposedValue) ? (
                                <a
                                  href={s.proposedValue}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-purple-400/90 underline hover:text-purple-300"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  {s.proposedValue}
                                </a>
                              ) : (
                                <span className="text-purple-400/90">{proposedDisplay}</span>
                              )}
                            </p>
                            <div className="flex gap-2 pt-0.5 flex-wrap">
                              <button
                                onClick={() => handleAction(() => addToInReview(moderatorKey, "suggestion", s.churchId, s.field), `add-${actionId}`)}
                                disabled={actionLoading === `add-${actionId}`}
                                className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/15 text-white/80 text-[11px] font-medium transition-colors disabled:opacity-50"
                              >
                                {actionLoading === `add-${actionId}` ? <ThreeDotLoader size={12} /> : null}
                                Add to up next
                              </button>
                              <button
                                onClick={() => handleAction(() => moderateApproveSuggestion(moderatorKey, s.churchId, s.field), actionId)}
                                disabled={isActing}
                                className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-green-600/20 hover:bg-green-600/40 text-green-400 text-[11px] font-medium transition-colors disabled:opacity-50"
                              >
                                {isActing ? <ThreeDotLoader size={12} /> : <Check size={12} />}
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

                  {/* Needing: New Churches */}
                  {needingChurches.length > 0 && (
                    <div className="space-y-3">
                      {needingChurches.map((ch) => {
                        const actionId = `c-${ch.id}`;
                        const isActing = actionLoading === actionId;
                        return (
                          <div key={ch.id} className="rounded-lg bg-white/4 hover:bg-white/8 transition-colors px-3.5 py-3 space-y-2">
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
                            <div className="flex gap-2 pt-0.5 flex-wrap">
                              <button
                                onClick={() => handleAction(() => addToInReview(moderatorKey, "church", ch.id), `add-${actionId}`)}
                                disabled={actionLoading === `add-${actionId}`}
                                className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/15 text-white/80 text-[11px] font-medium transition-colors disabled:opacity-50"
                              >
                                {actionLoading === `add-${actionId}` ? <ThreeDotLoader size={12} /> : null}
                                Add to up next
                              </button>
                              <button
                                onClick={() => handleAction(() => moderateApproveChurch(moderatorKey, ch.id), actionId)}
                                disabled={isActing}
                                className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-green-600/20 hover:bg-green-600/40 text-green-400 text-[11px] font-medium transition-colors disabled:opacity-50"
                              >
                                {isActing ? <ThreeDotLoader size={12} /> : <Check size={12} />}
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

              {activeTab === "inReview" && inReviewCount > 0 && (
                <>
                  {/* In review: Field Corrections */}
                  {inReviewSuggestionsList.length > 0 && (
                    <div className="space-y-3">
                      {inReviewSuggestionsList.map((s) => {
                        const actionId = `s-${s.churchId}-${s.field}`;
                        const isActing = actionLoading === actionId;
                        const isMine = myReviewSuggestionSet.has(`${s.churchId}:${s.field}`);
                        const churchDisplayName = s.churchName || s.churchId;
                        const whereabouts = [s.churchCity, s.churchState].filter(Boolean).join(" \u00b7 ");
                        const proposedDisplay = formatProposedDisplay(s.field, s.proposedValue);
                        const isWebsite = s.field === "website";
                        return (
                          <div
                            key={actionId}
                            className="rounded-lg bg-white/4 hover:bg-white/8 transition-colors px-3.5 py-3 space-y-2 group"
                          >
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-purple-500/10 border border-purple-500/20 text-purple-300 text-[10px] font-medium uppercase tracking-wider">
                                {FIELD_LABELS[s.field] || s.field}
                              </span>
                              {!isMine && (
                                <span className="text-[10px] text-white/50 font-medium">In review by another moderator</span>
                              )}
                              {onOpenChurch && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    onOpenChurch(s.churchId, s.churchShortId, s.churchState);
                                    onOpenChange(false);
                                  }}
                                  className="ml-auto inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-medium text-purple-300 bg-purple-500/15 border border-purple-500/25 hover:bg-purple-500/25 hover:text-purple-200 transition-colors"
                                >
                                  View church
                                  <ChevronRight size={10} />
                                </button>
                              )}
                            </div>
                            <div className="flex flex-col min-w-0">
                              <div className="text-white text-sm font-medium truncate">
                                {churchDisplayName}
                              </div>
                              {whereabouts && (
                                <div className="text-white/40 text-xs mt-0.5">{whereabouts}</div>
                              )}
                            </div>
                            {s.currentValue && (
                              <p className="text-white/60 text-sm">
                                Current: <span className="text-white/60">{s.currentValue}</span>
                              </p>
                            )}
                            <p className="text-white text-sm">
                              Proposed:{" "}
                              {isWebsite && /^https?:\/\//i.test(s.proposedValue) ? (
                                <a
                                  href={s.proposedValue}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-purple-400/90 underline hover:text-purple-300"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  {s.proposedValue}
                                </a>
                              ) : (
                                <span className="text-purple-400/90">{proposedDisplay}</span>
                              )}
                            </p>
                            {isMine && (
                              <div className="flex gap-2 pt-0.5 flex-wrap">
                                <button
                                  onClick={() => handleAction(() => removeFromInReview(moderatorKey, "suggestion", s.churchId, s.field), `remove-${actionId}`)}
                                  disabled={actionLoading === `remove-${actionId}`}
                                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/15 text-white/80 text-[11px] font-medium transition-colors disabled:opacity-50"
                                >
                                  {actionLoading === `remove-${actionId}` ? <ThreeDotLoader size={12} /> : null}
                                  Remove from up next
                                </button>
                                <button
                                  onClick={() => handleAction(() => moderateApproveSuggestion(moderatorKey, s.churchId, s.field), actionId)}
                                  disabled={isActing}
                                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-green-600/20 hover:bg-green-600/40 text-green-400 text-[11px] font-medium transition-colors disabled:opacity-50"
                                >
                                  {isActing ? <ThreeDotLoader size={12} /> : <Check size={12} />}
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
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* In review: New Churches */}
                  {inReviewChurchesList.length > 0 && (
                    <div className="space-y-3">
                      {inReviewChurchesList.map((ch) => {
                        const actionId = `c-${ch.id}`;
                        const isActing = actionLoading === actionId;
                        const isMine = myReviewChurchSet.has(ch.id);
                        return (
                          <div key={ch.id} className="rounded-lg bg-white/4 hover:bg-white/8 transition-colors px-3.5 py-3 space-y-2">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="text-white font-medium text-sm">{ch.name}</p>
                              {!isMine && (
                                <span className="text-[10px] text-white/50 font-medium">In review by another moderator</span>
                              )}
                            </div>
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
                            {isMine && (
                              <div className="flex gap-2 pt-0.5 flex-wrap">
                                <button
                                  onClick={() => handleAction(() => removeFromInReview(moderatorKey, "church", ch.id), `remove-${actionId}`)}
                                  disabled={actionLoading === `remove-${actionId}`}
                                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/15 text-white/80 text-[11px] font-medium transition-colors disabled:opacity-50"
                                >
                                  {actionLoading === `remove-${actionId}` ? <ThreeDotLoader size={12} /> : null}
                                  Remove from up next
                                </button>
                                <button
                                  onClick={() => handleAction(() => moderateApproveChurch(moderatorKey, ch.id), actionId)}
                                  disabled={isActing}
                                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-green-600/20 hover:bg-green-600/40 text-green-400 text-[11px] font-medium transition-colors disabled:opacity-50"
                                >
                                  {isActing ? <ThreeDotLoader size={12} /> : <Check size={12} />}
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
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </>
              )}
            </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

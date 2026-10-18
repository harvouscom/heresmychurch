import { TriangleAlert, ChevronDown } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { pendingAlerts, reportErrorsContact } from "../config/pendingAlerts";
import {
  fetchActiveAlerts,
  fetchAlertProposals,
  submitCreateAlertProposal,
  voteCreateProposal,
  voteResolveProposal,
} from "./api";
import type {
  AlertCreateProposal,
  AlertResolveProposal,
  CommunityAlert,
} from "./api";
import { CloseButton } from "./ui/close-button";
import { friendlyError } from "../lib/friendly-error";

type AlertItem = {
  id: string;
  shortLabel: string;
  description: string;
  estimatedResolution?: string;
  source: "static" | "community";
};

function mergeActiveAlerts(
  staticUnresolved: { id: string; shortLabel: string; description: string; estimatedResolution?: string }[],
  community: CommunityAlert[]
): AlertItem[] {
  const byId = new Map<string, AlertItem>();
  for (const a of staticUnresolved) {
    byId.set(a.id, { id: a.id, shortLabel: a.shortLabel, description: a.description, estimatedResolution: a.estimatedResolution, source: "static" });
  }
  for (const a of community) {
    byId.set(a.id, { id: a.id, shortLabel: a.shortLabel, description: a.description, estimatedResolution: a.estimatedResolution, source: "community" });
  }
  return Array.from(byId.values());
}

export function PendingAlertsPill({
  open,
  onOpenChange,
  showProposeForm = false,
  showReportIssue = true,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  showProposeForm?: boolean;
  showReportIssue?: boolean;
}) {
  const staticUnresolved = pendingAlerts.filter((a) => !a.resolved);

  const [communityAlerts, setCommunityAlerts] = useState<CommunityAlert[]>([]);
  const [createProposals, setCreateProposals] = useState<AlertCreateProposal[]>([]);
  const [resolveProposals, setResolveProposals] = useState<AlertResolveProposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [proposeShortLabel, setProposeShortLabel] = useState("");
  const [proposeDescription, setProposeDescription] = useState("");
  const [submittingPropose, setSubmittingPropose] = useState(false);
  const [votingId, setVotingId] = useState<string | null>(null);

  const activeAlerts = mergeActiveAlerts(staticUnresolved, communityAlerts);

  const loadAlertsAndProposals = async () => {
    setLoading(true);
    setError(null);
    try {
      const [activeRes, proposalsRes] = await Promise.all([
        fetchActiveAlerts(),
        fetchAlertProposals(),
      ]);
      setCommunityAlerts(activeRes.alerts);
      setCreateProposals(proposalsRes.create);
      setResolveProposals(proposalsRes.resolve);
    } catch (e) {
      setError(friendlyError(e));
      setCommunityAlerts([]);
      setCreateProposals([]);
      setResolveProposals([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) loadAlertsAndProposals();
  }, [open]);

  const handlePropose = async () => {
    const shortLabel = proposeShortLabel.trim();
    const description = proposeDescription.trim();
    if (!shortLabel) return;
    setSubmittingPropose(true);
    try {
      await submitCreateAlertProposal(shortLabel, description);
      setProposeShortLabel("");
      setProposeDescription("");
      await loadAlertsAndProposals();
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setSubmittingPropose(false);
    }
  };

  const handleVoteCreate = async (proposalId: string) => {
    setVotingId(proposalId);
    try {
      const res = await voteCreateProposal(proposalId);
      if (res.alerts != null) setCommunityAlerts(res.alerts);
      setCreateProposals(res.proposals.create);
      setResolveProposals(res.proposals.resolve);
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setVotingId(null);
    }
  };

  const handleVoteResolve = async (alertId: string) => {
    setVotingId(alertId);
    try {
      const res = await voteResolveProposal(alertId);
      setCommunityAlerts(res.alerts);
      setResolveProposals(res.proposals.resolve);
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setVotingId(null);
    }
  };

  if (activeAlerts.length === 0 && createProposals.length === 0 && resolveProposals.length === 0 && !open) {
    return null;
  }

  const collapsedLabel =
    activeAlerts.length === 0
      ? "Proposed issues"
      : activeAlerts.length === 1
        ? "1 known issue"
        : `${activeAlerts.length} known issues`;

  return (
    <div className="flex flex-col items-center min-w-0 max-w-full">
      <button
        type="button"
        onClick={() => onOpenChange(!open)}
        className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-full min-w-0 truncate hover:opacity-90 transition-opacity cursor-pointer bg-amber-500/10 border border-amber-500/20 backdrop-blur-md"
        style={{
          boxShadow:
            "inset 0 1px 0 0 rgba(255, 255, 255, 0.2), inset 0 -1px 0 0 rgba(0, 0, 0, 0.1)",
        }}
        aria-expanded={open}
      >
        <TriangleAlert
          size={12}
          className="text-amber-700 flex-shrink-0"
          aria-hidden
        />
        <span className="text-amber-800 text-caption font-medium truncate">
          {collapsedLabel}
        </span>
        <ChevronDown
          size={12}
          className={`text-amber-700/70 flex-shrink-0 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
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
            className="mt-2 rounded-panel shadow-hmc-panel overflow-hidden w-[min(360px,calc(100vw-3.5rem))] max-h-[70vh] flex flex-col border border-amber-500/20"
            style={{
              backgroundColor: "rgba(69, 26, 3, 0.97)",
              boxShadow:
                "inset 0 1px 0 0 rgba(255, 255, 255, 0.06), inset 0 -1px 0 0 rgba(0, 0, 0, 0.2)",
            }}
          >
            <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-amber-500/20 flex-shrink-0">
              <span className="flex items-center gap-1.5 text-xs font-medium text-white uppercase tracking-widest">
                Known issues
              </span>
              <CloseButton
                onClick={() => onOpenChange(false)}
                className="[&>svg]:text-white/60 hover:bg-amber-500/20"
              />
            </div>
            <div className="px-5 py-4 space-y-4 overflow-y-auto flex-1 min-h-0">
              {error && (
                <p className="text-amber-300 text-caption">{error}</p>
              )}

              {loading ? (
                <p className="text-white/60 text-caption">Loading…</p>
              ) : (
                <>
                  {activeAlerts.length > 0 && (
                    <div className="space-y-3">
                      <p className="text-caption uppercase tracking-widest text-amber-400/80 font-medium">
                        Active issues
                      </p>
                      {activeAlerts.map((alert) => (
                        <div key={alert.id} className="space-y-1">
                          <p className="text-white text-sm font-medium">
                            {alert.shortLabel}
                          </p>
                          <p className="text-white/80 text-[13px] leading-relaxed">
                            {alert.description}
                          </p>
                          {alert.estimatedResolution && (
                            <p className="text-amber-300/90 text-caption">
                              Est. resolved: {alert.estimatedResolution}
                            </p>
                          )}
                          {alert.source === "community" && (
                            <button
                              type="button"
                              disabled={votingId === alert.id}
                              onClick={() => handleVoteResolve(alert.id)}
                              className="text-caption text-amber-300 hover:text-amber-200 font-medium disabled:opacity-50"
                            >
                              {votingId === alert.id
                                ? "Voting…"
                                : "This is fixed – vote to resolve"}
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {createProposals.length > 0 && (
                    <div className="space-y-2 pt-2 border-t border-amber-500/20">
                      <p className="text-caption uppercase tracking-widest text-amber-400/80 font-medium">
                        Proposed new alerts
                      </p>
                      {createProposals.map((p) => (
                        <div key={p.id} className="space-y-0.5">
                          <p className="text-white text-label font-medium">
                            {p.shortLabel}
                          </p>
                          <p className="text-white/70 text-caption leading-relaxed">
                            {p.description}
                          </p>
                          <div className="flex items-center gap-2">
                            <span className="text-white/60 text-caption">
                              {p.votes} / {p.needed} votes
                            </span>
                            <button
                              type="button"
                              disabled={p.myVote || votingId === p.id}
                              onClick={() => handleVoteCreate(p.id)}
                              className="text-caption font-medium text-amber-300 hover:text-amber-200 disabled:opacity-50"
                            >
                              {p.myVote ? "Voted" : votingId === p.id ? "Voting…" : "Vote"}
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {resolveProposals.length > 0 && (
                    <div className="space-y-2 pt-2 border-t border-amber-500/20">
                      <p className="text-caption uppercase tracking-widest text-amber-400/80 font-medium">
                        Proposed resolutions
                      </p>
                      {resolveProposals.map((p) => {
                        const alert = activeAlerts.find((a) => a.id === p.alertId);
                        const label = alert?.shortLabel ?? `Alert ${p.alertId.slice(0, 8)}…`;
                        return (
                        <div key={p.alertId} className="flex items-center gap-2 text-caption">
                          <span className="text-white/70">
                            {label} — {p.votes} / {p.needed} votes
                          </span>
                          <button
                            type="button"
                            disabled={p.myVote || votingId === p.alertId}
                            onClick={() => handleVoteResolve(p.alertId)}
                            className="text-amber-300 hover:text-amber-200 font-medium disabled:opacity-50"
                          >
                            {p.myVote ? "Voted" : votingId === p.alertId ? "…" : "Vote"}
                          </button>
                        </div>
                        );
                      })}
                    </div>
                  )}

                  {showReportIssue && showProposeForm && (
                    <div className="space-y-2 pt-2 border-t border-amber-500/20">
                      <p className="text-caption uppercase tracking-widest text-amber-400/80 font-medium">
                        Describe the issue you&apos;re experiencing
                      </p>
                      <input
                        type="text"
                        placeholder="Brief summary"
                        value={proposeShortLabel}
                        onChange={(e) => setProposeShortLabel(e.target.value)}
                        className="w-full px-3 py-1.5 rounded-lg text-label text-white placeholder:text-white/60 bg-white/10 border border-amber-500/20"
                      />
                      <textarea
                        placeholder="What happened? (optional details)"
                        value={proposeDescription}
                        onChange={(e) => setProposeDescription(e.target.value)}
                        rows={2}
                        className="w-full px-3 py-1.5 rounded-lg text-label text-white placeholder:text-white/60 bg-white/10 border border-amber-500/20 resize-none"
                      />
                      <button
                        type="button"
                        disabled={!proposeShortLabel.trim() || submittingPropose}
                        onClick={handlePropose}
                        className="px-3 py-1.5 rounded-lg text-caption font-medium text-white bg-amber-700/80 hover:bg-amber-700 disabled:opacity-50"
                      >
                        {submittingPropose ? "Sending…" : "Send"}
                      </button>
                    </div>
                  )}
                </>
              )}

              {showReportIssue && reportErrorsContact.mailto && !showProposeForm && (
                <div className="pt-3 border-t border-amber-500/20 flex justify-center">
                  <a
                    href={`mailto:${reportErrorsContact.mailto}`}
                    className="w-full flex items-center justify-center px-3 py-2 rounded-xl text-xs font-medium text-white bg-amber-900/90 hover:bg-amber-800 border border-amber-700/50 transition-colors"
                  >
                    {reportErrorsContact.label}
                  </a>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

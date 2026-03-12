import { useState, useEffect, useCallback } from "react";
import { Check, X, Loader2, Shield, MapPin, Globe, ChurchIcon } from "lucide-react";
import {
  fetchModeratorPending,
  moderateApproveSuggestion,
  moderateRejectSuggestion,
  moderateApproveChurch,
  moderateRejectChurch,
} from "./api";
import type { PendingSuggestionItem, PendingChurchItem } from "./api";

function fieldLabel(field: string): string {
  const labels: Record<string, string> = {
    name: "Church Name",
    website: "Website",
    address: "Address",
  };
  return labels[field] || field;
}

export function ModeratorDashboard() {
  const [key, setKey] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("key") || "";
  });
  const [authenticated, setAuthenticated] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<PendingSuggestionItem[]>([]);
  const [churches, setChurches] = useState<PendingChurchItem[]>([]);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const loadPending = useCallback(async (modKey: string) => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchModeratorPending(modKey);
      setSuggestions(data.pendingSuggestions);
      setChurches(data.pendingChurches);
      setAuthenticated(true);
    } catch (err: any) {
      setError(err.message || "Failed to load");
      setAuthenticated(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (key) loadPending(key);
  }, []);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (key.trim()) loadPending(key.trim());
  };

  const handleAction = async (
    actionFn: () => Promise<any>,
    actionId: string
  ) => {
    setActionLoading(actionId);
    try {
      await actionFn();
      await loadPending(key);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setActionLoading(null);
    }
  };

  if (!authenticated) {
    return (
      <div
        className="min-h-screen flex items-center justify-center p-4"
        style={{ backgroundColor: "#0D0B1A", fontFamily: "'Livvic', sans-serif" }}
      >
        <form
          onSubmit={handleLogin}
          className="w-full max-w-sm p-6 rounded-2xl border border-white/10"
          style={{ backgroundColor: "#1E1040" }}
        >
          <div className="flex items-center gap-2 mb-4">
            <Shield size={20} className="text-purple-400" />
            <h1 className="text-white text-lg font-semibold">Moderator Access</h1>
          </div>
          <input
            type="password"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder="Enter moderator key"
            className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-sm placeholder:text-white/30 focus:outline-none focus:border-purple-500/50 mb-3"
          />
          <button
            type="submit"
            disabled={loading || !key.trim()}
            className="w-full py-2 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-sm font-medium disabled:opacity-50 transition-colors"
          >
            {loading ? <Loader2 size={16} className="animate-spin mx-auto" /> : "Sign In"}
          </button>
          {error && (
            <p className="mt-3 text-red-400 text-xs text-center">{error}</p>
          )}
        </form>
      </div>
    );
  }

  const totalPending = suggestions.length + churches.length;

  return (
    <div
      className="min-h-screen p-4 md:p-8"
      style={{ backgroundColor: "#0D0B1A", fontFamily: "'Livvic', sans-serif" }}
    >
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <Shield size={20} className="text-purple-400" />
            <h1 className="text-white text-lg font-semibold">Moderation Queue</h1>
            {totalPending > 0 && (
              <span className="px-2 py-0.5 rounded-full bg-orange-500/20 text-orange-300 text-xs font-medium">
                {totalPending}
              </span>
            )}
          </div>
          <button
            onClick={() => loadPending(key)}
            disabled={loading}
            className="text-white/50 hover:text-white text-xs transition-colors"
          >
            {loading ? "Refreshing..." : "Refresh"}
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-300 text-sm">
            {error}
          </div>
        )}

        {totalPending === 0 && !loading && (
          <div className="text-center py-16 text-white/40 text-sm">
            No pending items to review
          </div>
        )}

        {/* Pending Field Corrections */}
        {suggestions.length > 0 && (
          <div className="mb-8">
            <h2 className="text-white/60 text-xs uppercase tracking-wider font-semibold mb-3">
              Field Corrections ({suggestions.length})
            </h2>
            <div className="space-y-2">
              {suggestions.map((s) => {
                const actionId = `suggestion-${s.churchId}-${s.field}`;
                const isActing = actionLoading === actionId;
                return (
                  <div
                    key={actionId}
                    className="p-4 rounded-xl border border-white/10"
                    style={{ backgroundColor: "#1E1040" }}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-purple-400 text-[10px] uppercase tracking-wider font-semibold">
                            {fieldLabel(s.field)}
                          </span>
                          <span className="text-white/30 text-[10px]">
                            {s.votes} vote{s.votes !== 1 ? "s" : ""}
                          </span>
                        </div>
                        <p className="text-white/40 text-xs mb-1 truncate">
                          Church: {s.churchId}
                        </p>
                        {s.currentValue && (
                          <p className="text-white/50 text-sm">
                            Current: <span className="text-white/70">{s.currentValue}</span>
                          </p>
                        )}
                        <p className="text-white text-sm mt-1">
                          Proposed: <span className="text-green-300 font-medium">{s.proposedValue}</span>
                        </p>
                      </div>
                      <div className="flex gap-2 flex-shrink-0">
                        <button
                          onClick={() =>
                            handleAction(
                              () => moderateApproveSuggestion(key, s.churchId, s.field),
                              actionId
                            )
                          }
                          disabled={isActing}
                          className="p-2 rounded-lg bg-green-600/20 hover:bg-green-600/40 text-green-400 transition-colors disabled:opacity-50"
                          title="Approve"
                        >
                          {isActing ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                        </button>
                        <button
                          onClick={() =>
                            handleAction(
                              () => moderateRejectSuggestion(key, s.churchId, s.field),
                              actionId
                            )
                          }
                          disabled={isActing}
                          className="p-2 rounded-lg bg-red-600/20 hover:bg-red-600/40 text-red-400 transition-colors disabled:opacity-50"
                          title="Reject"
                        >
                          <X size={16} />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Pending New Churches */}
        {churches.length > 0 && (
          <div>
            <h2 className="text-white/60 text-xs uppercase tracking-wider font-semibold mb-3">
              New Churches ({churches.length})
            </h2>
            <div className="space-y-2">
              {churches.map((ch) => {
                const actionId = `church-${ch.id}`;
                const isActing = actionLoading === actionId;
                return (
                  <div
                    key={ch.id}
                    className="p-4 rounded-xl border border-white/10"
                    style={{ backgroundColor: "#1E1040" }}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-white font-medium text-sm mb-1">{ch.name}</p>
                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-white/50">
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
                          {ch.attendance > 0 && <span>{ch.attendance} attendance</span>}
                        </div>
                        <p className="text-white/30 text-[10px] mt-1">
                          Submitted {new Date(ch.submittedAt).toLocaleDateString()}
                        </p>
                      </div>
                      <div className="flex gap-2 flex-shrink-0">
                        <button
                          onClick={() =>
                            handleAction(
                              () => moderateApproveChurch(key, ch.id),
                              actionId
                            )
                          }
                          disabled={isActing}
                          className="p-2 rounded-lg bg-green-600/20 hover:bg-green-600/40 text-green-400 transition-colors disabled:opacity-50"
                          title="Approve"
                        >
                          {isActing ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                        </button>
                        <button
                          onClick={() =>
                            handleAction(
                              () => moderateRejectChurch(key, ch.id),
                              actionId
                            )
                          }
                          disabled={isActing}
                          className="p-2 rounded-lg bg-red-600/20 hover:bg-red-600/40 text-red-400 transition-colors disabled:opacity-50"
                          title="Reject"
                        >
                          <X size={16} />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

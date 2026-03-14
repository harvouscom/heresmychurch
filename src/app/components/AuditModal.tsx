import { useEffect, useState } from "react";
import { CloseButton } from "./ui/close-button";
import {
  fetchAuditRecent,
  fetchAuditByState,
  type AuditLogEntry,
} from "./api";

function formatTimeAgo(createdAt: string): string {
  const ts = new Date(createdAt).getTime();
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

function actionLabel(action: string): string {
  const labels: Record<string, string> = {
    field_updated: "Field updated",
    church_added: "Church added",
    church_approved: "Church approved",
    church_rejected: "Church rejected",
    suggestion_rejected: "Suggestion rejected",
    state_populated: "State populated",
    state_refreshed: "State refreshed",
    church_confirmed: "Church confirmed",
    cleanup_blocked_denominations: "Blocked denominations cleanup",
    remove_by_name: "Removed by name",
    dc_removed: "DC removed",
  };
  return labels[action] ?? action.replace(/_/g, " ");
}

function fieldLabel(field: string | null): string {
  if (!field) return "";
  const labels: Record<string, string> = {
    name: "Church name",
    website: "Website",
    address: "Address",
    attendance: "Attendance",
    denomination: "Denomination",
    serviceTimes: "Service times",
    languages: "Languages",
    ministries: "Ministries",
    pastorName: "Pastor",
    phone: "Phone",
    email: "Email",
    homeCampusId: "Main campus link",
  };
  return labels[field] ?? field;
}

function formatValue(val: unknown): string {
  if (val == null) return "—";
  if (typeof val === "string") return val;
  if (typeof val === "number") return String(val);
  if (typeof val === "object" && val !== null && "name" in val) return String((val as { name?: string }).name ?? JSON.stringify(val));
  return JSON.stringify(val).slice(0, 80);
}

export function AuditModal({
  onClose,
  moderatorKey,
  focusedStateAbbrev,
  navigateToChurch,
}: {
  onClose: () => void;
  moderatorKey: string;
  focusedStateAbbrev: string | null;
  navigateToChurch?: (stateAbbrev: string, churchShortId: string) => void;
}) {
  const [scope, setScope] = useState<"recent" | "state">(focusedStateAbbrev ? "state" : "recent");
  const [entries, setEntries] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!moderatorKey) return;
    setLoading(true);
    setError(null);
    const state = scope === "state" ? focusedStateAbbrev : null;
    const promise = state
      ? fetchAuditByState(state, moderatorKey, 200)
      : fetchAuditRecent(moderatorKey, 200);
    promise
      .then((data) => setEntries(data.entries))
      .catch((e) => setError(e.message ?? "Failed to load audit log"))
      .finally(() => setLoading(false));
  }, [moderatorKey, scope, focusedStateAbbrev]);

  return (
    <div
      className="absolute inset-0 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div className="absolute inset-0 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-md rounded-2xl shadow-2xl overflow-hidden max-h-[85vh] flex flex-col"
        style={{ backgroundColor: "#1E1040" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative flex flex-col items-center text-center px-6 pt-6 pb-4 border-b border-white/10 flex-shrink-0">
          <CloseButton onClick={onClose} size="md" className="absolute top-4 right-4" />
          <h2 className="text-white font-medium text-[22px] leading-tight">Change history</h2>
          <p className="text-white/60 text-sm leading-relaxed mt-2 text-pretty">
            Recent changes to church data for transparency and accuracy.
          </p>
          {focusedStateAbbrev && (
            <div className="flex gap-2 mt-3">
              <button
                type="button"
                onClick={() => setScope("recent")}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                  scope === "recent"
                    ? "bg-white/20 text-white"
                    : "bg-white/10 text-white/70 hover:bg-white/15"
                }`}
              >
                All recent
              </button>
              <button
                type="button"
                onClick={() => setScope("state")}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                  scope === "state"
                    ? "bg-white/20 text-white"
                    : "bg-white/10 text-white/70 hover:bg-white/15"
                }`}
              >
                This state ({focusedStateAbbrev})
              </button>
            </div>
          )}
        </div>

        <div className="px-6 py-4 overflow-y-auto flex-1 min-h-0">
          {error && (
            <p className="text-red-300/90 text-sm mb-4">{error}</p>
          )}
          {loading && (
            <p className="text-white/50 text-sm">Loading…</p>
          )}
          {!loading && !error && entries.length === 0 && (
            <p className="text-white/50 text-sm text-center">No audit entries yet.</p>
          )}
          {!loading && !error && entries.length > 0 && (
            <ul className="space-y-3">
              {entries.map((entry) => (
                <li
                  key={entry.id}
                  className="rounded-lg bg-white/4 hover:bg-white/8 transition-colors px-3.5 py-3 space-y-2"
                >
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-1">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-purple-500/10 border border-purple-500/20 text-purple-300 text-[10px] font-medium uppercase tracking-wider">
                        {actionLabel(entry.action)}
                      </span>
                      <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-medium text-white/70 bg-white/10 border border-white/10">
                        {entry.source.replace(/_/g, " ")}
                      </span>
                    </div>
                    <span className="text-white/40 text-xs">
                      {formatTimeAgo(entry.created_at)}
                    </span>
                  </div>
                  {(entry.church_name || entry.church_id || (entry.state && entry.state !== "ALL")) && (
                    <div className="flex flex-col min-w-0">
                      <div className="text-white text-sm font-medium truncate">
                        {entry.church_name || (entry.church_id ? (
                          <span title={entry.church_id}>{entry.church_id}</span>
                        ) : (
                          entry.state
                        ))}
                      </div>
                      {(entry.church_city_state || (entry.church_id && entry.state && entry.state !== "ALL")) && (
                        <div className="text-white/40 text-xs mt-0.5">
                          {entry.church_city_state || entry.state}
                        </div>
                      )}
                    </div>
                  )}
                  {entry.field && (
                    <>
                      {entry.action === "field_updated" && entry.old_value != null && (
                        <p className="text-white/60 text-sm">
                          Current: <span className="text-white/60">{formatValue(entry.old_value)}</span>
                        </p>
                      )}
                      <p className="text-white text-sm">
                        {fieldLabel(entry.field)}:{" "}
                        {entry.new_value != null ? (
                          <span className="text-purple-400/90">{formatValue(entry.new_value)}</span>
                        ) : entry.old_value != null ? (
                          <span className="text-white/60">{formatValue(entry.old_value)}</span>
                        ) : (
                          "—"
                        )}
                      </p>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

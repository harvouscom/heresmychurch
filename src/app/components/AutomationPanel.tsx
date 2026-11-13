import { useCallback, useEffect, useState } from "react";
import { fetchModerationConfig, fetchModerationDecisions, saveModerationConfig, undoModerationDecision, type ModerationConfig, type ModerationDecision } from "./api";

const FIELD_LABELS: Record<string, string> = { phone: "Phone", serviceTimes: "Service times", denomination: "Denomination", languages: "Languages", ministries: "Ministries", pastorName: "Pastor", email: "Email", website: "Website", name: "Name", address: "Address", reportClosed: "Closed reports", reportDuplicate: "Duplicate reports", reportRelocated: "Moves", reportOutOfScope: "Scope reports", homeCampusId: "Main campus", attendance: "Attendance" };
const OUTCOME: Record<string, string> = { approve: "Approve", reject: "Reject", hide: "Hide", wait: "Wait", escalate: "To a reviewer", undo: "Undone", human_approve: "Reviewer approved", human_reject: "Reviewer rejected", church_accept: "Church accepted", church_decline: "Church declined" };

/** Reviewer controls for the automated engine: mode, which fields it may decide, and recent decisions with undo. */
export function AutomationPanel({ moderatorKey }: { moderatorKey: string }) {
  const [config, setConfig] = useState<ModerationConfig | null>(null);
  const [fields, setFields] = useState<string[]>([]);
  const [agreement, setAgreement] = useState<Record<string, { agree: number; disagree: number }>>({});
  const [decisions, setDecisions] = useState<ModerationDecision[]>([]);
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const load = useCallback(async () => {
    setError("");
    try {
      const [c, d] = await Promise.all([fetchModerationConfig(moderatorKey), fetchModerationDecisions(moderatorKey)]);
      setConfig(c.config); setFields(c.fields); setAgreement(c.agreement || {}); setDecisions(d.decisions);
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to load automation."); }
  }, [moderatorKey]);
  useEffect(() => { void load(); }, [load]);
  async function save(next: Partial<ModerationConfig>) {
    setBusy(true); setError("");
    try { const r = await saveModerationConfig(moderatorKey, next); setConfig(r.config); } catch (e) { setError(e instanceof Error ? e.message : "Unable to save."); } finally { setBusy(false); }
  }
  async function undo(id: number) {
    setBusy(true); setError("");
    try { await undoModerationDecision(moderatorKey, id); await load(); } catch (e) { setError(e instanceof Error ? e.message : "Unable to undo."); } finally { setBusy(false); }
  }
  if (!config) return <p className="text-white/50 text-sm text-center py-4">{error || "Loading automation…"}</p>;
  const enforce = new Set(config.enforceFields);
  return (
    <div className="space-y-4 text-sm">
      {error && <p className="text-red-400 text-caption">{error}</p>}
      <div className="space-y-2">
        <p className="text-white/60 text-caption">Mode</p>
        <div className="flex gap-1 rounded-full bg-white/5 p-1">
          {(["off", "shadow", "enforce"] as const).map(m => (
            <button key={m} type="button" disabled={busy} onClick={() => save({ mode: m })} className={`flex-1 rounded-full py-1.5 text-caption font-medium ${config.mode === m ? "bg-purple-500/30 text-white" : "text-white/60 hover:bg-white/5"}`}>
              {m === "off" ? "Off" : m === "shadow" ? "Shadow" : "Deciding"}
            </button>
          ))}
        </div>
        <p className="text-white/50 text-caption">{config.mode === "shadow" ? "The engine records what it would decide; people still decide." : config.mode === "enforce" ? "The engine decides the checked fields; everything else comes to this queue." : "The engine is paused."}{config.reason ? ` ${config.reason}` : ""}</p>
      </div>
      <div className="space-y-1.5">
        <p className="text-white/60 text-caption">Fields the engine may decide</p>
        <div className="grid grid-cols-2 gap-1.5">
          {fields.map(f => {
            const a = agreement[f]; const total = a ? a.agree + a.disagree : 0;
            return (
              <label key={f} className="flex items-center gap-2 rounded-lg bg-white/5 px-2.5 py-1.5 text-caption text-white/80">
                <input type="checkbox" disabled={busy} checked={enforce.has(f)} onChange={e => save({ enforceFields: e.target.checked ? [...enforce, f] : [...enforce].filter(x => x !== f) })} />
                <span className="flex-1">{FIELD_LABELS[f] || f}</span>
                {total > 0 && <span className="text-white/45" title="Shadow decisions that matched people's decisions">{Math.round((a!.agree / total) * 100)}%</span>}
              </label>
            );
          })}
        </div>
      </div>
      <div className="space-y-2">
        <p className="text-white/60 text-caption">Recent decisions</p>
        {decisions.length === 0 && <p className="text-white/45 text-caption">None yet.</p>}
        {decisions.slice(0, 40).map(d => (
          <div key={d.id} className="rounded-lg bg-white/5 px-3 py-2 space-y-1">
            <div className="flex items-center justify-between gap-2 text-caption">
              <span className="text-white/80">{FIELD_LABELS[d.field] || d.field} · {OUTCOME[d.outcome] || d.outcome}{d.mode === "shadow" ? " (shadow)" : ""}</span>
              {d.applied === 1 && !d.undone_by && ["approve", "reject", "hide"].includes(d.outcome) && (
                <button type="button" disabled={busy} onClick={() => undo(d.id)} className="text-purple-300 hover:text-purple-200">Undo</button>
              )}
              {d.undone_by && <span className="text-white/45">Undone</span>}
            </div>
            {d.proposed_value && <p className="text-white/60 text-caption break-words">{d.previous_value ? `${d.previous_value} → ` : ""}{d.proposed_value}</p>}
            {d.reasons.map((r, i) => <p key={i} className="text-white/45 text-caption break-words">{r.detail}</p>)}
            <p className="text-white/35 text-caption">{d.church_id} · {new Date(d.created_at).toLocaleString()}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

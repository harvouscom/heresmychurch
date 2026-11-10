import { useState } from "react";
import { fetchReviewEvidence, type ReviewEvidence } from "./api";

export function ReviewEvidenceCheck({ moderatorKey, churchId, field, proposedValue }: {
  moderatorKey: string; churchId: string; field: string; proposedValue: string;
}) {
  const [evidence, setEvidence] = useState<ReviewEvidence | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (field !== "phone" && field !== "serviceTimes") return null;
  async function check() {
    setLoading(true); setError(null);
    try { setEvidence(await fetchReviewEvidence(moderatorKey, churchId, field, proposedValue)); }
    catch (e) { setError(e instanceof Error ? e.message : "Evidence could not be checked."); }
    finally { setLoading(false); }
  }
  const label = evidence?.verdict === "supported" ? "Website supports this edit" : evidence?.verdict === "contradicted" ? "Website shows different information" : "Not enough evidence";
  return <div className="rounded-lg border border-purple-500/20 p-3 space-y-2 text-sm">
    <button type="button" disabled={loading} onClick={check} className="text-purple-300 underline underline-offset-2 disabled:opacity-50">
      {loading ? "Checking church website…" : evidence ? "Check evidence again" : "Check website with AI"}
    </button>
    <div aria-live="polite">
      {error && <p className="text-amber-300">{error}</p>}
      {evidence && <div className="space-y-2">
        <p className="text-white font-medium">{label}</p>
        <p className="text-white/70">{evidence.reason}</p>
        {evidence.quote && <blockquote className="border-l-2 border-purple-400/50 pl-2 text-white/80">“{evidence.quote}”</blockquote>}
        {evidence.sourceUrl && <a href={evidence.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-purple-300 underline">View church website</a>}
        <p className="text-xs text-white/50">AI assistance · checked {new Date(evidence.checkedAt).toLocaleString()}. Verify the church and campus before approving.</p>
      </div>}
    </div>
  </div>;
}

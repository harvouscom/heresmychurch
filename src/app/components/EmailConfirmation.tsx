import { useEffect, useState } from "react";
import type { Church } from "./church-data";
const BASE = ((import.meta.env.VITE_HMC_API_BASE_URL as string | undefined) || "https://api.heresmychurch.com").replace(/\/$/, "");
async function post(path: string, body: unknown) {
  const res = await fetch(`${BASE}/email-confirmation/${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const result = await res.json();
  if (!res.ok) throw new Error(result.error || "Please try again later.");
  return result;
}
const inputStyle = "w-full rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-sm text-white";
export function EmailConfirmationCard({ church }: { church: Church }) {
  const [status, setStatus] = useState<any>(null);
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    setStatus(null); setOpen(false); setMessage(""); setEmail("");
    fetch(`${BASE}/email-confirmation/status/${encodeURIComponent(church.id)}`).then(r => r.ok ? r.json() : null).then(data => { if (active) setStatus(data); }).catch(() => {});
    return () => { active = false; };
  }, [church.id, church.serviceTimes, church.address]);
  if (!status?.enabled && !status?.serviceTimesConfirmedAt) return null;
  return <section className="rounded-lg border border-white/10 bg-white/5 p-3 space-y-2">
    {status.serviceTimesConfirmedAt && <p className="text-xs text-emerald-300">Service times confirmed through church email · {new Date(status.serviceTimesConfirmedAt).toLocaleDateString()}</p>}
    {status.locationConfirmedAt && <p className="text-xs text-emerald-300">Listed location confirmed through church email · {new Date(status.locationConfirmedAt).toLocaleDateString()}</p>}
    {status.enabled && !open && <button type="button" className="text-sm text-purple-300 underline" onClick={() => setOpen(true)}>Notify me when service times are confirmed</button>}
    {open && <form className="space-y-2" onSubmit={async e => {
      e.preventDefault(); setBusy(true); setMessage("");
      try { await post("request", { churchId: church.id, email }); setMessage("Check your inbox to confirm your request. Delivery may take a few minutes."); setOpen(false); }
      catch (error) { setMessage(error instanceof Error ? error.message : "Please try again."); } finally { setBusy(false); }
    }}>
      <label className="block text-sm text-white" htmlFor="confirmation-email">Your email</label>
      <input id="confirmation-email" type="email" autoComplete="email" required maxLength={254} value={email} onChange={e => setEmail(e.target.value)} className={inputStyle} />
      <p className="text-xs text-white/60">One update when confirmed. No marketing, and your address is never shared with the church. Request expires after 90 days.</p>
      <button disabled={busy} className="rounded-lg bg-purple-600 px-3 py-2 text-sm text-white disabled:opacity-50">{busy ? "Requesting…" : "Email me when confirmed"}</button>
    </form>}
    {message && <p role="status" className="text-sm text-white/80">{message}</p>}
  </section>;
}

export function EmailConfirmationPage() {
  const [params] = useState(() => Object.fromEntries(new URLSearchParams(window.location.hash.slice(1))));
  const [church, setChurch] = useState<any>(null);
  const [times, setTimes] = useState("");
  const [address, setAddress] = useState("");
  const [correct, setCorrect] = useState(false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  async function act(action: string, extra = {}) {
    setBusy(true); setMessage("");
    try {
      const result = await post("action", { ...params, action, ...extra });
      if (result.completed) { setDone(true); setMessage("These details have already been submitted. Thank you."); }
      else if (result.church) { setChurch(result.church); setTimes(result.church.serviceTimes); setAddress([result.church.address, result.church.city].filter(Boolean).join(", ")); }
      else { setMessage(result.message || "Your request has been cancelled."); setDone(action !== "subscribe"); }
    } catch (error) { setMessage(error instanceof Error ? error.message : "Please try again."); } finally { setBusy(false); }
  }
  return <main className="min-h-screen bg-[#13111c] px-5 py-16 text-white"><div className="mx-auto max-w-lg space-y-5">
    <a href="/world" className="text-purple-300">Here's My Church</a>
    <h1 className="text-2xl font-semibold">{params.mode === "staff" ? "Help people plan a visit" : params.mode === "stop" ? "Stop church confirmation requests" : "Confirm your email update request"}</h1>
    {!params.key || !params.token ? <p>This link is incomplete. Please open the full link from your email.</p> : !done && <>
      {params.mode === "staff" ? !church ? <button disabled={busy} onClick={() => act("preview")} className="rounded bg-purple-600 px-4 py-2">Review church details</button> : <form className="space-y-4" onSubmit={e => { e.preventDefault(); act("save", { serviceTimes: times, locationCorrect: correct, address, original: church }); }}>
        <h2 className="text-xl">{church.name}</h2>
        <label className="block">Worship service days and times<textarea required maxLength={1000} value={times} onChange={e => setTimes(e.target.value)} placeholder="Sunday 9 am and 11 am" className={inputStyle} /></label>
        <p>Listed location: {church.address || "Not listed"}, {church.city}</p>
        <label className="flex gap-2"><input type="checkbox" checked={correct} onChange={e => setCorrect(e.target.checked)} />I confirm this is our current worship location.</label>
        {!correct && <label className="block">Correct street address, city, and region<textarea required maxLength={600} value={address} onChange={e => setAddress(e.target.value)} className={inputStyle} /></label>}
        <p className="text-sm text-white/60">Service times will be published. Location corrections go to review. This link confirms access to the church's listed email contact.</p>
        <button disabled={busy} className="rounded bg-purple-600 px-4 py-2">{busy ? "Saving…" : "Confirm details"}</button>
      </form> : <button disabled={busy} className="rounded bg-purple-600 px-4 py-2" onClick={() => act(params.mode === "stop" ? "stop" : "subscribe")}>{busy ? "Working…" : params.mode === "stop" ? "Stop requests" : "Confirm my request"}</button>}
      {params.mode !== "staff" && params.mode !== "stop" && <button disabled={busy} className="block text-sm text-white/70 underline" onClick={() => act("cancel")}>Cancel my update request and delete my email</button>}
    </>}
    {message && <p role="status">{message}</p>}
  </div></main>;
}

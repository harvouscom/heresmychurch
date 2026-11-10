import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Bell, Check, CheckCheck, ChevronRight, Church as ChurchIcon, Clock3, LoaderCircle, Mail, MapPin, ShieldCheck, X } from "lucide-react";
import type { Church } from "./church-data";
import "./email-confirmation.css";
import appIcon from "../../assets/a94bce1cf0860483364d5d9c353899b7da8233e7.png";

const BASE = ((import.meta.env.VITE_HMC_API_BASE_URL as string | undefined) || "https://api.heresmychurch.com").replace(/\/$/, "");
async function post(path: string, body: unknown) {
  const res = await fetch(`${BASE}/email-confirmation/${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const result = await res.json();
  if (!res.ok) throw new Error(result.error || "Please try again later.");
  return result;
}
interface ConfirmationStatus { enabled: boolean; serviceTimesConfirmedAt?: number; locationConfirmedAt?: number }
interface ReviewChurch { name: string; serviceTimes: string; address: string; city: string }
const date = (value: number) => new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });

export function EmailConfirmationCard({ church }: { church: Church }) {
  const [status, setStatus] = useState<ConfirmationStatus | null>(null);
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    setStatus(null); setOpen(false); setSent(false); setError(""); setEmail("");
    fetch(`${BASE}/email-confirmation/status/${encodeURIComponent(church.id)}`).then(r => r.ok ? r.json() : null).then(data => { if (active) setStatus(data); }).catch(() => {});
    return () => { active = false; };
  }, [church.id, church.serviceTimes, church.address]);
  if (!status?.enabled && !status?.serviceTimesConfirmedAt) return null;
  return <section className="email-update" aria-label="Service time email updates">
    {status.serviceTimesConfirmedAt && <p className="email-update-proof"><ShieldCheck size={13} />Service times confirmed · {date(status.serviceTimesConfirmedAt)}</p>}
    {status.locationConfirmedAt && <p className="email-update-proof"><MapPin size={13} />Location confirmed · {date(status.locationConfirmedAt)}</p>}
    {(status.serviceTimesConfirmedAt || status.locationConfirmedAt) && <p className="email-update-source">Confirmed through the church’s listed email.</p>}
    {sent ? <div className="email-update-sent" role="status"><span className="email-update-icon"><Check size={14} /></span><div><strong>Check your inbox</strong><p>Confirm your request using the link we sent. It may take a few minutes.</p></div></div> : status.enabled && <>
      <button type="button" className="email-update-trigger" aria-expanded={open} aria-controls={`email-form-${church.id}`} onClick={() => { setOpen(!open); setError(""); }}>
        <Bell size={14} /><span>{church.serviceTimes?.trim() ? "Notify me when these times are verified" : "Email me when service times are confirmed"}</span>{open ? <X size={13} /> : <ChevronRight size={14} />}
      </button>
      {open && <form id={`email-form-${church.id}`} className="email-update-form" onSubmit={async e => {
        e.preventDefault(); setBusy(true); setError("");
        try { await post("request", { churchId: church.id, email }); setSent(true); setOpen(false); }
        catch (err) { setError(err instanceof Error ? err.message : "Please try again."); } finally { setBusy(false); }
      }}>
        <label className="email-sr-only" htmlFor={`email-input-${church.id}`}>Your email address</label>
        <div className="email-update-input-row"><div className="email-input-wrap"><Mail size={13} aria-hidden="true" /><input id={`email-input-${church.id}`} type="email" autoComplete="email" placeholder="Your email address" required maxLength={254} value={email} onChange={e => setEmail(e.target.value)} className="email-input" aria-describedby={`email-note-${church.id}`} disabled={busy} /></div>
          <button disabled={busy} className="email-button email-button-small">{busy ? <LoaderCircle size={13} className="email-spin" /> : <ArrowRight size={13} />}<span>{busy ? "Sending…" : "Notify me"}</span></button>
        </div>
        <p id={`email-note-${church.id}`} className="email-update-note">One email when confirmed. No marketing or sharing your address. Request expires in 14 days.</p>
        {error && <p role="alert" className="email-error">{error}</p>}
      </form>}
    </>}
  </section>;
}

export function EmailPageBackdrop({ point }: { point?: { lat: number; lng: number } } = {}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pointRef = useRef(point); pointRef.current = point;
  const globeRef = useRef<{ destroy(): void; select(point: { lat: number; lng: number }): void } | null>(null);
  useEffect(() => {
    let disposed = false;
    Promise.all([import("./report/lookup-particle-globe"), import("./report/globe-cells.json")]).then(([renderer, cells]) => {
      if (disposed || !canvasRef.current) return;
      const globe = renderer.createGlobe(canvasRef.current, cells.default, { lat: 26, lng: -38, top: 50, scale: 1.15, driftSpeed: 0.012, pinOffset: 30 });
      globeRef.current = globe;
      if (pointRef.current) globe.select(pointRef.current);
    }).catch(() => { /* The CSS horizon remains when the decorative canvas cannot load. */ });
    return () => { disposed = true; globeRef.current?.destroy(); globeRef.current = null; };
  }, []);
  useEffect(() => { if (point) globeRef.current?.select(point); }, [point?.lat, point?.lng]);
  return <div className="email-page-backdrop" aria-hidden="true"><div className="email-page-horizon"><canvas ref={canvasRef} /></div></div>;
}

export function EmailConfirmationPage() {
  const [params] = useState(() => Object.fromEntries(new URLSearchParams(window.location.hash.slice(1))));
  const [church, setChurch] = useState<ReviewChurch | null>(null);
  const [times, setTimes] = useState("");
  const [address, setAddress] = useState("");
  const [correct, setCorrect] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<"subscribe" | "save" | "stop" | "cancel" | null>(null);
  const staff = params.mode === "staff";
  const stop = params.mode === "stop";
  const incomplete = !params.key || !params.token;
  useEffect(() => {
    const previous = document.title;
    document.title = "Email updates | Here’s My Church";
    return () => { document.title = previous; };
  }, []);
  async function act(action: string, extra = {}) {
    setBusy(true); setError("");
    try {
      const result = await post("action", { ...params, action, ...extra });
      if (result.completed) { setOutcome("save"); setMessage("These details have already been submitted. Thank you for helping visitors plan a visit."); }
      else if (result.church) { setChurch(result.church); setTimes(result.church.serviceTimes); setAddress([result.church.address, result.church.city].filter(Boolean).join(", ")); }
      else { setMessage(result.message || "Your request has been cancelled and your email deleted."); setOutcome(action as "subscribe" | "save" | "stop" | "cancel"); }
    } catch (err) { setError(err instanceof Error ? err.message : "Please try again."); } finally { setBusy(false); }
  }
  const title = incomplete ? "A little link trouble" : outcome === "subscribe" ? "Request confirmed" : outcome === "cancel" ? "Request cancelled" : outcome === "save" ? "Thanks for the update" : outcome === "stop" ? "Requests stopped" : staff ? "Help people plan a visit" : stop ? "Stop confirmation requests?" : "Confirm your email request";
  const description = incomplete ? "Open the full link from your email to continue." : outcome ? message : staff ? "Review your church’s service times and location so visitors can arrive with confidence." : stop ? "We’ll stop sending requests to confirm this church’s details." : "We’ll send you one email when this church’s service times are confirmed.";
  return <main className="email-page"><EmailPageBackdrop /><div className="email-page-shell">
    <a href="/world" className="email-wordmark"><img src={appIcon} alt="" width={30} height={30} />Here’s My Church</a>
    <section className="email-page-card" aria-labelledby="email-page-title">
      <div className="email-card-heading"><span className={`email-page-symbol${outcome ? " is-success" : ""}`}>{outcome ? <CheckCheck size={15} /> : staff ? <ChurchIcon size={15} /> : <Mail size={15} />}</span><p className="email-eyebrow">{staff ? "Church details" : "Service-time updates"}</p></div>
      <h1 id="email-page-title">{title}</h1>
      <p className="email-page-description" role={outcome ? "status" : undefined}>{description}</p>
      {!incomplete && !outcome && (staff ? !church ? <button disabled={busy} onClick={() => act("preview")} className="email-button email-page-primary">{busy ? <LoaderCircle size={14} className="email-spin" /> : <ArrowRight size={14} />}Review church details</button> : <form className="email-review-form" onSubmit={e => { e.preventDefault(); act("save", { serviceTimes: times, locationCorrect: correct, address, original: church }); }}>
        <div className="email-church-name"><ChurchIcon size={15} /><h2>{church.name}</h2></div>
        <label className="email-field">Worship service days and times<textarea required maxLength={1000} value={times} onChange={e => setTimes(e.target.value)} placeholder="Sunday 9 am and 11 am" className="email-input" rows={3} /></label>
        <div className="email-location"><MapPin size={14} /><div><span>Listed worship location</span><p>{church.address || "Not listed"}{church.city ? `, ${church.city}` : ""}</p></div></div>
        <label className="email-check"><input type="checkbox" checked={correct} onChange={e => setCorrect(e.target.checked)} /><span>This is our current worship location.</span></label>
        {!correct && <label className="email-field">Correct street address, city, and region<textarea required maxLength={600} value={address} onChange={e => setAddress(e.target.value)} className="email-input" rows={2} /></label>}
        <p className="email-review-note">Service times are published when you confirm. Location changes go to review.</p>
        <button disabled={busy} className="email-button email-page-primary">{busy ? <LoaderCircle size={14} className="email-spin" /> : <Check size={14} />}{busy ? "Saving…" : "Confirm details"}</button>
      </form> : <>
        {!stop && <div className="email-page-details"><p><Bell size={14} />One update when service times are confirmed</p><p><ShieldCheck size={14} />Your email stays private. No marketing.</p><p><Clock3 size={14} />Request expires after 14 days</p></div>}
        <div className="email-page-actions"><button disabled={busy} className="email-button email-page-primary" onClick={() => act(stop ? "stop" : "subscribe")}>{busy ? <LoaderCircle size={14} className="email-spin" /> : stop ? <Bell size={14} /> : <Check size={14} />}{busy ? "Working…" : stop ? "Stop requests" : "Confirm my request"}</button>{!stop && <button disabled={busy} className="email-cancel" aria-label="Cancel request and delete my email" title="Cancel request and delete my email" onClick={() => act("cancel")}>Cancel request</button>}</div>
      </>)}
      {error && <p role="alert" className="email-error email-page-error">{error}</p>}
      {outcome && <div className="email-page-actions"><a href="/world" className="email-button email-page-primary">Back to the map<ArrowRight size={14} /></a>{outcome === "subscribe" && <button disabled={busy} className="email-cancel" aria-label="Cancel request and delete my email" title="Cancel request and delete my email" onClick={() => act("cancel")}>Cancel request</button>}</div>}

    </section>
    <a className="email-back" href="/world"><ArrowLeft size={13} />Explore the map</a>
  </div></main>;
}

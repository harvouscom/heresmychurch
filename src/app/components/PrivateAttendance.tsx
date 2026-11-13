import { useState } from 'react';
import { LockKeyhole, Check } from 'lucide-react';
import { Link } from 'react-router';
import { portalRequest } from './portal-api';
import { reviewerSessionActive } from './api';

// Signed-in reviewers (Cloudflare Access) go through the same-origin proxy; the key field is a fallback.
async function reviewerRequest(path: string, key: string, body?: unknown) {
  if (!key && reviewerSessionActive()) {
    const res = await fetch(`/review/api/${path}`, body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({})); if (!res.ok) throw new Error(data.error || 'Sign in again at /review.'); return data;
  }
  return portalRequest(path, body, undefined, { 'x-moderator-key': key });
}

export function PrivateAttendanceForm({ token }: { token: string }) {
  const [lower, setLower] = useState(''), [upper, setUpper] = useState(''), [weeks, setWeeks] = useState('8'), [basis, setBasis] = useState('approximate'), [notes, setNotes] = useState('');
  const [accepted, setAccepted] = useState(false), [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [error, setError] = useState('');
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError('');
    try { const result = await portalRequest('church-portal/session', { token, action: 'attendance', report: { lower: Number(lower), upper: Number(upper), weeks: Number(weeks), basis, notes, definitionAccepted: accepted } }); setMessage(result.message); }
    catch (e) { setError(e instanceof Error ? e.message : 'Please try again.'); } finally { setBusy(false); }
  }
  return <details className="attendance-private"><summary><LockKeyhole size={14} /><span>Help improve our attendance estimate</span></summary><p>Our estimates draw on building size and denominational patterns where available. Your local knowledge helps us get closer.</p>{message ? <p className="portal-message" role="status"><Check size={14} /> {message}</p> : <form className="email-review-form" onSubmit={submit}><p className="attendance-private-note"><LockKeyhole size={13} />Only the HMC review team sees this report. Sharing is optional.</p><fieldset><legend>About how many people attend in a typical week?</legend><div className="attendance-range"><label className="email-field">From<input className="email-input" type="number" min={1} max={50000} required value={lower} onChange={e => setLower(e.target.value)} /></label><span>–</span><label className="email-field">To<input className="email-input" type="number" min={Number(lower) || 1} max={50000} required value={upper} onChange={e => setUpper(e.target.value)} /></label></div><p className="email-review-note">A rough range is welcome. Enter the same number twice for an exact count.</p></fieldset><label className="email-field">Based on how many recent, typical weeks?<input className="email-input" type="number" min={4} max={13} required value={weeks} onChange={e => setWeeks(e.target.value)} /></label><label className="email-field">How was this worked out?<select className="email-input" value={basis} onChange={e => setBasis(e.target.value)}><option value="approximate">An informed approximation</option><option value="counted">Recorded attendance counts</option></select></label><label className="email-check"><input type="checkbox" checked={accepted} onChange={e => setAccepted(e.target.checked)} required /><span>Count people attending worship in person at this location, including children, once per week across all services. Exclude online views, other campuses, and holiday peaks.</span></label><label className="email-field">Anything that would help us interpret this? (optional)<textarea className="email-input" rows={2} value={notes} maxLength={500} onChange={e => setNotes(e.target.value)} placeholder="For example, a recent move or a seasonal pattern" /></label><button className="email-button" disabled={busy}>{busy ? 'Sharing…' : 'Share privately'}</button><p className="email-review-note">A maintainer reviews this before adjusting the public estimate. Your reported range stays private and is removed after 180 days.</p>{error && <p role="alert" className="email-error">{error}</p>}</form>}</details>;
}

export function AttendanceReviewPage() {
  const [key, setKey] = useState(''), [reports, setReports] = useState<any[] | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState(''), [message, setMessage] = useState('');
  const [estimates, setEstimates] = useState<Record<string, string>>({}), [reasons, setReasons] = useState<Record<string, string>>({});
  async function load(e?: React.FormEvent) {
    e?.preventDefault(); setBusy(true); setError('');
    try { const data = await reviewerRequest('moderate/attendance-reports', key); setReports(data.reports); }
    catch (e) { setError(e instanceof Error ? e.message : 'Unable to load reports.'); } finally { setBusy(false); }
  }
  async function review(id: string, action: string) {
    setBusy(true); setError(''); setMessage('');
    try {
      const data = await reviewerRequest('moderate/attendance-reports/review', key, { id, action, estimate: Number(estimates[id]), reason: reasons[id] || '' });
      setMessage(data.message); setReports(rows => rows!.filter(r => r.id !== id));
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to review.'); } finally { setBusy(false); }
  }
  // Deliberately separate from the public dashboard and its data requests.
  return <main className="portal-page"><div className="portal-shell attendance-review-page"><Link className="email-back" to="/improve-the-map">Back to church data</Link><h1>Private attendance review</h1><p className="email-page-description">Compare the church’s context with the model. Reports are calibration evidence, and require your judgment before any estimate changes.</p>{reports === null ? <form className="email-review-form" onSubmit={load}><label className="email-field">Moderator key<input className="email-input" type="password" autoComplete="off" value={key} onChange={e => setKey(e.target.value)} required /></label><button className="email-button" disabled={busy}>{busy ? 'Opening…' : 'Open private reports'}</button></form> : <><div className="attendance-review-tools"><button className="email-button" disabled={busy} onClick={() => load()}>Refresh reports</button><button className="email-cancel" onClick={() => { setKey(''); setReports(null); setMessage(''); setError(''); }}>Close private review</button></div>{!reports.length && <p className="portal-message">No pending attendance reports.</p>}{reports.map(r => <article key={r.id} className="email-page-card attendance-review-row"><h2>{r.churchName}</h2><p className="email-page-description">{[r.city, r.region].filter(Boolean).join(', ')} · Submitted {new Date(r.at).toLocaleDateString()}</p><dl><div><dt>Current estimate at submission</dt><dd>{r.baselineEstimate?.toLocaleString() || 'Unavailable'}</dd></div><div><dt>Private reported range</dt><dd>{r.lower.toLocaleString()}–{r.upper.toLocaleString()}</dd></div><div><dt>Basis</dt><dd>{r.basis === 'counted' ? 'Recorded counts' : 'Approximation'} · {r.weeks} weeks</dd></div></dl>{r.notes && <p className="attendance-review-note">{r.notes}</p>}<p className="email-review-note">In-person worship, children included, each person counted once per week at this location. Consider building capacity, measurement method, typical weeks, and unusual changes before calibrating.</p><label className="email-field">Estimate to publish (within reported range)<input className="email-input" type="number" min={r.lower} max={r.upper} value={estimates[r.id] || ''} placeholder="Choose after review" onChange={e => setEstimates(s => ({ ...s, [r.id]: e.target.value }))} /></label><label className="email-field">Private review note<textarea className="email-input" minLength={10} maxLength={500} value={reasons[r.id] || ''} onChange={e => setReasons(s => ({ ...s, [r.id]: e.target.value }))} placeholder="Why is this a reasonable calibration, or why should it be dismissed?" /></label><div className="attendance-review-tools"><button className="email-button" disabled={busy || !estimates[r.id] || (reasons[r.id]?.trim().length || 0) < 10} onClick={() => review(r.id, 'apply')}>Calibrate estimate</button><button className="email-cancel" disabled={busy || (reasons[r.id]?.trim().length || 0) < 10} onClick={() => review(r.id, 'dismiss')}>Dismiss report</button></div></article>)}</>}{message && <p className="portal-message" role="status">{message}</p>}{error && <p className="email-error" role="alert">{error}</p>}</div></main>;
}

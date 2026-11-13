import { useCallback, useEffect, useState } from 'react';
import { Link, NavLink, Navigate, useLocation, useSearchParams } from 'react-router';
import { ArrowLeft, ArrowUpRight, Check, Globe2, Mail, ShieldCheck } from 'lucide-react';
import { EmailPageBackdrop } from './EmailConfirmation';
import type { Church as ChurchType } from './church-data';
import logo from '../../assets/a94bce1cf0860483364d5d9c353899b7da8233e7.png';
import './church-portal.css';
import { PrivateAttendanceForm } from './PrivateAttendance';
import { PortalChurchPreview } from './PortalChurchPreview';
import { portalRequest } from './portal-api';
export { PORTAL_BASE, portalRequest } from './portal-api';
export function PortalShell({ children, wide = false, point, showGlobeBackdrop = true }: { children: React.ReactNode; wide?: boolean; showGlobeBackdrop?: boolean; point?: { lat: number; lng: number } }) {
  return <main className={`portal-page ${wide ? 'portal-wide' : ''}`}>{showGlobeBackdrop ? <EmailPageBackdrop point={point} /> : <div className="portal-ambient" aria-hidden="true" />}<div className="portal-shell"><nav className="portal-nav" aria-label="Main navigation"><Link to="/" className="portal-brand"><img src={logo} alt="" />Here’s My Church</Link><div className="portal-nav-links"><NavLink to="/improve-the-map">Improve the map</NavLink><NavLink to="/for-churches">For churches</NavLink></div></nav>{import.meta.env.DEV && <p className="portal-local-note">Local preview · sample data</p>}{children}<footer className="portal-footer"><Link to="/"><ArrowLeft size={13} /> Back to the map</Link><span>A little care. A more welcoming map.</span></footer></div></main>;
}
export function ChurchClaimCard({ church }: { church: ChurchType }) {
  const fromData = (church as ChurchType & { claimed?: boolean }).claimed;
  const [claimed, setClaimed] = useState(!!fromData);
  useEffect(() => {
    // Region data carries the claimed flag; older cached data falls back to the status endpoint.
    if (fromData !== undefined) { setClaimed(!!fromData); return; }
    const controller = new AbortController(); setClaimed(false); portalRequest(`church-portal/status/${encodeURIComponent(church.id)}`, undefined, controller.signal).then(s => setClaimed(s.claimed)).catch(() => {}); return () => controller.abort();
  }, [church.id, church.email, fromData]);
  return <div className="church-claim-link">{claimed && <span><ShieldCheck size={13} /> Managed by the church</span>}<Link to={`/for-churches?church=${encodeURIComponent(church.id)}&name=${encodeURIComponent(church.name)}`}>{claimed ? 'Manage this listing' : 'Is this your church? Manage this listing'} <ArrowUpRight size={13} /></Link></div>;
}

type PortalFields = Record<'name' | 'address' | 'city' | 'postcode' | 'denomination' | 'serviceTimes' | 'phone' | 'email' | 'website' | 'pastorName' | 'languages' | 'ministries', string>;
const EMPTY_FIELDS: PortalFields = { name: '', address: '', city: '', postcode: '', denomination: '', serviceTimes: '', phone: '', email: '', website: '', pastorName: '', languages: '', ministries: '' };
const FIELD_GROUPS: { title: string; fields: { key: keyof PortalFields; label: string; type?: string; multiline?: boolean; placeholder?: string; half?: boolean }[] }[] = [
  { title: 'Listing', fields: [{ key: 'name', label: 'Church name' }, { key: 'denomination', label: 'Denomination', half: true }, { key: 'pastorName', label: 'Lead pastor', half: true }] },
  { title: 'Location', fields: [{ key: 'address', label: 'Street address' }, { key: 'city', label: 'City', half: true }, { key: 'postcode', label: 'Postcode', half: true }] },
  { title: 'Visiting', fields: [{ key: 'serviceTimes', label: 'Service times', multiline: true, placeholder: 'Sunday 9am & 11am' }, { key: 'languages', label: 'Languages', half: true, placeholder: 'English, Spanish' }, { key: 'ministries', label: 'Ministries', half: true, placeholder: 'Kids, Youth' }] },
  { title: 'Contact', fields: [{ key: 'phone', label: 'Phone', type: 'tel', half: true }, { key: 'website', label: 'Website', type: 'url', half: true }, { key: 'email', label: 'Contact email (sign-in links go here)', type: 'email' }] },
];
const FIELD_LABELS: Record<string, string> = { name: 'Name', address: 'Address', denomination: 'Denomination', serviceTimes: 'Service times', phone: 'Phone', email: 'Contact email', website: 'Website', pastorName: 'Lead pastor', languages: 'Languages', ministries: 'Ministries', reportClosed: 'Reported closed', reportDuplicate: 'Reported duplicate', reportOutOfScope: 'Reported out of scope', reportRelocated: 'Reported moved', homeCampusId: 'Main campus', attendance: 'Attendance' };
const toFields = (c: any): PortalFields => ({ ...EMPTY_FIELDS, ...Object.fromEntries(Object.keys(EMPTY_FIELDS).map(k => [k, String(c?.[k] ?? '')])) } as PortalFields);
function showValue(field: string, value: unknown) {
  if (field === 'address' && typeof value === 'string') { try { const a = JSON.parse(value); return [a.address, a.city, a.postcode].filter(Boolean).join(', '); } catch { return value; } }
  return Array.isArray(value) ? value.join(', ') : String(value ?? '') || '—';
}

export function ChurchPortalPage() {
  const [params] = useSearchParams();
  const hash = new URLSearchParams(window.location.hash.slice(1));
  const [token, setToken] = useState(() => hash.get('token') || '');
  const [verifyToken] = useState(() => hash.get('verify') || '');
  const [church, setChurch] = useState<any>(null);
  const [fields, setFields] = useState<PortalFields>(EMPTY_FIELDS);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [message, setMessage] = useState('');
  const [claimed, setClaimed] = useState(false);
  const [pending, setPending] = useState<any[]>([]);
  const [point, setPoint] = useState<{ lat: number; lng: number }>();
  const showPoint = useCallback((p: { lat: number; lng: number }) => setPoint(p), []);
  const [listing, setListing] = useState<any>(null);
  const [listingError, setListingError] = useState('');
  const [results, setResults] = useState<any[]>([]);
  useEffect(() => { document.title = 'For churches | Here’s My Church'; if (token || verifyToken) window.history.replaceState(null, '', window.location.pathname + window.location.search); }, []);
  useEffect(() => {
    if (!verifyToken) return;
    setBusy(true);
    portalRequest('church-portal/verify-email', { token: verifyToken }).then(d => setMessage(d.message)).catch(e => setError(e.message)).finally(() => setBusy(false));
  }, [verifyToken]);
  useEffect(() => {
    if (!token) return;
    const controller = new AbortController(); setBusy(true);
    Promise.all([
      portalRequest('church-portal/session', { token, action: 'preview' }, controller.signal),
      portalRequest('church-portal/session', { token, action: 'pending' }, controller.signal).catch(() => ({ pending: [] })),
    ]).then(([d, p]) => { setChurch(d.church); setClaimed(!!d.claimed); setFields(toFields(d.church)); setPending(p.pending || []); })
      .catch(e => { if (!controller.signal.aborted) setError(e.message); })
      .finally(() => { if (!controller.signal.aborted) setBusy(false); });
    return () => controller.abort();
  }, [token]);
  const listingId = params.get('church');
  useEffect(() => {
    setListing(null); setListingError(''); if (!listingId) return;
    const controller = new AbortController();
    portalRequest(`church-portal/listing/${encodeURIComponent(listingId)}`, undefined, controller.signal).then(d => setListing(d.church)).catch(e => { if (!controller.signal.aborted) setListingError(e.message); });
    return () => controller.abort();
  }, [listingId]);
  async function act(action: string, extra: Record<string, unknown> = {}) {
    setBusy(true); setError(''); setMessage(''); setResults([]);
    try {
      const d = await portalRequest(`church-portal/${action === 'request' ? 'request' : 'session'}`, action === 'request' ? { churchId: params.get('church') } : { token, action, ...(action === 'save' ? { fields } : {}), ...extra });
      setMessage(d.message); setResults(d.results || []);
      if (d.church) { setChurch(d.church); setFields(toFields(d.church)); }
      if (d.pending) setPending(d.pending);
      if (action === 'claim' || d.claimed) setClaimed(true);
      if (action === 'logout') { setToken(''); setChurch(null); }
    } catch (e) { setError(e instanceof Error ? e.message : 'Please try again.'); } finally { setBusy(false); }
  }
  const name = church?.name || listing?.name || params.get('name') || 'Your church';
  const signedIn = <>
    <p className="email-page-description">You’re signed in through the listed church inbox. Changes you save here go live right away{claimed ? '' : ' and claim this listing'}. Your private link is valid until it expires.</p>
    {!claimed && <button className="email-button portal-full" disabled={busy} onClick={() => act('claim')}>Claim this listing</button>}
    {claimed && <p className="portal-message"><Check size={14} /> Listing claimed. Other people’s suggestions come to you first.</p>}
    {pending.length > 0 && <section className="portal-pending" aria-label="Suggestions waiting for you">
      <h3>Suggestions waiting for you</h3>
      <p className="email-review-note">If you don’t answer within 14 days of a suggestion, our automated review decides instead.</p>
      {pending.map(p => <div className="portal-pending-item" key={`${p.field}:${p.value}`}>
        <div><strong>{FIELD_LABELS[p.field] || p.field}</strong>{p.votes > 1 ? <span> · {p.votes} people</span> : null}</div>
        <div className="portal-pending-change"><span className="portal-pending-old">{showValue(p.field, p.current)}</span> → <span>{showValue(p.field, p.value)}</span></div>
        <div className="portal-pending-actions"><button className="email-button" disabled={busy} onClick={() => act('accept', { field: p.field, value: p.value, reviewVersion: p.reviewVersion })}>Accept</button><button className="email-cancel" disabled={busy} onClick={() => act('decline', { field: p.field, value: p.value, reviewVersion: p.reviewVersion })}>Decline</button></div>
      </div>)}
    </section>}
    <form className="email-review-form portal-edit-form" onSubmit={e => { e.preventDefault(); act('save'); }}>
      {FIELD_GROUPS.map(group => <fieldset key={group.title} className="portal-fieldset"><legend>{group.title}</legend><div className="portal-field-grid">
        {group.fields.map(f => <label className={`email-field ${f.half ? 'portal-half' : ''}`} key={f.key}>{f.label}
          {f.multiline ? <textarea className="email-input" rows={3} maxLength={2000} value={fields[f.key]} placeholder={f.placeholder} onChange={e => setFields(v => ({ ...v, [f.key]: e.target.value }))} />
            : <input className="email-input" type={f.type || 'text'} maxLength={f.key === 'name' ? 120 : 2000} value={fields[f.key]} placeholder={f.placeholder} onChange={e => setFields(v => ({ ...v, [f.key]: e.target.value }))} />}
        </label>)}
      </div></fieldset>)}
      <p className="email-review-note">A new contact email takes effect after you confirm it from that inbox.</p>
      <button className="email-button" disabled={busy}>{busy ? 'Saving…' : 'Save changes'}</button>
    </form>
    <PrivateAttendanceForm token={token} />
    <button className="email-cancel" disabled={busy} onClick={() => act('logout')}>Sign out and invalidate this link</button>
  </>;
  const signedOut = <>
    <p className="email-page-description">{params.get('church') ? `We’ll send a private sign-in link to the contact email listed for ${name}.` : 'Find your church on the map, open its details, and choose “Manage this listing” to get started.'}</p>
    {listing && <p className="email-page-description" style={{ overflowWrap: 'anywhere' }}>{listing.hasEmail ? <>Sign-in link goes to the listed inbox <strong>{listing.emailHint}</strong>.</> : <>No contact email is listed. Suggest a contact correction from the map to get started.</>}</p>}
    {params.get('church') ? <button className="email-button portal-full" disabled={busy || !listing?.hasEmail} onClick={() => act('request')}><Mail size={15} />{busy ? 'Sending…' : 'Email a sign-in link'}</button> : <Link className="email-button portal-full" to="/">Find your church <ArrowUpRight size={15} /></Link>}
    <div className="portal-assurances"><p><Mail size={15} /> Secure access through your listed inbox</p><p><Globe2 size={15} /> Your edits go live right away</p><p><ShieldCheck size={15} /> Other people’s suggestions come to you first</p></div>
    <p className="email-review-note">Can’t access the listed email? Suggest a contact correction from your church’s map listing for review.</p>
  </>;
  return <PortalShell point={point}><div className="portal-intro"><h1>Your church.<br /><em>Accurately represented.</em></h1><p>Help the next person through your doors. Claim your listing and keep the details they depend on up to date.</p></div><div className="portal-columns"><PortalChurchPreview church={church ? { ...church, serviceTimes: fields.serviceTimes, website: fields.website } : listing} specific={!!church || !!listingId || !!token} claimed={claimed} unavailable={!!listingError || (!!token && !!error && !church)} onPoint={showPoint} /><section className="email-page-card portal-form"><div className="email-page-symbol"><ShieldCheck size={21} /></div><h2>{church ? 'Keep your listing accurate' : 'A better listing starts with you'}</h2>{church ? signedIn : signedOut}{message && <p className="portal-message" role="status">{message}</p>}{results.filter(r => !r.ok).map(r => <p className="email-error" key={r.field}>{FIELD_LABELS[r.field] || r.field}: {r.error}</p>)}{(error || listingError) && <p className="email-error" role="alert">{error || listingError}</p>}</section></div></PortalShell>;
}

export function LegacyChurchPortalRedirect() {
  const location = useLocation();
  return <Navigate replace to={`/for-churches${location.search}${location.hash}`} />;
}

export function LegacyDataHealthRedirect() {
  const location = useLocation();
  return <Navigate replace to={`/improve-the-map${location.search}${location.hash}`} />;
}

import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { ArrowLeft, ArrowUpRight, Check, Globe2, Mail, ShieldCheck } from 'lucide-react';
import { EmailPageBackdrop } from './EmailConfirmation';
import type { Church as ChurchType } from './church-data';
import logo from '../../assets/a94bce1cf0860483364d5d9c353899b7da8233e7.png';
import './church-portal.css';
import { PrivateAttendanceForm } from './PrivateAttendance';
import { PortalChurchPreview } from './PortalChurchPreview';
import { portalRequest } from './portal-api';
export { PORTAL_BASE, portalRequest } from './portal-api';
export function PortalShell({ children, wide = false, point }: { children: React.ReactNode; wide?: boolean; point?: { lat: number; lng: number } }) {
  return <main className={`portal-page ${wide ? 'portal-wide' : ''}`}><EmailPageBackdrop point={point} /><div className="portal-shell"><nav className="portal-nav"><Link to="/" className="portal-brand"><img src={logo} alt="" />Here’s My Church</Link><div><Link to="/data-health">Data health</Link><Link to="/church-portal">For churches</Link></div></nav>{import.meta.env.DEV && <p className="portal-local-note">Local preview · isolated sample data. Changes here stay local.</p>}{children}<footer className="portal-footer"><Link to="/"><ArrowLeft size={13} /> Back to the map</Link><span>A little care. A more welcoming map.</span></footer></div></main>;
}
export function ChurchClaimCard({ church }: { church: ChurchType }) {
  const [claimed, setClaimed] = useState(false);
  useEffect(() => { const controller = new AbortController(); setClaimed(false); portalRequest(`church-portal/status/${encodeURIComponent(church.id)}`, undefined, controller.signal).then(s => setClaimed(s.claimed)).catch(() => {}); return () => controller.abort(); }, [church.id, church.email]);
  return <div className="church-claim-link">{claimed && <span><ShieldCheck size={13} /> Church claimed · listed inbox</span>}<Link to={`/church-portal?church=${encodeURIComponent(church.id)}&name=${encodeURIComponent(church.name)}`}>Is this your church? Manage this listing <ArrowUpRight size={13} /></Link></div>;
}
export function ChurchPortalPage() {
  const [params] = useSearchParams();
  const [token, setToken] = useState(() => new URLSearchParams(window.location.hash.slice(1)).get('token') || '');
  const [church, setChurch] = useState<any>(null);
  const [fields, setFields] = useState({ serviceTimes: '', phone: '', email: '', website: '' });
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [message, setMessage] = useState('');
  const [claimed, setClaimed] = useState(false);
  const [point, setPoint] = useState<{ lat: number; lng: number }>();
  const showPoint = useCallback((p: { lat: number; lng: number }) => setPoint(p), []);
  const [listing, setListing] = useState<any>(null);
  const [listingError, setListingError] = useState('');
  const [results, setResults] = useState<any[]>([]);
  useEffect(() => { document.title = 'For churches | Here’s My Church'; if (token) window.history.replaceState(null, '', window.location.pathname + window.location.search); }, []);
  useEffect(() => {
    if (!token) return;
    const controller = new AbortController(); setBusy(true);
    portalRequest('church-portal/session', { token, action: 'preview' }, controller.signal).then(d => { setChurch(d.church); setClaimed(!!d.claimed); setFields({ serviceTimes: d.church.serviceTimes, phone: d.church.phone, email: d.church.email, website: d.church.website }); }).catch(e => { if (!controller.signal.aborted) setError(e.message); }).finally(() => { if (!controller.signal.aborted) setBusy(false); });
    return () => controller.abort();
  }, [token]);
  const listingId = params.get('church');
  useEffect(() => {
    setListing(null); setListingError(''); if (!listingId) return;
    const controller = new AbortController();
    portalRequest(`church-portal/listing/${encodeURIComponent(listingId)}`, undefined, controller.signal).then(d => setListing(d.church)).catch(e => { if (!controller.signal.aborted) setListingError(e.message); });
    return () => controller.abort();
  }, [listingId]);
  async function act(action: string) {
    setBusy(true); setError(''); setMessage(''); setResults([]);
    try {
      const d = await portalRequest(`church-portal/${action === 'request' ? 'request' : 'session'}`, action === 'request' ? { churchId: params.get('church') } : { token, action, fields });
      setMessage(d.message); setResults(d.results || []);
      if (action === 'claim') setClaimed(true);
      if (action === 'logout') { setToken(''); setChurch(null); }
    } catch (e) { setError(e instanceof Error ? e.message : 'Please try again.'); } finally { setBusy(false); }
  }
  const name = church?.name || listing?.name || params.get('name') || 'Your church';
  return <PortalShell point={point}><div className="portal-intro"><h1>Your church.<br /><em>Accurately represented.</em></h1><p>Help the next person through your doors. Claim your listing and keep the details they depend on up to date.</p></div><div className="portal-columns"><PortalChurchPreview church={church ? { ...church, serviceTimes: fields.serviceTimes, website: fields.website } : listing} specific={!!church || !!listingId || !!token} claimed={claimed} unavailable={!!listingError || (!!token && !!error && !church)} onPoint={showPoint} /><section className="email-page-card portal-form"><div className="email-page-symbol"><ShieldCheck size={21} /></div><h2>{church ? 'Keep your listing accurate' : 'A better listing starts with you'}</h2>{church ? <><p className="email-page-description">You’re signed in through the listed church inbox. Your private link is valid for 24 hours.</p><button className="email-button portal-full" disabled={busy || claimed} onClick={() => act('claim')}>{claimed ? <><Check size={15} /> Listing claimed</> : 'Claim this listing'}</button><form className="email-review-form" onSubmit={e => { e.preventDefault(); act('save'); }}>{Object.entries(fields).map(([key, value]) => <label className="email-field" key={key}>{({ serviceTimes: 'Service times', phone: 'Phone', email: 'Contact email', website: 'Website' } as any)[key]}{key === 'serviceTimes' ? <textarea className="email-input" rows={3} maxLength={2000} value={value} onChange={e => setFields(f => ({ ...f, [key]: e.target.value }))} placeholder="Sunday 9am & 11am" /> : <input className="email-input" type={key === 'email' ? 'email' : key === 'website' ? 'url' : 'tel'} maxLength={2000} value={value} onChange={e => setFields(f => ({ ...f, [key]: e.target.value }))} />}</label>)}<p className="email-review-note">Changes follow our community review process. Existing details stay visible while replacements await approval. Use “Suggest an edit” on the map for other corrections.</p><button className="email-button" disabled={busy}>{busy ? 'Submitting…' : 'Submit updates'}</button></form><PrivateAttendanceForm token={token} /><button className="email-cancel" disabled={busy} onClick={() => act('logout')}>Sign out and invalidate this link</button></> : <><p className="email-page-description">{params.get('church') ? `We’ll send a private sign-in link to the contact email listed for ${name}.` : 'Find your church on the map, open its details, and choose “Manage this listing” to get started.'}</p>{params.get('church') ? <button className="email-button portal-full" disabled={busy || !listing} onClick={() => act('request')}><Mail size={15} />{busy ? 'Sending…' : 'Email a sign-in link'}</button> : <Link className="email-button portal-full" to="/">Find your church <ArrowUpRight size={15} /></Link>}<div className="portal-assurances"><p><Mail size={15} /> Secure access through your listed inbox</p><p><Globe2 size={15} /> A free presence on a community-built map</p><p><ShieldCheck size={15} /> Thoughtful review keeps details trustworthy</p></div><p className="email-review-note">Can’t access the listed email? Suggest a contact correction from your church’s map listing for review.</p></>}{message && <p className="portal-message" role="status">{message}</p>}{results.filter(r => !r.ok).map(r => <p className="email-error" key={r.field}>{r.field}: {r.error}</p>)}{(error || listingError) && <p className="email-error" role="alert">{error || listingError}</p>}</section></div></PortalShell>;
}

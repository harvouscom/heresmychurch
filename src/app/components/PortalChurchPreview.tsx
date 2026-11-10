import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowUpRight, Church, Clock3, Globe2, Pause, Play, ShieldCheck } from 'lucide-react';
import { Link } from 'react-router';
import { PlaceFlag } from './PlaceFlag';
import { COUNTRIES } from '../config/countries';
import { parseServiceTimesForDisplay } from '../lib/service-times';
import demoChurches from '../data/portal-demo-churches.json';

export type PreviewChurch = { id: string; name: string; country?: string; state?: string; city?: string; locationLabel?: string; countryName?: string; denomination?: string; serviceTimes?: string; website?: string; mapPath?: string; shortId?: string; lat?: number; lng?: number };
// Lookup's rotation: alternate US/world, visiting each state/country once per round.
function createRotation(churches: PreviewChurch[]) {
  let us = Math.random() < .5;
  const queues = new Map<boolean, PreviewChurch[]>(), previous = new Map<boolean, string | undefined>();
  const shuffle = <T,>(items: T[]) => { for (let i = items.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [items[i], items[j]] = [items[j], items[i]]; } return items; };
  const region = (r: PreviewChurch, group: boolean) => group ? r.state : r.country;
  function refill(group: boolean) {
    const regions = new Map<string | undefined, PreviewChurch[]>();
    for (const church of churches) { if ((church.country === 'US') !== group) continue; const key = region(church, group); const list = regions.get(key) || []; list.push(church); regions.set(key, list); }
    const groups = shuffle([...regions.values()]).map(shuffle);
    if (groups.length > 1 && region(groups[0][0], group) === previous.get(group)) [groups[0], groups[1]] = [groups[1], groups[0]];
    const queue: PreviewChurch[] = []; while (groups.some(g => g.length)) for (const g of groups) if (g.length) queue.push(g.pop()!);
    queues.set(group, queue); return queue;
  }
  return { next() { const queue = queues.get(us)?.length ? queues.get(us)! : refill(us); const church = queue.shift(); if (!church) return null; previous.set(us, region(church, us)); us = !us; return church; } };
}
export function PortalChurchPreview({ church, specific = false, claimed = false, unavailable = false, onPoint }: { church?: PreviewChurch | null; specific?: boolean; claimed?: boolean; unavailable?: boolean; onPoint(point: { lat: number; lng: number }): void }) {
  const rotation = useMemo(() => createRotation(demoChurches), []);
  const [current, setCurrent] = useState<PreviewChurch>(() => rotation.next() || demoChurches[0]);
  const [paused, setPaused] = useState(false), [hovered, setHovered] = useState(false);
  const container = useRef<HTMLElement>(null);
  const active = church || (specific ? null : current);
  useEffect(() => {
    if (specific || paused || hovered) return;
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)'); let visible = true;
    const observer = new IntersectionObserver(([e]) => { visible = e.isIntersecting; }); if (container.current) observer.observe(container.current);
    const timer = window.setInterval(() => { if (!motion.matches && visible && !document.hidden) { const next = rotation.next(); if (next) setCurrent(next); } }, 6500);
    return () => { window.clearInterval(timer); observer.disconnect(); };
  }, [specific, paused, hovered, rotation]);
  useEffect(() => { if (active && Number.isFinite(active.lat) && Number.isFinite(active.lng)) onPoint({ lat: active.lat!, lng: active.lng! }); }, [active?.id, active?.lat, active?.lng, onPoint]);
  const country = active?.country || 'US';
  const times = active?.serviceTimes ? parseServiceTimesForDisplay(active.serviceTimes).map(t => `${t.day === '?' ? '' : t.day + ' '}${t.time}${t.label ? ` (${t.label})` : ''}`).join('; ') : '';
  let site = ''; try { site = active?.website ? new URL(active.website).hostname.replace(/^www\./, '') : ''; } catch { /* Don't make malformed source URLs interactive. */ }
  return <aside ref={container} className="portal-preview portal-live-preview" aria-label={specific ? 'Your church listing preview' : 'Churches on the map'} onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)} onFocusCapture={() => setHovered(true)} onBlurCapture={e => { if (!e.currentTarget.contains(e.relatedTarget)) setHovered(false); }}><div className="portal-pin" aria-hidden="true"><i /><span /></div><article key={active?.id || 'loading'} className="portal-directory-card"><div className="portal-card-place">{active && <><PlaceFlag abbrev={country} countryCode="WORLD" size="md" /><span>{active.countryName || COUNTRIES[country]?.name || country}</span></>}{claimed && <span className="portal-card-claimed"><ShieldCheck size={11} /> Claimed</span>}</div><div className="portal-card-title"><span className="portal-card-icon"><Church size={21} /></span><div><h2>{active?.name || (church?.name ? church.name : unavailable ? 'Listing unavailable' : 'Loading your listing…')}</h2><p>{active?.locationLabel || [active?.city, active?.state].filter(Boolean).join(', ')}</p></div></div><div className="portal-card-facts">{active?.denomination && !/^(unknown|other)$/i.test(active.denomination) && <span className="portal-card-denomination">{active.denomination}</span>}{active?.serviceTimes && <p><Clock3 size={13} /><span>{times}</span></p>}{site && <p><Globe2 size={13} /><span>{site}</span></p>}</div>{active && <Link className="portal-card-map" to={active.mapPath || `/${country}/${active.state}/${active.shortId || active.id}`}>View on the map <ArrowUpRight size={12} /></Link>}</article>{!specific && <div className="portal-rotation-controls"><span>Real churches. All around the world.</span><button type="button" onClick={() => setPaused(p => !p)} aria-label={paused ? 'Resume church previews' : 'Pause church previews'} aria-pressed={paused}>{paused ? <Play size={12} /> : <Pause size={12} />}</button></div>}</aside>;
}

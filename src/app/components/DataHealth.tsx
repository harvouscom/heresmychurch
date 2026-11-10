import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { ArrowUpRight, Copy, Layers3, Search } from 'lucide-react';
import { PortalShell, portalRequest } from './ChurchPortal';
import { DataHealthGlobe } from './DataHealthGlobe';
import { PlaceFlag } from './PlaceFlag';
import { COUNTRIES } from '../config/countries';
const labels: Record<string, string> = { address: 'Address', serviceTimes: 'Service times', website: 'Website', contact: 'Contact', photo: 'Photo', recentConfirmation: 'Recent confirmation' };
export function DataHealthPage() {
  const [params, setParams] = useSearchParams(); const region = (params.get('region') || 'TX').toUpperCase();
  const [data, setData] = useState<any>(null), [error, setError] = useState(''), [loading, setLoading] = useState(true);
  const [search, setSearch] = useState(''), [filter, setFilter] = useState('all'), [limit, setLimit] = useState(50), [retry, setRetry] = useState(0);
  useEffect(() => { document.title = 'Data health | Here’s My Church'; }, []);
  useEffect(() => { const controller = new AbortController(); setLoading(true); setError(''); setData(null); setLimit(50); portalRequest(`data-health/${encodeURIComponent(region)}`, undefined, controller.signal).then(setData).catch(e => { if (!controller.signal.aborted) setError(e.message); }).finally(() => { if (!controller.signal.aborted) setLoading(false); }); return () => controller.abort(); }, [region, retry]);
  const rows = useMemo(() => (data?.rows || []).filter((r: any) => `${r.name} ${r.city}`.toLowerCase().includes(search.toLowerCase()) && (filter === 'all' || filter === 'gaps' && r.score < 100 || filter === 'suggestions' && r.openSuggestions > 0 || filter === 'duplicates' && r.possibleDuplicate)).sort((a: any, b: any) => a.score - b.score || a.name.localeCompare(b.name)), [data, search, filter]);
  const country = Object.values(COUNTRIES).find(c => c.regions[region]);
  const regionConfig = country?.regions[region];
  const regionName = regionConfig?.name || region;
  const count = (value: number | undefined) => loading || !data ? '—' : (value ?? 0).toLocaleString();
  return <PortalShell wide showGlobeBackdrop={false}>
    <header className="health-hero health-hero-focused">
      <div className="health-hero-copy">
        <h1>Church data in <em>{regionName}.</em></h1>
        <p>Help keep local church listings useful, complete, and up to date.</p>
        <label className="email-field health-region-control">Explore a region
          <span className="health-region-picker">{country && <PlaceFlag abbrev={region} countryCode={country.code} size="md" />}
            <select className="email-input" value={region} onChange={e => { setParams({ region: e.target.value }); setSearch(''); setFilter('all'); }}>
              {!regionConfig && <option value={region}>Choose a region</option>}
              {Object.values(COUNTRIES).map(c => <optgroup key={c.code} label={c.name}>{Object.values(c.regions).map(r => <option key={r.abbrev} value={r.abbrev}>{r.name}</option>)}</optgroup>)}
            </select>
          </span>
        </label>
      </div>
      {country && regionConfig && <DataHealthGlobe region={regionConfig} countryCode={country.code} countryName={country.name} />}
    </header>
    <section className="health-workspace health-workspace-focused" aria-label="Regional data health">
      <div className="health-metrics health-metrics-focused">
        <div><span>Average completeness</span><strong>{loading || !data?.total ? '—' : `${data.averageScore}%`}</strong><small>Across six listing details</small></div>
        <div><span>Church listings</span><strong>{count(data?.total)}</strong><small>In {regionName}</small></div>
        <div><span>Open suggestions</span><strong>{count(data?.openSuggestions)}</strong><small>Fields awaiting review</small></div>
        <div><span>Possible duplicate groups</span><strong>{count(data?.duplicateGroups)}</strong><small>For a closer look</small></div>
      </div>
      <div className="health-heading"><h2>Where a little local knowledge helps</h2></div>
      <details className="health-method health-method-details"><summary>How completeness is measured</summary><p>Each score checks six details equally: address, service times, website, contact, photo, and confirmation in the last 180 days. Completeness describes available information; it does not verify ownership or accuracy.</p></details><div className="health-toolbar"><label className="health-search"><Search size={16} /><input aria-label="Search churches or cities" placeholder="Search a church or city" value={search} onChange={e => { setSearch(e.target.value); setLimit(50); }} /></label><label className="email-sr-only" htmlFor="health-filter">Filter listings</label><select id="health-filter" className="email-input" value={filter} onChange={e => { setFilter(e.target.value); setLimit(50); }}><option value="all">All listings</option><option value="gaps">Missing details</option><option value="suggestions">Open suggestions</option><option value="duplicates">Possible duplicates</option></select></div>{loading ? <p className="health-empty" role="status">Gathering the details for {regionName}…</p> : error ? <div className="health-empty" role="alert"><p>{error}</p><button className="email-button" onClick={() => setRetry(n => n + 1)}>Try again</button></div> : <><p className="health-results">{rows.length.toLocaleString()} listings · Showing {Math.min(limit, rows.length).toLocaleString()} · Lowest completeness first</p><div className="health-table-wrap"><table className="health-table"><thead><tr><th>Church</th><th>Completeness</th><th>Ways to help</th><th><span className="email-sr-only">Open listing</span></th></tr></thead><tbody>{rows.slice(0, limit).map((r: any) => <tr key={r.id}><td><strong>{r.name}</strong><span>{r.city || 'City not listed'}</span></td><td><div className="health-score"><span>{r.score}%</span><meter min="0" max="100" value={r.score} aria-label={`${r.name} completeness`} /></div></td><td><div className="health-tags">{r.possibleDuplicate && <span className="health-warning"><Copy size={11} />Possible duplicate</span>}{r.openSuggestions > 0 && <span><Layers3 size={11} />{r.openSuggestions} open</span>}{r.missing.map((k: string) => <span key={k}>{labels[k]}</span>)}{!r.missing.length && <span>All six details present</span>}</div></td><td><Link className="health-open" aria-label={`Open ${r.name} on the map`} to={`/${r.country}/${r.state}/${r.shortId || r.id}`}><ArrowUpRight size={17} /></Link></td></tr>)}</tbody></table></div>{!rows.length && <p className="health-empty">{data?.total ? 'No listings match these filters.' : 'No listings are available for this region yet.'}</p>}{rows.length > limit && <button className="email-button health-more" onClick={() => setLimit(n => n + 50)}>Show 50 more</button>}<p className="health-footnote">Open a listing to confirm its details or suggest an edit. Duplicate candidates are for human review; campuses are never merged automatically. Updated {new Date(data.generatedAt).toLocaleString()}.</p></>}</section><Link className="attendance-maintainer" to="/data-health/attendance-review">Maintainer review</Link></PortalShell>;
}

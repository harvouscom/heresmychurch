import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { ArrowUpRight, Globe, Search, ArrowRight } from "lucide-react";
import { fetchReportList, reportPath } from "../api";
import type { SeasonalReportSummary } from "../church-data";
import { STATE_NAMES } from "../map-constants";
import { COUNTRIES, SUPPORTED_COUNTRY_CODES } from "../../config/countries";
import { PlaceFlag } from "../PlaceFlag";
import logoImg from "../../../assets/a94bce1cf0860483364d5d9c353899b7da8233e7.png";

const STATE_ABBREVS = Object.keys(STATE_NAMES).sort((a, b) => STATE_NAMES[a].localeCompare(STATE_NAMES[b]));
const OTHER_COUNTRIES = SUPPORTED_COUNTRY_CODES.filter((cc) => cc !== "US").sort((a, b) =>
  (COUNTRIES[a]?.name || a).localeCompare(COUNTRIES[b]?.name || b),
);

export function ReportsHubPage() {
  const [query, setQuery] = useState("");
  const [view, setView] = useState<"countries" | "states" | "archive">("countries");
  const [period, setPeriod] = useState("latest");
  const [usReports, setUsReports] = useState<SeasonalReportSummary[]>([]);
  const [worldReports, setWorldReports] = useState<SeasonalReportSummary[]>([]);
  const [byCountry, setByCountry] = useState<Record<string, SeasonalReportSummary[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const root = document.getElementById("root");

    const origBodyOverflow = body.style.overflow;
    const origBodyHeight = body.style.height;
    const origHtmlOverflow = html.style.overflow;
    const origHtmlHeight = html.style.height;
    const origRootHeight = root?.style.height ?? "";
    const origRootMinHeight = root?.style.minHeight ?? "";

    html.style.overflow = "visible";
    html.style.height = "auto";
    body.style.overflow = "visible";
    body.style.height = "auto";
    if (root) {
      root.style.height = "auto";
      root.style.minHeight = "100dvh";
    }

    return () => {
      html.style.overflow = origHtmlOverflow;
      html.style.height = origHtmlHeight;
      body.style.overflow = origBodyOverflow;
      body.style.height = origBodyHeight;
      if (root) {
        root.style.height = origRootHeight;
        root.style.minHeight = origRootMinHeight;
      }
    };
  }, []);

  const latestUsSlug = useMemo(() => {
    if (!usReports.length) return null;
    return [...usReports].sort((a,b)=>Date.parse(b.generatedAt)-Date.parse(a.generatedAt))[0]?.slug ?? null;
  }, [usReports]);

  const countriesWithReports = useMemo(
    () => OTHER_COUNTRIES.filter((cc) => (byCountry[cc] || []).length > 0),
    [byCountry],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [us, world, ...rest] = await Promise.all([
          fetchReportList("US"),
          fetchReportList("WORLD"),
          ...OTHER_COUNTRIES.map((cc) => fetchReportList(cc)),
        ]);
        if (cancelled) return;
        setUsReports(Array.isArray(us) ? us : []);
        setWorldReports(Array.isArray(world) ? world : []);
        const map: Record<string, SeasonalReportSummary[]> = {};
        OTHER_COUNTRIES.forEach((cc, i) => {
          map[cc] = Array.isArray(rest[i]) ? rest[i] : [];
        });
        setByCountry(map);
      } catch {
        if (!cancelled) setError("Could not load reports.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const title = "Reports & data — Here's My Church";
    const description =
      "Seasonal snapshots of mapped churches, denominations, geography, and data quality on Here's My Church — free and crowd-sourced.";
    const prevTitle = document.title;
    document.title = title;

    const setMeta = (selector: string, attr: string, content: string) => {
      const el = document.querySelector(selector);
      if (el) el.setAttribute(attr, content);
    };
    const origin = window.location.origin;
    const url = `${origin}/reports`;
    const imageUrl = `${origin}/og-report.png`;

    setMeta('meta[name="description"]', "content", description);
    setMeta('meta[property="og:title"]', "content", title);
    setMeta('meta[property="og:description"]', "content", description);
    setMeta('meta[property="og:url"]', "content", url);
    setMeta('meta[property="og:image"]', "content", imageUrl);
    setMeta('meta[name="twitter:title"]', "content", title);
    setMeta('meta[name="twitter:description"]', "content", description);
    setMeta('meta[name="twitter:url"]', "content", url);
    setMeta('meta[name="twitter:image"]', "content", imageUrl);

    return () => {
      document.title = prevTitle;
    };
  }, []);

  const allReports = useMemo(() => [
    ...worldReports.map(report => ({ report, cc: "WORLD", place: "Worldwide" })),
    ...usReports.map(report => ({ report, cc: "US", place: "United States" })),
    ...Object.entries(byCountry).flatMap(([cc, reports]) => reports.map(report => ({ report, cc, place: COUNTRIES[cc]?.name || cc }))),
  ].sort((a, b) => Date.parse(b.report.generatedAt) - Date.parse(a.report.generatedAt)), [worldReports, usReports, byCountry]);
  const periods = [...new Set(allReports.map(item => item.report.slug))];
  const latestByCountry = allReports.filter((item, i, items) => item.cc !== "WORLD" && items.findIndex(other => other.cc === item.cc && (period === "latest" || other.report.slug === period)) === i && (period === "latest" || item.report.slug === period));
  const featured = allReports.find(item => item.cc === "WORLD") || allReports[0];
  const ranked = [...latestByCountry].sort((a,b) => b.report.totalChurches - a.report.totalChurches).slice(0,5);
  const term = query.trim().toLowerCase();
  latestByCountry.sort((a,b)=>a.place.localeCompare(b.place));
  const results = (view === "archive" ? allReports.filter(item => period === "latest" || item.report.slug === period) : latestByCountry)
    .filter(item => [item.place, item.cc, item.report.title, item.report.slug].some(value => value.toLowerCase().includes(term)));
  const stateResults = STATE_ABBREVS.filter(abbrev => (STATE_NAMES[abbrev] + " " + abbrev).toLowerCase().includes(term));
  const stateSlug = period === "latest" ? latestUsSlug : usReports.find(report => report.slug === period)?.slug;
  const resultCount = view === "states" ? (stateSlug ? stateResults.length : 0) : results.length;

  return (
    <div className="reports-page min-h-screen">
      <header className="atlas-header">
        <nav className="atlas-nav" aria-label="Main navigation">
          <Link to="/" className="flex items-center gap-2 text-white text-sm font-medium"><img src={logoImg} alt="" className="h-7 w-7 rounded-lg" />Here's My Church <span className="text-purple-200/40 font-normal">/ Reports</span></Link>
          <Link to="/" className="atlas-nav-link">Explore the map <ArrowUpRight size={14} /></Link>
        </nav>
        <div className="atlas-hero-grid">
          <div className="py-6">
            <h1 className="text-4xl sm:text-5xl lg:text-6xl tracking-tight font-medium leading-[1.06] text-white text-balance">A world of churches.<br /><span className="text-purple-300">A clearer perspective.</span></h1>
            <p className="mt-5 max-w-md text-base text-purple-100/60 leading-relaxed">Discover the places, traditions, and communities behind the map. Find your place. Explore its story.</p>
            <a href="#report-library" className="atlas-primary mt-7">Find a report <ArrowRight size={16} /></a>
          </div>
          <div className="atlas-snapshot">
            <div className="flex items-center justify-between gap-4 text-xs text-purple-200/70"><span className="inline-flex items-center gap-2"><Globe size={14} />Latest snapshots</span><span>{latestByCountry.length} countries</span></div>
            <div className="atlas-orbit" aria-hidden="true"><span /><span /><span /><Globe size={116} strokeWidth={.6} /></div>
            <div className="relative -mt-2 text-center"><span className="text-4xl sm:text-5xl font-medium tracking-tight tabular-nums text-white">{featured ? featured.report.totalChurches.toLocaleString() : "—"}</span><p className="text-xs text-purple-200/60 mt-2">{featured?.cc === "WORLD" ? "churches in the latest worldwide report" : "churches in the featured snapshot"}</p></div>
            <div className="mt-6 space-y-2.5" aria-label="Largest country snapshots by mapped churches">
              {ranked.map(({cc,place,report}) => <div key={cc} className="grid grid-cols-[92px_1fr_64px] items-center gap-3 text-xs"><span className="text-purple-100/70 truncate">{place}</span><span className="h-1.5 bg-white/5 rounded-full overflow-hidden"><span className="block h-full rounded-full bg-gradient-to-r from-violet-500 to-purple-300" style={{width: (report.totalChurches / ranked[0].report.totalChurches * 100) + "%"}} /></span><span className="text-right tabular-nums text-purple-100/75">{report.totalChurches.toLocaleString()}</span></div>)}
            </div>
          </div>
        </div>
      </header>
      <main className="atlas-library" id="report-library">
        {featured && <Link to={reportPath({slug:featured.report.slug,countryCode:featured.cc})} className="atlas-feature">
          <span className="atlas-feature-icon"><Globe size={25} strokeWidth={1.3} /></span>
          <div className="min-w-0 flex-1"><h2 className="text-lg sm:text-xl font-medium tracking-tight text-stone-900 mt-1">{featured.report.title}</h2><p className="text-xs text-stone-500 mt-1">{new Date(featured.report.generatedAt).toLocaleDateString("en-US",{month:"long",year:"numeric"})} · Coverage, geography, and community</p></div>
          <ArrowUpRight className="shrink-0 text-purple-600" size={22} />
        </Link>}
        <div className="flex flex-wrap items-end justify-between gap-4 mb-6"><div><h2 className="text-2xl sm:text-3xl tracking-tight font-medium">Find your perspective.</h2><p className="text-sm text-stone-500 mt-2">Go straight to the place and reporting period you need.</p></div><span className="text-xs text-stone-500" role="status" aria-live="polite">{resultCount} {view === "states" ? (resultCount === 1 ? "state" : "states") : (resultCount === 1 ? "report" : "reports")}</span></div>
        <div className="atlas-library-controls">
          <div className="atlas-tabs" role="group" aria-label="Report scope">
            {([["countries","Countries"],["states","U.S. states"],["archive","All editions"]] as const).map(([id,label]) => <button key={id} onClick={() => setView(id)} aria-pressed={view===id} className={view===id ? "active" : ""}>{label}</button>)}
          </div>
          <label className="atlas-search"><Search size={16} className="text-stone-400" /><input aria-label="Search reports by place or title" placeholder={view === "states" ? "Find a state…" : "Find a country or report…"} value={query} onChange={e=>setQuery(e.target.value)} /></label>
          <select aria-label="Reporting period" value={period} onChange={e=>setPeriod(e.target.value)} className="atlas-period"><option value="latest">Latest available</option>{periods.map(slug=><option key={slug} value={slug}>{slug.replace(/-/g," ")}</option>)}</select>
        </div>
        {loading && <p className="py-16 text-center text-stone-500" role="status">Gathering the reports…</p>}
        {error && <p className="py-12 text-center text-red-700" role="alert">{error}</p>}
        {!loading && !error && resultCount === 0 && <div className="atlas-empty"><Search size={28} /><h3>No matching reports</h3><p>Try another place or reporting period.</p><button onClick={()=>{setQuery("");setPeriod("latest");}}>Clear filters</button></div>}
        {!loading && !error && <div className="atlas-report-grid">
          {view === "states" ? stateSlug && stateResults.map(abbrev => <Link className="atlas-report-card atlas-state-card" key={abbrev} to={`/report/state/${abbrev}/${encodeURIComponent(stateSlug)}`}><div className="flex items-center justify-between"><span className="atlas-state-code">{abbrev}</span><ArrowUpRight size={17} className="text-stone-400" /></div><h3 className="mt-2 text-sm font-medium">{STATE_NAMES[abbrev]}</h3><div className="atlas-card-footer"><span>{stateSlug.replace(/-/g," ")}</span><span>State report</span></div></Link>)
          : results.map(({cc,place,report}) => <Link className="atlas-report-card" key={cc+report.slug} to={reportPath({slug:report.slug,countryCode:cc})}>
              <div className="flex items-center gap-2.5"><span className="atlas-place-mark">{cc==="WORLD" ? <Globe size={18} /> : <PlaceFlag abbrev={cc} countryCode="WORLD" size="sm" />}</span><h3 className="min-w-0 flex-1 text-sm font-medium tracking-tight">{place}</h3><ArrowUpRight size={14} className="shrink-0 text-stone-400" /></div>
              {view==="archive" && <p className="text-xs text-stone-500 mt-2">{report.title}</p>}
              <div className="mt-3 flex items-baseline gap-1.5"><strong className="text-xl font-medium tracking-tight tabular-nums text-purple-950">{report.totalChurches.toLocaleString()}</strong><span className="text-xs text-stone-500">churches</span></div>
              <div className="atlas-card-footer"><span>{report.slug.replace(/-/g," ")}</span><span>View →</span></div>
            </Link>)}
        </div>}
        <footer className="mt-12 border-t border-stone-200 pt-6 pb-8 flex flex-wrap justify-between gap-4 text-xs text-stone-500"><span>Open data. Local knowledge. A shared picture.</span><Link to="/">Back to the map ↗</Link></footer>
      </main>
    </div>
  );
}

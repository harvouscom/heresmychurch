import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { FileText, Globe, MapPin } from "lucide-react";
import { fetchReportList, reportPath } from "../api";
import type { SeasonalReportSummary } from "../church-data";
import { STATE_NAMES } from "../map-constants";
import { COUNTRIES, SUPPORTED_COUNTRY_CODES } from "../../config/countries";
import { PlaceFlag } from "../PlaceFlag";
import logoImg from "../../../assets/a94bce1cf0860483364d5d9c353899b7da8233e7.png";

const STATE_ABBREVS = Object.keys(STATE_NAMES).sort((a, b) => a.localeCompare(b));
const OTHER_COUNTRIES = SUPPORTED_COUNTRY_CODES.filter((cc) => cc !== "US").sort((a, b) =>
  (COUNTRIES[a]?.name || a).localeCompare(COUNTRIES[b]?.name || b),
);

function ReportList({
  reports,
  countryCode,
}: {
  reports: SeasonalReportSummary[];
  countryCode: string;
}) {
  const newestFirst = useMemo(
    () =>
      [...reports].sort(
        (a, b) => new Date(b.generatedAt).getTime() - new Date(a.generatedAt).getTime(),
      ),
    [reports],
  );
  if (!newestFirst.length) return null;
  return (
    <ul className="space-y-2">
      {newestFirst.map((r) => (
        <li key={`${countryCode}-${r.slug}`}>
          <Link
            to={reportPath({ slug: r.slug, countryCode })}
            className="flex items-start gap-3 rounded-xl border border-stone-200/80 bg-white/60 px-4 py-3 transition-colors hover:border-purple-200 hover:bg-purple-50/40"
          >
            <FileText className="h-5 w-5 shrink-0 text-purple-500 mt-0.5" aria-hidden />
            <div className="min-w-0 flex-1">
              <div className="font-medium text-stone-900">{r.title}</div>
              <div className="text-sm text-stone-500 mt-0.5">
                {r.totalChurches.toLocaleString()} churches mapped ·{" "}
                {new Date(r.generatedAt).toLocaleDateString("en-US", {
                  month: "long",
                  day: "numeric",
                  year: "numeric",
                })}
              </div>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function ReportsHubPage() {
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
    return usReports[usReports.length - 1]?.slug ?? null;
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

  const hasAny =
    usReports.length > 0 || worldReports.length > 0 || countriesWithReports.length > 0;

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-3xl px-6 py-8 sm:py-10">
        <div className="flex items-center justify-between">
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-sm text-stone-400 hover:text-purple-600 transition-colors"
          >
            <div className="w-6 h-6 rounded overflow-hidden shrink-0">
              <img src={logoImg} alt="Here's My Church" className="w-full h-full object-cover" />
            </div>
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Explore the map
          </Link>
        </div>

        <h1 className="mt-8 text-2xl font-bold text-stone-900 sm:text-4xl tracking-tight leading-[1.1]">
          Reports & data
        </h1>
        <p className="text-pretty mt-2 text-base sm:text-lg text-stone-500 leading-relaxed">
          Seasonal snapshots from the crowd-sourced map: worldwide and country coverage, denominations,
          geography, data quality, and U.S. state-level views.
        </p>

        {loading && (
          <p className="mt-10 text-sm text-stone-400" role="status">
            Loading reports&hellip;
          </p>
        )}

        {error && (
          <p className="mt-10 text-sm text-red-600" role="alert">
            {error}
          </p>
        )}

        {!loading && !error && !hasAny && (
          <p className="mt-10 text-sm text-stone-500">No reports are published yet. Check back soon.</p>
        )}

        {!loading && worldReports.length > 0 && (
          <section className="mt-10 space-y-3" aria-labelledby="world-reports-heading">
            <h2
              id="world-reports-heading"
              className="text-sm font-semibold uppercase tracking-wider text-stone-400 inline-flex items-center gap-2"
            >
              <Globe className="h-3.5 w-3.5" aria-hidden />
              Worldwide
            </h2>
            <ReportList reports={worldReports} countryCode="WORLD" />
          </section>
        )}

        {!loading && countriesWithReports.length > 0 && (
          <section className="mt-12 space-y-6" aria-labelledby="country-reports-heading">
            <h2
              id="country-reports-heading"
              className="text-sm font-semibold uppercase tracking-wider text-stone-400"
            >
              Country reports
            </h2>
            {countriesWithReports.map((cc) => (
              <div key={cc} className="space-y-2">
                <h3 className="text-sm font-medium text-stone-700 inline-flex items-center gap-2">
                  <PlaceFlag abbrev={cc} size="sm" />
                  {COUNTRIES[cc]?.name || cc}
                </h3>
                <ReportList reports={byCountry[cc] || []} countryCode={cc} />
              </div>
            ))}
          </section>
        )}

        {!loading && usReports.length > 0 && (
          <section className="mt-12 space-y-3" aria-labelledby="national-reports-heading">
            <h2
              id="national-reports-heading"
              className="text-sm font-semibold uppercase tracking-wider text-stone-400 inline-flex items-center gap-2"
            >
              <PlaceFlag abbrev="US" size="sm" />
              United States
            </h2>
            <ReportList reports={usReports} countryCode="US" />
          </section>
        )}

        {!loading && latestUsSlug && (
          <section className="mt-12 space-y-3" aria-labelledby="state-reports-heading">
            <h2 id="state-reports-heading" className="text-sm font-semibold uppercase tracking-wider text-stone-400">
              U.S. state reports
            </h2>
            <p className="text-sm text-stone-500 text-pretty">
              Open a state for the same reporting period ({latestUsSlug.replace(/-/g, " ")}): coverage, counties,
              denominations, and how the state compares nationally.
            </p>
            <ul className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-2">
              {STATE_ABBREVS.map((abbrev) => (
                <li key={abbrev}>
                  <Link
                    to={`/report/state/${abbrev}/${encodeURIComponent(latestUsSlug)}`}
                    className="flex items-center gap-2 rounded-lg border border-stone-200/70 px-3 py-2 text-sm text-stone-700 hover:border-purple-200 hover:text-purple-700 hover:bg-purple-50/30 transition-colors"
                  >
                    <MapPin className="h-3.5 w-3.5 shrink-0 text-stone-400" aria-hidden />
                    <span className="truncate">{STATE_NAMES[abbrev] ?? abbrev}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}

import { useEffect, useMemo } from "react";
import { Link } from "react-router";
import { MapPin } from "lucide-react";
import { STATE_NAMES } from "../map-constants";
import { US_METROS, metroSlug } from "../../data/us-metros";
import logoImg from "../../../assets/a94bce1cf0860483364d5d9c353899b7da8233e7.png";
import { useDocumentScrollUnlock } from "./useDocumentScrollUnlock";

export function MetroIndexPage() {
  useDocumentScrollUnlock();

  const byState = useMemo(() => {
    const map = new Map<string, typeof US_METROS>();
    for (const m of US_METROS) {
      const list = map.get(m.region) ?? [];
      list.push(m);
      map.set(m.region, list);
    }
    return [...map.entries()].sort((a, b) => {
      const na = STATE_NAMES[a[0]] ?? a[0];
      const nb = STATE_NAMES[b[0]] ?? b[0];
      return na.localeCompare(nb);
    });
  }, []);

  useEffect(() => {
    const title = "Churches by metro area — Here's My Church";
    const description =
      "Browse Christian churches in major U.S. metro areas. Free, crowd-sourced directory with filters for denomination and size.";
    const prevTitle = document.title;
    document.title = title;
    const setMeta = (selector: string, attr: string, content: string) => {
      const el = document.querySelector(selector);
      if (el) el.setAttribute(attr, content);
    };
    const origin = window.location.origin;
    const url = `${origin}/metro`;
    setMeta('meta[name="description"]', "content", description);
    setMeta('meta[property="og:title"]', "content", title);
    setMeta('meta[property="og:description"]', "content", description);
    setMeta('meta[property="og:url"]', "content", url);
    setMeta('meta[name="twitter:title"]', "content", title);
    setMeta('meta[name="twitter:description"]', "content", description);
    setMeta('meta[name="twitter:url"]', "content", url);
    return () => {
      document.title = prevTitle;
    };
  }, []);

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
            Here's My Church
          </Link>
          <Link to="/US" className="text-sm text-stone-500 hover:text-purple-600 transition-colors">
            Open map
          </Link>
        </div>

        <header className="mt-10 mb-8">
          <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight text-stone-900">
            Churches by metro
          </h1>
          <p className="mt-3 text-stone-600 text-pretty leading-relaxed">
            Directory pages for major U.S. metro areas — filter by denomination and size, then open
            any church on the map.
          </p>
        </header>

        <div className="space-y-8">
          {byState.map(([region, metros]) => (
            <section key={region}>
              <h2 className="text-lg font-semibold text-stone-800 mb-3">
                <Link to={`/US/${region}`} className="hover:text-purple-700 transition-colors">
                  {STATE_NAMES[region] ?? region}
                </Link>
              </h2>
              <ul className="space-y-2">
                {metros.map((m) => (
                  <li key={m.id}>
                    <Link
                      to={`/metro/${metroSlug(m)}`}
                      className="flex items-center gap-3 rounded-xl border border-stone-200/80 bg-white/60 px-4 py-3 transition-colors hover:border-purple-200 hover:bg-purple-50/40"
                    >
                      <MapPin className="h-5 w-5 shrink-0 text-purple-500" aria-hidden />
                      <span className="font-medium text-stone-900">{m.name}</span>
                      <span className="ml-auto text-sm text-stone-400">{region}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}

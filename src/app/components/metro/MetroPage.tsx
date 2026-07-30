import { useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router";
import { MapPin } from "lucide-react";
import {
  DENOMINATION_GROUPS,
  churchMeetsVerifiedListingCriteria,
  getDenominationGroup,
  getSizeCategory,
  sizeCategories,
  type Church,
  type SizeCategory,
} from "../church-data";
import { STATE_NAMES } from "../map-constants";
import { fetchChurches } from "../api";
import {
  US_METROS,
  churchesInMetro,
  findMetroBySlug,
  metroSlug,
} from "../../data/us-metros";
import { churchMapPath } from "../../lib/map-paths";
import { getChurchUrlSegment } from "../url-utils";
import logoImg from "../../../assets/a94bce1cf0860483364d5d9c353899b7da8233e7.png";
import { useDocumentScrollUnlock } from "./useDocumentScrollUnlock";
import { MetroLoadingState } from "./MetroLoadingState";

function parseCsvParam(v: string | null): Set<string> {
  if (!v) return new Set();
  return new Set(
    v
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );
}

export function MetroPage() {
  useDocumentScrollUnlock();
  const { slug = "" } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const metro = findMetroBySlug(slug);

  const [churches, setChurches] = useState<Church[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const q = searchParams.get("q") ?? "";
  const verifiedOnly = searchParams.get("verified") === "1";
  const selectedDenoms = useMemo(
    () => parseCsvParam(searchParams.get("denom")),
    [searchParams],
  );
  const selectedSizes = useMemo(
    () => parseCsvParam(searchParams.get("size")) as Set<SizeCategory | string>,
    [searchParams],
  );

  useEffect(() => {
    if (!metro) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const data = await fetchChurches(metro.region);
        if (cancelled) return;
        setChurches(churchesInMetro(data.churches ?? [], metro));
      } catch {
        if (!cancelled) setError("Could not load churches for this metro.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [metro]);

  const filtered = useMemo(() => {
    const qLower = q.trim().toLowerCase();
    return churches
      .filter((ch) => {
        if (verifiedOnly && !churchMeetsVerifiedListingCriteria(ch)) return false;
        if (selectedDenoms.size > 0) {
          const g = getDenominationGroup(ch.denomination);
          if (!selectedDenoms.has(g)) return false;
        }
        if (selectedSizes.size > 0) {
          const s = getSizeCategory(ch.attendance).label;
          if (!selectedSizes.has(s)) return false;
        }
        if (qLower) {
          const hay = `${ch.name} ${ch.city} ${ch.denomination} ${ch.address ?? ""}`.toLowerCase();
          if (!hay.includes(qLower)) return false;
        }
        return true;
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [churches, q, verifiedOnly, selectedDenoms, selectedSizes]);

  const denomCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const ch of churches) {
      const g = getDenominationGroup(ch.denomination);
      m.set(g, (m.get(g) ?? 0) + 1);
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [churches]);

  const sizeCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const ch of churches) {
      const s = getSizeCategory(ch.attendance).label;
      m.set(s, (m.get(s) ?? 0) + 1);
    }
    return sizeCategories.map((c) => [c.label, m.get(c.label) ?? 0] as const);
  }, [churches]);

  const siblings = useMemo(() => {
    if (!metro) return [];
    return US_METROS.filter((m) => m.region === metro.region && m.id !== metro.id);
  }, [metro]);

  useEffect(() => {
    if (!metro) return;
    const stateName = STATE_NAMES[metro.region] ?? metro.region;
    const title = `Churches in ${metro.name}, ${metro.region} — Here's My Church`;
    const description = `${churches.length.toLocaleString()} Christian churches mapped near ${metro.name}, ${stateName}. Filter by denomination and size — free and crowd-sourced.`;
    const prevTitle = document.title;
    document.title = title;
    const setMeta = (selector: string, attr: string, content: string) => {
      const el = document.querySelector(selector);
      if (el) el.setAttribute(attr, content);
    };
    const origin = window.location.origin;
    const url = `${origin}/metro/${metroSlug(metro)}`;
    setMeta('meta[name="description"]', "content", description);
    setMeta('meta[property="og:title"]', "content", title);
    setMeta('meta[property="og:description"]', "content", description);
    setMeta('meta[property="og:url"]', "content", url);
    setMeta('meta[name="twitter:title"]', "content", title);
    setMeta('meta[name="twitter:description"]', "content", description);
    setMeta('meta[name="twitter:url"]', "content", url);

    const jsonLdId = "metro-jsonld";
    let el = document.getElementById(jsonLdId) as HTMLScriptElement | null;
    const payload = {
      "@context": "https://schema.org",
      "@type": "ItemList",
      name: `Churches in ${metro.name}, ${metro.region}`,
      numberOfItems: churches.length,
      url,
      itemListElement: churches.slice(0, 50).map((ch, i) => ({
        "@type": "ListItem",
        position: i + 1,
        name: ch.name,
        url: `${origin}${churchMapPath("US", metro.region, getChurchUrlSegment(ch, metro.region, "US"))}`,
      })),
    };
    const json = JSON.stringify(payload);
    if (el) el.textContent = json;
    else {
      el = document.createElement("script");
      el.id = jsonLdId;
      el.type = "application/ld+json";
      el.textContent = json;
      document.head.appendChild(el);
    }

    return () => {
      document.title = prevTitle;
      document.getElementById(jsonLdId)?.remove();
    };
  }, [metro, churches.length]);

  const updateParam = (key: string, value: string | null) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (!value) next.delete(key);
        else next.set(key, value);
        return next;
      },
      { replace: true },
    );
  };

  const toggleSetParam = (key: string, value: string, current: Set<string>) => {
    const next = new Set(current);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    updateParam(key, next.size ? [...next].join(",") : null);
  };

  if (!metro) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-6">
        <div className="text-center">
          <h1 className="text-2xl font-semibold text-stone-900">Metro not found</h1>
          <p className="mt-2 text-stone-500">That metro directory doesn’t exist.</p>
          <Link to="/metro" className="mt-4 inline-block text-purple-600 hover:underline">
            Browse all metros
          </Link>
        </div>
      </div>
    );
  }

  const stateName = STATE_NAMES[metro.region] ?? metro.region;
  const mapHref = `/US/${metro.region}`;

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-4xl px-6 py-8 sm:py-10">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <Link
            to="/metro"
            className="inline-flex items-center gap-2 text-sm text-stone-400 hover:text-purple-600 transition-colors"
          >
            <div className="w-6 h-6 rounded overflow-hidden shrink-0">
              <img src={logoImg} alt="Here's My Church" className="w-full h-full object-cover" />
            </div>
            All metros
          </Link>
          <div className="flex items-center gap-4 text-sm">
            <Link to={mapHref} className="text-stone-500 hover:text-purple-600 transition-colors">
              {stateName} map
            </Link>
            <Link to="/US" className="text-stone-500 hover:text-purple-600 transition-colors">
              U.S. map
            </Link>
          </div>
        </div>

        <header className="mt-10 mb-6">
          <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight text-stone-900">
            Churches in {metro.name}, {metro.region}
          </h1>
          <p className="mt-3 text-stone-600 text-pretty leading-relaxed">
            {loading ? (
              <>
                Churches within about {metro.radiusKm} km of {metro.name}, {stateName}. Free and
                crowd-sourced on Here's My Church.
              </>
            ) : (
              <>
                {churches.length.toLocaleString()} churches within about {metro.radiusKm} km of{" "}
                {metro.name}, {stateName}. Free and crowd-sourced on Here's My Church.
              </>
            )}
          </p>
          {!loading && denomCounts.length > 0 && (
            <p className="mt-2 text-sm text-stone-500">
              Top groups:{" "}
              {denomCounts
                .slice(0, 5)
                .map(([g, n]) => `${g} (${n})`)
                .join(" · ")}
            </p>
          )}
        </header>

        {error && <p className="text-red-600 text-sm mb-4">{error}</p>}

        {loading ? (
          <MetroLoadingState placeName={metro.name} />
        ) : (
          <>
            <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end">
              <label className="flex-1 block">
                <span className="text-xs font-medium text-stone-500 uppercase tracking-wide">
                  Search
                </span>
                <input
                  type="search"
                  value={q}
                  onChange={(e) => updateParam("q", e.target.value || null)}
                  placeholder="Name, city, denomination…"
                  className="mt-1 w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-stone-900 outline-none focus:border-purple-300 focus:ring-2 focus:ring-purple-100"
                />
              </label>
              <label className="inline-flex items-center gap-2 text-sm text-stone-700 pb-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={verifiedOnly}
                  onChange={(e) => updateParam("verified", e.target.checked ? "1" : null)}
                  className="rounded border-stone-300"
                />
                Verified listings only
              </label>
            </div>

            <div className="mb-8 grid gap-4 sm:grid-cols-2">
              <fieldset>
                <legend className="text-xs font-medium text-stone-500 uppercase tracking-wide mb-2">
                  Denomination
                </legend>
                <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto">
                  {DENOMINATION_GROUPS.filter(
                    (g) => (denomCounts.find(([l]) => l === g.label)?.[1] ?? 0) > 0,
                  ).map((g) => {
                    const count = denomCounts.find(([l]) => l === g.label)?.[1] ?? 0;
                    const on = selectedDenoms.has(g.label);
                    return (
                      <button
                        key={g.label}
                        type="button"
                        onClick={() => toggleSetParam("denom", g.label, selectedDenoms)}
                        className={`rounded-full px-3 py-1 text-xs border transition-colors ${
                          on
                            ? "bg-purple-100 border-purple-300 text-purple-900"
                            : "bg-white border-stone-200 text-stone-600 hover:border-stone-300"
                        }`}
                      >
                        {g.label} ({count})
                      </button>
                    );
                  })}
                </div>
              </fieldset>
              <fieldset>
                <legend className="text-xs font-medium text-stone-500 uppercase tracking-wide mb-2">
                  Size
                </legend>
                <div className="flex flex-wrap gap-2">
                  {sizeCounts
                    .filter(([, n]) => n > 0)
                    .map(([label, count]) => {
                      const on = selectedSizes.has(label);
                      return (
                        <button
                          key={label}
                          type="button"
                          onClick={() => toggleSetParam("size", label, selectedSizes)}
                          className={`rounded-full px-3 py-1 text-xs border transition-colors ${
                            on
                              ? "bg-purple-100 border-purple-300 text-purple-900"
                              : "bg-white border-stone-200 text-stone-600 hover:border-stone-300"
                          }`}
                        >
                          {label} ({count})
                        </button>
                      );
                    })}
                </div>
              </fieldset>
            </div>

            {(selectedDenoms.size > 0 || selectedSizes.size > 0 || q || verifiedOnly) && (
              <div className="mb-4 flex items-center justify-between gap-3 text-sm">
                <span className="text-stone-500">
                  Showing {filtered.length.toLocaleString()} of {churches.length.toLocaleString()}
                </span>
                <button
                  type="button"
                  className="text-purple-600 hover:underline"
                  onClick={() => setSearchParams({}, { replace: true })}
                >
                  Clear filters
                </button>
              </div>
            )}

            <ul className="divide-y divide-stone-200/80 border border-stone-200/80 rounded-xl bg-white/60 overflow-hidden">
              {filtered.map((ch) => {
                const seg = getChurchUrlSegment(ch, metro.region, "US");
                const href = churchMapPath("US", metro.region, seg);
                const size = getSizeCategory(ch.attendance).label;
                const denom = getDenominationGroup(ch.denomination);
                return (
                  <li key={ch.id}>
                    <Link
                      to={href}
                      className="flex items-start gap-3 px-4 py-3 hover:bg-purple-50/50 transition-colors"
                    >
                      <MapPin className="h-4 w-4 shrink-0 text-purple-500 mt-1" aria-hidden />
                      <div className="min-w-0 flex-1">
                        <div className="font-medium text-stone-900">{ch.name}</div>
                        <div className="text-sm text-stone-500 mt-0.5">
                          {[ch.city, denom, size].filter(Boolean).join(" · ")}
                        </div>
                      </div>
                    </Link>
                  </li>
                );
              })}
              {!filtered.length && (
                <li className="px-4 py-8 text-center text-stone-500 text-sm">
                  No churches match these filters.
                </li>
              )}
            </ul>
          </>
        )}

        {siblings.length > 0 && (
          <section className="mt-12">
            <h2 className="text-lg font-semibold text-stone-800 mb-3">
              More metros in {stateName}
            </h2>
            <ul className="flex flex-wrap gap-2">
              {siblings.map((m) => (
                <li key={m.id}>
                  <Link
                    to={`/metro/${metroSlug(m)}`}
                    className="inline-block rounded-full border border-stone-200 bg-white px-3 py-1 text-sm text-stone-700 hover:border-purple-200 hover:text-purple-700"
                  >
                    {m.name}
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

import { useLocation, useNavigate } from "react-router";
import { useMemo, useCallback, useEffect } from "react";
import { ChurchMap } from "./ChurchMap";
import { DEFAULT_COUNTRY_CODE, getRegion, isSupportedCountry, resolveRegionByAbbrev } from "../config/countries";
import {
  churchMapPath,
  countryPath,
  countyPath,
  isAdmin2Id,
  regionPath,
} from "../lib/map-paths";
import { getCountry } from "../config/countries";
import { useIosFullBleed } from "../hooks/useIosFullBleed";

/**
 * Thin routing wrapper — parses URL params and passes navigation
 * callbacks down to ChurchMap.
 *
 * Hierarchy: /world → /:CC → /:CC/:region → church
 * Legacy: /state/:abbrev and /country/:cc redirect into /:CC/...
 */
export function ChurchMapPage() {
  const location = useLocation();
  const nav = useNavigate();
  useIosFullBleed();

  const detectedCountry = useMemo(() => {
    if (typeof document === "undefined") return null;
    const meta = document.querySelector('meta[name="x-user-country"]');
    const cc = meta?.getAttribute("content")?.toUpperCase() ?? null;
    return cc && isSupportedCountry(cc) ? cc : null;
  }, []);

  // Canonicalize legacy + bare `/` URLs into /:CC/...
  useEffect(() => {
    const parts = location.pathname.split("/").filter(Boolean);
    const search = location.search;

    if (parts[0] === "state" && parts[1]) {
      const region = parts[1].toUpperCase();
      const rest = parts.slice(2).join("/");
      nav(`/US/${region}${rest ? `/${rest}` : ""}${search}`, { replace: true });
      return;
    }
    if (parts[0] === "country" && parts[1]) {
      const cc = parts[1].toUpperCase();
      const region = parts[2] ? parts[2].toUpperCase() : null;
      const rest = parts.slice(3).join("/");
      nav(
        `/${cc}${region ? `/${region}` : ""}${rest ? `/${rest}` : ""}${search}`,
        { replace: true },
      );
      return;
    }
    // /add?name=&city=&region=[&country=] → /:CC/:REGION?add=1&name=&city= (the map opens the form).
    if (parts[0] === "add") {
      const params = new URLSearchParams(search);
      const region = (params.get("region") || "").trim().toUpperCase();
      const country = (params.get("country") || "").trim().toUpperCase();
      const resolved = country && getRegion(country, region)
        ? { cc: country, abbrev: region }
        : (() => {
          const r = resolveRegionByAbbrev(region);
          return r ? { cc: r.country.code, abbrev: region } : null;
        })();
      const next = new URLSearchParams();
      const key = params.get("key");
      if (key) next.set("key", key);
      if (resolved) {
        next.set("add", "1");
        for (const k of ["name", "city"] as const) {
          const v = (params.get(k) || "").trim().slice(0, 120);
          if (v) next.set(k, v);
        }
      }
      const qs = next.toString() ? `?${next.toString()}` : "";
      nav(
        resolved
          ? `${regionPath(resolved.cc, resolved.abbrev)}${qs}`
          : `${detectedCountry ? countryPath(detectedCountry) : "/world"}${qs}`,
        { replace: true },
      );
      return;
    }
    if (parts.length === 0) {
      // Geo → that country; otherwise world is the default home.
      nav(
        detectedCountry
          ? `${countryPath(detectedCountry)}${search}`
          : `/world${search}`,
        { replace: true },
      );
      return;
    }
    // /us/tx → /US/TX (keep church shortId casing)
    if (isSupportedCountry(parts[0])) {
      const cc = parts[0].toUpperCase();
      const region = parts[1] ? parts[1].toUpperCase() : null;
      const rest = parts.slice(2).join("/");
      const desired = `/${cc}${region ? `/${region}` : ""}${rest ? `/${rest}` : ""}`;
      if (location.pathname !== desired) {
        nav(`${desired}${search}`, { replace: true });
      }
    }
  }, [location.pathname, location.search, detectedCountry, nav]);

  const routeParams = useMemo(() => {
    const parts = location.pathname.split("/").filter(Boolean);
    const isWorld = parts[0] === "world";
    const isLegacyCountry = parts[0] === "country" && !!parts[1];
    const isLegacyState = parts[0] === "state" && !!parts[1];
    const isCcRoot = !!parts[0] && isSupportedCountry(parts[0]);

    let viewLevel: "world" | "country" | "region" = "country";
    let countryCode = DEFAULT_COUNTRY_CODE;
    let stateAbbrev: string | null = null;
    /** First path index after country (+ region when present) — church/county segments. */
    let restIdx = 0;

    if (isWorld) {
      viewLevel = "world";
      countryCode = DEFAULT_COUNTRY_CODE;
    } else if (isLegacyCountry) {
      // /country/CA/PE/...
      countryCode = parts[1].toUpperCase();
      stateAbbrev = parts[2] ? parts[2].toUpperCase() : null;
      viewLevel = stateAbbrev ? "region" : "country";
      restIdx = stateAbbrev ? 3 : 2;
    } else if (isLegacyState) {
      // /state/TX/...
      countryCode = "US";
      stateAbbrev = parts[1].toUpperCase();
      viewLevel = "region";
      restIdx = 2;
    } else if (isCcRoot) {
      // /CA or /US/TX/...
      countryCode = parts[0].toUpperCase();
      stateAbbrev = parts[1] ? parts[1].toUpperCase() : null;
      viewLevel = stateAbbrev ? "region" : "country";
      restIdx = stateAbbrev ? 2 : 1;
    } else {
      // Bare `/` (briefly, before redirect) or unknown — geo country, else world.
      if (detectedCountry) {
        countryCode = detectedCountry;
        viewLevel = "country";
      } else {
        viewLevel = "world";
        countryCode = DEFAULT_COUNTRY_CODE;
      }
      restIdx = 0;
    }

    const s1 = parts[restIdx] ?? null;
    const s2 = parts[restIdx + 1] ?? null;
    const s3 = parts[restIdx + 2] ?? null;
    const s4 = parts[restIdx + 3] ?? null;

    const isCountyPath = s1 === "county" && isAdmin2Id(countryCode, s2);
    const routeCountyFips = isCountyPath ? s2! : null;
    const legacyChurchId = isCountyPath
      ? s3 === "church" && s4 ? decodeURIComponent(s4) : null
      : s1 === "church" && s2
        ? decodeURIComponent(s2)
        : null;
    const churchShortId = isCountyPath
      ? s3 && s3 !== "church" ? s3 : null
      : routeCountyFips
        ? null
        : s1 && s1 !== "church"
          ? s1
          : null;

    const searchParams = new URLSearchParams(location.search);
    const openReviewModalFromQuery = searchParams.get("review") === "true";
    const showVerifiedDots =
      searchParams.get("verified") === "true" || searchParams.get("verified") === "1";
    const moderatorKey = searchParams.get("key") || null;
    // Deep links from Lookup: ?add=1&name=&city= on a region, ?suggest=1 on a church.
    const addChurchPrefill = viewLevel === "region" && !churchShortId && searchParams.get("add") === "1"
      ? { name: searchParams.get("name") || "", city: searchParams.get("city") || "" }
      : null;
    const openSuggestFromQuery = !!churchShortId && searchParams.get("suggest") === "1";
    const queryCounty = searchParams.get("county");
    const routeCountyFipsResolved =
      routeCountyFips
      ?? (queryCounty && isAdmin2Id(countryCode, queryCounty) ? queryCounty : null);

    return {
      viewLevel,
      countryCode,
      stateAbbrev,
      routeCountyFips: routeCountyFipsResolved,
      churchShortId,
      legacyChurchId,
      openReviewModalFromQuery,
      showVerifiedDots,
      moderatorKey,
      addChurchPrefill,
      openSuggestFromQuery,
    };
  }, [location.pathname, location.search, detectedCountry]);

  const qs = location.search;

  const navigateToWorld = useCallback(() => nav(`/world${qs}`), [nav, qs]);

  const navigateToCountry = useCallback(
    (cc: string) => nav(`${countryPath(cc)}${qs}`),
    [nav, qs],
  );

  const navigateToState = useCallback(
    (abbrev: string) =>
      nav(`${regionPath(routeParams.countryCode, abbrev)}${qs}`),
    [nav, qs, routeParams.countryCode],
  );

  const navigateToStateWithReview = useCallback(
    (abbrev: string) => {
      const params = new URLSearchParams(location.search);
      params.set("review", "true");
      nav(`${regionPath(routeParams.countryCode, abbrev)}?${params.toString()}`);
    },
    [nav, location.search, routeParams.countryCode],
  );

  const navigateToChurch = useCallback(
    (
      stateAbbrev: string,
      churchShortId: string,
      options?: { replace?: boolean; countyFips?: string; countryCode?: string },
    ) => {
      const cc = (options?.countryCode ?? routeParams.countryCode).toUpperCase();
      const path = churchMapPath(cc, stateAbbrev, churchShortId);
      const params = new URLSearchParams(location.search);
      if (options?.countyFips) params.set("county", options.countyFips);
      else params.delete("county");
      const search = params.toString() ? `?${params.toString()}` : "";
      nav(path + search, options ?? {});
    },
    [nav, location.search, routeParams.countryCode],
  );

  /** Zoom-out from a country goes to world; legacy name kept for call sites. */
  const navigateToNational = useCallback(() => nav(`/world${qs}`), [nav, qs]);

  const navigateToCounty = useCallback(
    (stateAbbrev: string, countyFips: string) => {
      const cc = routeParams.countryCode;
      if (!getCountry(cc)?.hasAdmin2) return;
      if (!isAdmin2Id(cc, countyFips)) return;
      nav(`${countyPath(cc, stateAbbrev, countyFips)}${qs}`);
    },
    [nav, qs, routeParams.countryCode],
  );

  const navigateToStateOnly = useCallback(
    (stateAbbrev: string) => {
      const params = new URLSearchParams(location.search);
      params.delete("county");
      const search = params.toString() ? `?${params.toString()}` : "";
      nav(`${regionPath(routeParams.countryCode, stateAbbrev)}${search}`);
    },
    [nav, location.search, routeParams.countryCode],
  );

  const clearReviewQueryParam = useCallback(() => {
    const params = new URLSearchParams(location.search);
    if (params.get("review") === "true") {
      params.delete("review");
      const search = params.toString();
      nav(location.pathname + (search ? `?${search}` : ""), { replace: true });
    }
  }, [nav, location.pathname, location.search]);

  /** Drops the one-shot deep-link params once the form they asked for is open. */
  const clearDeepLinkParams = useCallback(() => {
    const params = new URLSearchParams(location.search);
    let changed = false;
    for (const k of ["add", "name", "city", "suggest"]) {
      if (params.has(k)) { params.delete(k); changed = true; }
    }
    if (!changed) return;
    const search = params.toString();
    nav(location.pathname + (search ? `?${search}` : ""), { replace: true });
  }, [nav, location.pathname, location.search]);

  const exitReviewView = useCallback(() => {
    const params = new URLSearchParams(location.search);
    params.delete("key");
    const search = params.toString();
    nav(location.pathname + (search ? `?${search}` : ""), { replace: true });
  }, [nav, location.pathname, location.search]);

  return (
    <ChurchMap
      viewLevel={routeParams.viewLevel}
      countryCode={routeParams.countryCode}
      navigateToWorld={navigateToWorld}
      navigateToCountry={navigateToCountry}
      routeStateAbbrev={routeParams.stateAbbrev}
      routeCountyFips={routeParams.routeCountyFips}
      routeChurchShortId={routeParams.churchShortId}
      routeLegacyChurchId={routeParams.legacyChurchId}
      openReviewModalFromQuery={routeParams.openReviewModalFromQuery}
      showVerifiedDotsFromQuery={routeParams.showVerifiedDots}
      clearReviewQueryParam={clearReviewQueryParam}
      moderatorKey={routeParams.moderatorKey}
      addChurchPrefill={routeParams.addChurchPrefill}
      openSuggestFromQuery={routeParams.openSuggestFromQuery}
      clearDeepLinkParams={clearDeepLinkParams}
      onExitReviewView={exitReviewView}
      navigateToState={navigateToState}
      navigateToStateWithReview={navigateToStateWithReview}
      navigateToChurch={navigateToChurch}
      navigateToNational={navigateToNational}
      navigateToCounty={navigateToCounty}
      navigateToStateOnly={navigateToStateOnly}
    />
  );
}

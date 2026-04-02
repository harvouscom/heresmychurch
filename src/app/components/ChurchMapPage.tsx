import { useLocation, useNavigate } from "react-router";
import { useMemo, useCallback } from "react";
import { ChurchMap } from "./ChurchMap";

/**
 * Thin routing wrapper — parses URL params and passes navigation
 * callbacks down to ChurchMap. This keeps all React Router logic
 * in one place so ChurchMap doesn't need to import router hooks directly.
 * Canonical: /state/MO/16692500 (church), /state/MO/16692500?county=06037 (church + county).
 * Legacy: /state/MO (state), /state/MO/county/06037 (county view), /state/MO/church/legacy-id,
 * /state/MO/county/06037/16692500 (church in county path — still supported).
 */
export function ChurchMapPage() {
  const location = useLocation();
  const nav = useNavigate();

  const routeParams = useMemo(() => {
    const parts = location.pathname.split("/").filter(Boolean);
    const stateAbbrev =
      parts[0] === "state" && parts[1] ? parts[1].toUpperCase() : null;
    const segment1 = parts[2];
    const segment2 = parts[3];
    const segment3 = parts[4];
    const segment4 = parts[5];
    const isCountyPath = segment1 === "county" && /^\d{5}$/.test(segment2 ?? "");
    const routeCountyFips = isCountyPath ? segment2! : null;
    // Church segment: either after county (parts[4]) or at parts[2] when no county
    const legacyChurchId = isCountyPath
      ? (segment3 === "church" && segment4 ? decodeURIComponent(segment4) : null)
      : segment1 === "church" && segment2
        ? decodeURIComponent(segment2)
        : null;
    const churchShortId = isCountyPath
      ? (segment3 && segment3 !== "church" ? segment3 : null)
      : routeCountyFips
        ? null
        : segment1 && segment1 !== "church"
          ? segment1
          : null;
    const searchParams = new URLSearchParams(location.search);
    const openReviewModalFromQuery = searchParams.get("review") === "true";
    const showVerifiedDots = searchParams.get("verified") === "true" || searchParams.get("verified") === "1";
    const moderatorKey = searchParams.get("key") || null;
    // County from path (legacy) or from query param (canonical)
    const queryCounty = searchParams.get("county");
    const routeCountyFipsResolved =
      routeCountyFips ?? (queryCounty && /^\d{5}$/.test(queryCounty) ? queryCounty : null);
    return { stateAbbrev, routeCountyFips: routeCountyFipsResolved, churchShortId, legacyChurchId, openReviewModalFromQuery, showVerifiedDots, moderatorKey };
  }, [location.pathname, location.search]);

  // location.search already includes the leading "?" (or is ""), so append as-is to avoid "??"
  const navigateToState = useCallback(
    (abbrev: string) => nav(`/state/${abbrev}${location.search}`),
    [nav, location.search]
  );
  const navigateToStateWithReview = useCallback(
    (abbrev: string) => {
      const params = new URLSearchParams(location.search);
      params.set("review", "true");
      nav(`/state/${abbrev}?${params.toString()}`);
    },
    [nav, location.search]
  );
  const navigateToChurch = useCallback(
    (stateAbbrev: string, churchShortId: string, options?: { replace?: boolean; countyFips?: string }) => {
      const path = `/state/${stateAbbrev}/${churchShortId}`;
      const params = new URLSearchParams(location.search);
      if (options?.countyFips) params.set("county", options.countyFips);
      const search = params.toString() ? `?${params.toString()}` : "";
      nav(path + search, options ?? {});
    },
    [nav, location.search]
  );
  const navigateToNational = useCallback(
    () => nav(`/${location.search}`),
    [nav, location.search]
  );
  const navigateToCounty = useCallback(
    (stateAbbrev: string, countyFips: string) =>
      nav(`/state/${stateAbbrev}/county/${countyFips}${location.search}`),
    [nav, location.search]
  );
  const navigateToStateOnly = useCallback(
    (stateAbbrev: string) => {
      const params = new URLSearchParams(location.search);
      params.delete("county");
      const search = params.toString() ? `?${params.toString()}` : "";
      nav(`/state/${stateAbbrev}${search}`);
    },
    [nav, location.search]
  );

  const clearReviewQueryParam = useCallback(() => {
    const params = new URLSearchParams(location.search);
    if (params.get("review") === "true") {
      params.delete("review");
      const search = params.toString();
      nav(location.pathname + (search ? `?${search}` : ""), { replace: true });
    }
  }, [nav, location.pathname, location.search]);

  const exitReviewView = useCallback(() => {
    const params = new URLSearchParams(location.search);
    params.delete("key");
    const search = params.toString();
    nav(location.pathname + (search ? `?${search}` : ""), { replace: true });
  }, [nav, location.pathname, location.search]);

  return (
    <ChurchMap
      routeStateAbbrev={routeParams.stateAbbrev}
      routeCountyFips={routeParams.routeCountyFips}
      routeChurchShortId={routeParams.churchShortId}
      routeLegacyChurchId={routeParams.legacyChurchId}
      openReviewModalFromQuery={routeParams.openReviewModalFromQuery}
      showVerifiedDotsFromQuery={routeParams.showVerifiedDots}
      clearReviewQueryParam={clearReviewQueryParam}
      moderatorKey={routeParams.moderatorKey}
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
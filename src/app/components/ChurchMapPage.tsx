import { useLocation, useNavigate } from "react-router";
import { useMemo, useCallback } from "react";
import { ChurchMap } from "./ChurchMap";

/**
 * Thin routing wrapper — parses URL params and passes navigation
 * callbacks down to ChurchMap. This keeps all React Router logic
 * in one place so ChurchMap doesn't need to import router hooks directly.
 * URLs: /state/MO (state), /state/MO/county/06037 (county), /state/MO/16692500 (shortId),
 * /state/MO/church/legacy-id (legacy), /state/MO/county/06037/16692500 (church in county).
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
    const moderatorKey = searchParams.get("key") || null;
    return { stateAbbrev, routeCountyFips, churchShortId, legacyChurchId, openReviewModalFromQuery, moderatorKey };
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
      const path = options?.countyFips
        ? `/state/${stateAbbrev}/county/${options.countyFips}/${churchShortId}`
        : `/state/${stateAbbrev}/${churchShortId}`;
      nav(path + location.search, options ?? {});
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
    (stateAbbrev: string) => nav(`/state/${stateAbbrev}${location.search}`),
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
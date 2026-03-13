import { useLocation, useNavigate } from "react-router";
import { useMemo, useCallback } from "react";
import { ChurchMap } from "./ChurchMap";

/**
 * Thin routing wrapper — parses URL params and passes navigation
 * callbacks down to ChurchMap. This keeps all React Router logic
 * in one place so ChurchMap doesn't need to import router hooks directly.
 * URLs: /state/MO/16692500 (shortId) or /state/MO/church/legacy-id (legacy).
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
    const legacyChurchId =
      segment1 === "church" && segment2
        ? decodeURIComponent(segment2)
        : null;
    const churchShortId =
      segment1 && segment1 !== "church" ? segment1 : null;
    const searchParams = new URLSearchParams(location.search);
    const openReviewModalFromQuery = searchParams.get("review") === "true";
    const moderatorKey = searchParams.get("key") || null;
    return { stateAbbrev, churchShortId, legacyChurchId, openReviewModalFromQuery, moderatorKey };
  }, [location.pathname, location.search]);

  const navigateToState = useCallback(
    (abbrev: string) => {
      const path = `/state/${abbrev}`;
      const search = location.search ? `?${location.search}` : "";
      nav(path + search);
    },
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
    (stateAbbrev: string, churchShortId: string, options?: { replace?: boolean }) => {
      const path = `/state/${stateAbbrev}/${churchShortId}`;
      const search = location.search ? `?${location.search}` : "";
      nav(path + search, options ?? {});
    },
    [nav, location.search]
  );
  const navigateToNational = useCallback(() => {
    const search = location.search ? `?${location.search}` : "";
    nav("/" + search);
  }, [nav, location.search]);

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
    />
  );
}
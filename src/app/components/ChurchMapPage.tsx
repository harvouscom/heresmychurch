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
    const openReviewModalFromQuery =
      new URLSearchParams(location.search).get("review") === "true";
    return { stateAbbrev, churchShortId, legacyChurchId, openReviewModalFromQuery };
  }, [location.pathname, location.search]);

  const navigateToState = useCallback(
    (abbrev: string) => nav(`/state/${abbrev}`),
    [nav]
  );
  const navigateToStateWithReview = useCallback(
    (abbrev: string) => nav(`/state/${abbrev}?review=true`),
    [nav]
  );
  const navigateToChurch = useCallback(
    (stateAbbrev: string, churchShortId: string, options?: { replace?: boolean }) =>
      nav(`/state/${stateAbbrev}/${churchShortId}`, options ?? {}),
    [nav]
  );
  const navigateToNational = useCallback(() => nav("/"), [nav]);

  const clearReviewQueryParam = useCallback(() => {
    if (new URLSearchParams(location.search).get("review") === "true") {
      nav(location.pathname, { replace: true });
    }
  }, [nav, location.pathname, location.search]);

  return (
    <ChurchMap
      routeStateAbbrev={routeParams.stateAbbrev}
      routeChurchShortId={routeParams.churchShortId}
      routeLegacyChurchId={routeParams.legacyChurchId}
      openReviewModalFromQuery={routeParams.openReviewModalFromQuery}
      clearReviewQueryParam={clearReviewQueryParam}
      navigateToState={navigateToState}
      navigateToStateWithReview={navigateToStateWithReview}
      navigateToChurch={navigateToChurch}
      navigateToNational={navigateToNational}
    />
  );
}
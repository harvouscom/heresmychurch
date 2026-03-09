import { useLocation, useNavigate } from "react-router";
import { useMemo, useCallback } from "react";
import { ChurchMap } from "./ChurchMap";

/**
 * Thin routing wrapper — parses URL params and passes navigation
 * callbacks down to ChurchMap. This keeps all React Router logic
 * in one place so ChurchMap doesn't need to import router hooks directly.
 */
export function ChurchMapPage() {
  const location = useLocation();
  const nav = useNavigate();

  // Parse route params from pathname
  const routeParams = useMemo(() => {
    const parts = location.pathname.split("/").filter(Boolean);
    // /state/TX → stateAbbrev = "TX"
    // /state/TX/church/TX-123 → stateAbbrev = "TX", churchId = "TX-123"
    const stateAbbrev =
      parts[0] === "state" && parts[1] ? parts[1].toUpperCase() : null;
    const churchId =
      parts[2] === "church" && parts[3]
        ? decodeURIComponent(parts[3])
        : null;
    return { stateAbbrev, churchId };
  }, [location.pathname]);

  const navigateToState = useCallback(
    (abbrev: string) => nav(`/state/${abbrev}`),
    [nav]
  );
  const navigateToChurch = useCallback(
    (stateAbbrev: string, churchId: string) =>
      nav(`/state/${stateAbbrev}/church/${encodeURIComponent(churchId)}`),
    [nav]
  );
  const navigateToNational = useCallback(() => nav("/"), [nav]);

  return (
    <ChurchMap
      routeStateAbbrev={routeParams.stateAbbrev}
      routeChurchId={routeParams.churchId}
      navigateToState={navigateToState}
      navigateToChurch={navigateToChurch}
      navigateToNational={navigateToNational}
    />
  );
}
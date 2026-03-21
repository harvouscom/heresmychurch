import { createBrowserRouter } from "react-router";
import { ChurchMapPage } from "./components/ChurchMapPage";
import { SeasonalReportPage } from "./components/report/SeasonalReportPage";
import { RouteError } from "./components/RouteError";

// All routes render ChurchMapPage — URL params drive the map state
// /                            → National overview
// /state/:stateAbbrev          → State view (zoomed into a state with churches)
// /state/:stateAbbrev/:segment1/:segment2? → segment1=8-digit shortId (canonical) or "church" + segment2=legacy id; ?county=FIPS supported; county path legacy also supported
// /report/:slug                → Seasonal data report (e.g. /report/launch-2026)
// /report/:slug/:sectionId     → Seasonal report section excerpt (e.g. /report/launch-2026/denominations)
// Review mode: add ?key=SECRET to any route
export const router = createBrowserRouter([
  { path: "/", Component: ChurchMapPage, ErrorBoundary: RouteError },
  { path: "/report/:slug", Component: SeasonalReportPage, ErrorBoundary: RouteError },
  { path: "/report/:slug/:sectionId", Component: SeasonalReportPage, ErrorBoundary: RouteError },
  { path: "/state/:stateAbbrev", Component: ChurchMapPage, ErrorBoundary: RouteError },
  { path: "/state/:stateAbbrev/:segment1/:segment2?", Component: ChurchMapPage, ErrorBoundary: RouteError },
  { path: "*", Component: ChurchMapPage, ErrorBoundary: RouteError },
]);
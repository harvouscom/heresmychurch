import { createBrowserRouter } from "react-router";
import { ChurchMapPage } from "./components/ChurchMapPage";
import { SeasonalReportPage } from "./components/report/SeasonalReportPage";
import { ReportsHubPage } from "./components/report/ReportsHubPage";
import { RouteError } from "./components/RouteError";
import { Easter2026EntryRedirect } from "./components/special-report/Easter2026EntryRedirect";
import { PrivacyPolicyPage } from "./components/report/PrivacyPolicyPage";
import { RootLayout } from "./RootLayout";

// All routes render ChurchMapPage — URL params drive the map state
// /                            → National overview
// /reports                     → Index of seasonal reports (national + state links)
// /state/:stateAbbrev          → State view (zoomed into a state with churches)
// /state/:stateAbbrev/:segment1/:segment2? → segment1=8-digit shortId (canonical) or "church" + segment2=legacy id; ?county=FIPS supported; county path legacy also supported
// /report/:slug                → Seasonal national report (e.g. /report/launch-2026)
// /report/:slug/:sectionId     → Seasonal national report excerpt (e.g. /report/launch-2026/denominations)
// /report/state/:stateAbbrev/:slug            → Seasonal state report
// /report/state/:stateAbbrev/:slug/:sectionId → Seasonal state report excerpt
// Review mode: add ?key=SECRET to any route
export const router = createBrowserRouter([
  {
    Component: RootLayout,
    ErrorBoundary: RouteError,
    children: [
      { path: "/", Component: ChurchMapPage, ErrorBoundary: RouteError },
      { path: "/special-report/easter-2026", Component: Easter2026EntryRedirect, ErrorBoundary: RouteError },
      { path: "/reports", Component: ReportsHubPage, ErrorBoundary: RouteError },
      { path: "/privacy", Component: PrivacyPolicyPage, ErrorBoundary: RouteError },
      { path: "/report/:slug", Component: SeasonalReportPage, ErrorBoundary: RouteError },
      { path: "/report/:slug/:sectionId", Component: SeasonalReportPage, ErrorBoundary: RouteError },
      { path: "/report/state/:stateAbbrev/:slug", Component: SeasonalReportPage, ErrorBoundary: RouteError },
      { path: "/report/state/:stateAbbrev/:slug/:sectionId", Component: SeasonalReportPage, ErrorBoundary: RouteError },
      { path: "/state/:stateAbbrev", Component: ChurchMapPage, ErrorBoundary: RouteError },
      { path: "/state/:stateAbbrev/:segment1/:segment2?", Component: ChurchMapPage, ErrorBoundary: RouteError },
      { path: "*", Component: ChurchMapPage, ErrorBoundary: RouteError },
    ],
  },
]);
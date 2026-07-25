import { createBrowserRouter } from "react-router";
import { ChurchMapPage } from "./components/ChurchMapPage";
import { RouteError } from "./components/RouteError";
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
//
// The map is the app; the report pages are a side trip. They pull in Recharts,
// d3 and react-simple-maps (report/charts.tsx), so they are loaded lazily —
// otherwise every visitor who only ever opens the map downloads a second
// mapping library they never use.
const seasonalReport = async () => ({
  Component: (await import("./components/report/SeasonalReportPage")).SeasonalReportPage,
});

export const router = createBrowserRouter([
  {
    Component: RootLayout,
    ErrorBoundary: RouteError,
    children: [
      { path: "/", Component: ChurchMapPage, ErrorBoundary: RouteError },
      {
        path: "/special-report/easter-2026",
        lazy: async () => ({
          Component: (await import("./components/special-report/Easter2026EntryRedirect"))
            .Easter2026EntryRedirect,
        }),
        ErrorBoundary: RouteError,
      },
      {
        path: "/reports",
        lazy: async () => ({
          Component: (await import("./components/report/ReportsHubPage")).ReportsHubPage,
        }),
        ErrorBoundary: RouteError,
      },
      {
        path: "/privacy",
        lazy: async () => ({
          Component: (await import("./components/report/PrivacyPolicyPage")).PrivacyPolicyPage,
        }),
        ErrorBoundary: RouteError,
      },
      { path: "/report/:slug", lazy: seasonalReport, ErrorBoundary: RouteError },
      { path: "/report/:slug/:sectionId", lazy: seasonalReport, ErrorBoundary: RouteError },
      { path: "/report/state/:stateAbbrev/:slug", lazy: seasonalReport, ErrorBoundary: RouteError },
      {
        path: "/report/state/:stateAbbrev/:slug/:sectionId",
        lazy: seasonalReport,
        ErrorBoundary: RouteError,
      },
      { path: "/state/:stateAbbrev", Component: ChurchMapPage, ErrorBoundary: RouteError },
      { path: "/state/:stateAbbrev/:segment1/:segment2?", Component: ChurchMapPage, ErrorBoundary: RouteError },
      { path: "*", Component: ChurchMapPage, ErrorBoundary: RouteError },
    ],
  },
]);

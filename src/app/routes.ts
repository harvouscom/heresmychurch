import { createBrowserRouter } from "react-router";
import { ChurchMapPage } from "./components/ChurchMapPage";
import { RouteError } from "./components/RouteError";
import { RootLayout } from "./RootLayout";

// All map routes render ChurchMapPage — URL params drive the map state.
// /                            → Redirects to /:CC (geo) or /world (default)
// /world                       → World choropleth (countries) — default home
// /:countryCode                → Country overview (e.g. /US, /CA)
// /:countryCode/:regionCode    → Region view (e.g. /US/TX, /CA/PE)
// /:countryCode/:region/:seg   → Church / county deep link (?suggest=1 opens suggest-an-edit)
// /add?name=&city=&region=     → Add-church form for that region, prefilled (links from Lookup)
// Legacy (redirected in ChurchMapPage + the site Worker):
//   /state/:abbrev…  → /US/:abbrev…
//   /country/:cc…    → /:cc…
// /metro                       → U.S. metro directory index (SEO)
// /metro/:slug                 → Metro church list + filters (SEO)
// /reports                     → Index of seasonal reports
// /report/:slug…               → US national seasonal report
// /report/:countryCode/:slug…  → Country / WORLD seasonal report (ISO CC or WORLD)
// /report/state/:stateAbbrev/:slug… → US state report (unchanged)
// Review mode: sign in at /review (Cloudflare Access); ?key=SECRET still works until the key is retired
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
      { path: "/for-churches", lazy: async () => ({ Component: (await import("./components/ChurchPortal")).ChurchPortalPage }) },
      { path: "/church-portal", lazy: async () => ({ Component: (await import("./components/ChurchPortal")).LegacyChurchPortalRedirect }) },
      { path: "/review", lazy: async () => ({ Component: (await import("./components/ReviewEntry")).ReviewEntryPage }) },
      { path: "/review/signout", lazy: async () => ({ Component: (await import("./components/ReviewEntry")).ReviewEntryPage }) },
      { path: "/data-health/attendance-review", lazy: async () => ({ Component: (await import("./components/PrivateAttendance")).AttendanceReviewPage }) },
      { path: "/improve-the-map", lazy: async () => ({ Component: (await import("./components/DataHealth")).DataHealthPage }) },
      { path: "/data-health", lazy: async () => ({ Component: (await import("./components/ChurchPortal")).LegacyDataHealthRedirect }) },
      { path: "/email-confirmation", lazy: async () => ({ Component: (await import("./components/EmailConfirmation")).EmailConfirmationPage }) },
      { path: "/", Component: ChurchMapPage, ErrorBoundary: RouteError },
      { path: "/world", Component: ChurchMapPage, ErrorBoundary: RouteError },
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
      {
        path: "/metro",
        lazy: async () => ({
          Component: (await import("./components/metro/MetroIndexPage")).MetroIndexPage,
        }),
        ErrorBoundary: RouteError,
      },
      {
        path: "/metro/:slug",
        lazy: async () => ({
          Component: (await import("./components/metro/MetroPage")).MetroPage,
        }),
        ErrorBoundary: RouteError,
      },
      { path: "/report/state/:stateAbbrev/:slug", lazy: seasonalReport, ErrorBoundary: RouteError },
      {
        path: "/report/state/:stateAbbrev/:slug/:sectionId",
        lazy: seasonalReport,
        ErrorBoundary: RouteError,
      },
      // Two- and three-segment report URLs share one pattern. SeasonalReportPage
      // decides whether :a/:b is country+slug or US-slug+sectionId.
      { path: "/report/:a/:b/:c", lazy: seasonalReport, ErrorBoundary: RouteError },
      { path: "/report/:a/:b", lazy: seasonalReport, ErrorBoundary: RouteError },
      { path: "/report/:slug", lazy: seasonalReport, ErrorBoundary: RouteError },
      // Legacy aliases — ChurchMapPage replace-navigates to /:CC/...
      { path: "/country/:countryCode", Component: ChurchMapPage, ErrorBoundary: RouteError },
      { path: "/country/:countryCode/:regionCode", Component: ChurchMapPage, ErrorBoundary: RouteError },
      { path: "/country/:countryCode/:regionCode/:segment1/:segment2?", Component: ChurchMapPage, ErrorBoundary: RouteError },
      { path: "/state/:stateAbbrev", Component: ChurchMapPage, ErrorBoundary: RouteError },
      { path: "/state/:stateAbbrev/:segment1/:segment2?", Component: ChurchMapPage, ErrorBoundary: RouteError },
      // Lookup's "add this church" link; ChurchMapPage redirects to the region with the form open.
      { path: "/add", Component: ChurchMapPage, ErrorBoundary: RouteError },
      // Canonical country-scoped browsing (must stay after reserved paths above).
      { path: "/:countryCode", Component: ChurchMapPage, ErrorBoundary: RouteError },
      { path: "/:countryCode/:regionCode", Component: ChurchMapPage, ErrorBoundary: RouteError },
      { path: "/:countryCode/:regionCode/:segment1/:segment2?", Component: ChurchMapPage, ErrorBoundary: RouteError },
      { path: "*", Component: ChurchMapPage, ErrorBoundary: RouteError },
    ],
  },
]);

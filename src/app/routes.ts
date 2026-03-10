import { createBrowserRouter } from "react-router";
import { ChurchMapPage } from "./components/ChurchMapPage";
import { RouteError } from "./components/RouteError";

// All routes render ChurchMapPage — URL params drive the map state
// /                            → National overview
// /state/:stateAbbrev          → State view (zoomed into a state with churches)
// /state/:stateAbbrev/:segment1/:segment2? → segment1=8-digit shortId (new) or "church" + segment2=legacy churchId
export const router = createBrowserRouter([
  { path: "/", Component: ChurchMapPage, ErrorBoundary: RouteError },
  { path: "/state/:stateAbbrev", Component: ChurchMapPage, ErrorBoundary: RouteError },
  { path: "/state/:stateAbbrev/:segment1/:segment2?", Component: ChurchMapPage, ErrorBoundary: RouteError },
  { path: "*", Component: ChurchMapPage, ErrorBoundary: RouteError },
]);
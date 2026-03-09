import { createBrowserRouter } from "react-router";
import { ChurchMapPage } from "./components/ChurchMapPage";
import { RouteError } from "./components/RouteError";

// All routes render ChurchMapPage — URL params drive the map state
// /                            → National overview
// /state/:stateAbbrev          → State view (zoomed into a state with churches)
// /state/:stateAbbrev/church/:churchId → Church detail panel open
export const router = createBrowserRouter([
  { path: "/", Component: ChurchMapPage, ErrorBoundary: RouteError },
  { path: "/state/:stateAbbrev", Component: ChurchMapPage, ErrorBoundary: RouteError },
  { path: "/state/:stateAbbrev/church/:churchId", Component: ChurchMapPage, ErrorBoundary: RouteError },
  { path: "*", Component: ChurchMapPage, ErrorBoundary: RouteError },
]);
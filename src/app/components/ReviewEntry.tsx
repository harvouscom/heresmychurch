import { Navigate, useLocation } from "react-router";
import { setReviewerSession } from "./api";

/**
 * /review is protected by Cloudflare Access, so reaching it means the reviewer has signed in.
 * Remember that for this tab and continue to the map (or ?next=), where the review queue appears.
 * /review/signout forgets it.
 */
export function ReviewEntryPage() {
  const location = useLocation();
  const signOut = location.pathname.startsWith("/review/signout");
  if (signOut) { setReviewerSession(false); return <Navigate replace to="/" />; }
  setReviewerSession(true);
  const next = new URLSearchParams(location.search).get("next") || "/";
  return <Navigate replace to={next.startsWith("/") && !next.startsWith("//") ? next : "/"} />;
}

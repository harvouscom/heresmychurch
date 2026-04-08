import { useEffect } from "react";
import { useLocation } from "react-router";

const CANONICAL_LINK_ID = "hmc-canonical-link";

/**
 * Keeps `<link rel="canonical">` in sync with the current path (no query or hash).
 * Default href in index.html is `/`; SPA navigation updates it for all routes.
 */
export function SeoCanonical() {
  const { pathname } = useLocation();

  useEffect(() => {
    const href = `${window.location.origin}${pathname}`;
    let link = document.getElementById(CANONICAL_LINK_ID) as HTMLLinkElement | null;
    if (!link) {
      link = document.createElement("link");
      link.id = CANONICAL_LINK_ID;
      link.rel = "canonical";
      document.head.appendChild(link);
    }
    link.href = href;
  }, [pathname]);

  return null;
}

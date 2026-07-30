import * as React from "react";

const MOBILE_BREAKPOINT = 990;
/** Ignore rapid width flips while the window edge is being dragged. */
const MOBILE_CHANGE_DEBOUNCE_MS = 200;

export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState<boolean | undefined>(
    undefined,
  );

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
    let timer = 0;
    const apply = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    };
    const onChange = () => {
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(apply, MOBILE_CHANGE_DEBOUNCE_MS);
    };
    mql.addEventListener("change", onChange);
    apply();
    return () => {
      mql.removeEventListener("change", onChange);
      if (timer) window.clearTimeout(timer);
    };
  }, []);

  return !!isMobile;
}

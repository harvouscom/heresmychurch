import * as React from "react";

const MOBILE_BREAKPOINT = 990;
/** Ignore rapid width flips while the window edge is being dragged. */
const MOBILE_CHANGE_DEBOUNCE_MS = 200;

/** Below this the church card is a full-width bottom sheet; between it and
 *  MOBILE_BREAKPOINT the card floats in the bottom-right corner. */
const PHONE_BREAKPOINT = 640;

/** True when the window is narrower than the `md` breakpoint (990px). */
export function useIsMobile() {
  return useIsBelow(MOBILE_BREAKPOINT);
}

/** True on phone-width windows (under 640px). */
export function useIsPhone() {
  return useIsBelow(PHONE_BREAKPOINT);
}

function useIsBelow(breakpoint: number) {
  const [isMobile, setIsMobile] = React.useState<boolean | undefined>(
    undefined,
  );

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${breakpoint - 1}px)`);
    let timer = 0;
    const apply = () => {
      setIsMobile(window.innerWidth < breakpoint);
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
  }, [breakpoint]);

  return !!isMobile;
}

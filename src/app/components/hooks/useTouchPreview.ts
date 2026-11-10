import { useCallback, useEffect, useRef } from "react";
import { trackPointerIntent } from "../../lib/pointer-intent";

/** Touch taps preview first; mouse clicks open immediately at every screen width. */
export function useTouchPreview() {
  const tracker = useRef<ReturnType<typeof trackPointerIntent> | null>(null);
  useEffect(() => {
    tracker.current = trackPointerIntent(window);
    return () => { tracker.current?.destroy(); tracker.current = null; };
  }, []);
  return useCallback(() => tracker.current?.shouldPreview() ?? false, []);
}

import * as React from "react";

/**
 * Code-split a rarely used component (modals, forms, moderator tools) out of the main
 * bundle. Each gets its own Suspense boundary with no fallback, so the first open just
 * appears a moment later instead of suspending (and blanking) the map around it.
 */
export function lazyComponent<P extends object>(
  load: () => Promise<React.ComponentType<P>>,
): React.ComponentType<P> {
  const Lazy = React.lazy(async () => ({ default: await load() }));
  function LazyComponent(props: P) {
    return (
      <React.Suspense fallback={null}>
        <Lazy {...(props as any)} />
      </React.Suspense>
    );
  }
  return LazyComponent;
}

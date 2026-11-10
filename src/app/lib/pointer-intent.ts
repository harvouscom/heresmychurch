/** Pointer intent is independent of viewport width, including on hybrid laptops. */
export function trackPointerIntent(host: Pick<Window, "matchMedia" | "addEventListener" | "removeEventListener">) {
  const primaryTouch = host.matchMedia("(hover: none) and (pointer: coarse)");
  let touch = primaryTouch.matches;
  const change = () => { touch = primaryTouch.matches; };
  const pointer = (event: Event) => {
    const type = (event as PointerEvent).pointerType;
    if (type === "mouse") touch = false;
    else if (type === "touch" || type === "pen") touch = true;
  };
  // Capture runs before the map's click handler and needs no React render cycle.
  host.addEventListener("pointerdown", pointer, { capture: true });
  primaryTouch.addEventListener("change", change);
  return {
    shouldPreview: () => touch,
    destroy() {
      host.removeEventListener("pointerdown", pointer, { capture: true });
      primaryTouch.removeEventListener("change", change);
    },
  };
}

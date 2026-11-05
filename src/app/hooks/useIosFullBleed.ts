import { useLayoutEffect } from "react";

/**
 * iPhone Safari only paints a page behind its status bar and toolbar in limited ways:
 * `position: fixed` and anything within the root's height stop at the bars, leaving bands
 * of flat background. Page content does paint behind them, if it extends past the viewport
 * (bottom) and the page is scrolled down a little (top). `overflow: hidden` on the root
 * still blocks user scrolling, so only the scroll set here can move it.
 *
 * So on map routes: #root moves down by `top`, the scroll is pinned to `top` so the UI stays
 * where it was, and only the map reaches out behind the bars. Generous sizes are harmless,
 * since anything past the screen edge is simply off screen. Measured on iOS 26: status bar
 * 62pt, toolbar 98pt, landscape tab bar 110pt.
 */
const BLEED = { top: 120, bottom: 120 };
const NO_BLEED = { top: 0, bottom: 0 };

function isIphoneSafariTab(): boolean {
  if (typeof window === "undefined" || typeof CSS === "undefined") return false;
  const ua = navigator.userAgent;
  return (
    CSS.supports("-webkit-touch-callout", "none") && // iOS WebKit
    /iPhone/.test(ua) && // iPad Safari has no bottom toolbar
    !/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua) && // other browsers have their own bars
    window.matchMedia("(display-mode: browser)").matches // not added to the home screen
  );
}

/** How far the map extends past the visible page, so the camera can frame around it. */
export const mapBleed = isIphoneSafariTab() ? BLEED : NO_BLEED;

export function useIosFullBleed() {
  useLayoutEffect(() => {
    if (mapBleed === NO_BLEED) return;
    const root = document.documentElement;
    root.style.setProperty("--hmc-bleed-top", `${mapBleed.top}px`);
    root.style.setProperty("--hmc-bleed-bottom", `${mapBleed.bottom}px`);
    root.classList.add("hmc-ios-bleed");

    const pin = () => {
      // Safari scrolls the page itself to keep a focused field above the keyboard.
      const el = document.activeElement;
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) return;
      if (Math.abs(window.scrollY - mapBleed.top) > 1) window.scrollTo(0, mapBleed.top);
    };
    pin();
    window.addEventListener("scroll", pin, { passive: true }); // e.g. tapping the status bar
    window.addEventListener("resize", pin);
    window.addEventListener("pageshow", pin);
    document.addEventListener("focusout", pin);

    return () => {
      window.removeEventListener("scroll", pin);
      window.removeEventListener("resize", pin);
      window.removeEventListener("pageshow", pin);
      document.removeEventListener("focusout", pin);
      root.classList.remove("hmc-ios-bleed");
      root.style.removeProperty("--hmc-bleed-top");
      root.style.removeProperty("--hmc-bleed-bottom");
      window.scrollTo(0, 0);
    };
  }, []);
}

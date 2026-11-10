import { describe, expect, it } from "vitest";
import { trackPointerIntent } from "../../src/app/lib/pointer-intent";
function device(coarse = false) {
  const host = new EventTarget();
  const media = Object.assign(new EventTarget(), { matches: coarse });
  const tracker = trackPointerIntent(Object.assign(host, { matchMedia: () => media }) as any);
  const click = (pointerType: string) => host.dispatchEvent(Object.assign(new Event("pointerdown"), { pointerType }));
  return { host, media, tracker, click };
}
describe("map click intent", () => {
  it("opens directly with a mouse regardless of the window width", () => {
    const d = device(); d.click("mouse"); expect(d.tracker.shouldPreview()).toBe(false);
  });
  it("previews on touch, including a large-screen touch device", () => {
    const d = device(true); expect(d.tracker.shouldPreview()).toBe(true);
    d.click("touch"); expect(d.tracker.shouldPreview()).toBe(true);
  });
  it("switches correctly between touch and mouse on hybrid devices", () => {
    const d = device(true); d.click("mouse"); expect(d.tracker.shouldPreview()).toBe(false);
    d.click("touch"); expect(d.tracker.shouldPreview()).toBe(true);
    d.click("mouse"); expect(d.tracker.shouldPreview()).toBe(false);
  });
  it("uses changed hardware capability as a fallback and removes listeners on cleanup", () => {
    const d = device(); d.media.matches = true; d.media.dispatchEvent(new Event("change"));
    expect(d.tracker.shouldPreview()).toBe(true); d.tracker.destroy(); d.click("mouse");
    expect(d.tracker.shouldPreview()).toBe(true);
  });
});

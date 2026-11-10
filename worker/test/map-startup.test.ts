import { describe, expect, it, vi } from "vitest";
import { runInNewContext } from "node:vm";
import { MAP_STARTUP_HEAD } from "../map-startup";
import { rewriteForBots } from "../og-rewrite";
import { readFileSync } from "node:fs";

function start() {
  const classes = new Set<string>();
  const events = new Map<string, () => void>();
  const remove = vi.fn();
  let timeout: () => void = () => {};
  runInNewContext(MAP_STARTUP_HEAD.match(/<script>(.*?)<\/script>/s)![1], {
    document: { documentElement: { classList: { add: (c: string) => classes.add(c), remove: (c: string) => classes.delete(c) } }, getElementById: () => ({ remove }) },
    window: { addEventListener: (e: string, fn: () => void) => events.set(e, fn), removeEventListener: (e: string) => events.delete(e) },
    setTimeout: (fn: () => void) => { timeout = fn; return 1; }, clearTimeout: vi.fn(),
  });
  return { classes, events, remove, failBundle: () => timeout() };
}
describe("map startup", () => {
  it("shows the loading state until the app commits, then reveals the app", () => {
    const page = start(); expect(page.classes.has("hmc-map-starting")).toBe(true);
    page.events.get("hmc-app-ready")!();
    expect(page.classes.has("hmc-map-starting")).toBe(false); expect(page.remove).toHaveBeenCalledOnce();
  });
  it("restores the readable directory if the app fails to load", () => {
    const page = start(); page.failBundle(); expect(page.classes.has("hmc-map-starting")).toBe(false);
    expect(page.remove).toHaveBeenCalledOnce();
  });
  it("keeps the same country directory and loading shell for visitors and crawlers", async () => {
    const next = async () => new Response(readFileSync(new URL("../../index.html", import.meta.url), "utf8"), { headers: { "content-type": "text/html" } });
    const pages = await Promise.all(["Mozilla/5.0", "Googlebot"].map(async ua => (await rewriteForBots(new Request("https://heresmychurch.com/US", { headers: { "user-agent": ua } }), next)).text()));
    expect(pages[0]).toBe(pages[1]); expect(pages[0]).toContain('href="/US/IA"');
    expect(pages[0]).toContain('id="hmc-map-startup"');
    // With JS disabled, no starting class is added and the directory remains readable.
    expect(pages[0]).not.toMatch(/<html[^>]*class="hmc-map-starting"/);
  });
});

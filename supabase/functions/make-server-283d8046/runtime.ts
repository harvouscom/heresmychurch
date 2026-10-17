// Platform shims so the same app runs on Supabase Edge (Deno) and Cloudflare Workers.
//
// Each entry point wires these up once:
//   Supabase (index.ts):  setEnv((n) => Deno.env.get(n)); setWaitUntil(EdgeRuntime.waitUntil)
//   Workers (api/index.ts): setEnv((n) => env[n]);        setWaitUntil(ctx.waitUntil)
// Read env lazily (inside functions), never at module scope: on Workers the env
// only exists once the first request arrives.

type EnvSource = (name: string) => string | undefined;
type WaitUntil = (promise: Promise<unknown>) => void;

let envSource: EnvSource = () => undefined;
let waitUntilImpl: WaitUntil | null = null;

export function setEnv(source: EnvSource): void {
  envSource = source;
}

/** Environment variable or secret, or undefined when unset. */
export function env(name: string): string | undefined {
  const v = envSource(name);
  return typeof v === "string" ? v : undefined;
}

export function setWaitUntil(fn: WaitUntil | null): void {
  waitUntilImpl = fn;
}

/** Keep the isolate alive for background work after the response is sent. */
export function waitUntil(promise: Promise<unknown>): void {
  const p = promise.catch(() => {});
  try {
    waitUntilImpl?.(p);
  } catch (_) {
    /* best effort, matching the old EdgeRuntime?.waitUntil?.() */
  }
}

// OG image rendering is platform-specific (Deno og_edge vs Workers), so each entry
// point registers a renderer. Params match og-image.tsx's OgImageParams.
type OgImageRenderer = (params: any) => Promise<Response>;
let ogImageRenderer: OgImageRenderer | null = null;

export function setOgImageRenderer(fn: OgImageRenderer): void {
  ogImageRenderer = fn;
}

export function renderOgImage(params: any): Promise<Response> {
  if (!ogImageRenderer) throw new Error("No OG image renderer registered");
  return ogImageRenderer(params);
}

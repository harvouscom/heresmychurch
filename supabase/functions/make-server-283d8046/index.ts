// Supabase Edge (Deno) entry point. The app itself is platform-neutral (app.ts);
// the Cloudflare Worker entry is api/index.ts.
import app from "./app.ts";
import { setEnv, setOgImageRenderer, setWaitUntil } from "./runtime.ts";

setEnv((name) => Deno.env.get(name));
const edgeRuntime = (globalThis as any).EdgeRuntime;
setWaitUntil(edgeRuntime?.waitUntil ? (p) => edgeRuntime.waitUntil(p) : null);
// Dynamic import: og-image pulls React + esm.sh; loading at startup can cause BOOT_ERROR on Edge.
setOgImageRenderer(async (params) => (await import("./og-image.tsx")).generateOgImage(params));

Deno.serve(app.fetch);

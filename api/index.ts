/**
 * Cloudflare Worker entry for the HMC API (api.heresmychurch.com).
 *
 * Runs the same Hono app as the Supabase edge function
 * (supabase/functions/make-server-283d8046/app.ts). Deno-style imports in that code
 * (npm:, jsr:) are mapped to npm packages by `alias` in api/wrangler.jsonc.
 */
import app from "../supabase/functions/make-server-283d8046/app.ts";
import { setEnv, setOgImageRenderer, setWaitUntil } from "../supabase/functions/make-server-283d8046/runtime.ts";
import { generateOgImage } from "./og-image.ts";

const PREFIX = "/make-server-283d8046";

interface Env {
  [name: string]: unknown;
}

// og-image.tsx is Deno-only (esm.sh React + og_edge); Workers use workers-og.
setOgImageRenderer(generateOgImage);

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    setEnv((name) => {
      const v = env[name];
      return typeof v === "string" ? v : undefined;
    });
    setWaitUntil((p) => ctx.waitUntil(p));

    // Routes are mounted under /make-server-283d8046 (the Supabase function name);
    // accept bare paths too, so api.heresmychurch.com/churches/TX works.
    const url = new URL(request.url);
    if (url.pathname !== PREFIX && !url.pathname.startsWith(`${PREFIX}/`)) {
      url.pathname = PREFIX + (url.pathname === "/" ? "" : url.pathname);
    }

    return app.fetch(new Request(url.toString(), request), env, ctx);
  },
};

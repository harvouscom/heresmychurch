/**
 * Cloudflare Worker entry for the HMC API (api.heresmychurch.com).
 *
 * Runs the same Hono app as the Supabase edge function
 * (supabase/functions/make-server-283d8046/app.ts). Deno-style imports in that code
 * (npm:, jsr:) are mapped to npm packages by `alias` in api/wrangler.jsonc.
 */
import app from "../supabase/functions/make-server-283d8046/app.ts";
import { setEnv, setOgImageRenderer, setWaitUntil } from "../supabase/functions/make-server-283d8046/runtime.ts";
import { setR2Binding } from "../supabase/functions/make-server-283d8046/r2.ts";
import { setD1, setKvBucket, setSearchD1 } from "../supabase/functions/make-server-283d8046/bindings.ts";
import { generateOgImage } from "./og-image.ts";
import { handlePresence } from "./presence.ts";

export { PresenceRoom } from "./presence.ts";

const PREFIX = "/make-server-283d8046";

interface Env {
  [name: string]: unknown;
  /** hmc-data bucket (static files); replaces the S3 keys the Supabase function uses. */
  HMC_DATA?: R2Bucket;
  /** Main store: KV rows, audit log, monthly snapshots. */
  HMC_DB?: D1Database;
  /** Church search with FTS5. Separate so a heavy search can't block KV reads. */
  HMC_SEARCH_DB?: D1Database;
  /** Private bucket for KV values too large for a D1 row. */
  HMC_KV?: R2Bucket;
  /** Live visitor counts. */
  PRESENCE?: DurableObjectNamespace;
}

// og-image.tsx is Deno-only (esm.sh React + og_edge); Workers use workers-og.
setOgImageRenderer(generateOgImage);

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    // Bypasses the Hono app: this needs no store, and must keep working if the store is down.
    if (new URL(request.url).pathname === "/presence" && env.PRESENCE) {
      return handlePresence(request, env.PRESENCE);
    }

    setEnv((name) => {
      const v = env[name];
      return typeof v === "string" ? v : undefined;
    });
    setWaitUntil((p) => ctx.waitUntil(p));
    setR2Binding(env.HMC_DATA ?? null);
    setD1(env.HMC_DB ?? null);
    setSearchD1(env.HMC_SEARCH_DB ?? null);
    setKvBucket(env.HMC_KV ?? null);

    // Routes are mounted under /make-server-283d8046 (the Supabase function name);
    // accept bare paths too, so api.heresmychurch.com/churches/TX works.
    const url = new URL(request.url);
    if (url.pathname !== PREFIX && !url.pathname.startsWith(`${PREFIX}/`)) {
      url.pathname = PREFIX + (url.pathname === "/" ? "" : url.pathname);
    }

    return app.fetch(new Request(url.toString(), request), env, ctx);
  },
};

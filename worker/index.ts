/**
 * Cloudflare Worker for heresmychurch.com: serves the Vite build (dist/) as static
 * assets, plus the bits Netlify used to do at the edge:
 *   - www → apex and legacy /state/*, /country/* redirects
 *   - og-rewrite: per-page meta tags + crawlable HTML for social/search bots
 *   - geo-inject: visitor country / US state as <meta> tags for landing
 *
 * Hashed bundles (/assets/*) skip the Worker entirely (wrangler.jsonc run_worker_first).
 */
import { injectGeo, SUPPORTED_COUNTRIES } from "./geo-inject.ts";
import { rewriteForBots, type OgRewriteEnv } from "./og-rewrite.ts";

interface Env extends OgRewriteEnv {
  ASSETS: { fetch(request: Request): Promise<Response> };
}

const APEX_HOST = "heresmychurch.com";

/** Same paths netlify.toml routed to og-rewrite (legacy /state, /country redirect first). */
function isOgPath(path: string): boolean {
  if (path === "/world" || path === "/reports" || path === "/metro") return true;
  if (path.startsWith("/report/") || path.startsWith("/metro/")) return true;
  const m = path.match(/^\/([A-Z]{2})(\/|$)/);
  return !!m && SUPPORTED_COUNTRIES.has(m[1]);
}

/** Legacy map URLs → canonical /:CC/... (mirrors netlify.toml). */
function legacyRedirect(url: URL): string | null {
  const p = url.pathname;
  let m = p.match(/^\/state\/(.+)$/);
  if (m) return `/US/${m[1]}`;
  m = p.match(/^\/country\/([^/]+)\/?$/);
  if (m) return `/${m[1]}`;
  m = p.match(/^\/country\/([^/]+)\/(.+)$/);
  if (m) return `/${m[1]}/${m[2]}`;
  return null;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.hostname === `www.${APEX_HOST}`) {
      url.hostname = APEX_HOST;
      return Response.redirect(url.toString(), 301);
    }

    const legacy = legacyRedirect(url);
    if (legacy) {
      return Response.redirect(new URL(legacy + url.search, url).toString(), 301);
    }

    const next = async () => {
      const res = await env.ASSETS.fetch(request);
      // Asset handling adds trailing slashes with a 307 (/metro → /metro/); keep Netlify's permanent 301.
      if (res.status === 307) {
        const loc = res.headers.get("location");
        if (loc && new URL(loc, url).pathname === `${url.pathname}/`) {
          return new Response(null, { status: 301, headers: { location: loc } });
        }
      }
      return res;
    };
    const response = isOgPath(url.pathname) ? await rewriteForBots(request, next, env) : await next();

    const cf = (request as Request & { cf?: { country?: string; regionCode?: string } }).cf;
    return injectGeo(response, { country: cf?.country, subdivision: cf?.regionCode });
  },
};

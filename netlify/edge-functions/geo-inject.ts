/**
 * Netlify Edge Function wrapper — logic lives in worker/geo-inject.ts, shared
 * with the Cloudflare Worker. Delete with netlify.toml once Cloudflare serves the site.
 */
import type { Context } from "https://edge.netlify.com";
import { injectGeo } from "../../worker/geo-inject.ts";

export default async function handler(_request: Request, context: Context): Promise<Response> {
  return injectGeo(await context.next(), {
    country: context.geo?.country?.code,
    subdivision: context.geo?.subdivision?.code,
  });
}

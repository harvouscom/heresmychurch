/**
 * Netlify Edge Function wrapper — logic lives in worker/og-rewrite.ts, shared
 * with the Cloudflare Worker. Delete with netlify.toml once Cloudflare serves the site.
 */
import type { Context } from "https://edge.netlify.com";
import { rewriteForBots } from "../../worker/og-rewrite.ts";

export default function handler(request: Request, context: Context): Promise<Response> {
  return rewriteForBots(request, () => context.next(), {
    SUPABASE_FUNCTIONS_BASE_URL: Deno.env.get("SUPABASE_FUNCTIONS_BASE_URL"),
    SUPABASE_ANON_KEY: Deno.env.get("SUPABASE_ANON_KEY"),
  });
}

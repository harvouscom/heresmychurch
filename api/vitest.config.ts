import { defineConfig } from "vitest/config";

// Store tests run in Node against real local D1 and R2 through Miniflare (see test/harness.ts).
// Same specifier mapping as `alias` in wrangler.jsonc.
export default defineConfig({
  test: { include: ["api/test/**/*.test.ts"], testTimeout: 60_000, hookTimeout: 60_000 },
  resolve: {
    alias: {
      "npm:hono/cors": "hono/cors",
      "npm:hono": "hono",
      "jsr:@supabase/supabase-js@2.49.8": "@supabase/supabase-js",
      "npm:aws4fetch@1.0.20": "aws4fetch",
      "npm:d3-geo@3": "d3-geo",
      "npm:topojson-client@3": "topojson-client",
    },
  },
});

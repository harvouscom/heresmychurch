# API Improvements & Cloudflare Migration Notes

Notes compiled from discussion about making the Here's My Church API more usable for external consumers (including potential AI enrichment work) while preserving the existing contract used by the frontend and Harvous.

**Status**: Discussion notes only. No code changes applied yet. The public repo still reflects the Netlify + Supabase setup; a full Cloudflare migration was in progress separately.

## Current Architecture (as of Oct 2026)

- Single Hono app running as a Supabase Edge Function (`make-server-283d8046`).
- Church / state data stored in a KV table (`kv_store_283d8046`) and served from there.
- Public-ish read endpoints (authenticated with the Supabase anon key):
  - `/churches/states`
  - `/churches/:stateAbbrev`
  - `/churches/search`
  - plus suggestion, community, and moderator routes.
- Frontend (Vite + React) and Harvous already call these endpoints.
- Hosting: Netlify for the SPA + some edge functions; Supabase for the main API + Realtime.

## Recommended API Improvements (independent of host)

These are high-ROI changes that keep the existing API contract intact:

1. **Public documentation**
   - Simple README or OpenAPI description of the main read routes, response shapes, and auth (anon key).
   - Biggest enabler for external users.

2. **Cache headers**
   - Add `Cache-Control` (and ideally `ETag`) on church list and search responses. Data is relatively static.

3. **Rate limiting**
   - Especially important if the API is pointed at more external consumers. Upstash or Cloudflare-native options work well.

4. **Versioning**
   - Prefix routes with `/v1/` so the contract can evolve without breaking existing clients.

5. **Clearer separation of concerns**
   - Keep read endpoints open.
   - Keep writes / moderation behind stronger checks.
   - Optional later: simple API key for higher rate limits.

None of these require leaving Supabase immediately.

## Platform Considerations: Supabase Edge Functions vs Cloudflare vs Fly

| Option | Fit | Notes |
|--------|-----|-------|
| Stay on Supabase Edge Functions | Good for now | Simplest. Keeps writes, Realtime, and KV access together. Fine until volume or latency becomes an issue. Cold starts and regional placement are the main limitations. |
| Cloudflare Workers (or Cloudflare in front) | Strong fit | Near-zero cold starts, global edge, excellent free tier, built-in caching / rate limiting / KV. Ideal for a public read-heavy directory API. Data is already KV-style, so migrating the read path is realistic. |
| Fly.io | Overkill | Better for long-running processes. More ops overhead for a simple JSON API. |

### Practical path

- **Short term**: Document the existing API + add cache headers and basic rate limiting.
- **Medium term**: Put Cloudflare in front of the Supabase function, or move the read endpoints to Cloudflare Workers while keeping Supabase as the source of truth for writes and the KV store. Hybrid is low-risk.
- Finish or stabilize the Cloudflare migration first so improvements land on the long-term host.

## Constraints on Automated Changes

Any automated or external contributor cannot confidently push breaking-or-even-non-breaking API changes without:
- Local verification against the frontend and Harvous.
- CI or manual testing of the real data.
- Coordination with the in-progress Cloudflare migration (changes to the Supabase function alone risk being discarded).

Recommended approach: land documentation and non-breaking improvements (headers, rate limiting, `/v1/` aliases) on the target platform after the cutover plan is clear. Keep the old Supabase endpoints alive briefly as a compatibility layer if needed.

## Next Steps (suggested)

- [ ] Decide whether to finish the Cloudflare migration before touching the API surface.
- [ ] Add a short public API section to the main README or a dedicated `docs/API.md`.
- [ ] Implement cache headers and basic rate limiting on the read path.
- [ ] Optionally introduce `/v1/` route aliases.
- [ ] Document the exact base URL + auth pattern currently used by Harvous.

---

*Compiled 2026-10-14 from project discussion. Update or remove as the architecture evolves.*

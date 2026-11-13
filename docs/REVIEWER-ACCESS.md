# Reviewer sign-in (Cloudflare Access)

The review queue no longer needs a key in the URL. Reviewers sign in with Cloudflare Access, and maintenance scripts use a separate admin key.

## How it works

- Cloudflare Access protects `heresmychurch.com/review`, which also covers `/review/api/*`.
- Visiting `/review` signs you in, remembers reviewer mode for the browser tab, and opens the map, where the review queue appears. `/review/signout` turns reviewer mode off.
- The site Worker (`worker/review-proxy.ts`) forwards `/review/api/moderate/*` and `/review/api/audit/*` to the API. It sends only the `Cf-Access-Jwt-Assertion` header and the content type.
- The API (`reviewer-auth.ts`) checks that token every time:
  - the RS256 signature, against the team's keys;
  - the audience, issuer and expiry;
  - that the email or service token is on the allowlist.

  Anyone can send the header to `api.heresmychurch.com`, so it is never trusted without these checks.
- Maintenance routes (populate, search, admin, migrate, publish, operations) accept `x-admin-key: $ADMIN_KEY`. Signed-in reviewers can use them too. The scripts in `scripts/` send `ADMIN_KEY`, or `MODERATOR_KEY` until it is retired.

## One-time setup

1. In Zero Trust, go to **Access → Applications → Add → Self-hosted**, with domain `heresmychurch.com` and path `review`. Add a policy that allows your email, and note the application's **Audience (AUD) tag**.
2. Optional: create an Access **service token** for scripts that read the queue (such as `scripts/lookup-review-check.mjs`), and include it in the policy.
3. Set the API secrets:
   ```bash
   wrangler secret put ACCESS_TEAM_DOMAIN -c api/wrangler.jsonc   # e.g. yourteam.cloudflareaccess.com
   wrangler secret put ACCESS_AUD -c api/wrangler.jsonc
   wrangler secret put REVIEWER_EMAILS -c api/wrangler.jsonc      # comma-separated
   wrangler secret put REVIEWER_SERVICE_TOKENS -c api/wrangler.jsonc  # client ids, optional
   wrangler secret put ADMIN_KEY -c api/wrangler.jsonc
   ```
4. Add `ADMIN_KEY` to the GitHub repository secrets, which the publish-static workflow uses.

## Retiring the moderator key

Once `/review` sign-in works in production, run `wrangler secret put LEGACY_MODERATOR_KEY -c api/wrangler.jsonc` with the value `off`, then delete the `MODERATOR_KEY` secret from both the Worker and GitHub. From then on, `?key=` and `x-moderator-key` return 401.

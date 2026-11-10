# Church portal and data health

## Routes

- `/for-churches`: introduction, listing preview, inbox sign-in, explicit claim, and edit form.
- `/for-churches?church=ID&name=NAME`: request access from a listing. Name is presentation only; the server resolves the ID and recipient independently.
- `/for-churches#token=TOKEN`: private 24-hour editing grant. The token is removed from the address bar on initial load and held only in page memory. Reopen the inbox link to return after a refresh.
- `/data-health?region=TX`: public regional dashboard. Regions across supported countries are selectable. Search, missing details, open suggestion fields, duplicate candidates, and incremental rows are available.

The map listing includes “Manage this listing” and an inbox-based “Church claimed” badge. The summary panel links to Data health. Ownership and the existing completeness-based Verified label remain distinct.

## Inbox access and edits

`CHURCH_PORTAL_ENABLED=1`, the existing `CONFIRMATION_EMAIL` binding, and `EMAIL_FROM` enable sign-in delivery. The main API configuration enables the feature; environments without the switch stay disabled. `EMAIL_SITE_URL` selects the destination origin (default `https://heresmychurch.com`). `EMAIL_TEST_RECIPIENT` continues to restrict delivery when set. No additional provider, signing secret, or database migration is required beyond existing KV storage.

Requests send only to the church’s currently listed email, ignoring any visitor-provided address. Responses do not expose recipient addresses. A 15-minute per-listing cooldown and per-IP rate limits constrain requests. Missing inboxes and ownership disputes use existing moderated contact corrections; there is no self-asserted email ownership bypass.

Random access tokens are stored only as SHA-256 digests in private `church-login:` rows, expire after 24 hours, and can be invalidated by signing out. The Cloudflare minute schedule deletes expired grants. Changes to the listed contact invalidate existing grants and suppress an old claim badge. Claim records hold the inbox digest and claim time, never the access token. The badge proves listed-inbox access, not identity, doctrine, location, or continued accuracy.

Authenticated updates support service times, phone, email, and website. They use the existing suggestion validation, per-church limits, audit, and moderation pipeline. Claiming does not bypass review; replacing existing values stays held. Per-field results report partial failures explicitly. Other fields and correction types remain accessible through the map’s Suggest an edit flow.

## Data health methodology

Six equally weighted checks produce a rounded percentage: meaningful address, non-placeholder service times, HTTP(S) website, contact, photo URL, and a non-future confirmation within 180 days. This measures recorded completeness, not external fact checking. Photo URL checks recognize `photoUrl` or `photo`; the current contribution form has no photo upload flow, so records without one retain that gap. Dashboard counts use stored listing data and the existing review consensus rules. Open suggestions count fields, not individual votes. Private submissions, contact addresses, IPs, inbox hashes, and tokens are omitted.

Duplicate candidates share a normalized name and city within the region. This is a deliberately narrow heuristic for human review. It can include valid campuses and misses differently named duplicates; nothing is merged automatically. Regional rows include stable IDs for opening the map and suggesting corrections.

## Local preview and verification

Start the existing frontend and local API on ports 5173 and 8790. New portal screens default to the isolated local API during development; production uses `VITE_HMC_API_BASE_URL` or the existing API origin. `VITE_HMC_PORTAL_API_BASE_URL` overrides this independently. Set `EMAIL_SITE_URL=http://127.0.0.1:5173` for local sign-in emails. The local Cloudflare email binding simulates delivery; do not bind production storage for preview.

Apply existing migrations to the local HMC_DB before using the dashboard. The development banner identifies local sample data. During implementation, 100 public Texas listings were copied into the isolated local database for layout review, plus one explicitly fictional “Preview Community Church” for signed-in testing. They do not represent the entire region.

Verification:

```sh
npx vitest run --config api/vitest.config.ts api/test/church-portal.test.ts api/test/attendance-calibration.test.ts api/test/email-confirmation.test.ts
npx vite build
```

Before production rollout, deploy frontend and API together and rehearse delivery using a controlled listed inbox. Check claim, replacement review, invalidation after contact change, sign-out, and expired links. Deploy the frontend and API together through the guarded release scripts after merging the pull request.

## Private attendance calibration

Church-reported attendance is private. It never appears as a public reported count, badge, completeness input, or leaderboard. The portal deliberately avoids showing the model estimate before asking for a report, reducing anchoring. Staff may optionally share a range (or exact count), covering 4–13 recent typical weeks, together with whether it was counted or approximated and optional context. The count definition is worship attendance in person at this location, children included, each person once per week across services; exclude online views, other campuses, and holiday peaks.

Reports submitted through a current inbox grant are stored under `private-attendance-report:` with a 180-day expiry. No reporter email, inbox hash, or token enters the report. A separate private cooldown record limits reports to one per listed inbox per church per day. The existing API minute dispatcher removes expired reports and cooldown records.

`/data-health/attendance-review` is a separate maintainer screen. It passes the existing moderator key in a request header, keeps it in page memory, and clears it when review is closed. The protected GET `/moderate/attendance-reports` returns at most 100 pending reports, oldest first. POST `/moderate/attendance-reports/review` accepts `id`, `action` (`apply` or `dismiss`), `reason` (10–500 characters), and an integer `estimate` for an apply action. A reviewer must select the calibrated estimate within the reported range; no midpoint or automated adjustment is preselected. Reports are evidence requiring judgment, particularly for large discrepancies or approximated counts.

The current Cloudflare D1 database provides a per-church review lease, and stale-baseline checks prevent replacing an estimate that changed after a report arrived. The existing correction/audit/publication machinery publishes only the chosen calibrated estimate. Private ranges, context, and reviewer notes remain in the private report. Calibration preserves relocation warnings and existing `lastVerified` timestamps. The raw report is not a community suggestion, so it cannot be consensus-applied or exposed by public suggestion routes. Dismissal leaves the estimate untouched.

The current review queue shows the first 100 pending reports; refreshing after reviews advances through the backlog. This is a manual calibration workflow, not an automatic statistical retraining system. The general community attendance suggestion path remains as before; the privacy guarantee described here applies to the portal’s explicit “Share privately” action.

## Landing-page card and controls

The generic portal rotates through the same real-church sample and US/world alternation pattern as Lookup’s hero. The slimmed snapshot is in `src/app/data/portal-demo-churches.json`; source snapshot date: November 10, 2026. Each US state or international country is visited once per round. Hover, keyboard focus, an explicit pause control, a hidden tab, offscreen cards, and reduced-motion preferences stop automatic changes. The globe follows the selected church’s coordinates. A church-specific URL and authenticated session show only that church, including before sign-in. The new public listing preview endpoint returns no private attendance report or inbox data.

Both pages omit decorative eyebrow text. Selects use an inset custom chevron rather than the default platform arrow.

## Region-focused data health header

The data-health page uses its own contained globe in the header, centered on the selected region’s configured bounds, with state/country flags and a wrapping location label. It does not use the portal’s full-page globe backdrop. The globe remains pointed at the selected region; changing the region updates the title, flag, globe, and data together. Completeness now lives in a four-column statistics row (two columns on small screens), with methodology in an expandable note. The header and table switch to single-column/mobile rows at 600px; controls and long labels can shrink and wrap without extending the page horizontally.

The public church-facing route is `/for-churches`. Older `/church-portal` links redirect while preserving their query and private token fragment; the internal API prefix remains `church-portal`.

The public dashboard is labeled “Improve the map” at `/improve-the-map`. The summary dropdown carries the selected region into this destination; older `/data-health` links redirect with their query intact. The maintainer endpoint and internal API retain their existing names.

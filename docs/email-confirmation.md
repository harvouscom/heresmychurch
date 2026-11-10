# Church email confirmation

The map offers a one-time service-time notification, with visitor double opt-in, grouped church outreach, and separate timestamps for service-time and unchanged-location confirmation. Access to the listed church inbox is the source of confirmation; this is not an identity or doctrinal verification badge.

## Enable delivery

This implementation uses the Cloudflare API's existing minute schedule and private KV store. No database migration is required. It is disabled unless the native `CONFIRMATION_EMAIL` send binding and these three settings are present:

- `EMAIL_CONFIRMATION_ENABLED=1`
- `EMAIL_FROM=updates@mail.heresmychurch.com` (verified Cloudflare sending domain)
- `EMAIL_TOKEN_SECRET` (secret; use at least 32 random bytes)

Optional `EMAIL_SITE_URL` defaults to `https://heresmychurch.com`. Use the staging site's origin and a test recipient church contact for rehearsal. Rotate the signing secret to invalidate all outstanding links. The domain `mail.heresmychurch.com` is onboarded in Cloudflare Email Sending. Keep the switch off until delivery has been tested. Optional `EMAIL_TEST_RECIPIENT` restricts both requests and delivery to a single test address. Deploy the frontend and API together. The Supabase entry point shares the routes but does not run this dispatcher: this feature targets the default Cloudflare API.

Provider contract: https://developers.cloudflare.com/email-service/api/send-emails/workers-api/ . Sending uses the native Workers binding with text bodies and separate recipients; no external provider API key is needed. The API worker restricts the binding to the configured sender. No live email is sent by the automated test suite.

## Behavior

- The listing card requests an email address. An initial email asks the visitor to explicitly confirm; simply opening a link cannot opt in or mutate a listing.
- A confirmed visitor queues outreach to the church's current listed email, never an address supplied in the visitor request. No contact means the visitor remains waiting for up to 14 days.
- Outreach is grouped by church into 30-day calendar buckets. Repeated requests share the review link for that bucket. A church can permanently stop outreach with the stop link. Bucket boundaries may put two requests less than 30 days apart.
- Staff can publish normalized service times through a scoped link. Address corrections use the existing moderated suggestion queue. Service-time confirmation preserves any relocation warning. Church confirmation never approves closures or other unrelated fields.
- An unchanged location can be confirmed separately. A changed location is not marked confirmed by the service-time submission; it remains under the existing moderation process.
- Confirmation records store the exact service-time and location values. Public status suppresses confirmation when the current listing differs. Proof contains no email address or access token.
- Visitors receive one email after a subsequent matching service-time confirmation. Requests can be cancelled using the original confirmation link. Visitor addresses are deleted after delivery, cancellation, or expiry; unconfirmed requests expire after 48 hours, confirmed requests after 14 days, staff review links after 30 days. Expired rows are removed on dispatch.
- Delivery is attempted by the minute schedule with a 25-message budget per invocation. Failures remain queued for retry, under a D1 dispatch lease that prevents overlapping scheduled invocations. Private tokens live in URL fragments and POST bodies rather than query strings. Don't add body logging to these endpoints.

## Verification

`npx vitest run --config api/vitest.config.ts api/test/email-confirmation.test.ts`

`npx vite build`

Before enabling production, rehearse with a test church and controlled inboxes: request → confirm → review → publish → notification, correction review, cancellation, and church opt-out. Delivery failures do not indicate that a church is closed.

## Initial limits

The private KV dispatcher scans active requests; move to a paginated dedicated queue if volume grows. Rate limiting uses the existing per-IP KV limiter. Provider bounce/complaint webhooks, periodic check-ins, dashboards, and post-visit emails are not part of this release. Provider delivery logs have their own retention rules. D1 leases prevent ordinary overlapping dispatches. A crash after Cloudflare accepts a message but before its sent flag is saved can cause a duplicate on retry; this is not an exactly-once queue.

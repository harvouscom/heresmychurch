# Cloudflare AI evidence checks

Reviewers can request an evidence check on pending phone and service-time proposals. The API uses a Workers AI binding with `@cf/meta/llama-3.1-8b-instruct` and JSON mode. The feature is enabled only when `AI_REVIEW_ENABLED=1` and the binding is present.

The first version reads the established listing website's homepage only. It accepts HTTPS on the standard port, checks public DNS addresses, limits redirects to the same hostname, limits response size and extracted text, strips script/style content, and uses fetch timeouts. Unreadable sites, cross-domain redirects, or facts absent from the homepage need manual review. No search-engine results or proposed replacement website are used as evidence.

The model receives untrusted page text and proposed values, with no mutation tools. Supported/contradicted results require an exact quote that exists in the fetched page; otherwise the result is downgraded to insufficient evidence. A matching quote is not proof of semantic accuracy, currency, or the correct campus: a human must still check those. Results never publish, approve, reject, or change a church record.

Checks are moderator-authenticated, restricted to a current pending proposal, and cached for 24 hours per church identity, website, field, and proposed value. Limits reuse the existing best-effort KV counters: 10 fresh checks per moderator per hour and 100 across the site per day. Concurrent requests can exceed these counters; these are usage controls, not a hard billing cap. Configure account-level Cloudflare usage alerts separately if desired.

The review panel shows the verdict, exact source quote, source URL, and check time. Missing configuration or provider failures leave the normal approve/reject workflow available. No model-generated confidence percentage is presented as verification.

Next expansion: safely fetch relevant contact/visit pages, save reviewer outcomes for an accuracy sample, and measure supported/contradicted/insufficient rates before considering any automatic decisions. Name, address, website, and lifecycle decisions remain moderated.

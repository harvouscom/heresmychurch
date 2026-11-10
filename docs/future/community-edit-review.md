# Community edit review

Implemented locally (not deployed):

- Existing input validation still runs first. An ordinary field that is null, undefined, whitespace-only, or an empty array can publish from one submission.
- Replacing any populated ordinary field is held for moderator review. Conflicting previous proposals also cause a hold, including when the stored field is blank.
- Name, address, website, listing lifecycle reports, and campus links always require review. Lookup email and pastor names remain held even when blank.
- Held votes are excluded from public consensus, overlays, and automatic application. They appear in the existing moderator queue, pending banners, and partner status. Approval and rejection use the existing audited moderation actions.
- Accepted votes are kept separate from held proposals from the same actor, preventing an attempted replacement from changing the accepted consensus value.
- Per-church limit: 20 valid submissions per hour across contributors, in addition to existing contributor limits. This reuses the existing KV read/write limiter and is best-effort under concurrent requests, not an atomic abuse ceiling.

Formatting-only edits conservatively require review when replacing existing data. This stage does not add AI evidence extraction, Turnstile, contributor reputation, automatic verification of sensitive changes, or new rollback UI. Existing audit history remains available.

Before adding AI: fetch only safely validated official sources, retain evidence URL/quote/time, validate model output, treat fetched content as untrusted, and hold uncertain results. AI should assist evidence review rather than directly authorize changes.

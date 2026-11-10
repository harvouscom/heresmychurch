# Future: Church claim portal and data quality dashboard

Originally captured as future ideas. The initial implementation uses `/for-churches` and `/data-health`; see [implementation and operating notes](../church-portal-and-data-health.md). See the operating notes for deployment and controlled-inbox delivery rehearsal.

## Church claim & keep-accurate portal

A lightweight authenticated flow (or magic link) where a pastor or staff member can claim their listing, update service times and contact info, and get a “verified” badge.

This is one of the highest-ROI things for data quality on a crowdsourced map. It also creates a natural reason for churches to care about their HMC presence.

Before implementation, align badge naming with the existing [claimable listings strategy](./claimable-listings-and-traction.md): distinguish church ownership (“Claimed” or “Updated by the church”) from the map’s existing completeness-based “Verified” label.

## Data completeness & quality dashboard

A semi-public or partner-facing view that shows:

- Completeness score per church or region: service times, website, photo, recent confirmation, etc.
- Open suggestions and pending reviews.
- Duplicate candidates.

Useful for the maintainer and for motivated partners or regional volunteers. This could also become a public “data health” page that encourages contributions.

## Related planning

- [Claimable listings, traction, and the paid API](./claimable-listings-and-traction.md)
- [Faster church data review](./faster-church-data-review.md)
- [Community edit review](./community-edit-review.md)

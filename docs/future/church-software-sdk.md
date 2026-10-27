# Public API & SDK for Church Software

**Status:** Proposal (future / hackathon candidate)  
**Related:** [public-api.md](./public-api.md) (Harvous-first partner API), [ARCHITECTURE.md](../ARCHITECTURE.md)

## Problem

Most church-related software (ChMS tools, church websites, event platforms, small-group apps, campus apps, etc.) already asks users to enter their church name. They then force manual entry of the same details over and over: service times, ministries, address, language, denomination, website, and more.

This creates two problems:
1. **Friction** for end users and for the software builders.
2. **Fragmented, inconsistent data** across the ecosystem. Here's My Church (HMC) already maintains a large crowd-sourced directory, but other apps don't easily benefit from it or contribute back to it.

## Solution

A clean public API + lightweight SDK (and optional widgets) that lets any church software:

1. **Look up** a church by name (with optional location) and get ranked matches.
2. **Autofill** structured fields (service times, ministries, address, languages, denomination, website, size estimate, etc.).
3. **Contribute** corrections or missing data back to HMC as suggestions (human-reviewed, same pipeline as the site).

AI improves the experience by powering better fuzzy matching and ranking (relevance + data completeness/freshness) so the right church surfaces quickly and incomplete listings rank lower.

This is an extension of the existing internal API (`https://api.heresmychurch.com`) and the partner surface described in [public-api.md](./public-api.md). The new work focuses on making the capability easy for *any* church software to adopt, not just Harvous.

## Core capabilities

### 1. Church lookup / search
- Typeahead-friendly search by name.
- Optional location bias (city, state/region, lat/lng, or "near me").
- AI-enhanced ranking: fuzzy matching, relevance scoring, and boost for listings with complete/fresh data (service times present, website present, recent community activity, verified flags).
- Returns lean structured results suitable for display and selection.

### 2. Structured details for autofill
Once a church is selected, return the fields other software commonly needs:

- Name, address, city, region, country, lat/lng
- Service times
- Ministries
- Languages
- Denomination
- Website, phone, email (when available)
- Size / attendance estimate
- Pastor name (when available)
- HMC id + shortId (stable references)
- Completeness / freshness signals

Consumers treat optional fields as nullable and handle missing data gracefully.

### 3. Contribution / update path (data integrity)
- Suggest a field correction or addition (reuses the existing suggestion pipeline).
- Confirm that current data is still accurate (bumps freshness).
- Optional: detect differences between what the consuming app has stored and what HMC currently has, then surface a "suggest update" prompt.
- All writes remain human-reviewed on the HMC side (sensitive fields require moderation; non-sensitive can auto-apply after consensus, same as the site).

### 4. Widgets / embeddable components (optional but high-leverage)
- "Select your church" typeahead component.
- Compact church card.
- Nearby / filtered discovery widget.
- Drop-in for church websites or other software via script tag, React component, or web component.

## SDK surface (illustrative)

```ts
// Lookup
const results = await hmc.search({
  q: "Grace Community",
  near: "Des Moines, IA",   // or lat/lng, or region
  limit: 10
});

// Details for autofill
const church = await hmc.getById(results[0].id);
// church.serviceTimes, church.ministries, church.address, etc.

// Contribute
await hmc.suggest(church.id, { field: "serviceTimes", value: "Sun 9am, 11am" });
await hmc.confirm(church.id); // "still correct"
```

A small React (or framework-agnostic) component can wrap the search + select flow so integrating apps don't have to build the UI themselves.

## Why this matters

- **For other church software:** Instant, accurate church details without maintaining their own directory. Faster onboarding for users.
- **For HMC data integrity:** More eyes and more contributions from the places where people already enter church information. The shared directory improves over time.
- **For discovery:** Better data makes the map and any future discovery features more useful for everyone.
- **Responsible AI:** AI only assists matching and ranking on existing community-maintained data. It does not invent church facts. Users confirm selections and any contributions. Humans stay in the loop for review.

## Hackathon angle (AI for Church)

This is a strong candidate for the AI for Church Hackathon (Outreach or Operations track):

- Clear ministry impact: reduces friction and improves shared church data across tools.
- AI is central but responsible (matching/ranking + optional difference detection).
- Practical proof-of-concept: public (or partner) API surface + SDK method + one reference integration (mock church-app settings screen that does typeahead → autofill → suggest update).
- Extension of existing HMC work; new pieces (SDK, widgets, ranking improvements, reference demo) are built inside the window.
- Easy to demo in a 5-minute video (see demo ideas below).

## Showing it off (demo ideas)

1. **Reference church-app settings screen**  
   Mock profile/settings page with a "What's your church?" typeahead. Type a partial name → AI-ranked results → select → fields autofill. Then show a "Suggest update" action.

2. **Before / after**  
   Manual form vs. HMC-powered autofill.

3. **Multi-context**  
   Same component in a church website form, a small-group app, and a ChMS-style profile.

4. **Data-integrity moment**  
   Spot an outdated field, suggest a correction, and note that it goes into the existing HMC review pipeline.

5. **SDK snippet**  
   Brief shot of the simple client call so other builders see how easy adoption is.

## Relationship to existing work

- Builds on the internal Hono/Cloudflare API and the partner `/v1` surface in [public-api.md](./public-api.md).
- Reuses the suggestion, confirm, and review pipelines already in production.
- Can start as an expanded partner surface or a lightly authenticated public surface with rate limits.
- Widgets and a polished SDK are the new high-leverage pieces for broader adoption.

## Open questions / next steps

- Authentication model for broader public use (API keys, rate limits, optional paid tier later).
- Exact field set returned by default vs. on-demand.
- Ranking signals to expose (or keep internal).
- Widget packaging (npm package, script embed, iframe).
- Reference implementation location (separate small repo, or demo page in this repo).
- How aggressively to surface "suggest update" prompts without annoying users.

## References

- [public-api.md](./public-api.md) — current partner API design
- [ARCHITECTURE.md](../ARCHITECTURE.md) — overall system
- [DATA-FLOW.md](../DATA-FLOW.md) — how church data moves today

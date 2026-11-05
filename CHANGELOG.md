# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

<!-- Add new changes here as you work. Move to a version section when releasing. -->

### Changed

- **Lookup can suggest church names** — they wait for a moderator, like name suggestions from the site.

### Added

- **Worldwide totals in the welcome modal** — the modal now shows the same church and country totals on every route, with a row of country flags, instead of numbers for the current view.
- **Prep for moving off Supabase** — empty D1 databases and private R2 buckets with a staging copy, a guard that refuses API deploys from a stale checkout, and cron workflows that call the API directly. Production still reads and writes Supabase.
- **Internal routes for Lookup** — moderated region export plus suggestion and confirm routes for the new Lookup autofill API, behind `LOOKUP_INTERNAL_KEY`. Moderators see which tool sent a suggestion.
- **`POST /churches/populate-fill/:state`** — moderator-only. Fills blank phone, postcode, website, address and city from a staged OSM walk, without adding or removing churches. Previews unless `?apply=true`.

### Fixed

- **Unreviewed edits no longer show publicly** — name, website, address, report and campus-link suggestions now stay off the map and public data files until a moderator approves them.
- **Corrections no longer lose to older values** — on a tied vote the newest value now wins, and `applied` is only true when the stored value matches what was sent.

## [2.0.0] - 2026-07-27

### Changed

- **Live visitor counts run on Cloudflare** — "people with you now" uses a Durable Object over WebSockets instead of Supabase Realtime, which also drops supabase-js from the browser bundle.
- **Worldwide coverage** — Here's My Church is no longer U.S.-only. Browse Christian churches by country and region on a world map, with international search, add-church, seasonal reports, and product copy updated for global scope.

## [1.171.0] - 2026-04-01

### Changed

- Bump version to **1.171.0** (171 commits since inception).

## [1.110.0] - 2026-03-14

### Added

- **Changelog and versioning** — This release adds `CHANGELOG.md` and proper semantic versioning. Version **1.110.0** reflects **110 commits** since inception; the minor number tracks commit count. Future releases can bump the minor (e.g. 1.111.0) or use patch (1.110.1) as you prefer.

## [1.2.0] - 2026-03-14

Summarizes post-launch work since moving from Figma Make to Netlify.

### Added

- Review/moderation flow: pending suggestions, approvals/rejections, in-review state in UI
- Twitter automation: scheduled posts, weekend fun facts and church spotlights, national milestone tweets
- Church reactions and announcements; announcements pill and presence-based notifications
- Search: scoring and ranking, priority states, main-campus search, state filtering in map view
- Community stats (nation-wide and state-specific), verification modal with impact metrics
- Geocoding and address validation in Add Church and Suggest Edit forms
- Active users / presence by state; state tooltip with viewer counts
- Fathom analytics; SEO and social meta tags
- shortId for churches and shortId-based URLs; `formatFullAddress` and improved address display
- Blocked-denominations handling and cleanup script; pastor role (later simplified)
- Service times with timezone by state; recent changes and confirmation in ChurchDetailPanel
- Learning React guide and docs for new contributors

### Changed

- License from MIT to **CC BY-NC 4.0** (Attribution-NonCommercial)
- Moderation terminology to “review” across UI and API
- Zoom limits and dot sizing for mobile; touch handling (hover off on touch devices)
- Regrid integration removed (trial limits); attendance from OSM geometry and heuristics only
- Loaders and close buttons unified (e.g. ThreeDotLoader, CloseButton)
- Text styling (e.g. `text-pretty`, `line-clamp`) and layout tweaks across panels

### Fixed

- State filtering (e.g. DC excluded from active user counts); batch processing for review stats
- Cache overwrites wiping user-submitted fields; shortId preservation on population
- Mobile navigation and tap/select behavior; scroll-to-top on church change in detail panel

## [1.0.0] - 2026-03-09 (Figma Make → Netlify)

### Added

- First production release: interactive map of Christian churches in the U.S.
- Browse by state, search, filter by denomination/size/language
- Church details (address, website, service times, pastor, ministries)
- Crowd-sourced add church and suggest edits
- Bilingual detection and basic attendance estimates
- Deployed at [heresmychurch.com](https://heresmychurch.com) (Netlify)

---

When cutting a new release:

1. Move items from `[Unreleased]` into a new `## [X.Y.Z] - YYYY-MM-DD` section.
2. Bump `version` in `package.json` (and `package-lock.json`) to `X.Y.Z`.
3. Commit with a message like: `chore: release vX.Y.Z`

[Unreleased]: https://github.com/harvouscom/heresmychurch/compare/v2.0.0...HEAD
[2.0.0]: https://github.com/harvouscom/heresmychurch/compare/v1.171.0...v2.0.0
[1.171.0]: https://github.com/harvouscom/heresmychurch/compare/v1.110.0...v1.171.0
[1.110.0]: https://github.com/harvouscom/heresmychurch/compare/v1.2.0...v1.110.0
[1.2.0]: https://github.com/harvouscom/heresmychurch/compare/v1.0.0...v1.2.0
[1.0.0]: https://github.com/harvouscom/heresmychurch/releases/tag/v1.0.0

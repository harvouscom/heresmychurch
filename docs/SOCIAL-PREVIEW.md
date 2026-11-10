# Main social preview

The default Open Graph and Twitter card is `public/og-image.png` (1200 × 630), inspired by the About panel: existing brand icon, Google Sans Flex, deep purple globe, deterministic dots, count pills, and the same country flag artwork used in Lookup. `public/og-image.svg` is an outlined vector export, so rendering does not depend on fonts on the viewer’s device.

Regenerate with `pnpm run generate:og`. The generator makes no network requests and uses the existing workers-og dependencies (Satori and Resvg) plus the repository’s static fonts. No image-generation service or new runtime dependency is required.

Counts come from `scripts/assets/social-preview-data.json`. The initial snapshot is the user-supplied November 10, 2026 About-panel reference: 655,437 churches and 19 countries. These are snapshot figures, not live counters. Update the counts/date and regenerate when refreshing the social card. The flag row displays ten countries plus the remaining count; artwork is bundled in `scripts/assets/social-flags.json`.

Both the static HTML and the site Worker’s default crawler image reference the refreshed image with `?v=20261110-about` to distinguish it from the old US-only card. Church- and region-specific generated cards retain their existing endpoint and templates. A source change alone does not update production; use the normal reviewed release process.

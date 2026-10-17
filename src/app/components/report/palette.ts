/**
 * Report chart colours. Hex values (not CSS variables) because d3 scales interpolate
 * between them. The brand values match the --hmc-* tokens in src/styles/theme.css and
 * the map ramp in ../map-constants.ts — keep them in sync.
 */
export const BRAND = {
  strong: "#4C1D95",   // --hmc-brand-strong
  brand: "#6B21A8",    // --hmc-brand
  violet: "#7C3AED",
  violetSoft: "#8B5CF6",
  soft: "#A855F7",     // --hmc-brand-soft
  softer: "#C084FC",
  purple600: "#9333EA",
  pink: "#EC4899",
  wash: "#F3E8FF",
} as const;

/** Neutral fill for regions with no data, and the ring track in the TOC. */
export const NEUTRAL = {
  noData: "#E7E5E0",
  track: "#D6D3D1",
} as const;

/** Light → dark ramp for choropleth maps. */
export const CHOROPLETH_RANGE: [string, string] = [BRAND.wash, BRAND.strong];

/** Hovered region outline on report maps. */
export const HOVER_STROKE = BRAND.violet;

/** Categorical palette for denomination shares: purples first, then indigos. */
export const DENOMINATION_COLORS = [
  "#4C1D95", "#6B21A8", "#7C3AED", "#8B5CF6", "#A855F7",
  "#C084FC", "#D8B4FE", "#E9D5FF", "#F3E8FF", "#FAF5FF",
  "#EDE9FE", "#DDD6FE", "#C4B5FD", "#A78BFA", "#818CF8",
  "#6366F1", "#4F46E5", "#4338CA", "#3730A3", "#312E81",
  "#1E1B4B", "#7E22CE",
] as const;

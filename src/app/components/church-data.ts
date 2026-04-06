// Types and constants for church map

import { STATE_NAMES } from "./map-constants";

export interface Church {
  id: string;
  /** 8-digit id for URLs; unique per state */
  shortId?: string;
  name: string;
  city: string;
  state: string;
  lat: number;
  lng: number;
  attendance: number;
  denomination: string;
  address?: string;
  website?: string;
  // Extended fields (community-contributed or enriched)
  serviceTimes?: string;       // e.g. "Sunday 9am, 11am; Wednesday 7pm"
  languages?: string[];        // e.g. ["English", "Spanish"]
  ministries?: string[];       // e.g. ["Youth", "Music", "Outreach"]
  pastorName?: string;
  phone?: string;
  email?: string;
  /** When set, this church is a campus; value is the main church's id (e.g. "TX-12345"). */
  homeCampusId?: string;
  /** Resolved by API when homeCampusId points to another state: main campus summary for display/link. */
  homeCampus?: HomeCampusSummary;
  bilingualProbability?: number; // 0-1, estimated or user-confirmed
  lastVerified?: number; // timestamp of last correction or confirmation
  /** Building square footage from OSM polygon geometry; used as primary attendance estimate when available. */
  buildingSqft?: number;
}

/** Minimal church info for cross-state main campus link (from API). */
export interface HomeCampusSummary {
  id: string;
  name: string;
  state: string;
  shortId: string;
}

export interface StateInfo {
  abbrev: string;
  name: string;
  lat: number;
  lng: number;
  churchCount: number;
  isPopulated: boolean;
}

// ── Completeness tiers (tier 1 = critical for "needs review") ──

/** Tier 1: address, serviceTimes, denomination. "Needs review" when 2+ are missing. */
const TIER1_DENOM_EMPTY_VALUES = ["", "Unknown", "Other"];

function isDenominationMissing(denomination: string | undefined): boolean {
  return !denomination || TIER1_DENOM_EMPTY_VALUES.includes(denomination.trim());
}

/** Placeholder service-time values that don't count as "has service times". */
const TIER1_SERVICE_TIMES_EMPTY_VALUES = [
  "",
  "unknown",
  "other",
  "see website",
  "tbd",
  "n/a",
  "na",
  "pending",
  "to be determined",
];

function isServiceTimesMissing(value: string | undefined): boolean {
  if (!value) return true;
  const normalized = value.trim().toLowerCase();
  return TIER1_SERVICE_TIMES_EMPTY_VALUES.includes(normalized);
}

/** True if address is a real street-style address, not empty or only locality. */
function isAddressMeaningful(
  address: string | undefined,
  city: string,
  state: string
): boolean {
  if (!address || !address.trim()) return false;
  const a = address.trim();
  if (a.length < 5) return false;
  const cityNorm = (city || "").trim().toLowerCase();
  const stateNorm = (state || "").trim().toLowerCase();
  const aNorm = a.toLowerCase();
  if (cityNorm && aNorm === cityNorm) return false;
  const cityState = [cityNorm, stateNorm].filter(Boolean).join(", ");
  if (cityState && aNorm === cityState) return false;
  return true;
}

/**
 * Returns a fallback location string when a church has no complete address/city,
 * e.g. "Somewhere in Polk County, Iowa" when `countyName` is resolved from coordinates.
 * Without a county name, uses the state only: "Somewhere in Iowa".
 * Returns null if city is present (caller should use city as fallback) or state is unknown.
 */
export function getFallbackLocation(
  church: {
    lat: number;
    lng: number;
    state: string;
    city?: string;
  },
  countyName?: string | null
): string | null {
  if (church.city?.trim()) return null;
  const stateAbbrev = (church.state || "").trim().toUpperCase().slice(0, 2);
  if (!stateAbbrev) return null;
  const stateName = STATE_NAMES[stateAbbrev] || stateAbbrev;
  const cn = (countyName ?? "").trim();
  if (cn) {
    const countyPart = /\bcounty\b/i.test(cn) ? cn : `${cn} County`;
    return `Somewhere in ${countyPart}, ${stateName}`;
  }
  return `Somewhere in ${stateName}`;
}

const SOMEWHERE_IN_PREFIX = /^Somewhere in /i;

/**
 * Compact location string for external search (e.g. Google) when pairing with church name.
 * Prefers city + state abbrev; if no city, uses a meaningful street address + state when present;
 * otherwise {@link getFallbackLocation} without the "Somewhere in " prefix (county + state or state only).
 */
export function getLocationContextForWebSearch(
  church: {
    lat: number;
    lng: number;
    state: string;
    city?: string;
    address?: string;
  },
  countyName?: string | null
): string {
  const city = (church.city || "").trim();
  const stateAbbrev = (church.state || "").trim().toUpperCase().slice(0, 2);
  if (city) {
    return stateAbbrev ? `${city} ${stateAbbrev}` : city;
  }
  if (isAddressMeaningful(church.address, city, church.state)) {
    const a = (church.address || "").trim();
    return stateAbbrev ? `${a} ${stateAbbrev}` : a;
  }
  const fallback = getFallbackLocation(church, countyName);
  if (fallback) {
    return fallback.replace(SOMEWHERE_IN_PREFIX, "").trim();
  }
  return stateAbbrev;
}

/**
 * Format address for list/search display. When both address and city exist, returns "address, city";
 * otherwise returns address, city, or "".
 */
export function formatAddressWithCity(address?: string | null, city?: string | null): string {
  const a = (address || "").trim();
  const c = (city || "").trim();
  if (a && c) return `${a}, ${c}`;
  if (a) return a;
  if (c) return c;
  return "";
}

export interface Tier1Completeness {
  missingAddress: boolean;
  missingServiceTimes: boolean;
  missingDenomination: boolean;
  missingCount: number;
  needsReview: boolean;
}

/**
 * Returns tier-1 completeness for a church. "Needs review" when 2+ of
 * address, service times, denomination are missing (denom treated as missing if Unknown/Other).
 */
export function getTier1Completeness(church: Church): Tier1Completeness {
  const missingAddress = !isAddressMeaningful(church.address, church.city, church.state);
  const missingServiceTimes = isServiceTimesMissing(church.serviceTimes);
  const missingDenomination = isDenominationMissing(church.denomination);
  const missingCount = [missingAddress, missingServiceTimes, missingDenomination].filter(Boolean).length;
  return {
    missingAddress,
    missingServiceTimes,
    missingDenomination,
    missingCount,
    needsReview: missingCount >= 2,
  };
}

/** True if church should appear in "need review" list (missing 2+ of address, service times, denomination). */
export function churchNeedsReview(church: Church): boolean {
  return getTier1Completeness(church).needsReview;
}

export type SizeCategory =
  | "< 50"
  | "50–250"
  | "250–500"
  | "500–1,000"
  | "1,000–5,000"
  | "5,000+";

export const sizeCategories: {
  label: SizeCategory;
  min: number;
  max: number;
  radius: number;
  color: string;
}[] = [
  { label: "< 50", min: 0, max: 49, radius: 2.5, color: "#E8D5F5" },
  { label: "50–250", min: 50, max: 250, radius: 4, color: "#C9A0DC" },
  { label: "250–500", min: 251, max: 500, radius: 6, color: "#A855F7" },
  { label: "500–1,000", min: 501, max: 1000, radius: 8, color: "#8B2FC9" },
  { label: "1,000–5,000", min: 1001, max: 5000, radius: 11, color: "#6B21A8" },
  { label: "5,000+", min: 5001, max: Infinity, radius: 15, color: "#4C1D95" },
];

export function getSizeCategory(attendance: number) {
  return (
    sizeCategories.find((c) => attendance >= c.min && attendance <= c.max) ||
    sizeCategories[0]
  );
}

// Major denomination groups for filtering (order matters: first match wins)
export const DENOMINATION_GROUPS: { label: string; matches: string[] }[] = [
  { label: "Catholic", matches: ["Catholic"] },
  { label: "Baptist", matches: ["Baptist"] },
  { label: "Methodist", matches: ["Methodist", "Wesleyan"] },
  { label: "Lutheran", matches: ["Lutheran"] },
  { label: "Presbyterian", matches: ["Presbyterian"] },
  { label: "Episcopal", matches: ["Episcopal", "Anglican"] },
  // Pentecostal before "Church of God" so "Church of God in Christ" maps here
  { label: "Pentecostal", matches: ["Pentecostal", "Foursquare", "Full Gospel", "Apostolic", "Church of God in Christ", "COGIC"] },
  { label: "Assemblies of God", matches: ["Assemblies of God", "Assembly of God"] },
  { label: "Church of Christ", matches: ["Church of Christ"] },
  { label: "Church of God", matches: ["Church of God"] },
  { label: "Orthodox", matches: ["Orthodox", "Coptic", "Antiochian"] },
  { label: "Seventh-day Adventist", matches: ["Seventh-day Adventist"] },
  { label: "Evangelical", matches: ["Evangelical", "Alliance", "Moravian", "Evangelical Free", "EFCA", "Free Church"] },
  { label: "Nazarene", matches: ["Nazarene"] },
  { label: "Congregational", matches: ["Congregational"] },
  { label: "Disciples of Christ", matches: ["Disciples of Christ"] },
  { label: "Mennonite", matches: ["Mennonite", "Brethren", "Hutterite"] },
  { label: "Amish", matches: ["Amish"] },
  { label: "Reformed", matches: ["Reformed"] },
  { label: "Quaker", matches: ["Quaker", "Friends"] },
  { label: "Covenant", matches: ["Covenant"] },
  { label: "Salvation Army", matches: ["Salvation Army"] },
  { label: "Non-denominational", matches: ["Non-denominational", "Nondenominational", "Non denominational", "Calvary Chapel", "Vineyard", "Bible Church", "Bible Fellowship", "Community Church", "Independent"] },
  { label: "Unspecified", matches: ["Other", "Unknown"] }, // catch-all
];

export function getDenominationGroup(denomination: string): string {
  for (const group of DENOMINATION_GROUPS) {
    if (group.matches.some((m) => denomination.includes(m))) {
      return group.label;
    }
  }
  return "Unspecified";
}

// ── Bilingual probability estimation ──
// Heuristic estimation until community-confirmed via languages field

// State-level Hispanic population share (approx % from Census 2020)
const STATE_HISPANIC_SHARE: Record<string, number> = {
  NM: 0.48, TX: 0.40, CA: 0.39, AZ: 0.31, NV: 0.29, FL: 0.27, CO: 0.22,
  NJ: 0.21, NY: 0.19, IL: 0.18, CT: 0.17, RI: 0.16, UT: 0.15, OR: 0.14,
  WA: 0.13, KS: 0.13, NE: 0.12, MA: 0.12, ID: 0.13, GA: 0.10, NC: 0.10,
  MD: 0.11, VA: 0.10, OK: 0.12, IN: 0.08, WI: 0.07, MN: 0.06, PA: 0.08,
  IA: 0.06, SC: 0.06, AR: 0.08, TN: 0.06, HI: 0.11, AK: 0.07, DE: 0.10,
};

// Name patterns that strongly indicate non-English services
const BILINGUAL_NAME_PATTERNS = [
  // Spanish
  { pattern: /\biglesia\b/i, lang: "Spanish", weight: 0.95 },
  { pattern: /\bcristiana?\b/i, lang: "Spanish", weight: 0.7 },
  { pattern: /\bhispana?\b/i, lang: "Spanish", weight: 0.95 },
  { pattern: /\blatino?a?\b/i, lang: "Spanish", weight: 0.9 },
  { pattern: /\bcomunidad\b/i, lang: "Spanish", weight: 0.85 },
  { pattern: /\bdios\b/i, lang: "Spanish", weight: 0.8 },
  { pattern: /\bespíritu|espiritu\b/i, lang: "Spanish", weight: 0.85 },
  { pattern: /\bcapilla\b/i, lang: "Spanish", weight: 0.9 },
  // Portuguese
  { pattern: /\bigreja\b/i, lang: "Portuguese", weight: 0.95 },
  { pattern: /\bbrasileir[oa]\b/i, lang: "Portuguese", weight: 0.95 },
  // Korean
  { pattern: /한인|한국|교회/i, lang: "Korean", weight: 0.95 },
  { pattern: /\bkorean\b/i, lang: "Korean", weight: 0.9 },
  // Chinese
  { pattern: /中[华文国]|華人|教會/i, lang: "Chinese", weight: 0.95 },
  { pattern: /\bchinese\b/i, lang: "Chinese", weight: 0.9 },
  // Vietnamese
  { pattern: /\bvietnamese\b/i, lang: "Vietnamese", weight: 0.9 },
  { pattern: /việt|giáo\s*xứ/i, lang: "Vietnamese", weight: 0.95 },
  // Other
  { pattern: /\bhaitian\b/i, lang: "Haitian Creole", weight: 0.9 },
  { pattern: /\bethiopian|eritrean\b/i, lang: "Amharic", weight: 0.85 },
  { pattern: /\bfilipino|tagalog\b/i, lang: "Tagalog", weight: 0.9 },
  { pattern: /\barabic?\b/i, lang: "Arabic", weight: 0.85 },
  { pattern: /\bbilingual\b/i, lang: "Bilingual", weight: 0.95 },
  { pattern: /\bmulticultural|multi-ethnic\b/i, lang: "Multilingual", weight: 0.7 },
];

export function estimateBilingualProbability(church: Church): { probability: number; detectedLanguage?: string; confirmed: boolean } {
  // If languages field is set by community, use it as confirmed
  if (church.languages && church.languages.length > 0) {
    return {
      probability: church.languages.length >= 2 ? 1.0 : 0.05,
      detectedLanguage: church.languages.length >= 2 ? church.languages.find(l => l !== "English") || church.languages[0] : undefined,
      confirmed: true,
    };
  }

  // If bilingualProbability is already set (e.g. from community correction), use it
  if (church.bilingualProbability !== undefined && church.bilingualProbability !== null) {
    return { probability: church.bilingualProbability, confirmed: true };
  }

  let maxProb = 0;
  let detectedLang: string | undefined;

  // Check name patterns
  for (const { pattern, lang, weight } of BILINGUAL_NAME_PATTERNS) {
    if (pattern.test(church.name)) {
      if (weight > maxProb) {
        maxProb = weight;
        detectedLang = lang;
      }
    }
  }

  if (maxProb > 0) {
    return { probability: maxProb, detectedLanguage: detectedLang, confirmed: false };
  }

  // State + denomination heuristic
  const hispanicShare = STATE_HISPANIC_SHARE[church.state] || 0.05;

  // Catholic churches in high-Hispanic states have higher bilingual probability
  if (church.denomination === "Catholic") {
    const prob = Math.min(hispanicShare * 1.2, 0.6); // Cap at 60%
    if (prob > 0.1) {
      return { probability: prob, detectedLanguage: "Spanish", confirmed: false };
    }
  }

  // Pentecostal/AG in high-Hispanic states
  if ((church.denomination === "Pentecostal" || church.denomination === "Assemblies of God") && hispanicShare > 0.15) {
    return { probability: hispanicShare * 0.8, detectedLanguage: "Spanish", confirmed: false };
  }

  // Very low base probability for any church in a diverse state
  if (hispanicShare > 0.2) {
    return { probability: hispanicShare * 0.15, confirmed: false };
  }

  return { probability: 0, confirmed: false };
}

// Common language options for form UI
export const COMMON_LANGUAGES = [
  "English", "Spanish", "Korean", "Chinese (Mandarin)", "Chinese (Cantonese)",
  "Portuguese", "Vietnamese", "Tagalog", "French", "Haitian Creole",
  "Arabic", "Amharic", "Swahili", "Russian", "Hindi", "Japanese",
  "American Sign Language (ASL)", "Other",
];

// ── Seasonal Report types ──

export interface SeasonalReportBigPicture {
  totalChurches: number;
  statesPopulated: number;
  totalAttendanceEstimate: number;
  /** U.S. Census population in states where we have at least one church */
  populationRepresented?: number;
  /** Same as populationRepresented / 1e6, one decimal (e.g. 331.4) */
  populationRepresentedMillions?: number;
  /** Only for seasonal (non-launch) reports */
  churchGrowth?: number;
  statesAddedThisSeason?: string[];
}

/** Community-driven corrections and improvements (transparency) */
export interface SeasonalReportCommunity {
  totalCorrections: number;
  churchesImproved: number;
  /** Community corrections per 1,000 mapped churches */
  correctionsPerThousandChurches: number;
}

export interface SeasonalReportDataQuality {
  pctNeedsReview: number;
  totalNeedsReview: number;
  missingByField: { field: string; count: number; pct: number }[];
  /** Per-state data quality */
  stateBreakdown: { abbrev: string; name: string; total: number; needsReview: number; pct: number }[];
  /** Per-county (state-scoped reports) */
  countyBreakdown?: { fips: string; name: string; total: number; needsReview: number; pct: number }[];
  /** % of churches with a website field that looks usable */
  pctWithWebsite?: number;
  pctWithPhone?: number;
  /** Website or phone present */
  pctWithContactPath?: number;
  /** % with non-placeholder service times */
  pctWithServiceTimes?: number;
  campusCount?: number;
  campusPct?: number;
  pctWithMinistries?: number;
  topMinistries?: { name: string; count: number; pct: number }[];
  /** lastVerified within last 90 / 365 days */
  pctVerifiedLast90Days?: number;
  pctVerifiedLast365Days?: number;
  /** OSM building footprint available */
  pctWithBuildingFootprint?: number;
  /** Estimated attendance among churches with attendance &gt; 0 */
  attendanceMedian?: number;
  attendanceP25?: number;
  attendanceP75?: number;
}

export interface SeasonalReportGeoDensity {
  national: { peoplePer: number; churchesPer10k: number };
  mostChurched: { abbrev: string; name: string; churchesPer10k: number; peoplePer: number }[];
  leastChurched: { abbrev: string; name: string; churchesPer10k: number; peoplePer: number }[];
  stateMetrics: Record<string, { churches: number; population: number; churchesPer10k: number; peoplePer: number }>;
  /** Counties in this state only (state-scoped reports) */
  countyMetrics?: Record<string, { churches: number; population: number; churchesPer10k: number; peoplePer: number }>;
}

export interface SeasonalReportDenominations {
  national: { name: string; count: number; pct: number }[];
  /** Largest denomination group in each state (grouped buckets) */
  dominantByState: Record<string, { denomination: string; count: number; pct: number }>;
  /** Per-state breakdown for report table (grouped buckets), excluding Unspecified */
  byStateBreakdown?: Record<
    string,
    {
      top: { denomination: string; count: number; pct: number }[];
      least: { denomination: string; count: number; pct: number } | null;
    }
  >;
  /** County FIPS → dominant group (state-scoped reports) */
  dominantByCounty?: Record<string, { denomination: string; count: number; pct: number }>;
  byCountyBreakdown?: Record<
    string,
    {
      top: { denomination: string; count: number; pct: number }[];
      least: { denomination: string; count: number; pct: number } | null;
    }
  >;
  regionalPatterns: { denomination: string; strongStates: string[]; nationalPct: number; regionalPct: number }[];
}

export interface SeasonalReportDiversity {
  bilingualChurches: number;
  bilingualPct: number;
  languageDistribution: { language: string; count: number }[];
  topBilingualStates: { abbrev: string; name: string; pct: number; count: number }[];
  /** Counties in this state (state-scoped reports) */
  topBilingualCounties?: { abbrev: string; name: string; pct: number; count: number }[];
}

export interface SeasonalReportSpotlight {
  name: string;
  state: string;
  city: string;
  attendance: number;
  denomination: string;
  /** Set on newly generated reports — enables “View on map” links */
  id?: string;
  shortId?: string;
}

export interface SeasonalReportStateRanking {
  abbrev: string;
  name: string;
  churchCount: number;
  churchesPer10k: number;
  pctComplete: number;
  corrections: number;
}

/** State-scoped report: this state vs others using HMC meta stateCounts + Census pop */
export interface SeasonalReportStatePeerComparison {
  churchCount: number;
  rankByChurchCount: number | null;
  statesRankedByCount: number;
  churchesPer10k: number;
  rankByDensity: number | null;
  statesRankedByDensity: number;
  medianChurchCount: number;
  medianChurchesPer10k: number;
  totalUsMappedChurches: number;
  pctOfUsMappedChurches: number;
  leaderCount: { abbrev: string; name: string; count: number };
  leaderDensity: { abbrev: string; name: string; churchesPer10k: number };
  peersMoreChurches: { abbrev: string; name: string; count: number }[];
  peersFewerChurches: { abbrev: string; name: string; count: number }[];
  peersHigherDensity: { abbrev: string; name: string; churchesPer10k: number }[];
  peersLowerDensity: { abbrev: string; name: string; churchesPer10k: number }[];
}

/** Deltas compared to the previous report (only present on non-launch reports) */
export interface SeasonalReportChanges {
  churchesAdded: number;
  churchesRemoved: number;
  netChurchChange: number;
  statesAdded: string[];
  dataQualityDelta: number; // positive = improvement (fewer needing review)
  newLanguages: string[];
  correctionsThisSeason: number;
  /** When both reports have `community`, diff of `churchesImproved` (listings updated via community) */
  churchesImprovedDelta?: number;
  /** Top states by net church-count growth vs previous report */
  fastestGrowingStates?: { abbrev: string; name: string; churchCount: number; delta: number; pctChange: number }[];
  /** Denominations with the largest share gains/losses (percentage points) */
  denominationShifts?: {
    gainers: { name: string; currentPct: number; previousPct: number; shareDelta: number }[];
    losers: { name: string; currentPct: number; previousPct: number; shareDelta: number }[];
  };
  /** States with the largest drop in "needs review" share (percentage points) */
  dataQualityMovers?: { abbrev: string; name: string; currentPct: number; improvement: number }[];
  /** Per-section noteworthy shifts */
  highlights: string[];
}

export interface SeasonalReportSummary {
  slug: string;
  title: string;
  season: "launch" | "spring" | "summer" | "fall" | "winter";
  year: number;
  generatedAt: string;
  totalChurches: number;
}

export interface SeasonalReport {
  slug: string;
  scope?: "national" | "state";
  stateAbbrev?: string;
  stateName?: string;
  title: string;
  subtitle: string;
  season: "launch" | "spring" | "summer" | "fall" | "winter";
  year: number;
  generatedAt: string;
  previousSlug?: string;
  changes?: SeasonalReportChanges;
  bigPicture: SeasonalReportBigPicture;
  /** Community corrections — omitted in older cached payloads */
  community?: SeasonalReportCommunity;
  dataQuality: SeasonalReportDataQuality;
  geoDensity: SeasonalReportGeoDensity;
  denominations: SeasonalReportDenominations;
  diversity: SeasonalReportDiversity;
  spotlights: {
    largest: SeasonalReportSpotlight[];
    smallest: SeasonalReportSpotlight[];
  };
  stateRankings: SeasonalReportStateRanking[];
  /** County rankings (state-scoped reports; `abbrev` is 5-digit FIPS) */
  countyRankings?: SeasonalReportStateRanking[];
  /** How this state compares to others on HMC (state-scoped reports) */
  statePeerComparison?: SeasonalReportStatePeerComparison;
}

// Common ministry categories for form UI
export const COMMON_MINISTRIES = [
  "Youth", "Children's", "College", "Young Adults", "Women's", "Men's",
  "Worship / Music", "Small Groups", "Outreach / Missions",
  "Food Pantry", "Recovery / Support Groups", "Senior Adults",
  "Marriage & Family", "Counseling", "Prayer", "Discipleship",
  "Sports", "Media / Production", "Hospitality",
  "Deaf / ASL", "Special Needs", "Prison",
];
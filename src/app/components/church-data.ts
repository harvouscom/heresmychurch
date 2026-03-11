// Types and constants for church map

import { STATE_BOUNDS, STATE_NAMES } from "./map-constants";

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
  /** Building square footage (parcel data); used to improve attendance estimate when available. */
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

/** Diagonal (degrees) below which we skip quadrant and show only state name. */
const QUADRANT_MIN_DIAGONAL = 2;

/** Fraction of half-diagonal from state center; points within this are labeled "Central". */
const CENTRAL_RADIUS_FRACTION = 0.2;

function getQuadrantLabel(
  lat: number,
  lng: number,
  bounds: [number, number, number, number]
): string {
  const [south, west, north, east] = bounds;
  const midLat = (south + north) / 2;
  const midLng = (west + east) / 2;
  const ns = lat >= midLat ? "N" : "S";
  const ew = lng >= midLng ? "E" : "W";
  return `${ns}${ew}`;
}

/** True if (lat, lng) is within the "central" zone of the state (near geographic center). */
function isInCentralZone(
  lat: number,
  lng: number,
  bounds: [number, number, number, number],
  diagonal: number
): boolean {
  const [south, west, north, east] = bounds;
  const midLat = (south + north) / 2;
  const midLng = (west + east) / 2;
  const halfDiagonal = diagonal / 2;
  const radius = halfDiagonal * CENTRAL_RADIUS_FRACTION;
  const dist = Math.sqrt((lat - midLat) ** 2 + (lng - midLng) ** 2);
  return dist <= radius;
}

/**
 * Returns a fallback location string when a church has no complete address/city,
 * e.g. "Somewhere in Central Iowa" or "Somewhere in NW Iowa". Use when address and city are both missing or not meaningful.
 * Returns null if city is present (caller should use city as fallback) or state is unknown.
 */
export function getFallbackLocation(church: {
  lat: number;
  lng: number;
  state: string;
  city?: string;
}): string | null {
  if (church.city?.trim()) return null;
  const stateAbbrev = (church.state || "").trim().toUpperCase().slice(0, 2);
  if (!stateAbbrev) return null;
  const bounds = STATE_BOUNDS[stateAbbrev];
  const stateName = STATE_NAMES[stateAbbrev] || stateAbbrev;
  if (!bounds) return `Somewhere in ${stateName}`;
  const [south, west, north, east] = bounds;
  const latSpan = north - south;
  const lngSpan = east - west;
  const diagonal = Math.sqrt(latSpan * latSpan + lngSpan * lngSpan);
  if (diagonal < QUADRANT_MIN_DIAGONAL) return `Somewhere in ${stateName}`;
  if (isInCentralZone(church.lat, church.lng, bounds, diagonal)) {
    return `Somewhere in Central ${stateName}`;
  }
  const quadrant = getQuadrantLabel(church.lat, church.lng, bounds);
  return `Somewhere in ${quadrant} ${stateName}`;
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

// Common ministry categories for form UI
export const COMMON_MINISTRIES = [
  "Youth", "Children's", "Young Adults", "Women's", "Men's",
  "Worship / Music", "Small Groups", "Outreach / Missions",
  "Food Pantry", "Recovery / Support Groups", "Senior Adults",
  "Marriage & Family", "Counseling", "Prayer", "Discipleship",
  "Sports", "Media / Production", "Hospitality",
];
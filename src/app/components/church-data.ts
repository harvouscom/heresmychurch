// Types and constants for church map

export interface Church {
  id: string;
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
  bilingualProbability?: number; // 0-1, estimated or user-confirmed
}

export interface StateInfo {
  abbrev: string;
  name: string;
  lat: number;
  lng: number;
  churchCount: number;
  isPopulated: boolean;
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

// Major denomination groups for filtering
export const DENOMINATION_GROUPS: { label: string; matches: string[] }[] = [
  { label: "Catholic", matches: ["Catholic"] },
  { label: "Baptist", matches: ["Baptist"] },
  { label: "Methodist", matches: ["Methodist", "Wesleyan"] },
  { label: "Lutheran", matches: ["Lutheran"] },
  { label: "Presbyterian", matches: ["Presbyterian"] },
  { label: "Episcopal", matches: ["Episcopal", "Anglican"] },
  { label: "Pentecostal", matches: ["Pentecostal", "Foursquare"] },
  { label: "Assemblies of God", matches: ["Assemblies of God"] },
  { label: "Latter-day Saints", matches: ["Latter-day Saints"] },
  { label: "Church of Christ", matches: ["Church of Christ"] },
  { label: "Church of God", matches: ["Church of God"] },
  { label: "Orthodox", matches: ["Orthodox", "Coptic", "Antiochian"] },
  { label: "Seventh-day Adventist", matches: ["Seventh-day Adventist"] },
  { label: "Jehovah's Witnesses", matches: ["Jehovah"] },
  { label: "Evangelical", matches: ["Evangelical", "Alliance", "Moravian"] },
  { label: "Nazarene", matches: ["Nazarene"] },
  { label: "Congregational", matches: ["Congregational"] },
  { label: "Disciples of Christ", matches: ["Disciples of Christ"] },
  { label: "Mennonite", matches: ["Mennonite", "Brethren", "Hutterite"] },
  { label: "Amish", matches: ["Amish"] },
  { label: "Reformed", matches: ["Reformed"] },
  { label: "Quaker", matches: ["Quaker", "Friends"] },
  { label: "Covenant", matches: ["Covenant"] },
  { label: "Unitarian", matches: ["Unitarian", "Universalist"] },
  { label: "Salvation Army", matches: ["Salvation Army"] },
  { label: "Christian Science", matches: ["Christian Science", "Scientist"] },
  { label: "Non-denominational", matches: ["Non-denominational", "Nondenominational", "Non denominational"] },
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
// Country registry — the foundation for worldwide support.
//
// Every hardcoded US assumption becomes a lookup keyed by ISO 3166-1 alpha-2.
// Adding a country = add a CountryConfig entry + a region-boundary source.

import {
  STATE_BOUNDS,
  STATE_NAMES,
  GEO_URL,
  COUNTIES_GEO_URL,
  STATE_COUNT_TIERS,
} from "../components/map-constants";
import { GENERATED_REGIONS } from "./regions-generated";

/** An admin subdivision within a country (US state, CA province, etc.). */
export interface RegionConfig {
  /** ISO 3166-2 (or documented deviation) code, e.g. "US-CA", "CA-ON". */
  code: string;
  /** Abbreviation used in KV keys and URLs, e.g. "CA", "ON". */
  abbrev: string;
  /** Display name, e.g. "California", "Ontario". */
  name: string;
  /** Approximate bounding box [south, west, north, east]. */
  bounds: [number, number, number, number];
}

/** How churches in a country are attendance-estimated. */
export type AttendanceModel = "arda" | "sqft-only";

/** Choropleth tier for region/country church counts. */
export interface CountTier {
  label: string;
  min: number;
  max: number;
  color: string;
}

/** A supported country and everything the app needs to be country-agnostic. */
export interface CountryConfig {
  code: string;
  /** ISO 3166-1 numeric string as used by world-atlas, e.g. "840". */
  isoNumeric: string;
  name: string;
  units: "mi" | "km";
  defaultLocale: string;
  geocodeCountryCode: string;
  placesRegionCode: string;
  osmReligionFilter: string;
  regionSourceUrl: string;
  admin2SourceUrl?: string;
  hasAdmin2: boolean;
  populationSource: "census-2023" | null;
  attendanceModel: AttendanceModel;
  regions: Record<string, RegionConfig>;
  /** Singular/plural noun for admin-1 areas ("state" / "states"). */
  regionNoun: { one: string; many: string };
  /** Optional noun for admin-2 ("county" / "counties"). */
  admin2Noun?: { one: string; many: string };
  /** Choropleth tiers calibrated to this country's scale. */
  countTiers: CountTier[];
  /** Legend heading, e.g. "Churches per State". */
  legendHeading: string;
  /** Boundary attribution for the data footer. */
  boundaryAttribution: string;
  /** Whether bilingual probability estimates exist for this country. */
  hasBilingualModel: boolean;
}

/** world-atlas countries-110m TopoJSON (ISO numeric ids). */
export const WORLD_GEO_URL =
  "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json";

/** World choropleth tiers (explored countries by total church count). */
export const WORLD_COUNT_TIERS: CountTier[] = [
  { label: "Coming soon", min: 0, max: 0, color: "#E8D5F5" },
  { label: "< 1,000", min: 1, max: 999, color: "#C9A0DC" },
  { label: "1,000–10,000", min: 1000, max: 9999, color: "#9B59C4" },
  { label: "10,000–50,000", min: 10000, max: 49999, color: "#6B21A8" },
  { label: "50,000+", min: 50000, max: Infinity, color: "#4C1D95" },
];

/** Canada-scale tiers — US STATE_COUNT_TIERS would collapse every province into "< 500". */
const CA_COUNT_TIERS: CountTier[] = [
  { label: "Not yet explored", min: 0, max: 0, color: "#E8D5F5" },
  { label: "< 200", min: 1, max: 199, color: "#C9A0DC" },
  { label: "200–500", min: 200, max: 499, color: "#B07CD0" },
  { label: "500–1,500", min: 500, max: 1499, color: "#9B59C4" },
  { label: "1,500–3,000", min: 1500, max: 2999, color: "#8338B8" },
  { label: "3,000–6,000", min: 3000, max: 5999, color: "#6B21A8" },
  { label: "6,000+", min: 6000, max: Infinity, color: "#4C1D95" },
];

export function getTierForCount(tiers: CountTier[], count: number): CountTier {
  if (count <= 0) return tiers[0];
  return tiers.find((t) => count >= t.min && count <= t.max) || tiers[tiers.length - 1];
}

// ── United States ────────────────────────────────────────────────────────────

const US_REGIONS: Record<string, RegionConfig> = Object.fromEntries(
  Object.entries(STATE_BOUNDS).map(([abbrev, bounds]) => [
    abbrev,
    {
      code: `US-${abbrev}`,
      abbrev,
      name: STATE_NAMES[abbrev] ?? abbrev,
      bounds,
    } satisfies RegionConfig,
  ]),
);

const US: CountryConfig = {
  code: "US",
  isoNumeric: "840",
  name: "United States",
  units: "mi",
  defaultLocale: "en-US",
  geocodeCountryCode: "us",
  placesRegionCode: "US",
  osmReligionFilter: "christian",
  regionSourceUrl: GEO_URL,
  admin2SourceUrl: COUNTIES_GEO_URL,
  hasAdmin2: true,
  populationSource: "census-2023",
  attendanceModel: "arda",
  regions: US_REGIONS,
  regionNoun: { one: "state", many: "states" },
  admin2Noun: { one: "county", many: "counties" },
  countTiers: STATE_COUNT_TIERS,
  legendHeading: "Churches per State",
  boundaryAttribution: "Boundaries: U.S. Census TIGER via us-atlas",
  hasBilingualModel: true,
};

// ── Canada ───────────────────────────────────────────────────────────────────

const CA: CountryConfig = {
  code: "CA",
  isoNumeric: "124",
  name: "Canada",
  units: "km",
  defaultLocale: "en-CA",
  geocodeCountryCode: "ca",
  placesRegionCode: "CA",
  osmReligionFilter: "christian",
  regionSourceUrl: "/regions-ca.geojson",
  admin2SourceUrl: "/admin2-ca.geojson",
  hasAdmin2: true,
  populationSource: null,
  attendanceModel: "sqft-only",
  regions: GENERATED_REGIONS.CA,
  regionNoun: { one: "province", many: "provinces and territories" },
  admin2Noun: { one: "census division", many: "census divisions" },
  countTiers: CA_COUNT_TIERS,
  legendHeading: "Churches per Province",
  boundaryAttribution: "Boundaries: Natural Earth admin-1; census divisions: Statistics Canada 2021",
  hasBilingualModel: false,
};

/** UK/IE denser than Canada provinces but far below Texas. */
const EU_COUNT_TIERS: CountTier[] = [
  { label: "Not yet explored", min: 0, max: 0, color: "#E8D5F5" },
  { label: "< 500", min: 1, max: 499, color: "#C9A0DC" },
  { label: "500–1,500", min: 500, max: 1499, color: "#B07CD0" },
  { label: "1,500–4,000", min: 1500, max: 3999, color: "#9B59C4" },
  { label: "4,000–8,000", min: 4000, max: 7999, color: "#8338B8" },
  { label: "8,000+", min: 8000, max: Infinity, color: "#6B21A8" },
];

const GB: CountryConfig = {
  code: "GB",
  isoNumeric: "826",
  name: "United Kingdom",
  units: "km",
  defaultLocale: "en-GB",
  geocodeCountryCode: "gb",
  placesRegionCode: "GB",
  osmReligionFilter: "christian",
  regionSourceUrl: "/regions-gb.geojson",
  hasAdmin2: false,
  populationSource: null,
  attendanceModel: "sqft-only",
  regions: GENERATED_REGIONS.GB,
  regionNoun: { one: "region", many: "regions" },
  countTiers: EU_COUNT_TIERS,
  legendHeading: "Churches per Region",
  boundaryAttribution: "Boundaries: Natural Earth admin-1 (ITL1)",
  hasBilingualModel: false,
};

const IE: CountryConfig = {
  code: "IE",
  isoNumeric: "372",
  name: "Ireland",
  units: "km",
  defaultLocale: "en-IE",
  geocodeCountryCode: "ie",
  placesRegionCode: "IE",
  osmReligionFilter: "christian",
  regionSourceUrl: "/regions-ie.geojson",
  hasAdmin2: false,
  populationSource: null,
  attendanceModel: "sqft-only",
  regions: GENERATED_REGIONS.IE,
  regionNoun: { one: "county", many: "counties" },
  countTiers: EU_COUNT_TIERS,
  legendHeading: "Churches per County",
  boundaryAttribution: "Boundaries: Natural Earth admin-1",
  hasBilingualModel: false,
};

/** Admin-1 Europe template (GB/IE depth — no admin-2, sqft attendance). */
function euCountry(
  code: string,
  isoNumeric: string,
  name: string,
  locale: string,
  regionNoun: { one: string; many: string },
  legendHeading: string,
): CountryConfig {
  const cc = code.toUpperCase();
  return {
    code: cc,
    isoNumeric,
    name,
    units: "km",
    defaultLocale: locale,
    geocodeCountryCode: cc.toLowerCase(),
    placesRegionCode: cc,
    osmReligionFilter: "christian",
    regionSourceUrl: `/regions-${cc.toLowerCase()}.geojson`,
    hasAdmin2: false,
    populationSource: null,
    attendanceModel: "sqft-only",
    regions: GENERATED_REGIONS[cc] ?? {},
    regionNoun,
    countTiers: EU_COUNT_TIERS,
    legendHeading,
    boundaryAttribution: "Boundaries: Natural Earth admin-1",
    hasBilingualModel: false,
  };
}

const FR = euCountry("FR", "250", "France", "fr-FR", { one: "department", many: "departments" }, "Churches per Department");
const DE = euCountry("DE", "276", "Germany", "de-DE", { one: "state", many: "states" }, "Churches per State");
const NL = euCountry("NL", "528", "Netherlands", "nl-NL", { one: "province", many: "provinces" }, "Churches per Province");
const BE = euCountry("BE", "056", "Belgium", "nl-BE", { one: "province", many: "provinces" }, "Churches per Province");
const ES = euCountry("ES", "724", "Spain", "es-ES", { one: "province", many: "provinces" }, "Churches per Province");
const IT = euCountry("IT", "380", "Italy", "it-IT", { one: "province", many: "provinces" }, "Churches per Province");
const PT = euCountry("PT", "620", "Portugal", "pt-PT", { one: "district", many: "districts" }, "Churches per District");
const AT = euCountry("AT", "040", "Austria", "de-AT", { one: "state", many: "states" }, "Churches per State");
const CH = euCountry("CH", "756", "Switzerland", "de-CH", { one: "canton", many: "cantons" }, "Churches per Canton");
const SE = euCountry("SE", "752", "Sweden", "sv-SE", { one: "county", many: "counties" }, "Churches per County");
const NO = euCountry("NO", "578", "Norway", "nb-NO", { one: "county", many: "counties" }, "Churches per County");
const DK = euCountry("DK", "208", "Denmark", "da-DK", { one: "region", many: "regions" }, "Churches per Region");
const FI = euCountry("FI", "246", "Finland", "fi-FI", { one: "region", many: "regions" }, "Churches per Region");
const PL = euCountry("PL", "616", "Poland", "pl-PL", { one: "voivodeship", many: "voivodeships" }, "Churches per Voivodeship");
const AU: CountryConfig = {
  ...euCountry("AU", "036", "Australia", "en-AU", { one: "state", many: "states" }, "Churches per State"),
  hasAdmin2: true,
  admin2SourceUrl: "/admin2-au.geojson",
  admin2Noun: { one: "local government area", many: "local government areas" },
  boundaryAttribution:
    "Boundaries: Natural Earth admin-1; local government areas: ABS ASGS 2021",
};

// ── Registry ─────────────────────────────────────────────────────────────────

export const COUNTRIES: Record<string, CountryConfig> = {
  US,
  CA,
  GB,
  IE,
  FR,
  DE,
  NL,
  BE,
  ES,
  IT,
  PT,
  AT,
  CH,
  SE,
  NO,
  DK,
  FI,
  PL,
  AU,
};

export const DEFAULT_COUNTRY_CODE = "US";

export const SUPPORTED_COUNTRY_CODES = Object.keys(COUNTRIES);

/**
 * UN member states — denominator for world coverage copy
 * (“N of 193 countries”), not `SUPPORTED_COUNTRY_CODES.length`.
 */
export const UN_MEMBER_COUNTRIES = 193;

export function getCountry(code: string | undefined): CountryConfig | undefined {
  if (!code) return undefined;
  return COUNTRIES[code.toUpperCase()];
}

export function isSupportedCountry(code: string | undefined): boolean {
  return getCountry(code) !== undefined;
}

export function getRegion(
  countryCode: string | undefined,
  regionAbbrev: string | undefined,
): RegionConfig | undefined {
  if (!regionAbbrev) return undefined;
  return getCountry(countryCode)?.regions[regionAbbrev.toUpperCase()];
}

/**
 * Resolve a region abbrev to its country + region config.
 * US state codes win over colliding foreign abbrevs (same rule as server `regionCountry`).
 */
export function resolveRegionByAbbrev(
  regionAbbrev: string | undefined,
): { country: CountryConfig; region: RegionConfig } | undefined {
  const k = (regionAbbrev || "").trim().toUpperCase();
  if (!k) return undefined;
  const usRegion = US.regions[k];
  if (usRegion) return { country: US, region: usRegion };
  for (const country of Object.values(COUNTRIES)) {
    if (country.code === "US") continue;
    const region = country.regions[k];
    if (region) return { country, region };
  }
  return undefined;
}

/** Look up a supported country by world-atlas ISO numeric id. */
export function getCountryByNumeric(isoNumeric: string | number): CountryConfig | undefined {
  const id = String(isoNumeric).padStart(3, "0");
  return Object.values(COUNTRIES).find((c) => c.isoNumeric.padStart(3, "0") === id);
}

export function regionNoun(cc: string, n: number): string {
  const cfg = getCountry(cc);
  if (!cfg) return n === 1 ? "region" : "regions";
  return n === 1 ? cfg.regionNoun.one : cfg.regionNoun.many;
}

// Country registry — the foundation for worldwide support.
//
// Today the app is US-only, with that assumption hardcoded across the map
// projection, KV storage keys, church IDs, routing, ingestion, and SEO (see
// the plan in docs/future/mapbox-migration.md "Future countries"). This module
// is the single place that describes each supported country and its admin
// subdivisions ("regions"), so those hardcoded US tables become one lookup
// keyed by ISO 3166-1 alpha-2 country code.
//
// The US entry is composed from the existing constants in map-constants.ts so
// there is exactly one source of truth (no duplicated state tables to drift).
// Adding a country later = add a CountryConfig entry + a region-boundary source;
// no new plumbing.

import {
  STATE_BOUNDS,
  STATE_NAMES,
  GEO_URL,
  COUNTIES_GEO_URL,
} from "../components/map-constants";

/** An admin subdivision within a country (US state, CA province, etc.). */
export interface RegionConfig {
  /** ISO 3166-2 subdivision code, e.g. "US-CA", "CA-ON". Globally unique. */
  code: string;
  /** Subdivision abbreviation used in KV keys and URLs, e.g. "CA", "ON". */
  abbrev: string;
  /** Display name, e.g. "California", "Ontario". */
  name: string;
  /** Approximate bounding box [south, west, north, east]. */
  bounds: [number, number, number, number];
}

/** How churches in a country are attendance-estimated. */
export type AttendanceModel = "arda" | "sqft-only";

/** A supported country and everything the app needs to be country-agnostic. */
export interface CountryConfig {
  /** ISO 3166-1 alpha-2 country code, e.g. "US", "CA". */
  code: string;
  /** Display name, e.g. "United States". */
  name: string;
  /** Distance units for this country's UI. */
  units: "mi" | "km";
  /** BCP-47 default locale, e.g. "en-US". */
  defaultLocale: string;
  /** Nominatim `countrycodes` filter for geocoding, e.g. "us". */
  geocodeCountryCode: string;
  /** Google Places `regionCode`, e.g. "US". */
  placesRegionCode: string;
  /** OSM `religion` tag filter for Overpass, e.g. "christian". */
  osmReligionFilter: string;
  /** Admin-1 (region) boundary TopoJSON/GeoJSON source URL. */
  regionSourceUrl: string;
  /** Admin-2 (e.g. US counties) boundary source URL, when the country has one. */
  admin2SourceUrl?: string;
  /** Whether this country exposes an admin-2 layer (counties). US only, for now. */
  hasAdmin2: boolean;
  /**
   * Per-capita / attendance-scaling population source. `null` means no
   * population data (skip per-capita choropleth and state-population scaling).
   */
  populationSource: "census-2023" | null;
  /** Attendance estimation model; non-US countries fall back to "sqft-only". */
  attendanceModel: AttendanceModel;
  /** Admin subdivisions, keyed by `abbrev` (the value used in KV keys / URLs). */
  regions: Record<string, RegionConfig>;
}

// ── United States (composed from existing map-constants tables) ──────────────

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
};

// ── Registry ─────────────────────────────────────────────────────────────────

/** All supported countries, keyed by ISO 3166-1 alpha-2 code. */
export const COUNTRIES: Record<string, CountryConfig> = {
  US,
};

/** The country used when none is specified (preserves today's US-only behavior). */
export const DEFAULT_COUNTRY_CODE = "US";

/** ISO alpha-2 codes of all supported countries. */
export const SUPPORTED_COUNTRY_CODES = Object.keys(COUNTRIES);

/** Look up a country config by (case-insensitive) ISO alpha-2 code. */
export function getCountry(code: string | undefined): CountryConfig | undefined {
  if (!code) return undefined;
  return COUNTRIES[code.toUpperCase()];
}

/** Whether a country code is supported. */
export function isSupportedCountry(code: string | undefined): boolean {
  return getCountry(code) !== undefined;
}

/**
 * Look up a region within a country by its abbreviation (the value used in
 * KV keys and URLs). Returns undefined if the country or region is unknown.
 */
export function getRegion(
  countryCode: string | undefined,
  regionAbbrev: string | undefined,
): RegionConfig | undefined {
  if (!regionAbbrev) return undefined;
  return getCountry(countryCode)?.regions[regionAbbrev.toUpperCase()];
}

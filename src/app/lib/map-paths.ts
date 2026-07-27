/**
 * Canonical map URL helpers.
 *
 * Hierarchy: /world → /:CC → /:CC/:region → /:CC/:region/:shortId
 * (e.g. /US, /US/TX, /CA/PE). Legacy /state/* and /country/* redirect here.
 * Admin-2 (US county / CA census division / AU LGA): /:CC/:region/county/:id
 */

import { getCountry } from "../config/countries";

export function countryPath(countryCode: string): string {
  return `/${countryCode.toUpperCase()}`;
}

export function regionPath(countryCode: string, regionAbbrev: string): string {
  return `/${countryCode.toUpperCase()}/${regionAbbrev.toUpperCase()}`;
}

export function churchMapPath(
  countryCode: string,
  regionAbbrev: string,
  shortId: string,
): string {
  return `/${countryCode.toUpperCase()}/${regionAbbrev.toUpperCase()}/${shortId}`;
}

export function countyPath(
  countryCode: string,
  regionAbbrev: string,
  countyFips: string,
): string {
  return `/${countryCode.toUpperCase()}/${regionAbbrev.toUpperCase()}/county/${countyFips}`;
}

/**
 * Whether `id` is a valid admin-2 path segment for the country.
 * US: 5-digit FIPS; CA: 4-digit CDUID; AU: 5-digit LGA code.
 * Unknown / no-admin2 → false.
 */
export function isAdmin2Id(countryCode: string, id: string | null | undefined): boolean {
  if (!id) return false;
  const cc = countryCode.toUpperCase();
  const cfg = getCountry(cc);
  if (!cfg?.hasAdmin2) return false;
  if (cc === "US") return /^\d{5}$/.test(id);
  if (cc === "CA") return /^\d{4}$/.test(id);
  if (cc === "AU") return /^\d{5}$/.test(id);
  return false;
}

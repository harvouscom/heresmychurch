import { churchMapPath } from "./map-paths";
import { getChurchUrlSegment } from "../components/url-utils";
import { getCountry, getRegion, resolveRegionByAbbrev } from "../config/countries";

import { churchTitle, churchDescription, churchSchema, PROFILE_SCHEMA_ID, type ChurchProfile, type ChurchPlace } from "../../../shared/church-profile";
const CHURCH_JSONLD_ID = PROFILE_SCHEMA_ID;
const SITE = "https://heresmychurch.com";

export type ChurchSeoInput = ChurchProfile & { id: string; name: string; lat: number; lng: number };

function resolveCountryCode(church: ChurchSeoInput, countryCode?: string): string {
  if (countryCode) return countryCode.toUpperCase();
  if (church.country) return church.country.toUpperCase();
  const resolved = resolveRegionByAbbrev(church.state);
  return resolved?.country.code ?? "US";
}

/** Absolute map URL for a church (canonical path). */
export function churchCanonicalUrl(
  church: ChurchSeoInput,
  countryCode?: string,
): string | null {
  const region = (church.state || "").toUpperCase();
  if (!region) return null;
  const cc = resolveCountryCode(church, countryCode);
  const seg = getChurchUrlSegment({ id: church.id, shortId: church.shortId == null ? undefined : String(church.shortId) }, region, cc);
  return `${SITE}${churchMapPath(cc, region, seg)}`;
}

function profilePlace(church: ChurchSeoInput, countryCode?: string): ChurchPlace {
  const cc = resolveCountryCode(church, countryCode);
  const region = (church.state || "").toUpperCase();
  return { cc, region, regionName: getRegion(cc, region)?.name || region,
    countryName: getCountry(cc)?.name || cc, url: churchCanonicalUrl(church, cc) || SITE };
}
export function churchMetaDescription(church: ChurchSeoInput, countryCode?: string): string {
  return churchDescription(church, profilePlace(church, countryCode));
}
export function buildChurchJsonLd(church: ChurchSeoInput, countryCode?: string): Record<string, unknown> | null {
  return churchCanonicalUrl(church, countryCode) ? churchSchema(church, profilePlace(church, countryCode)) : null;
}

function setMeta(selector: string, attr: string, content: string) {
  const el = document.querySelector(selector);
  if (el) el.setAttribute(attr, content);
}

/**
 * Update document title + description/OG/Twitter for a selected church,
 * and inject/remove JSON-LD. Call with null to clear JSON-LD (title left alone).
 */
export function syncChurchDocumentSeo(
  church: ChurchSeoInput | null,
  countryCode?: string,
): void {
  let el = document.getElementById(CHURCH_JSONLD_ID) as HTMLScriptElement | null;

  if (!church) {
    el?.remove();
    return;
  }

  const url = churchCanonicalUrl(church, countryCode);
  const description = churchMetaDescription(church, countryCode);
  const title = churchTitle(church, profilePlace(church, countryCode));
  document.title = title;

  if (description) {
    setMeta('meta[name="description"]', "content", description);
    setMeta('meta[property="og:description"]', "content", description);
    setMeta('meta[name="twitter:description"]', "content", description);
  }
  setMeta('meta[property="og:title"]', "content", title);
  setMeta('meta[name="twitter:title"]', "content", title);
  if (url) {
    setMeta('meta[property="og:url"]', "content", url);
    setMeta('meta[name="twitter:url"]', "content", url);
  }

  const payload = buildChurchJsonLd(church, countryCode);
  if (!payload) {
    el?.remove();
    return;
  }
  const json = JSON.stringify(payload);
  if (el) {
    el.textContent = json;
  } else {
    el = document.createElement("script");
    el.id = CHURCH_JSONLD_ID;
    el.type = "application/ld+json";
    el.textContent = json;
    document.head.appendChild(el);
  }
}

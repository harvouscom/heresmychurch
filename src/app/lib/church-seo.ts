import { churchMapPath } from "./map-paths";
import { getChurchUrlSegment } from "../components/url-utils";
import { resolveRegionByAbbrev } from "../config/countries";

const CHURCH_JSONLD_ID = "church-jsonld";
const SITE = "https://heresmychurch.com";

export type ChurchSeoInput = {
  id: string;
  shortId?: string;
  name: string;
  city?: string;
  state?: string;
  country?: string;
  address?: string;
  website?: string;
  denomination?: string;
  lat: number;
  lng: number;
};

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
  const seg = getChurchUrlSegment(church, region, cc);
  return `${SITE}${churchMapPath(cc, region, seg)}`;
}

export function churchMetaDescription(church: ChurchSeoInput, countryCode?: string): string {
  const cc = resolveCountryCode(church, countryCode);
  const region = (church.state || "").toUpperCase();
  const resolved = resolveRegionByAbbrev(region);
  const regionName = resolved?.region.name ?? region;
  const place = [church.city, regionName, cc === "US" ? null : resolved?.country.name]
    .filter(Boolean)
    .join(", ");
  const denom = (church.denomination || "").trim();
  return [place, denom || null].filter(Boolean).join(" · ");
}

/** Build schema.org Place/Church JSON-LD payload. */
export function buildChurchJsonLd(
  church: ChurchSeoInput,
  countryCode?: string,
): Record<string, unknown> | null {
  const url = churchCanonicalUrl(church, countryCode);
  if (!url) return null;
  const cc = resolveCountryCode(church, countryCode);
  const address: Record<string, unknown> = {
    "@type": "PostalAddress",
    addressCountry: cc,
  };
  if (church.address) address.streetAddress = church.address;
  if (church.city) address.addressLocality = church.city;
  if (church.state) address.addressRegion = church.state;

  const payload: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": ["Church", "Place"],
    name: church.name,
    address,
    geo: {
      "@type": "GeoCoordinates",
      latitude: church.lat,
      longitude: church.lng,
    },
    url,
  };
  if (church.website) payload.sameAs = church.website;
  return payload;
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
  const title = `${church.name} -- ${church.city || church.state || "Church"} | Here's My Church`;
  document.title = title;

  if (description) {
    setMeta('meta[name="description"]', "content", description);
    setMeta('meta[property="og:description"]', "content", description);
    setMeta('meta[name="twitter:description"]', "content", description);
  }
  setMeta('meta[property="og:title"]', "content", church.name);
  setMeta('meta[name="twitter:title"]', "content", church.name);
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

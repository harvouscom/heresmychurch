/** Shared facts for initial HTML and the interactive church panel. No browser dependencies. */
export type ChurchProfile = {
  id?: string; shortId?: string | number; name?: string; city?: string;
  state?: string; country?: string; address?: string; postcode?: string;
  denomination?: string; website?: string; phone?: string; email?: string;
  lat?: number; lng?: number; attendance?: number; serviceTimes?: string;
  languages?: string[]; ministries?: string[]; pastorName?: string;
  lastVerified?: number; listingStatus?: string;
};
export type ChurchPlace = { cc: string; region: string; regionName: string; countryName: string; url: string };
export const PROFILE_SCHEMA_ID = "church-jsonld";
export function webUrl(value?: string): string | undefined {
  if (!value) return;
  try { const u = new URL(value); if (["https:", "http:"].includes(u.protocol)) return u.href; } catch { /* not a web URL */ }
}
export function churchPlaceLabel(c: ChurchProfile, p: ChurchPlace): string {
  return [c.city, p.regionName, p.cc === "US" ? null : p.countryName].filter(Boolean).join(", ");
}
export function churchTitle(c: ChurchProfile, p: ChurchPlace): string {
  return `${c.name || "Church"} in ${churchPlaceLabel(c, p)} | Here's My Church`;
}
export function churchDescription(c: ChurchProfile, p: ChurchPlace): string {
  const denom = c.denomination && !/^(other|unknown|unspecified)$/i.test(c.denomination) ? `${c.denomination} church` : "Christian church";
  return `${c.name || "Church"} is a ${denom} in ${churchPlaceLabel(c, p)}. Find ${c.serviceTimes ? "service times, " : ""}${c.address ? "address, " : ""}contact details and directions on Here's My Church.`;
}
export function verifiedDate(c: ChurchProfile): string | undefined {
  if (!c.lastVerified || !Number.isFinite(c.lastVerified)) return;
  const date = new Date(c.lastVerified);
  if (date.getUTCFullYear() >= 2000 && date.getTime() <= Date.now()) return date.toISOString().slice(0, 10);
}
export function churchSchema(c: ChurchProfile, p: ChurchPlace): Record<string, unknown> {
  const website = webUrl(c.website);
  const entity: Record<string, unknown> = {
    "@type": "Church", "@id": `${p.url}#church`, name: c.name || "Church",
    url: p.url, description: churchDescription(c, p),
    address: { "@type": "PostalAddress", addressCountry: p.cc,
      ...(c.address ? { streetAddress: c.address } : {}),
      ...(c.city ? { addressLocality: c.city } : {}), addressRegion: p.region,
      ...(c.postcode ? { postalCode: c.postcode } : {}) },
    ...(website ? { sameAs: [website] } : {}),
    ...(c.phone ? { telephone: c.phone } : {}),
    ...(c.email ? { email: c.email } : {}),
  };
  if (Number.isFinite(c.lat) && Number.isFinite(c.lng) && Math.abs(c.lat!) <= 90 && Math.abs(c.lng!) <= 180) {
    entity.geo = { "@type": "GeoCoordinates", latitude: c.lat, longitude: c.lng };
    entity.hasMap = `https://www.google.com/maps/search/?api=1&query=${c.lat},${c.lng}`;
  }
  // Worship schedules are not general opening hours; preserve their exact wording.
  if (c.serviceTimes) entity.additionalProperty = [{ "@type": "PropertyValue", name: "Service times", value: c.serviceTimes }];
  const crumbs = [
    ["Churches worldwide", "https://heresmychurch.com/world"],
    [p.countryName, `https://heresmychurch.com/${p.cc}`],
    [p.regionName, `https://heresmychurch.com/${p.cc}/${p.region}`],
    [c.name || "Church", p.url],
  ];
  return { "@context": "https://schema.org", "@graph": [entity, {
    "@type": "WebPage", "@id": `${p.url}#page`, url: p.url,
    name: churchTitle(c, p), description: churchDescription(c, p),
    mainEntity: { "@id": `${p.url}#church` },
    isPartOf: { "@type": "WebSite", "@id": "https://heresmychurch.com/#website", name: "Here's My Church", url: "https://heresmychurch.com" },
    ...(verifiedDate(c) ? { dateModified: verifiedDate(c) } : {}),
  }, { "@type": "BreadcrumbList", "@id": `${p.url}#breadcrumbs`, itemListElement: crumbs.map(([name, item], i) => ({ "@type": "ListItem", position: i + 1, name, item })) }] };
}
/** Safe in a script element, including legacy community-supplied strings. */
export function schemaJson(value: unknown): string { return JSON.stringify(value).replace(/</g, "\\u003c").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029"); }

/** Concise alternative representation of the same public profile facts. */
export function churchMarkdown(c: ChurchProfile, p: ChurchPlace): string {
  const clean = (value: string) => value.replace(/[<>]/g, "").replace(/\r/g, "");
  const parts = [`# ${clean(c.name || "Church")}`, churchDescription(c, p), `Canonical listing: ${p.url}`];
  const add = (heading: string, value?: string) => { if (value) parts.push(`## ${heading}\n\n${clean(value)}`); };
  if (c.listingStatus === "pending_reverify") parts.push("This location needs re-verification following a reported relocation. Confirm the current location before visiting.");
  add("Location", [c.address, c.city, p.regionName, p.countryName].filter(Boolean).join(", "));
  add("Service times", c.serviceTimes || "Not listed. Check with the church before visiting.");
  add("Tradition", c.denomination); add("Languages", c.languages?.join(", "));
  add("Ministries", c.ministries?.join(", ")); add("Pastor", c.pastorName);
  add("Phone", c.phone); add("Email", c.email); add("Church website", webUrl(c.website));
  if (Number.isFinite(c.attendance) && c.attendance! > 0) add("Estimated attendance", "Attendance figures on the interactive map are estimates, not verified attendance counts.");
  add("Sources and freshness", `OpenStreetMap and community contributions. ${verifiedDate(c) ? `Last community verification or correction: ${verifiedDate(c)}.` : "No community verification date is recorded."} Confirm current details directly with the church. Missing information does not mean a service or ministry is unavailable.`);
  parts.push(`## Explore\n\n- [Churches in ${clean(p.regionName)}](https://heresmychurch.com/${p.cc}/${p.region})\n- [Churches in ${clean(p.countryName)}](https://heresmychurch.com/${p.cc})`);
  return parts.join("\n\n") + "\n";
}

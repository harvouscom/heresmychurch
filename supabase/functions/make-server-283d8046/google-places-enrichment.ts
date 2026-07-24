/**
 * Google Places (New) enrichment overlay for OSM churches.
 * - Match with type + proximity + name guardrails
 * - Cache under enrichment:google:{churchId}
 * - Merge at read time: fill empty fields only; never overwrite community corrections
 * - Never write serviceTimes from Google opening hours
 */

export type EnrichmentConfidence = "high" | "low";
export type EnrichmentSource = "text_search" | "nearby";

export type GoogleEnrichment = {
  churchId: string;
  placeId: string;
  fetchedAt: string;
  name?: string;
  address?: string;
  city?: string;
  state?: string;
  phone?: string;
  website?: string;
  confidence: EnrichmentConfidence;
  source: EnrichmentSource;
  distanceMeters?: number;
  types?: string[];
};

export const GOOGLE_ENRICHMENT_TTL_MS = 90 * 24 * 60 * 60 * 1000;
export const GOOGLE_ENRICHMENT_MAX_DISTANCE_M = 1000;
export const GOOGLE_ENRICHMENT_NEARBY_RADIUS_M = 500;
/** Sleep between Places API calls to stay polite under free-tier QPS. */
export const GOOGLE_ENRICHMENT_REQUEST_GAP_MS = 120;

const WORSHIP_TYPES = new Set(["place_of_worship", "church"]);

const FILL_FIELDS = ["address", "city", "phone", "website"] as const;
type FillField = (typeof FILL_FIELDS)[number];

export function googleEnrichmentKey(churchId: string): string {
  return `enrichment:google:${churchId}`;
}

export function normalizeEnrichmentPhone(s: string): string {
  const digits = (s ?? "").replace(/\D/g, "");
  if (digits.length === 11 && digits[0] === "1") return digits.slice(1);
  if (digits.length < 10) return "";
  return digits;
}

function hasUsableWebsite(w: string | undefined): boolean {
  const v = (w || "").trim();
  if (!v) return false;
  return /^https?:\/\//i.test(v) || /^www\./i.test(v) || (/\./.test(v) && v.length > 4);
}

function isAddressMeaningful(addr: string | undefined, city: string, state: string): boolean {
  if (!addr || !addr.trim()) return false;
  const a = addr.trim();
  if (a.length < 5) return false;
  const c = (city || "").trim().toLowerCase();
  const s = (state || "").trim().toLowerCase();
  const an = a.toLowerCase();
  if (c && an === c) return false;
  const cs = [c, s].filter(Boolean).join(", ");
  if (cs && an === cs) return false;
  return true;
}

export function churchMissingEnrichableFields(ch: {
  address?: string;
  city?: string;
  state?: string;
  phone?: string;
  website?: string;
}): boolean {
  const missingAddress = !isAddressMeaningful(ch.address, ch.city || "", ch.state || "");
  const missingPhone = normalizeEnrichmentPhone(ch.phone || "").length < 10;
  const missingWebsite = !hasUsableWebsite(ch.website);
  return missingAddress || missingPhone || missingWebsite;
}

export function isEnrichmentFieldEmpty(ch: any, field: FillField): boolean {
  if (field === "address") return !isAddressMeaningful(ch.address, ch.city || "", ch.state || "");
  if (field === "city") return !(ch.city && String(ch.city).trim());
  if (field === "phone") return normalizeEnrichmentPhone(ch.phone || "").length < 10;
  if (field === "website") return !hasUsableWebsite(ch.website);
  return true;
}

export function isEnrichmentFresh(en: GoogleEnrichment | null | undefined, now = Date.now()): boolean {
  if (!en?.fetchedAt || en.confidence !== "high" || !en.placeId) return false;
  const t = Date.parse(en.fetchedAt);
  if (!Number.isFinite(t)) return false;
  return now - t < GOOGLE_ENRICHMENT_TTL_MS;
}

/** Haversine distance in meters. */
export function distanceMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

function normalizeName(s: string): string {
  return (s || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\b(the|church|of|and|a|an)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Cheap token overlap score in [0, 1]. */
export function nameSimilarity(a: string, b: string): number {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  if (na.includes(nb) || nb.includes(na)) return 0.85;
  const ta = new Set(na.split(" ").filter((t) => t.length > 2));
  const tb = new Set(nb.split(" ").filter((t) => t.length > 2));
  if (!ta.size || !tb.size) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  return inter / Math.max(ta.size, tb.size);
}

const MIN_NAME_SIMILARITY = 0.45;

export function hasWorshipType(types: string[] | undefined): boolean {
  if (!Array.isArray(types) || !types.length) return false;
  return types.some((t) => WORSHIP_TYPES.has(String(t).toLowerCase()));
}

export function evaluateMatch(opts: {
  churchName: string;
  churchLat: number;
  churchLng: number;
  placeName: string;
  placeLat: number;
  placeLng: number;
  types?: string[];
}): { confidence: EnrichmentConfidence; distanceMeters: number; nameScore: number } | null {
  const dist = distanceMeters(opts.churchLat, opts.churchLng, opts.placeLat, opts.placeLng);
  const nameScore = nameSimilarity(opts.churchName, opts.placeName);
  if (!hasWorshipType(opts.types)) return null;
  if (dist > GOOGLE_ENRICHMENT_MAX_DISTANCE_M) return null;
  if (nameScore < MIN_NAME_SIMILARITY) return null;
  const confidence: EnrichmentConfidence =
    dist <= GOOGLE_ENRICHMENT_MAX_DISTANCE_M && nameScore >= MIN_NAME_SIMILARITY ? "high" : "low";
  return { confidence, distanceMeters: Math.round(dist), nameScore };
}

/**
 * Overlay Google enrichment onto churches.
 * Never overwrites existing values or fields present in approved community corrections.
 * Never applies serviceTimes. Only high-confidence enrichments merge.
 */
export function mergeGoogleEnrichmentsIntoChurches(
  churches: any[],
  enrichments: Record<string, GoogleEnrichment>,
  corrections?: Record<string, Record<string, string>>,
): void {
  for (const ch of churches) {
    const en = enrichments[ch.id];
    if (!en || en.confidence !== "high") continue;
    const corr = corrections?.[ch.id] || {};
    for (const field of FILL_FIELDS) {
      if (corr[field] != null && String(corr[field]).trim() !== "") continue;
      // address corrections may also set city via JSON; treat city as taken if address correction exists
      if (field === "city" && corr.address != null && String(corr.address).trim() !== "") continue;
      if (!isEnrichmentFieldEmpty(ch, field)) continue;
      const raw = en[field];
      if (raw == null || String(raw).trim() === "") continue;
      if (field === "phone") {
        const phone = normalizeEnrichmentPhone(String(raw));
        if (phone) (ch as any).phone = phone;
      } else {
        (ch as any)[field] = String(raw).trim();
      }
    }
  }
}

type AddressParts = { address: string; city: string; state: string };

function parseAddressComponents(
  components: Array<{ longText?: string; shortText?: string; types?: string[] }> | undefined,
  formattedAddress: string | undefined,
  fallbackState: string,
): AddressParts {
  let streetNumber = "";
  let route = "";
  let city = "";
  let state = "";
  if (Array.isArray(components)) {
    for (const c of components) {
      const types = c.types || [];
      if (types.includes("street_number")) streetNumber = c.longText || c.shortText || "";
      else if (types.includes("route")) route = c.longText || c.shortText || "";
      else if (types.includes("locality")) city = c.longText || c.shortText || "";
      else if (types.includes("postal_town") && !city) city = c.longText || c.shortText || "";
      else if (types.includes("administrative_area_level_1")) state = (c.shortText || c.longText || "").toUpperCase().slice(0, 2);
    }
  }
  let address = [streetNumber, route].filter(Boolean).join(" ").trim();
  if (!address && formattedAddress) {
    const parts = formattedAddress.split(",").map((s) => s.trim());
    address = parts[0] || "";
    if (!city && parts[1]) city = parts[1];
  }
  if (!state) state = (fallbackState || "").toUpperCase().slice(0, 2);
  return { address, city, state };
}

function normalizeWebsite(uri: string | undefined): string {
  const w = (uri || "").trim();
  if (!w) return "";
  if (/^https?:\/\//i.test(w)) return w;
  if (/^www\./i.test(w)) return `https://${w}`;
  if (/\./.test(w) && w.length > 4) return `https://${w}`;
  return "";
}

function placeIdFromResourceName(name: string | undefined, id: string | undefined): string {
  if (id) return id;
  if (name?.startsWith("places/")) return name.slice("places/".length);
  return name || "";
}

type PlacesApiCounters = { textSearch: number; nearbySearch: number; placeDetails: number; errors: number };

async function sleep(ms: number): Promise<void> {
  await new Promise((r) => setTimeout(r, ms));
}

async function placesFetch(
  url: string,
  apiKey: string,
  body: Record<string, unknown> | null,
  fieldMask: string,
  counters: PlacesApiCounters,
  kind: "textSearch" | "nearbySearch" | "placeDetails",
): Promise<any | null> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Goog-Api-Key": apiKey,
    "X-Goog-FieldMask": fieldMask,
  };
  let attempt = 0;
  while (attempt < 3) {
    attempt++;
    try {
      const res = await fetch(url, {
        method: body ? "POST" : "GET",
        headers,
        body: body ? JSON.stringify(body) : undefined,
      });
      counters[kind]++;
      if (res.status === 429 || res.status >= 500) {
        await sleep(400 * attempt);
        continue;
      }
      if (!res.ok) {
        counters.errors++;
        console.log(`Places ${kind} HTTP ${res.status}: ${await res.text().catch(() => "")}`);
        return null;
      }
      return await res.json();
    } catch (e) {
      counters.errors++;
      console.log(`Places ${kind} error: ${e}`);
      await sleep(400 * attempt);
    }
  }
  return null;
}

type PlaceCandidate = {
  placeId: string;
  displayName: string;
  lat: number;
  lng: number;
  types: string[];
  formattedAddress?: string;
  addressComponents?: Array<{ longText?: string; shortText?: string; types?: string[] }>;
  phone?: string;
  website?: string;
};

function mapPlace(p: any): PlaceCandidate | null {
  const lat = p?.location?.latitude;
  const lng = p?.location?.longitude;
  if (typeof lat !== "number" || typeof lng !== "number") return null;
  const placeId = placeIdFromResourceName(p.name, p.id);
  if (!placeId) return null;
  return {
    placeId,
    displayName: p.displayName?.text || p.displayName || "",
    lat,
    lng,
    types: Array.isArray(p.types) ? p.types.map((t: string) => String(t)) : [],
    formattedAddress: p.formattedAddress,
    addressComponents: p.addressComponents,
    phone: p.nationalPhoneNumber || p.internationalPhoneNumber || "",
    website: p.websiteUri || "",
  };
}

const TEXT_SEARCH_MASK =
  "places.id,places.name,places.displayName,places.formattedAddress,places.location,places.types,places.addressComponents";
const NEARBY_SEARCH_MASK = TEXT_SEARCH_MASK;
const PLACE_DETAILS_MASK =
  "id,name,displayName,formattedAddress,location,types,addressComponents,nationalPhoneNumber,internationalPhoneNumber,websiteUri";

async function textSearchPlace(
  apiKey: string,
  query: string,
  lat: number,
  lng: number,
  counters: PlacesApiCounters,
): Promise<PlaceCandidate[]> {
  const data = await placesFetch(
    "https://places.googleapis.com/v1/places:searchText",
    apiKey,
    {
      textQuery: query,
      regionCode: "US",
      languageCode: "en",
      pageSize: 5,
      locationBias: {
        circle: { center: { latitude: lat, longitude: lng }, radius: GOOGLE_ENRICHMENT_MAX_DISTANCE_M },
      },
    },
    TEXT_SEARCH_MASK,
    counters,
    "textSearch",
  );
  const places = Array.isArray(data?.places) ? data.places : [];
  return places.map(mapPlace).filter(Boolean) as PlaceCandidate[];
}

async function nearbySearchPlace(
  apiKey: string,
  lat: number,
  lng: number,
  counters: PlacesApiCounters,
): Promise<PlaceCandidate[]> {
  const data = await placesFetch(
    "https://places.googleapis.com/v1/places:searchNearby",
    apiKey,
    {
      includedTypes: ["church"],
      maxResultCount: 5,
      locationRestriction: {
        circle: { center: { latitude: lat, longitude: lng }, radius: GOOGLE_ENRICHMENT_NEARBY_RADIUS_M },
      },
      languageCode: "en",
      regionCode: "US",
    },
    NEARBY_SEARCH_MASK,
    counters,
    "nearbySearch",
  );
  const places = Array.isArray(data?.places) ? data.places : [];
  return places.map(mapPlace).filter(Boolean) as PlaceCandidate[];
}

async function placeDetails(
  apiKey: string,
  placeId: string,
  counters: PlacesApiCounters,
): Promise<PlaceCandidate | null> {
  const data = await placesFetch(
    `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`,
    apiKey,
    null,
    PLACE_DETAILS_MASK,
    counters,
    "placeDetails",
  );
  if (!data) return null;
  return mapPlace(data);
}

function pickBestCandidate(
  church: { name: string; lat: number; lng: number },
  candidates: PlaceCandidate[],
  source: EnrichmentSource,
): { candidate: PlaceCandidate; confidence: EnrichmentConfidence; distanceMeters: number; source: EnrichmentSource } | null {
  let best: { candidate: PlaceCandidate; confidence: EnrichmentConfidence; distanceMeters: number; source: EnrichmentSource; score: number } | null = null;
  for (const c of candidates) {
    const ev = evaluateMatch({
      churchName: church.name,
      churchLat: church.lat,
      churchLng: church.lng,
      placeName: c.displayName,
      placeLat: c.lat,
      placeLng: c.lng,
      types: c.types,
    });
    if (!ev || ev.confidence !== "high") continue;
    const score = ev.nameScore * 1000 - ev.distanceMeters;
    if (!best || score > best.score) {
      best = { candidate: c, confidence: ev.confidence, distanceMeters: ev.distanceMeters, source, score };
    }
  }
  return best ? { candidate: best.candidate, confidence: best.confidence, distanceMeters: best.distanceMeters, source: best.source } : null;
}

export type EnrichChurchResult =
  | { status: "skipped_fresh" }
  | { status: "skipped_complete" }
  | { status: "no_match" }
  | { status: "duplicate_place"; placeId: string }
  | { status: "enriched"; enrichment: GoogleEnrichment }
  | { status: "would_enrich"; enrichment: GoogleEnrichment };

export async function enrichOneChurch(opts: {
  apiKey: string;
  church: any;
  existing: GoogleEnrichment | null;
  usedPlaceIds: Set<string>;
  dryRun: boolean;
  missingOnly: boolean;
  fetchDetailsForContact: boolean;
  counters: PlacesApiCounters;
}): Promise<EnrichChurchResult> {
  const ch = opts.church;
  const churchId = String(ch.id || "");
  if (!churchId) return { status: "no_match" };
  if (isEnrichmentFresh(opts.existing)) return { status: "skipped_fresh" };
  if (opts.missingOnly && !churchMissingEnrichableFields(ch)) return { status: "skipped_complete" };

  const lat = Number(ch.lat);
  const lng = Number(ch.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return { status: "no_match" };

  const city = (ch.city || "").trim();
  const state = (ch.state || "").trim().toUpperCase().slice(0, 2);
  const addr = (ch.address || "").trim();
  const queryParts = [ch.name, addr, city, state].filter(Boolean);
  const query = queryParts.join(", ");

  await sleep(GOOGLE_ENRICHMENT_REQUEST_GAP_MS);
  let picked = pickBestCandidate({ name: ch.name, lat, lng }, await textSearchPlace(opts.apiKey, query, lat, lng, opts.counters), "text_search");

  if (!picked) {
    await sleep(GOOGLE_ENRICHMENT_REQUEST_GAP_MS);
    picked = pickBestCandidate(
      { name: ch.name, lat, lng },
      await nearbySearchPlace(opts.apiKey, lat, lng, opts.counters),
      "nearby",
    );
  }

  if (!picked) return { status: "no_match" };
  // Allow re-enriching the same church with its own placeId; block other churches sharing that Place.
  if (
    opts.usedPlaceIds.has(picked.candidate.placeId) &&
    opts.existing?.placeId !== picked.candidate.placeId
  ) {
    return { status: "duplicate_place", placeId: picked.candidate.placeId };
  }

  let candidate = picked.candidate;
  const needPhone = isEnrichmentFieldEmpty(ch, "phone") && !normalizeEnrichmentPhone(candidate.phone || "");
  const needWebsite = isEnrichmentFieldEmpty(ch, "website") && !normalizeWebsite(candidate.website);
  if (opts.fetchDetailsForContact && (needPhone || needWebsite)) {
    await sleep(GOOGLE_ENRICHMENT_REQUEST_GAP_MS);
    const details = await placeDetails(opts.apiKey, candidate.placeId, opts.counters);
    if (details) {
      candidate = {
        ...candidate,
        ...details,
        phone: details.phone || candidate.phone,
        website: details.website || candidate.website,
        addressComponents: details.addressComponents || candidate.addressComponents,
        formattedAddress: details.formattedAddress || candidate.formattedAddress,
      };
    }
  }

  const parts = parseAddressComponents(candidate.addressComponents, candidate.formattedAddress, state);
  const enrichment: GoogleEnrichment = {
    churchId,
    placeId: candidate.placeId,
    fetchedAt: new Date().toISOString(),
    name: candidate.displayName || undefined,
    address: parts.address || undefined,
    city: parts.city || city || undefined,
    state: parts.state || state || undefined,
    phone: normalizeEnrichmentPhone(candidate.phone || "") || undefined,
    website: normalizeWebsite(candidate.website) || undefined,
    confidence: "high",
    source: picked.source,
    distanceMeters: picked.distanceMeters,
    types: candidate.types,
  };

  // Never persist serviceTimes — Google hours are not worship schedules.
  opts.usedPlaceIds.add(candidate.placeId);
  if (opts.dryRun) return { status: "would_enrich", enrichment };
  return { status: "enriched", enrichment };
}

export type EnrichStateSummary = {
  state: string;
  dryRun: boolean;
  missingOnly: boolean;
  limit: number;
  considered: number;
  enriched: number;
  wouldEnrich: number;
  noMatch: number;
  skippedFresh: number;
  skippedComplete: number;
  duplicatePlace: number;
  apiCalls: PlacesApiCounters;
};

export function emptyCounters(): PlacesApiCounters {
  return { textSearch: 0, nearbySearch: 0, placeDetails: 0, errors: 0 };
}

import { Hono } from "npm:hono";
import { cors } from "npm:hono/cors";
import { logger } from "npm:hono/logger";
import * as kv from "./kv_store.tsx";
import { US_STATES, getStateByAbbrev } from "./states.tsx";
import { enrichWithARDA } from "./arda-reference.tsx";

// Multiple Overpass API mirrors for fallback
const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
];

// Approximate bounding boxes for US states [south, west, north, east]
const STATE_BOUNDS: Record<string, [number, number, number, number]> = {
  AL: [30.22, -88.47, 35.01, -84.89], AK: [51.21, -179.15, 71.39, -129.98],
  AZ: [31.33, -114.81, 37.00, -109.04], AR: [33.00, -94.62, 36.50, -89.64],
  CA: [32.53, -124.41, 42.01, -114.13], CO: [36.99, -109.06, 41.00, -102.04],
  CT: [40.95, -73.73, 42.05, -71.79], DE: [38.45, -75.79, 39.84, -75.05],
  FL: [24.40, -87.63, 31.00, -79.97], GA: [30.36, -85.61, 35.00, -80.84],
  HI: [18.91, -160.24, 22.24, -154.81], ID: [42.00, -117.24, 49.00, -111.04],
  IL: [36.97, -91.51, 42.51, -87.02], IN: [37.77, -88.10, 41.76, -84.78],
  IA: [40.38, -96.64, 43.50, -90.14], KS: [36.99, -102.05, 40.00, -94.59],
  KY: [36.50, -89.57, 39.15, -81.96], LA: [28.93, -94.04, 33.02, -88.82],
  ME: [42.98, -71.08, 47.46, -66.95], MD: [37.91, -79.49, 39.72, -75.05],
  MA: [41.24, -73.50, 42.89, -69.93], MI: [41.70, -90.42, 48.31, -82.12],
  MN: [43.50, -97.24, 49.38, -89.49], MS: [30.17, -91.66, 34.99, -88.10],
  MO: [35.99, -95.77, 40.61, -89.10], MT: [44.36, -116.05, 49.00, -104.04],
  NE: [39.99, -104.05, 43.00, -95.31], NV: [35.00, -120.01, 42.00, -114.04],
  NH: [42.70, -72.56, 45.31, -70.70], NJ: [38.93, -75.56, 41.36, -73.89],
  NM: [31.33, -109.05, 37.00, -103.00], NY: [40.50, -79.76, 45.02, -71.86],
  NC: [33.84, -84.32, 36.59, -75.46], ND: [45.94, -104.05, 49.00, -96.55],
  OH: [38.40, -84.82, 42.33, -80.52], OK: [33.62, -103.00, 37.00, -94.43],
  OR: [41.99, -124.57, 46.29, -116.46], PA: [39.72, -80.52, 42.27, -74.69],
  RI: [41.15, -71.86, 42.02, -71.12], SC: [32.03, -83.35, 35.22, -78.54],
  SD: [42.48, -104.06, 45.95, -96.44], TN: [34.98, -90.31, 36.68, -81.65],
  TX: [25.84, -106.65, 36.50, -93.51], UT: [36.99, -114.05, 42.00, -109.04],
  VT: [42.73, -73.44, 45.02, -71.46], VA: [36.54, -83.68, 39.47, -75.24],
  WA: [45.54, -124.85, 49.00, -116.92], WV: [37.20, -82.64, 40.64, -77.72],
  WI: [42.49, -92.89, 47.08, -86.25], WY: [40.99, -111.06, 45.01, -104.05],
  DC: [38.79, -77.12, 38.99, -76.91],
};

// States that typically have > 5000 churches and benefit from quadrant splitting
const LARGE_STATES = new Set([
  "TX", "CA", "FL", "NY", "PA", "OH", "IL", "GA", "NC", "MI",
  "TN", "VA", "AL", "MO", "IN", "SC", "KY", "LA", "WI", "MN",
  "MS", "AR", "OK", "IA", "KS",
]);

const app = new Hono();

app.use("*", logger(console.log));

app.use(
  "/*",
  cors({
    origin: "*",
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    exposeHeaders: ["Content-Length"],
    maxAge: 600,
  })
);

// Health check
app.get("/make-server-283d8046/health", (c) => {
  return c.json({ status: "ok" });
});

// ============ CHURCH ROUTES ============

// Lightweight search index: strips lat/lng/website to ~40-60% smaller payloads.
// Stored per-state as `churches:sidx:{STATE}` and read by the search endpoint.
function buildSearchIndex(churches: any[]): Array<{
  id: string; n: string; c: string; d: string; a: number; ad: string; la: number; lo: number;
}> {
  return churches.map((ch: any) => ({
    id: ch.id,
    n: ch.name || "",        // name
    c: ch.city || "",        // city
    d: ch.denomination || "", // denomination
    a: ch.attendance || 0,   // attendance
    ad: ch.address || "",    // address (for matching)
    la: ch.lat || 0,         // latitude (for instant church preview)
    lo: ch.lng || 0,         // longitude
  }));
}

async function writeSearchIndex(stateAbbrev: string, churches: any[]) {
  const idx = buildSearchIndex(churches);
  await kv.set(`churches:sidx:${stateAbbrev}`, idx);
}

// Match a denomination from any raw string (denomination tag, name, operator, etc.)
function matchDenomination(text: string): string | null {
  const lower = text.toLowerCase().replace(/[''ʼ]/g, "'").replace(/[‐–—]/g, "-");

  // ── Catholic ──────────────────────────────────────────
  if (lower.includes("catholic") || lower.includes("roman_catholic")) return "Catholic";
  // Spanish Catholic signals
  if (/\b(parroquia|catedral|nuestra señora|nuestra senora|virgen de|sagrado corazón|sagrado corazon)\b/.test(lower) &&
      !lower.includes("baptist") && !lower.includes("pentecostal") && !lower.includes("lutheran")) return "Catholic";
  if (/\b(san [a-z]|santa [a-z]|santo [a-z])\b/.test(lower) &&
      !lower.includes("baptist") && !lower.includes("pentecostal") && !lower.includes("lutheran") && !lower.includes("iglesia cristiana") && !lower.includes("iglesia de dios")) return "Catholic";
  if (/\b(iglesia católica|iglesia catolica)\b/.test(lower)) return "Catholic";
  // English Catholic signals (strong)
  if (/\b(parish|basilica|sacred heart|immaculate|our lady|blessed sacrament|holy (family|cross|spirit|trinity|rosary|name|redeemer|angels|innocents))\b/.test(lower) &&
      !lower.includes("lutheran") && !lower.includes("episcopal") && !lower.includes("orthodox") &&
      !lower.includes("baptist") && !lower.includes("methodist") && !lower.includes("presbyterian") &&
      !lower.includes("anglican")) return "Catholic";
  // "St./Saint X" patterns — Catholic unless another denomination is present
  if (/\b(saint |st\. )\b/.test(lower) &&
      !lower.includes("lutheran") && !lower.includes("episcopal") && !lower.includes("orthodox") &&
      !lower.includes("baptist") && !lower.includes("methodist") && !lower.includes("presbyterian") &&
      !lower.includes("anglican") && !lower.includes("latter")) {
    if (/\b(parish|basilica|padre|mass|rectory|archdiocese|diocese)\b/.test(lower)) return "Catholic";
    if (/\bst\. (patrick|joseph|mary|anne|anthony|michael|peter|paul|john|james|francis|theresa|catherine|agnes|cecilia|augustine|thomas|elizabeth|andrew|mark|luke|matthew|stephen|lawrence|vincent|dominic|bernadette|rose|rita|clare|therese|jude|christopher|raphael|gabriel|ignatius|benedict|ambrose|basil)\b/.test(lower)) return "Catholic";
  }
  // Catholic rites and traditions
  if (/\b(maronite|melkite|chaldean|byzantine catholic|syro-malabar|latin mass|tridentine)\b/.test(lower)) return "Catholic";

  // ── Baptist ───────────────────────────────────────────
  if (lower.includes("baptist")) return "Baptist";
  if (lower.includes("sbc") || lower.includes("southern baptist")) return "Baptist";
  if (/\b(missionary baptist|freewill baptist|primitive baptist|regular baptist|independent baptist|bible baptist|fundamental baptist|general baptist|national baptist|progressive baptist|full gospel baptist|landmark baptist|old regular baptist|free will baptist)\b/.test(lower)) return "Baptist";
  if (/\b(iglesia bautista|templo bautista)\b/.test(lower)) return "Baptist";

  // ── Methodist ─────────────────────────────────────────
  if (lower.includes("methodist") || lower.includes("united_methodist")) return "Methodist";
  if (/\bame\b/.test(lower) || lower.includes("african methodist")) return "Methodist";
  if (lower.includes("ame zion") || lower.includes("amez")) return "Methodist";
  if (lower.includes("wesleyan")) return "Methodist";
  if (lower.includes("cme church") || lower.includes("colored methodist")) return "Methodist";
  if (/\b(iglesia metodista|templo metodista)\b/.test(lower)) return "Methodist";
  if (/\bumc\b/.test(lower)) return "Methodist";

  // ── Lutheran ──────────────────────────────────────────
  if (lower.includes("lutheran")) return "Lutheran";
  if (lower.includes("lcms") || lower.includes("elca") || lower.includes("wels")) return "Lutheran";
  if (lower.includes("missouri synod") || lower.includes("wisconsin synod")) return "Lutheran";
  if (/\b(iglesia luterana)\b/.test(lower)) return "Lutheran";

  // ── Presbyterian ──────────────────────────────────────
  if (lower.includes("presbyterian") || lower.includes("pcusa")) return "Presbyterian";
  if (/\bpca\b/.test(lower) && lower.includes("church")) return "Presbyterian";
  if (/\bepc\b/.test(lower) && lower.includes("church")) return "Presbyterian";
  if (/\b(iglesia presbiteriana)\b/.test(lower)) return "Presbyterian";

  // ── Episcopal / Anglican ──────────────────────────────
  if (lower.includes("episcopal") || lower.includes("anglican")) return "Episcopal";
  if (lower.includes("church of england") || lower.includes("acna")) return "Episcopal";

  // ── Pentecostal ───────────────────────────────────────
  if (lower.includes("pentecostal")) return "Pentecostal";
  if (lower.includes("apostolic") && !lower.includes("latter")) return "Pentecostal";
  if (lower.includes("foursquare") || lower.includes("four square")) return "Pentecostal";
  if (/\b(church of god of prophecy|church of god in prophecy)\b/.test(lower)) return "Pentecostal";
  if (/\b(full gospel|holiness church|holiness tabernacle|fire baptized)\b/.test(lower)) return "Pentecostal";
  if (/\b(iglesia pentecostal|iglesia apostólica|iglesia apostolica|templo pentecostal)\b/.test(lower)) return "Pentecostal";
  if (/\b(deliverance church|deliverance temple|deliverance center)\b/.test(lower)) return "Pentecostal";
  if (/\b(church of our lord jesus christ|united pentecostal|upci)\b/.test(lower)) return "Pentecostal";
  if (/\b(tabernáculo|tabernaculo)\b/.test(lower) && !lower.includes("baptist") && !lower.includes("methodist")) return "Pentecostal";

  // ── Assemblies of God ─────────────────────────────────
  if (lower.includes("assemblies_of_god") || lower.includes("assembly_of_god")) return "Assemblies of God";
  if (lower.includes("assemblies of god") || lower.includes("assembly of god")) return "Assemblies of God";
  if (lower.includes("a/g church") || lower.includes("ag church")) return "Assemblies of God";
  if (/\b(asambleas de dios|asamblea de dios)\b/.test(lower)) return "Assemblies of God";

  // ── Church of Christ ──────────────────────────────────
  if (/\bchurch(es)? of christ\b/.test(lower) && !lower.includes("united church of christ") && !lower.includes("latter")) return "Church of Christ";
  if (lower.includes("united church of christ") || /\bucc\b/.test(lower)) return "Congregational";
  if (/\biglesia de cristo\b/.test(lower) && !lower.includes("latter") && !lower.includes("santo")) return "Church of Christ";

  // ── Church of God ─────────────────────────────────────
  if (lower.includes("church of god") && !lower.includes("latter") && !lower.includes("prophecy")) return "Church of God";
  if (lower.includes("cogic") || lower.includes("church of god in christ")) return "Church of God";
  if (/\biglesia de dios\b/.test(lower) && !lower.includes("latter") && !lower.includes("profecía") && !lower.includes("profecia")) return "Church of God";

  // ── Latter-day Saints ─────────────────────────────────
  if (lower.includes("latter") || lower.includes("mormon") || lower.includes("lds")) return "Latter-day Saints";
  if (lower.includes("church of jesus christ")) return "Latter-day Saints";

  // ── Seventh-day Adventist ─────────────────────────────
  if (lower.includes("seventh") || lower.includes("adventist") || lower.includes("sda")) return "Seventh-day Adventist";
  if (/\b(iglesia adventista)\b/.test(lower)) return "Seventh-day Adventist";

  // ── Jehovah's Witnesses ───────────────────────────────
  if (lower.includes("jehovah") || lower.includes("kingdom hall")) return "Jehovah's Witnesses";
  if (/\b(salón del reino|salon del reino|testigos de jehová|testigos de jehova)\b/.test(lower)) return "Jehovah's Witnesses";

  // ── Orthodox ──────────────────────────────────────────
  if (lower.includes("orthodox")) return "Orthodox";
  if (/\b(coptic|antiochian|ecumenical patriarchate)\b/.test(lower)) return "Orthodox";

  // ── Christian & Missionary Alliance (C&MA / CMA) ─────
  if (/\b(christian and missionary alliance|c&ma|cma church|alliance church)\b/.test(lower)) return "Evangelical";

  // ── Non-denominational signals ────────────────────────
  if (lower.includes("nondenominational") || lower.includes("non-denominational") || lower.includes("non_denominational") || lower.includes("interdenominational")) return "Non-denominational";
  if (lower.includes("calvary chapel")) return "Non-denominational";
  if (lower.includes("vineyard")) return "Non-denominational";
  if (/\b(bible church|bible fellowship|community bible|open bible)\b/.test(lower)) return "Non-denominational";
  if (lower.includes("life church") || lower.includes("lifechurch")) return "Non-denominational";
  if (lower.includes("celebration church") || lower.includes("elevation church")) return "Non-denominational";
  if (/\b(worship center|praise center|faith center|faith church|faith community)\b/.test(lower)) return "Non-denominational";
  if (/\b(crossroads|newspring|northpoint|saddleback|willow creek|lakewood)\b/.test(lower)) return "Non-denominational";
  if (/\b(grace church|grace community|grace bible|grace fellowship)\b/.test(lower)) return "Non-denominational";
  if (/\b(harvest church|harvest christian|harvest bible|harvest fellowship)\b/.test(lower)) return "Non-denominational";
  // Modern megachurch / contemporary name patterns
  if (/\b(city church|the city church|city life church)\b/.test(lower)) return "Non-denominational";
  if (/\b(rock church|the rock church|solid rock)\b/.test(lower)) return "Non-denominational";
  if (/\b(cornerstone church|cornerstone fellowship|cornerstone community)\b/.test(lower)) return "Non-denominational";
  if (/\b(new life church|new life fellowship|new life community|newlife)\b/.test(lower)) return "Non-denominational";
  if (/\b(victory church|victorious|victory outreach)\b/.test(lower)) return "Non-denominational";
  if (/\b(river church|rivers church|river of life|living water)\b/.test(lower)) return "Non-denominational";
  if (/\b(journey church|the journey|mosaic church|mosaic community)\b/.test(lower)) return "Non-denominational";
  if (/\b(transformation church|transformation center)\b/.test(lower)) return "Non-denominational";
  if (/\b(bridge church|the bridge|summit church|the summit)\b/.test(lower)) return "Non-denominational";
  if (/\b(real life|reality church|reality la|reality sf)\b/.test(lower)) return "Non-denominational";
  if (/\b(christ fellowship|christ community|christ church)\b/.test(lower) && !lower.includes("lutheran") && !lower.includes("episcopal") && !lower.includes("methodist") && !lower.includes("reformed") && !lower.includes("presbyterian")) return "Non-denominational";
  if (/\b(fellowship church|the fellowship)\b/.test(lower) && !lower.includes("baptist") && !lower.includes("lutheran") && !lower.includes("methodist") && !lower.includes("presbyterian")) return "Non-denominational";
  // Spanish non-denominational
  if (/\b(iglesia cristiana|centro cristiano|iglesia de la comunidad|ministerio cristiano|templo cristiano)\b/.test(lower) && !lower.includes("adventist") && !lower.includes("baptist")) return "Non-denominational";
  if (/\b(casa de oración|casa de oracion|casa de dios|casa de fe|casa del alfarero)\b/.test(lower)) return "Non-denominational";
  // Generic "community church" / "chapel" fallback
  if (/\bcommunity church\b/.test(lower) && !lower.includes("methodist") && !lower.includes("lutheran") && !lower.includes("baptist") && !lower.includes("presbyterian") && !lower.includes("reformed")) return "Non-denominational";
  if (/\bchapel\b/.test(lower) && !lower.includes("catholic") && !lower.includes("methodist") && !lower.includes("lutheran") && !lower.includes("baptist") && !lower.includes("episcopal") && !lower.includes("presbyterian") && !lower.includes("calvary") && !lower.includes("orthodox")) return "Non-denominational";

  // ── Evangelical ───────────────────────────────────────
  if (lower.includes("evangelical") && !lower.includes("lutheran")) return "Evangelical";
  if (lower.includes("efca") || lower.includes("evangelical free")) return "Evangelical";
  if (/\bfree church\b/.test(lower) && !lower.includes("baptist") && !lower.includes("methodist") && !lower.includes("presbyterian")) return "Evangelical";
  if (lower.includes("moravian")) return "Evangelical";

  // ── Congregational ────────────────────────────────────
  if (lower.includes("congregational")) return "Congregational";

  // ── Nazarene ──────────────────────────────────────────
  if (lower.includes("nazarene")) return "Nazarene";
  if (/\b(iglesia del nazareno)\b/.test(lower)) return "Nazarene";

  // ── Quaker / Friends ──────────────────────────────────
  if (lower.includes("quaker") || lower.includes("friends meeting") || lower.includes("society of friends") || lower.includes("friends church")) return "Quaker";

  // ── Mennonite / Amish / Brethren ──────────────────────
  if (lower.includes("mennonite")) return "Mennonite";
  if (lower.includes("amish")) return "Amish";
  if (lower.includes("church of the brethren") || lower.includes("brethren in christ")) return "Mennonite";
  if (/\bbrethren\b/.test(lower) && !lower.includes("plymouth")) return "Mennonite";
  if (lower.includes("hutterite")) return "Mennonite";

  // ── Covenant ──────────────────────────────────────────
  if (lower.includes("covenant") && !lower.includes("ark of") && !lower.includes("old covenant")) return "Covenant";

  // ── Reformed ──────────────────────────────────────────
  if (lower.includes("reformed") && !lower.includes("latter")) return "Reformed";
  if (lower.includes("crc") || lower.includes("christian reformed")) return "Reformed";
  if (lower.includes("dutch reformed") || lower.includes("rca")) return "Reformed";

  // ── Unitarian ─────────────────────────────────────────
  if (lower.includes("unitarian") || lower.includes("universalist")) return "Unitarian";

  // ── Christian Science ─────────────────────────────────
  if (lower.includes("christian science") || lower.includes("scientist")) return "Christian Science";

  // ── Salvation Army ────────────────────────────────────
  if (lower.includes("salvation army") || lower.includes("ejército de salvación") || lower.includes("ejercito de salvacion")) return "Salvation Army";

  // ── Disciples of Christ ───────────────────────────────
  if (lower.includes("disciples of christ") || lower.includes("christian church (disciples")) return "Disciples of Christ";

  // ── Last-resort name-based heuristics ─────────────────
  // Generic Spanish church names that didn't match anything specific → likely Non-denominational
  if (/\b(iglesia|templo|ministerio|centro de adoración|centro de adoracion|mision cristiana|misión cristiana)\b/.test(lower) &&
      !lower.includes("catholic") && !lower.includes("catolica") && !lower.includes("católica")) return "Non-denominational";
  // English generic patterns
  if (/\b(house of worship|house of prayer|house of praise|tabernacle of)\b/.test(lower)) return "Non-denominational";
  if (/\b(the gathering|the well|the way church|the vine|the church of)\b/.test(lower) && !lower.includes("latter") && !lower.includes("christ,") && !lower.includes("nazarene") && !lower.includes("god")) return "Non-denominational";

  return null;
}

// Normalize denomination from all available OSM tags
function normalizeDenomination(tags: Record<string, string>): string {
  // 1. Check the explicit denomination tag first (most reliable)
  if (tags.denomination) {
    const fromDenom = matchDenomination(tags.denomination);
    if (fromDenom) return fromDenom;
    // If denomination tag exists but didn't match our known list, clean it up
    const cleaned = tags.denomination
      .replace(/_/g, " ")
      .replace(/\b\w/g, (l: string) => l.toUpperCase())
      .substring(0, 40);
    if (cleaned && cleaned !== "Unknown" && cleaned !== "Other") return cleaned;
  }

  // 2. Check operator and network tags (e.g., "Southern Baptist Convention", "ELCA")
  for (const tagKey of ["operator", "network", "operator:type", "service_times:denomination"]) {
    if (tags[tagKey]) {
      const fromTag = matchDenomination(tags[tagKey]);
      if (fromTag) return fromTag;
    }
  }

  // 3. Check brand tags (some chains like LDS, Salvation Army use brand tags)
  if (tags.brand) {
    const fromBrand = matchDenomination(tags.brand);
    if (fromBrand) return fromBrand;
  }

  // 4. Parse the church NAME for denomination clues (surprisingly effective)
  const name = tags.name || tags["name:en"] || "";
  if (name) {
    const fromName = matchDenomination(name);
    if (fromName) return fromName;
  }

  // 5. Check description, note, alternate names, and website as last resort
  for (const tagKey of ["description", "note", "official_name", "alt_name", "old_name", "short_name", "loc_name", "website", "contact:website"]) {
    if (tags[tagKey]) {
      const fromTag = matchDenomination(tags[tagKey]);
      if (fromTag) return fromTag;
    }
  }

  // 6. Check if the religion tag itself has sub-info (rare but happens)
  if (tags.religion && tags.religion !== "christian" && tags.religion !== "Christianity") {
    const fromRel = matchDenomination(tags.religion);
    if (fromRel) return fromRel;
  }

  return "Non-denominational";
}

// Simple deterministic hash from a string → number between 0 and 1
function seededRandom(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    const ch = seed.charCodeAt(i);
    hash = ((hash << 5) - hash) + ch;
    hash |= 0; // Convert to 32-bit int
  }
  // Normalize to 0-1 range
  return (Math.abs(hash) % 10000) / 10000;
}

// Multi-signal attendance estimation from OSM tags.
// Uses every available clue: capacity, seats, service times, building info,
// name patterns, tag richness, denomination averages, and OSM element type.
function estimateAttendance(
  tags: Record<string, string>,
  osmId: string | number,
  elType?: string // "node", "way", or "relation"
): number {
  // ── 1. DIRECT CAPACITY DATA (most accurate when available) ──
  for (const key of ["capacity", "seats", "capacity:persons", "building:capacity"]) {
    if (tags[key]) {
      const val = parseInt(tags[key]);
      if (!isNaN(val) && val > 0) {
        // Seats/capacity → ~60% fill rate for average weekly attendance
        const attendance = Math.round(val * 0.6);
        const serviceCount = countServices(tags);
        return Math.max(10, Math.min(Math.round(attendance * Math.max(1, serviceCount * 0.7)), 15000));
      }
    }
  }

  // ── 2. DENOMINATION BASELINE ──
  // Medians from real US church data (National Congregations Study, ARDA)
  const denom = normalizeDenomination(tags);
  const name = (tags.name || "").toLowerCase();

  const denomMedians: Record<string, number> = {
    "Catholic":              800,
    "Baptist":               85,
    "Methodist":             70,
    "Lutheran":              75,
    "Presbyterian":          75,
    "Episcopal":             60,
    "Pentecostal":           75,
    "Assemblies of God":     100,
    "Non-denominational":    120,
    "Latter-day Saints":     180,
    "Church of Christ":      65,
    "Church of God":         70,
    "Orthodox":              60,
    "Seventh-day Adventist": 55,
    "Evangelical":           100,
    "Jehovah's Witnesses":   70,
    "Nazarene":              65,
    "Congregational":        55,
    "Mennonite":             55,
    "Amish":                 80,
    "Reformed":              75,
    "Salvation Army":        35,
    "Christian Science":     25,
    "Unitarian":             50,
    "Quaker":                25,
    "Covenant":              80,
    "Disciples of Christ":   70,
  };

  let estimate = denomMedians[denom] || 65;

  // ── 3. MULTI-SIGNAL ADJUSTMENTS (multiplicative) ──
  let multiplier = 1.0;

  // 3a. Name-based size signals
  if (name.includes("cathedral") || name.includes("basilica")) {
    multiplier *= 3.0;
  } else if (name.includes("tabernacle") || name.includes("temple")) {
    multiplier *= 1.6;
  } else if (/\b(mega|megachurch)\b/.test(name)) {
    multiplier *= 8.0;
  } else if (name.includes("worship center") || name.includes("worship centre")) {
    multiplier *= 1.8;
  }

  if (/^first\s/.test(name) || /\bfirst (baptist|methodist|lutheran|presbyterian|christian|church)\b/.test(name)) {
    multiplier *= 1.5; // "First [Denomination]" = oldest & largest in town
  }
  if (/^greater\s/.test(name)) {
    multiplier *= 1.5; // "Greater" prefix = larger Black churches
  }
  if (name.includes("chapel") || name.includes("capilla")) {
    multiplier *= 0.45;
  } else if (/\b(mission|misión)\b/.test(name) && !name.includes("missionary")) {
    multiplier *= 0.55;
  } else if (/\b(little|small)\b/.test(name)) {
    multiplier *= 0.4;
  } else if (name.includes("house church") || name.includes("home church")) {
    multiplier *= 0.2;
  }
  if (/\bfellowship\b/.test(name) && !name.includes("fellowship church")) {
    multiplier *= 0.8;
  }
  // Known megachurch brands
  if (/\b(saddleback|lakewood|elevation|life\.?church|north ?point|willow creek|calvary chapel costa mesa|gateway church|church of the highlands)\b/.test(name)) {
    multiplier *= 10.0;
  }

  // 3b. Multiple service times = bigger church
  const serviceCount = countServices(tags);
  if (serviceCount >= 3) {
    multiplier *= 2.0;
  } else if (serviceCount === 2) {
    multiplier *= 1.5;
  }

  // 3c. OSM element type — way/relation = traced building = more prominent
  if (elType === "way" || elType === "relation") {
    multiplier *= 1.1;
  }

  // 3d. Tag richness — well-mapped = more notable church
  const tagCount = Object.keys(tags).length;
  if (tagCount >= 15) {
    multiplier *= 1.3;
  } else if (tagCount >= 10) {
    multiplier *= 1.15;
  } else if (tagCount <= 3) {
    multiplier *= 0.8;
  }

  // 3e. Has a website → more established
  if (tags.website || tags["contact:website"]) {
    multiplier *= 1.15;
  }

  // 3f. Has a phone number → more established
  if (tags.phone || tags["contact:phone"]) {
    multiplier *= 1.1;
  }

  // 3g. Wikipedia/Wikidata → notable enough for encyclopedia
  if (tags.wikidata || tags.wikipedia) {
    multiplier *= 2.0;
  }

  // 3h. Wheelchair accessibility → larger, modern facility
  if (tags.wheelchair === "yes") {
    multiplier *= 1.15;
  }

  // 3i. Building levels — multi-story = bigger
  if (tags["building:levels"]) {
    const levels = parseInt(tags["building:levels"]);
    if (!isNaN(levels) && levels > 1) {
      multiplier *= 1.0 + (levels - 1) * 0.2;
    }
  }

  // 3j. Parking capacity — strong signal (~2.5 people per car)
  if (tags["parking:capacity"] || tags["capacity:parking"]) {
    const parking = parseInt(tags["parking:capacity"] || tags["capacity:parking"] || "0");
    if (!isNaN(parking) && parking > 0) {
      const parkingEstimate = Math.round(parking * 2.5);
      estimate = estimate * 0.3 + parkingEstimate * 0.7;
    }
  }

  // 3k. Has opening_hours → active congregation
  if (tags.opening_hours) {
    multiplier *= 1.05;
  }

  // 3l. Historic marker — old building often = smaller modern congregation
  if (tags.historic || tags.heritage) {
    multiplier *= 0.8;
  }

  // Cap multiplier for non-megachurches
  if (!/\b(saddleback|lakewood|elevation|life\.?church|north ?point|willow creek|gateway church|church of the highlands)\b/.test(name)) {
    multiplier = Math.min(multiplier, 6.0);
  }

  // ── 4. APPLY MULTIPLIER + SMALL DETERMINISTIC VARIANCE (±15%) ──
  const rand = seededRandom(String(osmId));
  const variance = 0.85 + rand * 0.30;

  const final = Math.round(estimate * multiplier * variance);
  return Math.max(10, Math.min(final, 25000));
}

// Count distinct service times from OSM tags
function countServices(tags: Record<string, string>): number {
  const st = tags.service_times || tags["service_times:sunday"] || "";
  if (!st) return 0;
  const times = st.split(/[,;]/).filter((s: string) => /\d{1,2}:\d{2}/.test(s));
  return times.length;
}

// Extract city from various OSM tags
function extractCity(tags: Record<string, string>): string {
  // Direct address tags (most reliable)
  if (tags["addr:city"]) return tags["addr:city"];
  if (tags["addr:town"]) return tags["addr:town"];
  if (tags["addr:village"]) return tags["addr:village"];
  if (tags["addr:hamlet"]) return tags["addr:hamlet"];
  if (tags["addr:suburb"]) return tags["addr:suburb"];

  // is_in tags (sometimes present)
  if (tags["is_in:city"]) return tags["is_in:city"];
  if (tags["is_in:town"]) return tags["is_in:town"];
  if (tags["is_in:village"]) return tags["is_in:village"];

  // Generic is_in often contains "City, County, State" format
  if (tags["is_in"]) {
    const parts = tags["is_in"].split(",").map((p: string) => p.trim());
    if (parts.length > 0 && parts[0]) return parts[0];
  }

  // addr:place can sometimes have locality info
  if (tags["addr:place"]) return tags["addr:place"];

  return "";
}

// Fetch from an Overpass endpoint with timeout
async function fetchOverpassWithTimeout(
  endpoint: string,
  query: string,
  timeoutMs: number = 60000
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `data=${encodeURIComponent(query)}`,
      signal: controller.signal,
    });
    return resp;
  } finally {
    clearTimeout(timer);
  }
}

// Try all Overpass mirrors with automatic retry and backoff
async function queryOverpassWithFallback(query: string, stateAbbrev: string): Promise<any[]> {
  const MAX_RETRIES = 1; // Reduced retries to stay within edge function time limit
  const errors: string[] = [];

  for (const endpoint of OVERPASS_ENDPOINTS) {
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        console.log(
          `Trying Overpass endpoint ${endpoint} for ${stateAbbrev} (attempt ${attempt + 1})...`
        );

        const response = await fetchOverpassWithTimeout(endpoint, query);

        if (response.status === 429 || response.status === 504) {
          // Rate-limited or gateway timeout — wait and retry or try next mirror
          const waitSec = (attempt + 1) * 3;
          console.log(
            `Rate limited (${response.status}) at ${endpoint}, waiting ${waitSec}s before retry...`
          );
          await new Promise((r) => setTimeout(r, waitSec * 1000));
          continue;
        }

        if (!response.ok) {
          const text = await response.text().catch(() => "");
          errors.push(`${endpoint}: ${response.status} - ${text.substring(0, 100)}`);
          break; // Try next mirror
        }

        const data = await response.json();
        return data.elements || [];
      } catch (e: any) {
        const msg = e?.name === "AbortError" ? "timeout" : String(e);
        console.log(`Error at ${endpoint} attempt ${attempt + 1}: ${msg}`);
        errors.push(`${endpoint}: ${msg}`);
        if (e?.name === "AbortError") break; // Timeout — try next mirror
        // Network error — small wait then retry
        await new Promise((r) => setTimeout(r, 1000));
      }
    }
  }

  throw new Error(
    `All Overpass mirrors failed for ${stateAbbrev}. Errors: ${errors.join(" | ")}`
  );
}

// Build an Overpass query for a given area (ISO code or bounding box)
function buildOverpassQuery(
  isoCode: string,
  bbox?: [number, number, number, number]
): string {
  if (bbox) {
    const [south, west, north, east] = bbox;
    return `
      [out:json][timeout:90];
      area["ISO3166-2"="${isoCode}"]->.searchArea;
      (
        node["amenity"="place_of_worship"]["religion"="christian"](area.searchArea)(${south},${west},${north},${east});
        way["amenity"="place_of_worship"]["religion"="christian"](area.searchArea)(${south},${west},${north},${east});
        relation["amenity"="place_of_worship"]["religion"="christian"](area.searchArea)(${south},${west},${north},${east});
      );
      out center;
    `;
  }
  return `
    [out:json][timeout:90];
    area["ISO3166-2"="${isoCode}"]->.searchArea;
    (
      node["amenity"="place_of_worship"]["religion"="christian"](area.searchArea);
      way["amenity"="place_of_worship"]["religion"="christian"](area.searchArea);
      relation["amenity"="place_of_worship"]["religion"="christian"](area.searchArea);
    );
    out center;
  `;
}

// Split a bounding box into quadrants
function splitBounds(
  bounds: [number, number, number, number]
): [number, number, number, number][] {
  const [south, west, north, east] = bounds;
  const midLat = (south + north) / 2;
  const midLng = (west + east) / 2;
  return [
    [south, west, midLat, midLng],     // SW
    [south, midLng, midLat, east],     // SE
    [midLat, west, north, midLng],     // NW
    [midLat, midLng, north, east],     // NE
  ];
}

// Parse OSM elements into church objects, filtering to state bounding box
function parseChurchElements(elements: any[], stateAbbrev: string): any[] {
  const bounds = STATE_BOUNDS[stateAbbrev.toUpperCase()];

  return elements
    .map((el: any, idx: number) => {
      const lat = el.lat || el.center?.lat;
      const lng = el.lon || el.center?.lon;
      if (!lat || !lng) return null;

      // Filter out churches whose center point falls outside the state bounding box
      // (can happen with ways/relations whose computed center drifts across borders)
      if (bounds) {
        const [south, west, north, east] = bounds;
        // Small margin (0.01°≈1km) to avoid clipping legitimate border churches
        const margin = 0.01;
        if (lat < south - margin || lat > north + margin || lng < west - margin || lng > east + margin) {
          return null;
        }
      }

      const tags = el.tags || {};
      return {
        id: `${stateAbbrev}-${el.id || idx}`,
        name: tags.name || tags["name:en"] || "Unnamed Church",
        lat,
        lng,
        denomination: normalizeDenomination(tags),
        attendance: estimateAttendance(tags, el.id, el.type),
        state: stateAbbrev.toUpperCase(),
        city: extractCity(tags),
        address: tags["addr:street"]
          ? `${tags["addr:housenumber"] || ""} ${tags["addr:street"]}`.trim()
          : "",
        website: tags.website || tags["contact:website"] || "",
      };
    })
    .filter(Boolean);
}

// Fetch churches from Overpass API for a state — no result limit.
// Large states are automatically split into geographic quadrants to avoid timeouts.
async function fetchChurchesFromOverpass(
  stateAbbrev: string
): Promise<any[]> {
  const stateInfo = getStateByAbbrev(stateAbbrev);
  if (!stateInfo) throw new Error(`Unknown state: ${stateAbbrev}`);

  const isoCode = `US-${stateAbbrev.toUpperCase()}`;
  const isLarge = LARGE_STATES.has(stateAbbrev.toUpperCase());
  const bounds = STATE_BOUNDS[stateAbbrev.toUpperCase()];

  if (isLarge && bounds) {
    // Split large states into quadrants and query each separately
    const quadrants = splitBounds(bounds);
    console.log(
      `Large state ${stateInfo.name} — fetching in ${quadrants.length} quadrants...`
    );

    const seenIds = new Set<string>();
    let allChurches: any[] = [];

    for (let i = 0; i < quadrants.length; i++) {
      const q = buildOverpassQuery(isoCode, quadrants[i]);
      console.log(
        `  Quadrant ${i + 1}/${quadrants.length} for ${stateInfo.name}...`
      );

      try {
        const elements = await queryOverpassWithFallback(q, `${stateAbbrev}-Q${i + 1}`);
        const churches = parseChurchElements(elements, stateAbbrev);

        // Deduplicate by OSM element ID
        for (const ch of churches) {
          if (!seenIds.has(ch.id)) {
            seenIds.add(ch.id);
            allChurches.push(ch);
          }
        }

        console.log(
          `  Quadrant ${i + 1}: ${elements.length} raw → ${allChurches.length} total unique`
        );
      } catch (err) {
        console.log(`  Quadrant ${i + 1} failed: ${err}. Continuing with others...`);
        // Continue with remaining quadrants even if one fails
      }

      // Brief pause between quadrants to avoid rate limits
      if (i < quadrants.length - 1) {
        await new Promise((r) => setTimeout(r, 500));
      }
    }

    console.log(
      `Completed ${stateInfo.name}: ${allChurches.length} total churches across all quadrants`
    );
    return allChurches;
  }

  // Smaller states — single query, no limit
  const query = buildOverpassQuery(isoCode);
  console.log(`Fetching churches for ${stateInfo.name} (${isoCode})...`);

  const elements = await queryOverpassWithFallback(query, stateAbbrev);

  console.log(
    `Received ${elements.length} results from Overpass for ${stateInfo.name}`
  );

  let churches = parseChurchElements(elements, stateAbbrev);

  // DC is folded into Maryland — also fetch DC churches when populating MD
  if (stateAbbrev.toUpperCase() === "MD") {
    try {
      console.log(`Also fetching DC churches to fold into Maryland...`);
      const dcQuery = buildOverpassQuery("US-DC");
      const dcElements = await queryOverpassWithFallback(dcQuery, "DC");
      const dcChurches = parseChurchElements(dcElements, "MD"); // Tag as MD
      console.log(`Fetched ${dcChurches.length} DC churches to merge into Maryland`);

      // Deduplicate by ID
      const seenIds = new Set(churches.map((ch: any) => ch.id));
      for (const ch of dcChurches) {
        if (!seenIds.has(ch.id)) {
          seenIds.add(ch.id);
          churches.push(ch);
        }
      }
      console.log(`Maryland total after DC merge: ${churches.length} churches`);
    } catch (err) {
      console.log(`Failed to fetch DC churches for Maryland merge: ${err}. Continuing with MD only.`);
    }
  }

  return churches;
}

// GET /churches/states - List all states with their church counts
app.get("/make-server-283d8046/churches/states", async (c) => {
  try {
    const meta = await kv.get("churches:meta");
    const stateCounts: Record<string, number> = { ...(meta?.stateCounts || {}) };

    // Fold DC's church count into Maryland
    if (stateCounts["DC"]) {
      stateCounts["MD"] = (stateCounts["MD"] || 0) + stateCounts["DC"];
      delete stateCounts["DC"];
    }

    const states = US_STATES.map((s) => ({
      ...s,
      churchCount: stateCounts[s.abbrev] || 0,
      isPopulated: !!stateCounts[s.abbrev],
    }));

    return c.json({
      states,
      totalChurches: Object.values(stateCounts).reduce(
        (a: number, b: number) => a + b,
        0
      ),
      populatedStates: Object.keys(stateCounts).length,
    });
  } catch (error) {
    console.log(`Error fetching states list: ${error}`);
    return c.json({ error: `Failed to fetch states: ${error}` }, 500);
  }
});

// GET /churches/search?q=... - Search churches across all populated states
// Uses the lightweight search index (churches:sidx:{STATE}) instead of full church data.
// IMPORTANT: Must be registered BEFORE /churches/:state to avoid matching "search" as a state.
app.get("/make-server-283d8046/churches/search", async (c) => {
  try {
    const rawQ = c.req.query("q") || "";
    const q = rawQ.toLowerCase().trim();
    if (!q || q.length < 2) {
      return c.json({ results: [], query: rawQ });
    }
    const tokens = q.split(/\s+/).filter(Boolean);
    const limit = Math.min(parseInt(c.req.query("limit") || "10"), 25);

    const meta = await kv.get("churches:meta");
    const stateCounts: Record<string, number> = { ...(meta?.stateCounts || {}) };
    // Fold DC into Maryland for search purposes
    if (stateCounts["DC"]) {
      stateCounts["MD"] = (stateCounts["MD"] || 0) + stateCounts["DC"];
      delete stateCounts["DC"];
    }
    const populatedStates = Object.keys(stateCounts);

    if (populatedStates.length === 0) {
      return c.json({ results: [], query: rawQ, message: "No states populated yet." });
    }

    // Optional explicit state filter via query param
    let stateParam = (c.req.query("state") || "").toUpperCase().trim();
    if (stateParam === "DC") stateParam = "MD";

    // Build reverse lookup: lowercase state name/abbrev → uppercase abbrev
    const stateNameToAbbrev: Record<string, string> = {};
    for (const s of US_STATES) {
      stateNameToAbbrev[s.abbrev.toLowerCase()] = s.abbrev;
      stateNameToAbbrev[s.name.toLowerCase()] = s.abbrev;
    }
    // Map DC-related terms to Maryland
    stateNameToAbbrev["dc"] = "MD";
    stateNameToAbbrev["d.c."] = "MD";
    stateNameToAbbrev["district of columbia"] = "MD";

    // Determine target states and search tokens
    let targetStates: string[] = populatedStates;
    let searchTokens = tokens;

    if (stateParam && populatedStates.includes(stateParam)) {
      // Explicit state param — search only that state
      targetStates = [stateParam];
    } else {
      // Auto-detect state references in tokens
      const detectedStates: string[] = [];
      const textTokens: string[] = [];

      // Check for multi-word state names first (e.g. "new york", "north carolina")
      const fullQ = tokens.join(" ");
      const consumedTokenIndices = new Set<number>();

      for (const s of US_STATES) {
        const lowerName = s.name.toLowerCase();
        if (lowerName.includes(" ") && fullQ.includes(lowerName) && populatedStates.includes(s.abbrev)) {
          if (!detectedStates.includes(s.abbrev)) {
            detectedStates.push(s.abbrev);
          }
          // Mark which tokens belong to this state name
          const stateWords = lowerName.split(" ");
          let searchFrom = 0;
          for (const sw of stateWords) {
            for (let ti = searchFrom; ti < tokens.length; ti++) {
              if (!consumedTokenIndices.has(ti) && tokens[ti] === sw) {
                consumedTokenIndices.add(ti);
                searchFrom = ti + 1;
                break;
              }
            }
          }
        }
      }

      // Check remaining tokens for single-word state names/abbreviations
      for (let ti = 0; ti < tokens.length; ti++) {
        if (consumedTokenIndices.has(ti)) continue;
        const matched = stateNameToAbbrev[tokens[ti]];
        if (matched && populatedStates.includes(matched)) {
          detectedStates.push(matched);
          consumedTokenIndices.add(ti);
        } else {
          textTokens.push(tokens[ti]);
        }
      }

      if (detectedStates.length > 0) {
        targetStates = [...new Set(detectedStates)];
        searchTokens = textTokens;
      }
    }

    // Read lightweight search indexes only for target states
    // Also include DC index when searching MD (backward compat for separately-stored DC data)
    const expandedStates = [...targetStates];
    if (targetStates.includes("MD") && !targetStates.includes("DC")) {
      expandedStates.push("DC");
    }
    const idxKeys = expandedStates.map((s: string) => `churches:sidx:${s}`);
    const allIndexes = await kv.mget(idxKeys);

    // Fallback to full data if no indexes exist yet
    const hasSomeIndex = allIndexes.some((idx: any) => Array.isArray(idx) && idx.length > 0);
    let fallbackData: any[] | null = null;
    if (!hasSomeIndex) {
      console.log("Search: no search indexes found, falling back to full church data");
      const fallbackKeys = expandedStates.map((s: string) => `churches:${s}`);
      fallbackData = await kv.mget(fallbackKeys);
    }

    type SearchHit = {
      id: string;
      name: string;
      city: string;
      state: string;
      denomination: string;
      attendance: number;
      lat: number;
      lng: number;
      address: string;
    };
    const results: SearchHit[] = [];
    // Deduplicate by normalized name+city+state — OSM often maps same church as both node and way
    const seenKeys = new Set<string>();
    function dedupKey(name: string, city: string, st: string): string {
      return `${name.toLowerCase().replace(/[^a-z0-9]/g, "")}|${city.toLowerCase().replace(/[^a-z0-9]/g, "")}|${st}`;
    }
    function addResult(hit: SearchHit): boolean {
      const key = dedupKey(hit.name, hit.city, hit.state);
      if (seenKeys.has(key)) return false;
      seenKeys.add(key);
      results.push(hit);
      return true;
    }

    for (let i = 0; i < expandedStates.length; i++) {
      if (results.length >= limit) break;
      const stateAbbrev = expandedStates[i] === "DC" ? "MD" : expandedStates[i];

      const idx = allIndexes[i];
      if (Array.isArray(idx) && idx.length > 0) {
        for (const entry of idx) {
          if (results.length >= limit) break;
          if (searchTokens.length === 0) {
            addResult({
              id: entry.id,
              name: entry.n || "Unknown Church",
              city: entry.c,
              state: stateAbbrev,
              denomination: entry.d || "Unknown",
              attendance: entry.a || 0,
              lat: entry.la || 0,
              lng: entry.lo || 0,
              address: entry.ad || "",
            });
          } else {
            const haystack = `${entry.n} ${entry.c} ${entry.d} ${entry.ad}`.toLowerCase();
            if (searchTokens.every((t: string) => haystack.includes(t))) {
              addResult({
                id: entry.id,
                name: entry.n || "Unknown Church",
                city: entry.c,
                state: stateAbbrev,
                denomination: entry.d || "Unknown",
                attendance: entry.a || 0,
                lat: entry.la || 0,
                lng: entry.lo || 0,
                address: entry.ad || "",
              });
            }
          }
        }
      } else if (fallbackData) {
        const churches = fallbackData[i];
        if (!Array.isArray(churches)) continue;
        for (const ch of churches) {
          if (results.length >= limit) break;
          if (searchTokens.length === 0) {
            addResult({
              id: ch.id,
              name: ch.name || "Unknown Church",
              city: ch.city || "",
              state: stateAbbrev,
              denomination: ch.denomination || "Unknown",
              attendance: ch.attendance || 0,
              lat: ch.lat || 0,
              lng: ch.lng || 0,
              address: ch.address || "",
            });
          } else {
            const haystack = `${ch.name || ""} ${ch.city || ""} ${ch.denomination || ""} ${ch.address || ""}`.toLowerCase();
            if (searchTokens.every((t: string) => haystack.includes(t))) {
              addResult({
                id: ch.id,
                name: ch.name || "Unknown Church",
                city: ch.city || "",
                state: stateAbbrev,
                denomination: ch.denomination || "Unknown",
                attendance: ch.attendance || 0,
                lat: ch.lat || 0,
                lng: ch.lng || 0,
                address: ch.address || "",
              });
            }
          }
        }
      }
    }

    return c.json({
      results,
      query: rawQ,
      statesSearched: targetStates.length,
      stateFilter: targetStates.length < populatedStates.length ? targetStates : undefined,
    });
  } catch (error) {
    console.log(`Error searching churches: ${error}`);
    return c.json({ error: `Search failed: ${error}` }, 500);
  }
});

// GET /churches/:state - Get churches for a specific state
app.get("/make-server-283d8046/churches/:state", async (c) => {
  try {
    const stateAbbrev = c.req.param("state").toUpperCase();
    const stateInfo = getStateByAbbrev(stateAbbrev);
    if (!stateInfo) {
      return c.json({ error: `Unknown state: ${stateAbbrev}` }, 400);
    }

    // Check if we already have data
    let churches = await kv.get(`churches:${stateAbbrev}`);

    if (!churches || (Array.isArray(churches) && churches.length === 0)) {
      return c.json({
        churches: [],
        state: stateInfo,
        fromCache: false,
        message: `No data for ${stateInfo.name}. Use POST /churches/populate/${stateAbbrev} to fetch from OpenStreetMap.`,
      });
    }

    // For Maryland, also merge any separately-stored DC churches (backward compat)
    if (stateAbbrev === "MD") {
      try {
        const dcChurches = await kv.get("churches:DC");
        if (dcChurches && Array.isArray(dcChurches) && dcChurches.length > 0) {
          const seenIds = new Set(churches.map((ch: any) => ch.id));
          let merged = 0;
          for (const ch of dcChurches) {
            if (!seenIds.has(ch.id)) {
              seenIds.add(ch.id);
              churches.push({ ...ch, state: "MD" });
              merged++;
            }
          }
          if (merged > 0) {
            console.log(`Merged ${merged} DC churches into Maryland response`);
          }
        }
      } catch (err) {
        console.log(`Error merging DC churches into MD: ${err}`);
      }
    }

    return c.json({
      churches,
      state: stateInfo,
      count: churches.length,
      fromCache: true,
    });
  } catch (error) {
    console.log(`Error fetching churches for state: ${error}`);
    return c.json({ error: `Failed to fetch churches: ${error}` }, 500);
  }
});

// POST /churches/populate/:state - Populate churches for a state from Overpass API
app.post("/make-server-283d8046/churches/populate/:state", async (c) => {
  try {
    const stateAbbrev = c.req.param("state").toUpperCase();
    const stateInfo = getStateByAbbrev(stateAbbrev);
    if (!stateInfo) {
      return c.json({ error: `Unknown state: ${stateAbbrev}` }, 400);
    }

    // Check if already populated (skip if force=true)
    const force = c.req.query("force") === "true";
    const existing = await kv.get(`churches:${stateAbbrev}`);
    if (!force && existing && Array.isArray(existing) && existing.length > 0) {
      return c.json({
        message: `${stateInfo.name} already has ${existing.length} churches cached.`,
        count: existing.length,
        alreadyCached: true,
      });
    }

    if (force && existing) {
      console.log(`Force refresh for ${stateInfo.name} — clearing ${Array.isArray(existing) ? existing.length : 0} cached churches...`);
    }

    console.log(`Starting population for ${stateInfo.name}...`);

    const churches = await fetchChurchesFromOverpass(stateAbbrev);

    // Cross-reference with ARDA data to refine attendance estimates & analyze coverage
    const ardaResult = enrichWithARDA(stateAbbrev, churches);
    console.log(
      `ARDA cross-reference for ${stateInfo.name}: refined ${ardaResult.enriched}/${churches.length} attendance estimates, ` +
      `coverage ${ardaResult.coverageAnalysis.coveragePercent}% of ARDA expected (${ardaResult.coverageAnalysis.actualTotal}/${ardaResult.coverageAnalysis.expectedTotal})`
    );
    if (ardaResult.coverageAnalysis.denominationGaps.length > 0) {
      console.log(
        `  Top denomination gaps: ${ardaResult.coverageAnalysis.denominationGaps.slice(0, 3).map(g => `${g.denomination} (expected ~${g.expected}, have ${g.actual})`).join(", ")}`
      );
    }

    // Store in KV
    await kv.set(`churches:${stateAbbrev}`, churches);

    // Write lightweight search index (name/city/denom/attendance only)
    await writeSearchIndex(stateAbbrev, churches);

    // Update metadata
    const meta = (await kv.get("churches:meta")) || { stateCounts: {} };
    meta.stateCounts[stateAbbrev] = churches.length;
    meta.lastUpdated = new Date().toISOString();
    await kv.set("churches:meta", meta);

    console.log(
      `Successfully stored ${churches.length} churches for ${stateInfo.name}`
    );

    return c.json({
      message: `Successfully populated ${churches.length} churches for ${stateInfo.name}`,
      count: churches.length,
      state: stateInfo,
      ardaCrossReference: {
        enrichedCount: ardaResult.enriched,
        coveragePercent: ardaResult.coverageAnalysis.coveragePercent,
        expectedTotal: ardaResult.coverageAnalysis.expectedTotal,
        topGaps: ardaResult.coverageAnalysis.denominationGaps.slice(0, 5),
      },
    });
  } catch (error) {
    console.log(`Error populating churches for state: ${error}`);
    return c.json(
      { error: `Failed to populate churches: ${error}` },
      500
    );
  }
});

// GET /churches/denominations/all - Get all unique denominations across populated states
app.get("/make-server-283d8046/churches/denominations/all", async (c) => {
  try {
    const meta = await kv.get("churches:meta");
    const stateCounts: Record<string, number> = meta?.stateCounts || {};
    const populatedStates = Object.keys(stateCounts);

    if (populatedStates.length === 0) {
      return c.json({ denominations: [], message: "No states populated yet." });
    }

    const denomCounts: Record<string, number> = {};

    // Fetch each populated state's churches
    for (const state of populatedStates) {
      const churches = await kv.get(`churches:${state}`);
      if (Array.isArray(churches)) {
        for (const ch of churches) {
          const d = ch.denomination || "Unknown";
          denomCounts[d] = (denomCounts[d] || 0) + 1;
        }
      }
    }

    const denominations = Object.entries(denomCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([name, count]) => ({ name, count }));

    return c.json({ denominations });
  } catch (error) {
    console.log(`Error fetching denominations: ${error}`);
    return c.json({ error: `Failed to fetch denominations: ${error}` }, 500);
  }
});

// POST /churches/populate-batch - Populate multiple states at once
app.post("/make-server-283d8046/churches/populate-batch", async (c) => {
  try {
    const body = await c.req.json();
    const states: string[] = body.states || [];

    if (states.length === 0) {
      return c.json({ error: "No states provided" }, 400);
    }

    if (states.length > 3) {
      return c.json(
        {
          error:
            "Maximum 3 states at a time to avoid Overpass rate limits. Please populate states one at a time or in small batches.",
        },
        400
      );
    }

    const results: any[] = [];

    for (const stateAbbrev of states) {
      const upper = stateAbbrev.toUpperCase();
      const stateInfo = getStateByAbbrev(upper);
      if (!stateInfo) {
        results.push({ state: upper, error: "Unknown state" });
        continue;
      }

      // Check cache
      const existing = await kv.get(`churches:${upper}`);
      if (existing && Array.isArray(existing) && existing.length > 0) {
        results.push({
          state: upper,
          count: existing.length,
          alreadyCached: true,
        });
        continue;
      }

      try {
        const churches = await fetchChurchesFromOverpass(upper);

        // ARDA cross-reference enrichment
        const ardaResult = enrichWithARDA(upper, churches);
        console.log(`ARDA enrichment for ${upper}: refined ${ardaResult.enriched}/${churches.length}, coverage ${ardaResult.coverageAnalysis.coveragePercent}%`);

        await kv.set(`churches:${upper}`, churches);
        await writeSearchIndex(upper, churches);

        const meta = (await kv.get("churches:meta")) || { stateCounts: {} };
        meta.stateCounts[upper] = churches.length;
        meta.lastUpdated = new Date().toISOString();
        await kv.set("churches:meta", meta);

        results.push({ state: upper, count: churches.length, success: true });
      } catch (err) {
        results.push({ state: upper, error: String(err) });
      }

      // Small delay between states to be nice to Overpass
      await new Promise((r) => setTimeout(r, 2000));
    }

    return c.json({ results });
  } catch (error) {
    console.log(`Error in batch populate: ${error}`);
    return c.json({ error: `Batch populate failed: ${error}` }, 500);
  }
});

// POST /churches/search/rebuild-index - Backfill search indexes for already-populated states
app.post("/make-server-283d8046/churches/search/rebuild-index", async (c) => {
  try {
    const meta = await kv.get("churches:meta");
    const stateCounts: Record<string, number> = meta?.stateCounts || {};
    const populatedStates = Object.keys(stateCounts);

    if (populatedStates.length === 0) {
      return c.json({ message: "No states populated yet.", rebuilt: 0 });
    }

    let rebuilt = 0;
    for (const state of populatedStates) {
      const churches = await kv.get(`churches:${state}`);
      if (Array.isArray(churches) && churches.length > 0) {
        await writeSearchIndex(state, churches);
        rebuilt++;
        console.log(`Rebuilt search index for ${state}: ${churches.length} entries`);
      }
    }

    return c.json({ message: `Rebuilt search indexes for ${rebuilt} states`, rebuilt });
  } catch (error) {
    console.log(`Error rebuilding search indexes: ${error}`);
    return c.json({ error: `Failed to rebuild indexes: ${error}` }, 500);
  }
});

// ── COMMUNITY SUGGESTIONS (consensus-based corrections) ──
// Requires 3+ unique IPs to agree before a correction is applied.
// Attendance corrections are averaged; text fields require exact match.

const SUGGESTION_THRESHOLD = 3; // Min unique IPs needed for consensus

interface Suggestion {
  ip: string;
  field: "website" | "address" | "attendance" | "denomination" | "serviceTimes" | "languages" | "ministries" | "pastorName" | "phone" | "email";
  value: string;
  timestamp: number;
}

interface SuggestionStore {
  submissions: Suggestion[];
}

function getClientIp(c: any): string {
  return (
    c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ||
    c.req.header("x-real-ip") ||
    c.req.header("cf-connecting-ip") ||
    "unknown"
  );
}

// Compute consensus from submissions
function computeConsensus(submissions: Suggestion[]) {
  const fields = ["website", "address", "attendance", "denomination", "serviceTimes", "languages", "ministries", "pastorName", "phone", "email"] as const;
  const result: Record<string, {
    approved: boolean;
    value: string | null;
    votes: number;
    needed: number;
    submissions: { value: string; count: number }[];
  }> = {};

  for (const field of fields) {
    const fieldSubs = submissions.filter((s) => s.field === field);
    // Deduplicate by IP (keep latest per IP)
    const byIp = new Map<string, Suggestion>();
    for (const s of fieldSubs) {
      const existing = byIp.get(s.ip);
      if (!existing || s.timestamp > existing.timestamp) {
        byIp.set(s.ip, s);
      }
    }
    const uniqueSubs = Array.from(byIp.values());

    if (field === "attendance") {
      // Attendance: average all unique-IP submissions once threshold met
      const votes = uniqueSubs.length;
      const values = uniqueSubs.map((s) => parseFloat(s.value)).filter((v) => !isNaN(v));
      const avg = values.length > 0 ? Math.round(values.reduce((a, b) => a + b, 0) / values.length) : null;

      // Group by value for display
      const valueCounts = new Map<string, number>();
      for (const s of uniqueSubs) {
        valueCounts.set(s.value, (valueCounts.get(s.value) || 0) + 1);
      }

      result[field] = {
        approved: votes >= SUGGESTION_THRESHOLD && avg !== null,
        value: votes >= SUGGESTION_THRESHOLD && avg !== null ? String(avg) : null,
        votes,
        needed: SUGGESTION_THRESHOLD,
        submissions: Array.from(valueCounts.entries())
          .map(([value, count]) => ({ value, count }))
          .sort((a, b) => b.count - a.count),
      };
    } else {
      // Text fields: need exact match from 3+ unique IPs
      const valueCounts = new Map<string, number>();
      for (const s of uniqueSubs) {
        const normalized = s.value.trim().toLowerCase();
        valueCounts.set(normalized, (valueCounts.get(normalized) || 0) + 1);
      }

      let approvedValue: string | null = null;
      let maxVotes = 0;
      for (const [val, count] of valueCounts) {
        if (count >= SUGGESTION_THRESHOLD && count > maxVotes) {
          // Use the original-cased version from the latest submission
          approvedValue = uniqueSubs
            .filter((s) => s.value.trim().toLowerCase() === val)
            .sort((a, b) => b.timestamp - a.timestamp)[0].value.trim();
          maxVotes = count;
        }
      }

      result[field] = {
        approved: approvedValue !== null,
        value: approvedValue,
        votes: uniqueSubs.length,
        needed: SUGGESTION_THRESHOLD,
        submissions: Array.from(valueCounts.entries())
          .map(([value, count]) => ({
            value: uniqueSubs.find((s) => s.value.trim().toLowerCase() === value)?.value.trim() || value,
            count,
          }))
          .sort((a, b) => b.count - a.count),
      };
    }
  }

  return result;
}

// POST /suggestions - Submit a community correction
app.post("/make-server-283d8046/suggestions", async (c) => {
  try {
    const ip = getClientIp(c);
    const body = await c.req.json();
    const { churchId, field, value } = body;

    if (!churchId || !field || value === undefined || value === null || value === "") {
      return c.json({ error: "Missing churchId, field, or value" }, 400);
    }

    const validFields = ["website", "address", "attendance", "denomination", "serviceTimes", "languages", "ministries", "pastorName", "phone", "email"];
    if (!validFields.includes(field)) {
      return c.json({ error: `Invalid field: ${field}. Must be one of: ${validFields.join(", ")}` }, 400);
    }

    // Validate attendance is a number
    if (field === "attendance") {
      const num = parseInt(value);
      if (isNaN(num) || num < 1 || num > 50000) {
        return c.json({ error: "Attendance must be a number between 1 and 50,000" }, 400);
      }
    }

    const kvKey = `suggestions:${churchId}`;
    const existing: SuggestionStore = (await kv.get(kvKey)) || { submissions: [] };

    // Check if this IP already submitted for this field recently (24h cooldown)
    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
    const recentFromIp = existing.submissions.find(
      (s) => s.ip === ip && s.field === field && s.timestamp > oneDayAgo
    );
    if (recentFromIp) {
      // Update their existing submission instead of rejecting
      recentFromIp.value = String(value).trim();
      recentFromIp.timestamp = Date.now();
    } else {
      existing.submissions.push({
        ip,
        field,
        value: String(value).trim(),
        timestamp: Date.now(),
      });
    }

    await kv.set(kvKey, existing);

    const consensus = computeConsensus(existing.submissions);

    console.log(`Suggestion for ${churchId}.${field} from ${ip}: "${value}" — ${consensus[field].votes}/${SUGGESTION_THRESHOLD} votes`);

    return c.json({
      success: true,
      field,
      consensus: consensus[field],
      allFields: consensus,
    });
  } catch (error) {
    console.log(`Error submitting suggestion: ${error}`);
    return c.json({ error: `Failed to submit suggestion: ${error}` }, 500);
  }
});

// GET /suggestions/approved/:state - Get all approved corrections for a state
// NOTE: Must be registered BEFORE the /:churchId route to avoid matching "approved" as a churchId
app.get("/make-server-283d8046/suggestions/approved/:state", async (c) => {
  try {
    const stateAbbrev = c.req.param("state").toUpperCase();
    const prefix = `suggestions:${stateAbbrev}-`;
    const allSuggestions = await kv.getByPrefix(prefix);

    const approved: Record<string, Record<string, string>> = {};

    if (Array.isArray(allSuggestions)) {
      for (const entry of allSuggestions) {
        if (!entry || !entry.value || !entry.value.submissions) continue;
        const churchId = entry.key?.replace("suggestions:", "") || "";
        const consensus = computeConsensus(entry.value.submissions);

        const corrections: Record<string, string> = {};
        for (const [field, data] of Object.entries(consensus)) {
          if (data.approved && data.value !== null) {
            corrections[field] = data.value;
          }
        }

        if (Object.keys(corrections).length > 0) {
          approved[churchId] = corrections;
        }
      }
    }

    return c.json({ state: stateAbbrev, corrections: approved });
  } catch (error) {
    console.log(`Error fetching approved corrections: ${error}`);
    return c.json({ error: `Failed to fetch approved corrections: ${error}` }, 500);
  }
});

// GET /suggestions/:churchId - Get suggestion status for a church
app.get("/make-server-283d8046/suggestions/:churchId", async (c) => {
  try {
    const churchId = c.req.param("churchId");
    const kvKey = `suggestions:${churchId}`;
    const data: SuggestionStore = (await kv.get(kvKey)) || { submissions: [] };

    const consensus = computeConsensus(data.submissions);
    const ip = getClientIp(c);

    // Check which fields this IP has already voted on
    const myVotes: Record<string, string> = {};
    for (const s of data.submissions) {
      if (s.ip === ip) {
        myVotes[s.field] = s.value;
      }
    }

    return c.json({
      churchId,
      consensus,
      myVotes,
      totalSubmissions: data.submissions.length,
    });
  } catch (error) {
    console.log(`Error fetching suggestions for church: ${error}`);
    return c.json({ error: `Failed to fetch suggestions: ${error}` }, 500);
  }
});

// ── Community-added churches ──

interface PendingChurch {
  id: string;
  name: string;
  address: string;
  city: string;
  state: string;
  lat: number;
  lng: number;
  denomination: string;
  attendance: number;
  website: string;
  serviceTimes?: string;
  languages?: string[];
  ministries?: string[];
  pastorName?: string;
  phone?: string;
  email?: string;
  submittedByIp: string;
  submittedAt: number;
  approved: boolean;
  verifications: { ip: string; timestamp: number }[];
}

interface PendingChurchStore {
  churches: PendingChurch[];
}

const VERIFY_THRESHOLD = 3; // Unique IPs needed to approve a community-added church

// POST /churches/add - Submit a new community church
app.post("/make-server-283d8046/churches/add", async (c) => {
  try {
    const ip = getClientIp(c);
    const body = await c.req.json();
    const { name, address, city, state, lat, lng, denomination, attendance, website, serviceTimes, languages, ministries, pastorName, phone, email } = body;

    if (!name || !state || typeof name !== "string" || name.trim().length < 2) {
      return c.json({ error: "Church name is required (min 2 characters)" }, 400);
    }

    const stateAbbrev = String(state).toUpperCase();
    const stateInfo = getStateByAbbrev(stateAbbrev);
    if (!stateInfo) {
      return c.json({ error: `Invalid state: ${stateAbbrev}` }, 400);
    }

    // Parse lat/lng
    const parsedLat = parseFloat(lat);
    const parsedLng = parseFloat(lng);
    if (isNaN(parsedLat) || isNaN(parsedLng) || parsedLat < 18 || parsedLat > 72 || parsedLng < -180 || parsedLng > -65) {
      return c.json({ error: "Valid latitude and longitude are required within the US" }, 400);
    }

    const parsedAttendance = parseInt(attendance) || 50;
    if (parsedAttendance < 1 || parsedAttendance > 50000) {
      return c.json({ error: "Attendance must be between 1 and 50,000" }, 400);
    }

    // Generate a unique ID
    const churchId = `community-${stateAbbrev}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const kvKey = `pending-churches:${stateAbbrev}`;
    const store: PendingChurchStore = (await kv.get(kvKey)) || { churches: [] };

    // Prevent duplicate submissions: same name + similar location from same IP
    const duplicate = store.churches.find((ch) => {
      const nameSimilar = ch.name.trim().toLowerCase() === name.trim().toLowerCase();
      const locationClose = Math.abs(ch.lat - parsedLat) < 0.001 && Math.abs(ch.lng - parsedLng) < 0.001;
      return nameSimilar && locationClose;
    });

    if (duplicate) {
      // If duplicate exists, treat as a verification vote instead
      const alreadyVerified = duplicate.verifications.some((v) => v.ip === ip);
      if (!alreadyVerified) {
        duplicate.verifications.push({ ip, timestamp: Date.now() });
        if (duplicate.verifications.length >= VERIFY_THRESHOLD) {
          duplicate.approved = true;
        }
        await kv.set(kvKey, store);
      }
      return c.json({
        success: true,
        church: duplicate,
        message: "This church already exists as a pending entry — your verification has been counted.",
        isDuplicate: true,
      });
    }

    const newChurch: PendingChurch = {
      id: churchId,
      name: name.trim(),
      address: (address || "").trim(),
      city: (city || "").trim(),
      state: stateAbbrev,
      lat: parsedLat,
      lng: parsedLng,
      denomination: (denomination || "Unknown").trim(),
      attendance: parsedAttendance,
      website: (website || "").trim(),
      serviceTimes: (serviceTimes || "").trim() || undefined,
      languages: Array.isArray(languages) && languages.length > 0 ? languages : undefined,
      ministries: Array.isArray(ministries) && ministries.length > 0 ? ministries : undefined,
      pastorName: (pastorName || "").trim() || undefined,
      phone: (phone || "").trim() || undefined,
      email: (email || "").trim() || undefined,
      submittedByIp: ip,
      submittedAt: Date.now(),
      approved: false,
      verifications: [{ ip, timestamp: Date.now() }], // Creator counts as first verification
    };

    store.churches.push(newChurch);
    await kv.set(kvKey, store);

    console.log(`New community church added: "${name}" in ${stateAbbrev} by ${ip} — needs ${VERIFY_THRESHOLD - 1} more verifications`);

    return c.json({ success: true, church: newChurch });
  } catch (error) {
    console.log(`Error adding community church: ${error}`);
    return c.json({ error: `Failed to add church: ${error}` }, 500);
  }
});

// GET /churches/pending/:state - Get pending community churches for a state
app.get("/make-server-283d8046/churches/pending/:state", async (c) => {
  try {
    const stateAbbrev = c.req.param("state").toUpperCase();
    const ip = getClientIp(c);
    const kvKey = `pending-churches:${stateAbbrev}`;
    const store: PendingChurchStore = (await kv.get(kvKey)) || { churches: [] };

    // Return churches with verification status, and whether this IP has already verified
    const churches = store.churches.map((ch) => ({
      id: ch.id,
      name: ch.name,
      address: ch.address,
      city: ch.city,
      state: ch.state,
      lat: ch.lat,
      lng: ch.lng,
      denomination: ch.denomination,
      attendance: ch.attendance,
      website: ch.website,
      approved: ch.approved,
      verificationCount: ch.verifications.length,
      needed: VERIFY_THRESHOLD,
      myVerification: ch.verifications.some((v) => v.ip === ip),
      submittedAt: ch.submittedAt,
    }));

    return c.json({ state: stateAbbrev, churches });
  } catch (error) {
    console.log(`Error fetching pending churches: ${error}`);
    return c.json({ error: `Failed to fetch pending churches: ${error}` }, 500);
  }
});

// POST /churches/verify/:pendingId - Verify a pending community church
app.post("/make-server-283d8046/churches/verify/:pendingId", async (c) => {
  try {
    const ip = getClientIp(c);
    const pendingId = c.req.param("pendingId");

    // Parse state from the ID (community-{STATE}-{timestamp}-{random})
    const parts = pendingId.split("-");
    if (parts.length < 3 || parts[0] !== "community") {
      return c.json({ error: "Invalid pending church ID" }, 400);
    }
    const stateAbbrev = parts[1];

    const kvKey = `pending-churches:${stateAbbrev}`;
    const store: PendingChurchStore = (await kv.get(kvKey)) || { churches: [] };

    const church = store.churches.find((ch) => ch.id === pendingId);
    if (!church) {
      return c.json({ error: "Pending church not found" }, 404);
    }

    // Check if already verified by this IP
    if (church.verifications.some((v) => v.ip === ip)) {
      return c.json({
        success: true,
        message: "You have already verified this church",
        church: {
          ...church,
          verificationCount: church.verifications.length,
          needed: VERIFY_THRESHOLD,
          myVerification: true,
        },
        alreadyVerified: true,
      });
    }

    // 24hr cooldown per IP across all verifications (prevent spam)
    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
    const recentVerifications = store.churches.reduce((count, ch) => {
      return count + ch.verifications.filter((v) => v.ip === ip && v.timestamp > oneDayAgo).length;
    }, 0);

    if (recentVerifications >= 20) {
      return c.json({ error: "Too many verifications in 24 hours. Please try again later." }, 429);
    }

    church.verifications.push({ ip, timestamp: Date.now() });

    if (church.verifications.length >= VERIFY_THRESHOLD) {
      church.approved = true;
    }

    await kv.set(kvKey, store);

    console.log(`Verification for "${church.name}" (${pendingId}) by ${ip}: ${church.verifications.length}/${VERIFY_THRESHOLD}${church.approved ? " — APPROVED" : ""}`);

    return c.json({
      success: true,
      church: {
        ...church,
        verificationCount: church.verifications.length,
        needed: VERIFY_THRESHOLD,
        myVerification: true,
      },
    });
  } catch (error) {
    console.log(`Error verifying church: ${error}`);
    return c.json({ error: `Failed to verify church: ${error}` }, 500);
  }
});

// ── State Population endpoint (datausa.io API, cached in KV) ──

// Hardcoded 2023 Census estimates as fallback if API is unavailable
const CENSUS_2023_POPULATION: Record<string, number> = {
  AL: 5108468, AK: 733406, AZ: 7431344, AR: 3067732, CA: 38965193,
  CO: 5877610, CT: 3617176, DE: 1031890, FL: 22610726,
  GA: 11029227, HI: 1435138, ID: 1964726, IL: 12549689, IN: 6862199,
  IA: 3207004, KS: 2940546, KY: 4526154, LA: 4573749, ME: 1395722,
  MD: 6859225, MA: 7001399, MI: 10037261, MN: 5737915, MS: 2939690,
  MO: 6196156, MT: 1132812, NE: 1978379, NV: 3194176, NH: 1402054,
  NJ: 9290841, NM: 2114371, NY: 19571216, NC: 10835491, ND: 783926,
  OH: 11785935, OK: 4053824, OR: 4233358, PA: 12961683, RI: 1095962,
  SC: 5373555, SD: 919318, TN: 7126489, TX: 30503301, UT: 3417734,
  VT: 647464, VA: 8683619, WA: 7812880, WV: 1770071, WI: 5910955,
  WY: 584057,
};

// In-memory cache to avoid repeated KV reads within same server instance
let populationCache: Record<string, number> | null = null;
let populationCacheTime = 0;
const POPULATION_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

app.get("/make-server-283d8046/population", async (c) => {
  try {
    // Check in-memory cache first
    if (populationCache && Date.now() - populationCacheTime < POPULATION_CACHE_TTL) {
      return c.json({ populations: populationCache, source: "memory-cache" });
    }

    // Check KV cache
    const kvKey = "state-populations-v1";
    const cached = await kv.get(kvKey);
    if (cached) {
      const parsed = typeof cached === "string" ? JSON.parse(cached) : cached;
      if (parsed.populations && parsed.fetchedAt && Date.now() - parsed.fetchedAt < 30 * 24 * 60 * 60 * 1000) {
        populationCache = parsed.populations;
        populationCacheTime = Date.now();
        return c.json({ populations: parsed.populations, source: "kv-cache" });
      }
    }

    // Try datausa.io API (free, no key required)
    let populations: Record<string, number> = {};
    let source = "fallback";

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);

      const res = await fetch(
        "https://datausa.io/api/data?drilldowns=State&measures=Population&year=latest",
        { signal: controller.signal }
      );
      clearTimeout(timeout);

      if (res.ok) {
        const json = await res.json();
        if (json.data && Array.isArray(json.data)) {
          // Map state names to abbreviations
          const nameToAbbrev: Record<string, string> = {};
          for (const s of US_STATES) {
            nameToAbbrev[s.name.toLowerCase()] = s.abbrev;
          }
          for (const row of json.data) {
            const stateName = (row["State"] || "").toLowerCase();
            const pop = row["Population"];
            // Fold DC population into Maryland
            const abbrev = stateName === "district of columbia" ? "MD" : nameToAbbrev[stateName];
            if (abbrev && typeof pop === "number") {
              populations[abbrev] = (populations[abbrev] || 0) + pop;
            }
          }

          if (Object.keys(populations).length >= 45) {
            source = "datausa.io";
          } else {
            console.log(`datausa.io returned only ${Object.keys(populations).length} states, using fallback`);
            populations = { ...CENSUS_2023_POPULATION };
            source = "fallback";
          }
        }
      }
    } catch (apiErr) {
      console.log(`datausa.io API error: ${apiErr}. Using Census 2023 fallback.`);
      populations = { ...CENSUS_2023_POPULATION };
      source = "fallback";
    }

    if (Object.keys(populations).length === 0) {
      populations = { ...CENSUS_2023_POPULATION };
      source = "fallback";
    }

    // Cache in KV
    await kv.set(kvKey, JSON.stringify({ populations, fetchedAt: Date.now(), source }));
    populationCache = populations;
    populationCacheTime = Date.now();

    return c.json({ populations, source });
  } catch (error) {
    console.log(`Error fetching state populations: ${error}`);
    return c.json({ populations: CENSUS_2023_POPULATION, source: "error-fallback" });
  }
});

// POST /admin/cleanup-dc - Remove legacy DC KV keys (folded into MD)
app.post("/make-server-283d8046/admin/cleanup-dc", async (c) => {
  try {
    const dcKeys = ["churches:DC", "churches:sidx:DC"];
    let deleted = 0;
    for (const key of dcKeys) {
      const exists = await kv.get(key);
      if (exists) {
        await kv.del(key);
        deleted++;
        console.log(`Deleted legacy key: ${key}`);
      }
    }
    // Also remove DC from meta.stateCounts if present
    const meta = await kv.get("churches:meta");
    if (meta?.stateCounts?.DC) {
      delete meta.stateCounts.DC;
      await kv.set("churches:meta", meta);
      console.log("Removed DC from churches:meta.stateCounts");
      deleted++;
    }
    return c.json({ message: `DC cleanup complete. ${deleted} items removed.`, deleted });
  } catch (error) {
    console.log(`Error during DC cleanup: ${error}`);
    return c.json({ error: `DC cleanup failed: ${error}` }, 500);
  }
});

Deno.serve(app.fetch);
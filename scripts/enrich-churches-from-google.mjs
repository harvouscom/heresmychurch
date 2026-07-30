#!/usr/bin/env node
/**
 * Google Places enrichment drip.
 *
 * Default: worldwide round-robin — one metro per admin region across 19
 * countries (US₁, CA₁, GB₁, … then US₂, …). Place Details on by default so
 * matches fill address + phone/website.
 *
 * Optional: --us-density for US metros ordered by churches-per-capita.
 *
 * Usage:
 *   node scripts/enrich-churches-from-google.mjs --live --limit 25
 *   node scripts/enrich-churches-from-google.mjs --list
 *   node scripts/enrich-churches-from-google.mjs --us-density --live
 *   node scripts/enrich-churches-from-google.mjs --reset-progress
 */

import { readFileSync, writeFileSync, existsSync, unlinkSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const PROJECT_ID = process.env.SUPABASE_PROJECT_ID ?? "epufchwxofsyuictfufy";
const ANON_KEY =
  process.env.SUPABASE_ANON_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVwdWZjaHd4b2ZzeXVpY3RmdWZ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI5NzcxMTUsImV4cCI6MjA4ODU1MzExNX0.v11kHHpM1IsK6q81909CYkWgX5TdV8kJhCkNqSEs5QM";
const BASE = `https://${PROJECT_ID}.supabase.co/functions/v1/make-server-283d8046`;

const COUNTRY_CODES = [
  "US", "CA", "GB", "IE", "FR", "DE", "NL", "BE", "ES", "IT",
  "PT", "AT", "CH", "SE", "NO", "DK", "FI", "PL", "AU",
];

/** Census POPESTIMATE2023 — keep in sync with state-populations.ts */
const POP = {
  AK: 733406, AL: 5108468, AR: 3067732, AZ: 7431344, CA: 38965193,
  CO: 5877610, CT: 3617176, DC: 678972, DE: 1031890, FL: 22610726,
  GA: 11029227, HI: 1435138, IA: 3207004, ID: 1964726, IL: 12549689,
  IN: 6862199, KS: 2940546, KY: 4526154, LA: 4573749, MA: 7001399,
  MD: 6180253, ME: 1395722, MI: 10037261, MN: 5737915, MO: 6196156,
  MS: 2939690, MT: 1132812, NC: 10835491, ND: 783926, NE: 1978379,
  NH: 1402054, NJ: 9290841, NM: 2114371, NV: 3194176, NY: 19571216,
  OH: 11785935, OK: 4053824, OR: 4233358, PA: 12961683, RI: 1095962,
  SC: 5373555, SD: 919318, TN: 7126489, TX: 30503301, UT: 3417734,
  VA: 8715698, VT: 647464, WA: 7812880, WI: 5910955, WV: 1770071,
  WY: 584057,
};

/**
 * US metros — shared with SEO pages (`src/app/data/us-metros.json`).
 * `region` = enrich-google path (state abbrev).
 */
const US_METROS = JSON.parse(
  readFileSync(join(__dirname, "..", "src", "app", "data", "us-metros.json"), "utf8"),
);

/** Intl cities for --world mode (same as before). */
const CITIES_BY_COUNTRY = {
  US: US_METROS,
  CA: [
    { id: "ca-toronto", name: "Toronto", region: "ON", lat: 43.6532, lng: -79.3832, radiusKm: 45 },
    { id: "ca-montreal", name: "Montreal", region: "QC", lat: 45.5017, lng: -73.5673, radiusKm: 40 },
    { id: "ca-vancouver", name: "Vancouver", region: "BC", lat: 49.2827, lng: -123.1207, radiusKm: 40 },
    { id: "ca-calgary", name: "Calgary", region: "AB", lat: 51.0447, lng: -114.0719, radiusKm: 35 },
    { id: "ca-ottawa", name: "Ottawa", region: "ON", lat: 45.4215, lng: -75.6972, radiusKm: 30 },
  ],
  GB: [
    { id: "gb-london", name: "London", region: "GREATERLONDON", lat: 51.5074, lng: -0.1278, radiusKm: 40 },
    { id: "gb-manchester", name: "Manchester", region: "NORTHWEST", lat: 53.4808, lng: -2.2426, radiusKm: 30 },
    { id: "gb-birmingham", name: "Birmingham", region: "WESTMIDLANDS", lat: 52.4862, lng: -1.8904, radiusKm: 30 },
    { id: "gb-glasgow", name: "Glasgow", region: "SCOTLAND", lat: 55.8642, lng: -4.2518, radiusKm: 30 },
    { id: "gb-leeds", name: "Leeds", region: "YORKSHIREANDTHEHUMBER", lat: 53.8008, lng: -1.5491, radiusKm: 25 },
  ],
  IE: [
    { id: "ie-dublin", name: "Dublin", region: "IED", lat: 53.3498, lng: -6.2603, radiusKm: 30 },
    { id: "ie-cork", name: "Cork", region: "IECO", lat: 51.8985, lng: -8.4756, radiusKm: 20 },
    { id: "ie-galway", name: "Galway", region: "IEG", lat: 53.2707, lng: -9.0568, radiusKm: 18 },
    { id: "ie-limerick", name: "Limerick", region: "IELK", lat: 52.6638, lng: -8.6267, radiusKm: 18 },
    { id: "ie-waterford", name: "Waterford", region: "IEWD", lat: 52.2593, lng: -7.1101, radiusKm: 15 },
  ],
  FR: [
    { id: "fr-paris", name: "Paris", region: "FR75", lat: 48.8566, lng: 2.3522, radiusKm: 35 },
    { id: "fr-lyon", name: "Lyon", region: "FR69", lat: 45.764, lng: 4.8357, radiusKm: 25 },
    { id: "fr-marseille", name: "Marseille", region: "FR13", lat: 43.2965, lng: 5.3698, radiusKm: 25 },
    { id: "fr-toulouse", name: "Toulouse", region: "FR31", lat: 43.6047, lng: 1.4442, radiusKm: 22 },
    { id: "fr-lille", name: "Lille", region: "FR59", lat: 50.6292, lng: 3.0573, radiusKm: 22 },
  ],
  DE: [
    { id: "de-berlin", name: "Berlin", region: "DEBE", lat: 52.52, lng: 13.405, radiusKm: 35 },
    { id: "de-munich", name: "Munich", region: "DEBY", lat: 48.1351, lng: 11.582, radiusKm: 30 },
    { id: "de-hamburg", name: "Hamburg", region: "DEHH", lat: 53.5511, lng: 9.9937, radiusKm: 28 },
    { id: "de-cologne", name: "Cologne", region: "DENW", lat: 50.9375, lng: 6.9603, radiusKm: 25 },
    { id: "de-frankfurt", name: "Frankfurt", region: "DEHE", lat: 50.1109, lng: 8.6821, radiusKm: 25 },
  ],
  NL: [
    { id: "nl-amsterdam", name: "Amsterdam", region: "NLNH", lat: 52.3676, lng: 4.9041, radiusKm: 25 },
    { id: "nl-rotterdam", name: "Rotterdam", region: "NLZH", lat: 51.9244, lng: 4.4777, radiusKm: 22 },
    { id: "nl-hague", name: "The Hague", region: "NLZH", lat: 52.0705, lng: 4.3007, radiusKm: 18 },
    { id: "nl-utrecht", name: "Utrecht", region: "NLUT", lat: 52.0907, lng: 5.1214, radiusKm: 18 },
    { id: "nl-eindhoven", name: "Eindhoven", region: "NLNB", lat: 51.4416, lng: 5.4697, radiusKm: 18 },
  ],
  BE: [
    { id: "be-brussels", name: "Brussels", region: "BEBRU", lat: 50.8503, lng: 4.3517, radiusKm: 22 },
    { id: "be-antwerp", name: "Antwerp", region: "BEVAN", lat: 51.2194, lng: 4.4025, radiusKm: 20 },
    { id: "be-ghent", name: "Ghent", region: "BEVOV", lat: 51.0543, lng: 3.7174, radiusKm: 18 },
    { id: "be-charleroi", name: "Charleroi", region: "BEWHT", lat: 50.4108, lng: 4.4446, radiusKm: 16 },
    { id: "be-liege", name: "Liège", region: "BEWLG", lat: 50.6326, lng: 5.5797, radiusKm: 16 },
  ],
  ES: [
    { id: "es-madrid", name: "Madrid", region: "ESM", lat: 40.4168, lng: -3.7038, radiusKm: 30 },
    { id: "es-barcelona", name: "Barcelona", region: "ESB", lat: 41.3874, lng: 2.1686, radiusKm: 28 },
    { id: "es-valencia", name: "Valencia", region: "ESV", lat: 39.4699, lng: -0.3763, radiusKm: 22 },
    { id: "es-seville", name: "Seville", region: "ESS", lat: 37.3891, lng: -5.9845, radiusKm: 20 },
    { id: "es-bilbao", name: "Bilbao", region: "ESBI", lat: 43.263, lng: -2.935, radiusKm: 18 },
  ],
  IT: [
    { id: "it-rome", name: "Rome", region: "ITRM", lat: 41.9028, lng: 12.4964, radiusKm: 30 },
    { id: "it-milan", name: "Milan", region: "ITMI", lat: 45.4642, lng: 9.19, radiusKm: 28 },
    { id: "it-naples", name: "Naples", region: "ITNA", lat: 40.8518, lng: 14.2681, radiusKm: 25 },
    { id: "it-turin", name: "Turin", region: "ITTO", lat: 45.0703, lng: 7.6869, radiusKm: 22 },
    { id: "it-florence", name: "Florence", region: "ITFI", lat: 43.7696, lng: 11.2558, radiusKm: 18 },
  ],
  PT: [
    { id: "pt-lisbon", name: "Lisbon", region: "PT11", lat: 38.7223, lng: -9.1393, radiusKm: 25 },
    { id: "pt-porto", name: "Porto", region: "PT13", lat: 41.1579, lng: -8.6291, radiusKm: 22 },
    { id: "pt-braga", name: "Braga", region: "PT03", lat: 41.5454, lng: -8.4265, radiusKm: 15 },
    { id: "pt-coimbra", name: "Coimbra", region: "PT06", lat: 40.2033, lng: -8.4103, radiusKm: 15 },
    { id: "pt-faro", name: "Faro", region: "PT08", lat: 37.0194, lng: -7.9322, radiusKm: 15 },
  ],
  AT: [
    { id: "at-vienna", name: "Vienna", region: "AT9", lat: 48.2082, lng: 16.3738, radiusKm: 25 },
    { id: "at-graz", name: "Graz", region: "AT2", lat: 47.0707, lng: 15.4395, radiusKm: 18 },
    { id: "at-linz", name: "Linz", region: "AT4", lat: 48.3069, lng: 14.2858, radiusKm: 16 },
    { id: "at-salzburg", name: "Salzburg", region: "AT5", lat: 47.8095, lng: 13.055, radiusKm: 15 },
    { id: "at-innsbruck", name: "Innsbruck", region: "AT3", lat: 47.2692, lng: 11.4041, radiusKm: 15 },
  ],
  CH: [
    { id: "ch-zurich", name: "Zurich", region: "CHZH", lat: 47.3769, lng: 8.5417, radiusKm: 22 },
    { id: "ch-geneva", name: "Geneva", region: "CHGE", lat: 46.2044, lng: 6.1432, radiusKm: 18 },
    { id: "ch-basel", name: "Basel", region: "CHBS", lat: 47.5596, lng: 7.5886, radiusKm: 16 },
    { id: "ch-bern", name: "Bern", region: "CHBE", lat: 46.948, lng: 7.4474, radiusKm: 16 },
    { id: "ch-lausanne", name: "Lausanne", region: "CHVD", lat: 46.5197, lng: 6.6323, radiusKm: 15 },
  ],
  SE: [
    { id: "se-stockholm", name: "Stockholm", region: "SEAB", lat: 59.3293, lng: 18.0686, radiusKm: 30 },
    { id: "se-gothenburg", name: "Gothenburg", region: "SEO", lat: 57.7089, lng: 11.9746, radiusKm: 25 },
    { id: "se-malmo", name: "Malmö", region: "SEM", lat: 55.605, lng: 13.0038, radiusKm: 20 },
    { id: "se-uppsala", name: "Uppsala", region: "SEC", lat: 59.8586, lng: 17.6389, radiusKm: 15 },
    { id: "se-vasteras", name: "Västerås", region: "SEU", lat: 59.6099, lng: 16.5448, radiusKm: 14 },
  ],
  NO: [
    { id: "no-oslo", name: "Oslo", region: "NO03", lat: 59.9139, lng: 10.7522, radiusKm: 25 },
    { id: "no-bergen", name: "Bergen", region: "NO12", lat: 60.3913, lng: 5.3221, radiusKm: 18 },
    { id: "no-trondheim", name: "Trondheim", region: "NO16", lat: 63.4305, lng: 10.3951, radiusKm: 16 },
    { id: "no-stavanger", name: "Stavanger", region: "NO11", lat: 58.97, lng: 5.7331, radiusKm: 16 },
    { id: "no-drammen", name: "Drammen", region: "NO06", lat: 59.744, lng: 10.2045, radiusKm: 14 },
  ],
  DK: [
    { id: "dk-copenhagen", name: "Copenhagen", region: "DK84", lat: 55.6761, lng: 12.5683, radiusKm: 25 },
    { id: "dk-aarhus", name: "Aarhus", region: "DK82", lat: 56.1629, lng: 10.2039, radiusKm: 18 },
    { id: "dk-odense", name: "Odense", region: "DK83", lat: 55.4038, lng: 10.4024, radiusKm: 15 },
    { id: "dk-aalborg", name: "Aalborg", region: "DK81", lat: 57.0488, lng: 9.9217, radiusKm: 15 },
    { id: "dk-esbjerg", name: "Esbjerg", region: "DK83", lat: 55.4765, lng: 8.4594, radiusKm: 12 },
  ],
  FI: [
    { id: "fi-helsinki", name: "Helsinki", region: "FI18", lat: 60.1699, lng: 24.9384, radiusKm: 25 },
    { id: "fi-tampere", name: "Tampere", region: "FI06", lat: 61.4978, lng: 23.761, radiusKm: 18 },
    { id: "fi-turku", name: "Turku", region: "FI19", lat: 60.4518, lng: 22.2666, radiusKm: 16 },
    { id: "fi-oulu", name: "Oulu", region: "FI17", lat: 65.0121, lng: 25.4719, radiusKm: 15 },
    { id: "fi-jyvaskyla", name: "Jyväskylä", region: "FI08", lat: 62.2426, lng: 25.7473, radiusKm: 14 },
  ],
  PL: [
    { id: "pl-warsaw", name: "Warsaw", region: "PLMZ", lat: 52.2297, lng: 21.0122, radiusKm: 28 },
    { id: "pl-krakow", name: "Kraków", region: "PLMA", lat: 50.0647, lng: 19.945, radiusKm: 22 },
    { id: "pl-lodz", name: "Łódź", region: "PLLD", lat: 51.7592, lng: 19.456, radiusKm: 18 },
    { id: "pl-wroclaw", name: "Wrocław", region: "PLDS", lat: 51.1079, lng: 17.0385, radiusKm: 18 },
    { id: "pl-gdansk", name: "Gdańsk", region: "PLPM", lat: 54.352, lng: 18.6466, radiusKm: 18 },
  ],
  AU: [
    { id: "au-sydney", name: "Sydney", region: "AUNSW", lat: -33.8688, lng: 151.2093, radiusKm: 40 },
    { id: "au-melbourne", name: "Melbourne", region: "AUVIC", lat: -37.8136, lng: 144.9631, radiusKm: 40 },
    { id: "au-brisbane", name: "Brisbane", region: "AUQLD", lat: -27.4698, lng: 153.0251, radiusKm: 35 },
    { id: "au-perth", name: "Perth", region: "AUWA", lat: -31.9505, lng: 115.8605, radiusKm: 30 },
    { id: "au-adelaide", name: "Adelaide", region: "AUSA", lat: -34.9285, lng: 138.6007, radiusKm: 25 },
  ],
};

const PROGRESS_FILE =
  process.env.ENRICH_PROGRESS_FILE ?? join(__dirname, ".enrich-google-progress.json");
const PROGRESS_VERSION = 5; // world-round-robin + fetchDetails default

const MAX_TEXT = parseInt(process.env.ENRICH_MAX_TEXT_SEARCH || "4500", 10);
const MAX_NEARBY = parseInt(process.env.ENRICH_MAX_NEARBY_SEARCH || "4500", 10);
const MAX_DETAILS = parseInt(process.env.ENRICH_MAX_PLACE_DETAILS || "900", 10);

function statePop(abbrev) {
  if (abbrev === "MD") return (POP.MD || 0) + (POP.DC || 0);
  return POP[abbrev] || 0;
}

async function fetchStateChurchCounts() {
  const res = await fetch(`${BASE}/churches/states`, {
    headers: { Accept: "application/json", Authorization: `Bearer ${ANON_KEY}` },
  });
  if (!res.ok) throw new Error(`Failed to fetch states: ${res.status}`);
  const data = await res.json();
  const map = {};
  for (const s of data.states || []) {
    map[s.abbrev] = s.churchCount || 0;
  }
  return map;
}

/** US metros sorted by state churches-per-10k (desc), then larger radius first within a state. */
async function buildUsDensityQueue(minPer10k = 0) {
  const counts = await fetchStateChurchCounts();
  const density = {};
  for (const [st, n] of Object.entries(counts)) {
    const pop = statePop(st);
    density[st] = pop > 0 ? (n / pop) * 10000 : 0;
  }
  return US_METROS.map((m) => ({
    ...m,
    country: "US",
    churchesPer10k: Math.round((density[m.region] || 0) * 100) / 100,
    churchCount: counts[m.region] || 0,
  }))
    .filter((m) => m.churchesPer10k >= minPer10k)
    .sort((a, b) => {
      if (b.churchesPer10k !== a.churchesPer10k) return b.churchesPer10k - a.churchesPer10k;
      return b.radiusKm - a.radiusKm;
    });
}

function buildWorldRoundRobinQueue(countryFilter) {
  const countries = countryFilter?.length
    ? COUNTRY_CODES.filter((cc) => countryFilter.includes(cc))
    : [...COUNTRY_CODES];
  const lists = countries.map((cc) =>
    (CITIES_BY_COUNTRY[cc] || []).map((c) => ({ ...c, country: cc })),
  );
  const maxLen = Math.max(0, ...lists.map((l) => l.length));
  const queue = [];
  for (let i = 0; i < maxLen; i++) {
    for (const list of lists) {
      if (list[i]) queue.push(list[i]);
    }
  }
  return queue;
}

function parseArgs(argv) {
  const args = {
    dryRun: true,
    live: false,
    fetchDetails: true,
    limit: 25,
    usDensity: false,
    countries: null,
    minPer10k: 0,
    resetProgress: false,
    maxChunks: Infinity,
    list: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--live") {
      args.live = true;
      args.dryRun = false;
    } else if (a === "--dry-run") {
      args.dryRun = true;
      args.live = false;
    } else if (a === "--fetch-details") {
      args.fetchDetails = true;
    } else if (a === "--no-fetch-details") {
      args.fetchDetails = false;
    } else if (a === "--us-density") {
      args.usDensity = true;
    } else if (a === "--world") {
      // default; kept for backward compatibility
      args.usDensity = false;
    } else if (a === "--reset-progress") {
      args.resetProgress = true;
    } else if (a === "--list") {
      args.list = true;
    } else if (a === "--limit" && argv[i + 1]) {
      args.limit = Math.min(100, Math.max(1, parseInt(argv[++i], 10) || 25));
    } else if (a === "--min-per-10k" && argv[i + 1]) {
      args.minPer10k = Math.max(0, parseFloat(argv[++i]) || 0);
      args.usDensity = true;
    } else if (a === "--countries" && argv[i + 1]) {
      args.countries = argv[++i]
        .split(",")
        .map((s) => s.trim().toUpperCase())
        .filter(Boolean);
      args.usDensity = false;
    } else if (a === "--max-chunks" && argv[i + 1]) {
      args.maxChunks = Math.max(1, parseInt(argv[++i], 10) || 1);
    } else if (a === "--help" || a === "-h") {
      args.help = true;
    }
  }
  return args;
}

function emptyProgress(mode) {
  return {
    version: PROGRESS_VERSION,
    mode,
    monthKey: monthKeyNow(),
    queueIndex: 0,
    apiCalls: { textSearch: 0, nearbySearch: 0, placeDetails: 0, errors: 0 },
    totals: { enriched: 0, wouldEnrich: 0, noMatch: 0, chunks: 0 },
    lastTarget: null,
    updatedAt: null,
  };
}

function loadProgress(mode) {
  if (!existsSync(PROGRESS_FILE)) return emptyProgress(mode);
  const p = JSON.parse(readFileSync(PROGRESS_FILE, "utf8"));
  if (p.version !== PROGRESS_VERSION || p.mode !== mode) {
    const next = emptyProgress(mode);
    if (p.monthKey === next.monthKey && p.apiCalls) {
      next.apiCalls = { ...next.apiCalls, ...p.apiCalls };
      next.totals = { ...next.totals, ...(p.totals || {}) };
    }
    return next;
  }
  return p;
}

function saveProgress(p) {
  p.updatedAt = new Date().toISOString();
  writeFileSync(PROGRESS_FILE, JSON.stringify(p, null, 2) + "\n");
}

function monthKeyNow() {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function underCaps(apiCalls) {
  return (
    (apiCalls.textSearch || 0) < MAX_TEXT &&
    (apiCalls.nearbySearch || 0) < MAX_NEARBY &&
    (apiCalls.placeDetails || 0) < MAX_DETAILS
  );
}

async function enrichChunk(target, opts) {
  const qs = new URLSearchParams({
    dryRun: opts.dryRun ? "true" : "false",
    missingOnly: "true",
    limit: String(opts.limit),
    fetchDetails: opts.fetchDetails ? "true" : "false",
    nearLat: String(target.lat),
    nearLng: String(target.lng),
    nearRadiusKm: String(target.radiusKm),
  });
  const url = `${BASE}/admin/enrich-google/${encodeURIComponent(target.region)}?${qs}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${ANON_KEY}`,
    },
  });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`Non-JSON response ${res.status}: ${text.slice(0, 300)}`);
  }
  if (!res.ok) {
    throw new Error(`${target.country}/${target.region} ${res.status}: ${data.error || text.slice(0, 300)}`);
  }
  return data;
}

function addCounters(into, from) {
  if (!from || typeof from !== "object") return;
  for (const k of ["textSearch", "nearbySearch", "placeDetails", "errors"]) {
    into[k] = (into[k] || 0) + (from[k] || 0);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(`Usage: node scripts/enrich-churches-from-google.mjs [options]
  --dry-run              Count / match without writing (default)
  --live                 Write enrichments (spends Places quota)
  --fetch-details        Place Details for phone/website (default on)
  --no-fetch-details     Skip Place Details (address-only from Text/Nearby)
  --limit N              Churches per metro chunk (default 25, max 100)
  --us-density           US metros by state churches-per-capita (not default)
  --min-per-10k N        With --us-density: only states with ≥N churches per 10k
  --world                Worldwide RR (default; kept for compatibility)
  --countries US,CA,GB   Only these countries in the world queue
  --max-chunks N         Stop after N metros this run (1 chunk each)
  --list                 Print queue and exit
  --reset-progress       Delete progress file and exit

Default: worldwide RR — 1 metro per region across 19 countries, Details on.`);
    process.exit(0);
  }

  if (args.resetProgress) {
    if (existsSync(PROGRESS_FILE)) unlinkSync(PROGRESS_FILE);
    console.log(`Reset progress file: ${PROGRESS_FILE}`);
    process.exit(0);
  }

  const mode = args.usDensity ? "us-density" : "world-round-robin";
  const queue = args.usDensity
    ? await buildUsDensityQueue(args.minPer10k)
    : buildWorldRoundRobinQueue(args.countries);

  if (args.list) {
    queue.forEach((t, i) => {
      const dens =
        t.churchesPer10k != null ? ` · ${t.churchesPer10k}/10k` : "";
      console.log(
        `${String(i + 1).padStart(3)}. ${t.country} · ${t.name} (${t.region})${dens} · ${t.radiusKm}km`,
      );
    });
    console.log(`\n${queue.length} targets · mode=${mode}`);
    process.exit(0);
  }

  let progress = loadProgress(mode);
  const mk = monthKeyNow();
  if (progress.monthKey !== mk) {
    console.log(`New month (${progress.monthKey} → ${mk}); resetting API counters.`);
    progress = emptyProgress(mode);
  }

  console.log(
    `Places drip | mode=${args.dryRun ? "dry-run" : "LIVE"} target=${mode} fetchDetails=${args.fetchDetails} limit=${args.limit}`,
  );
  console.log(`Queue: ${queue.length} metros · 1 chunk each then advance`);
  console.log(
    `Caps: text≤${MAX_TEXT} nearby≤${MAX_NEARBY} details≤${MAX_DETAILS} | progress: ${PROGRESS_FILE}`,
  );
  console.log(
    `Month ${progress.monthKey} so far: text=${progress.apiCalls.textSearch} nearby=${progress.apiCalls.nearbySearch} details=${progress.apiCalls.placeDetails} · queueIndex=${progress.queueIndex || 0}`,
  );

  let chunksThisRun = 0;
  const startIndex = progress.queueIndex || 0;

  for (let i = startIndex; i < queue.length; i++) {
    if (!underCaps(progress.apiCalls)) {
      console.log("Monthly SKU caps reached; stopping.");
      break;
    }
    if (chunksThisRun >= args.maxChunks) {
      console.log(`--max-chunks ${args.maxChunks} reached; stopping.`);
      break;
    }

    const target = queue[i];
    const dens =
      target.churchesPer10k != null ? ` · ${target.churchesPer10k} churches/10k` : "";
    console.log(
      `\n→ [${i + 1}/${queue.length}] ${target.country} · ${target.name} (${target.region})${dens} · ${target.radiusKm}km · 1 chunk…`,
    );

    let data;
    try {
      data = await enrichChunk(target, {
        dryRun: args.dryRun,
        limit: args.limit,
        fetchDetails: args.fetchDetails,
      });
    } catch (e) {
      console.error(`  ERROR: ${e.message || e}`);
      progress.lastTarget = target.id;
      progress.queueIndex = i + 1;
      saveProgress(progress);
      const msg = String(e.message || e);
      if (msg.includes("404") || msg.includes("No churches")) continue;
      if (msg.includes("503") || msg.includes("GOOGLE_MAPS_API_KEY")) process.exit(1);
      continue;
    }

    addCounters(progress.apiCalls, data.apiCalls);
    progress.totals.enriched += data.enriched || 0;
    progress.totals.wouldEnrich += data.wouldEnrich || 0;
    progress.totals.noMatch += data.noMatch || 0;
    progress.totals.chunks += 1;
    progress.lastTarget = target.id;
    chunksThisRun++;

    console.log(
      `  considered=${data.considered || 0} enriched=${data.enriched} wouldEnrich=${data.wouldEnrich} noMatch=${data.noMatch} skippedFresh=${data.skippedFresh} skippedComplete=${data.skippedComplete}`,
    );
    console.log(
      `  apiCalls +${JSON.stringify(data.apiCalls || {})} | month totals ${JSON.stringify(progress.apiCalls)}`,
    );

    progress.queueIndex = i + 1;
    saveProgress(progress);
  }

  if ((progress.queueIndex || 0) >= queue.length) {
    console.log("\nFull queue pass complete; next run wraps to start.");
    progress.queueIndex = 0;
    saveProgress(progress);
  }

  console.log("\nDone.");
  console.log(
    `Run chunks=${chunksThisRun} | month enriched=${progress.totals.enriched} wouldEnrich=${progress.totals.wouldEnrich} noMatch=${progress.totals.noMatch}`,
  );
  console.log(`API month: ${JSON.stringify(progress.apiCalls)}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

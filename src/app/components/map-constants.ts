// Bible-themed sayings about waiting, shown during loading
export const WAITING_SAYINGS = [
  { text: "But they that wait upon the Lord shall renew their strength; they shall mount up with wings as eagles.", ref: "Isaiah 40:31" },
  { text: "Be still, and know that I am God.", ref: "Psalm 46:10" },
  { text: "Wait for the Lord; be strong, and let your heart take courage; wait for the Lord!", ref: "Psalm 27:14" },
  { text: "The Lord is good to those who wait for him, to the soul who seeks him.", ref: "Lamentations 3:25" },
  { text: "For the vision awaits its appointed time... though it linger, wait for it; it will certainly come.", ref: "Habakkuk 2:3" },
  { text: "I waited patiently for the Lord; he inclined to me and heard my cry.", ref: "Psalm 40:1" },
  { text: "Be patient, then, brothers and sisters, until the Lord's coming. See how the farmer waits for the precious fruit of the earth.", ref: "James 5:7" },
  { text: "Rest in the Lord, and wait patiently for him.", ref: "Psalm 37:7" },
  { text: "Abraham waited patiently, and so received what was promised.", ref: "Hebrews 6:15" },
  { text: "For since the beginning of the world men have not heard, nor perceived by the ear... what he hath prepared for him that waiteth for him.", ref: "Isaiah 64:4" },
  { text: "My soul waits for the Lord more than watchmen wait for the morning.", ref: "Psalm 130:6" },
  { text: "In the morning, Lord, you hear my voice; in the morning I lay my requests before you and wait expectantly.", ref: "Psalm 5:3" },
  { text: "Noah waited 40 days after the rain stopped before opening the window of the ark.", ref: "Genesis 8:6" },
  { text: "The Israelites waited 40 years in the wilderness before entering the Promised Land.", ref: "Deuteronomy 8:2" },
  { text: "Simeon waited his whole life to see the Messiah -- and his patience was rewarded in the temple.", ref: "Luke 2:25-26" },
  { text: "Joseph waited years in prison, but God's timing led him to the palace.", ref: "Genesis 41:14" },
  { text: "For I know the plans I have for you, declares the Lord, plans to prosper you and not to harm you.", ref: "Jeremiah 29:11" },
  { text: "He has made everything beautiful in its time.", ref: "Ecclesiastes 3:11" },
  { text: "The disciples waited in the upper room for ten days before the Holy Spirit came at Pentecost.", ref: "Acts 1:4-5" },
  { text: "David was anointed king as a teenager but waited roughly 15 years before taking the throne.", ref: "1 Samuel 16:13" },
];

// Map FIPS IDs to state abbreviations for click detection
export const FIPS_TO_STATE: Record<string, string> = {
  "01": "AL", "02": "AK", "04": "AZ", "05": "AR", "06": "CA",
  "08": "CO", "09": "CT", "10": "DE", "11": "MD", "12": "FL",
  "13": "GA", "15": "HI", "16": "ID", "17": "IL", "18": "IN",
  "19": "IA", "20": "KS", "21": "KY", "22": "LA", "23": "ME",
  "24": "MD", "25": "MA", "26": "MI", "27": "MN", "28": "MS",
  "29": "MO", "30": "MT", "31": "NE", "32": "NV", "33": "NH",
  "34": "NJ", "35": "NM", "36": "NY", "37": "NC", "38": "ND",
  "39": "OH", "40": "OK", "41": "OR", "42": "PA", "44": "RI",
  "45": "SC", "46": "SD", "47": "TN", "48": "TX", "49": "UT",
  "50": "VT", "51": "VA", "53": "WA", "54": "WV", "55": "WI",
  "56": "WY",
};

// Reverse lookup: state abbreviation -> FIPS code (for county filtering)
export const STATE_TO_FIPS: Record<string, string> = Object.fromEntries(
  Object.entries(FIPS_TO_STATE).map(([fips, abbrev]) => [abbrev, fips])
);

// Approximate bounding boxes for US states [south, west, north, east]
export const STATE_BOUNDS: Record<string, [number, number, number, number]> = {
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

// Full state name lookup (search results, quadrant fallback labels, etc.)
export const STATE_NAMES: Record<string, string> = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California",
  CO: "Colorado", CT: "Connecticut", DE: "Delaware", DC: "D.C.", FL: "Florida",
  GA: "Georgia", HI: "Hawaii", ID: "Idaho", IL: "Illinois", IN: "Indiana",
  IA: "Iowa", KS: "Kansas", KY: "Kentucky", LA: "Louisiana", ME: "Maine",
  MD: "Maryland", MA: "Massachusetts", MI: "Michigan", MN: "Minnesota",
  MS: "Mississippi", MO: "Missouri", MT: "Montana", NE: "Nebraska",
  NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey", NM: "New Mexico",
  NY: "New York", NC: "North Carolina", ND: "North Dakota", OH: "Ohio",
  OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania", RI: "Rhode Island",
  SC: "South Carolina", SD: "South Dakota", TN: "Tennessee", TX: "Texas",
  UT: "Utah", VT: "Vermont", VA: "Virginia", WA: "Washington",
  WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming",
};

export const GEO_URL = "https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json";
export const COUNTIES_GEO_URL = "https://cdn.jsdelivr.net/npm/us-atlas@3/counties-10m.json";

// Church count tiers for state shading in national view
export const STATE_COUNT_TIERS = [
  { label: "Not yet explored", min: 0, max: 0, color: "#E8D5F5" },
  { label: "< 500", min: 1, max: 499, color: "#C9A0DC" },
  { label: "500-1,500", min: 500, max: 1499, color: "#B07CD0" },
  { label: "1,500-3,000", min: 1500, max: 2999, color: "#9B59C4" },
  { label: "3,000-5,000", min: 3000, max: 4999, color: "#8338B8" },
  { label: "5,000-10,000", min: 5000, max: 9999, color: "#6B21A8" },
  { label: "10,000+", min: 10000, max: Infinity, color: "#4C1D95" },
];

// County choropleth: white to light purple (matching surrounding states #EDE4F3 when in state view)
export const COUNTY_PER_CAPITA_COLORS = [
  "#FFFFFF",
  "#F8F4FC",
  "#F0E8F8",
  "#E8DCF4",
  "#E4D4F0",
  "#E0CCEC",
  "#EDE4F3",
];

// Filter churches to state bounding box (handles stale cached data that wasn't bbox-filtered)
export function filterToStateBounds(churches: { lat: number; lng: number }[], stateAbbrev: string) {
  const bounds = STATE_BOUNDS[stateAbbrev.toUpperCase()];
  if (!bounds) return churches;
  const [south, west, north, east] = bounds;
  const margin = 0.01;
  return churches.filter(
    (ch) =>
      ch.lat >= south - margin &&
      ch.lat <= north + margin &&
      ch.lng >= west - margin &&
      ch.lng <= east + margin
  );
}

export function getStateTier(count: number) {
  if (count <= 0) return STATE_COUNT_TIERS[0];
  return STATE_COUNT_TIERS.find((t) => count >= t.min && count <= t.max) || STATE_COUNT_TIERS[STATE_COUNT_TIERS.length - 1];
}

/** Returns choropleth color for county by per-capita rank (0 = lowest, 1 = highest). */
export function getCountyPerCapitaColor(perCapita: number, sortedByPerCapita: { perCapita: number }[]): string {
  if (sortedByPerCapita.length === 0 || perCapita <= 0) return COUNTY_PER_CAPITA_COLORS[0];
  const sorted = [...sortedByPerCapita].sort((a, b) => a.perCapita - b.perCapita);
  const idx = sorted.findIndex((c) => c.perCapita >= perCapita);
  const rank = idx === -1 ? 1 : idx / sorted.length;
  const tier = Math.min(
    COUNTY_PER_CAPITA_COLORS.length - 1,
    Math.floor(rank * COUNTY_PER_CAPITA_COLORS.length)
  );
  return COUNTY_PER_CAPITA_COLORS[tier];
}

// Compute a zoom level that makes the state fill more of the viewport.
// Uses the bounding-box diagonal relative to a reference (Texas ≈ diagonal 17°).
// Alaska & Hawaii are special-cased because AlbersUSA repositions them.
const STATE_ZOOM_OVERRIDES: Record<string, number> = {
  AK: 3,
  HI: 5.3,
};
const REFERENCE_DIAGONAL = 17; // approx Texas bbox diagonal in degrees
const REFERENCE_ZOOM = 3.7;   // desired zoom for Texas-sized states (tuned: one zoom-out from 5.5)
const MIN_STATE_ZOOM = 3;
const MAX_STATE_ZOOM = 10.5;

export function getStateZoom(abbrev: string): number {
  const upper = abbrev.toUpperCase();
  if (STATE_ZOOM_OVERRIDES[upper] != null) return STATE_ZOOM_OVERRIDES[upper];
  const bounds = STATE_BOUNDS[upper];
  if (!bounds) return REFERENCE_ZOOM;
  const [south, west, north, east] = bounds;
  const latSpan = north - south;
  const lngSpan = east - west;
  const diagonal = Math.sqrt(latSpan * latSpan + lngSpan * lngSpan);
  if (diagonal <= 0) return REFERENCE_ZOOM;
  const zoom = REFERENCE_ZOOM * (REFERENCE_DIAGONAL / diagonal);
  return Math.min(MAX_STATE_ZOOM, Math.max(MIN_STATE_ZOOM, Math.round(zoom * 10) / 10));
}
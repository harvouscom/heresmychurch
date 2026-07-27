import tzLookup from "tz-lookup";

/** Haversine distance in miles. */
export function haversineMiles(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 3958.7613;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export function haversineKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  return haversineMiles(lat1, lng1, lat2, lng2) * 1.609344;
}

/** Format a distance using the country's preferred units. */
export function formatDistance(
  miles: number,
  units: "mi" | "km",
  digits = 1,
): string {
  if (units === "km") {
    const km = miles * 1.609344;
    return `${km.toFixed(digits)} km`;
  }
  return `${miles.toFixed(digits)} mi`;
}

/** Short timezone label for a lat/lng (e.g. "EST", "PDT"). */
export function timezoneLabelForPoint(lat: number, lng: number): string | null {
  try {
    const zone = tzLookup(lat, lng);
    if (!zone) return null;
    try {
      const parts = new Intl.DateTimeFormat("en-US", {
        timeZone: zone,
        timeZoneName: "short",
      }).formatToParts(new Date());
      const tz = parts.find((p) => p.type === "timeZoneName")?.value;
      if (tz) return tz;
    } catch {
      /* fall through */
    }
    return zone.split("/").pop()?.replace(/_/g, " ") ?? zone;
  } catch {
    return null;
  }
}

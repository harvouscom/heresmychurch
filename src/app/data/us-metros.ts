/**
 * US metro areas for enrichment + SEO directory pages.
 * Source of truth: us-metros.json (also imported by scripts).
 */
import raw from "./us-metros.json";

export type UsMetro = {
  id: string;
  name: string;
  region: string;
  lat: number;
  lng: number;
  radiusKm: number;
};

export const US_METROS: UsMetro[] = raw as UsMetro[];

/** SEO URL slug: `us-nashville-tn` → `nashville-tn` */
export function metroSlug(metro: Pick<UsMetro, "id">): string {
  return metro.id.replace(/^us-/, "");
}

export function findMetroBySlug(slug: string): UsMetro | undefined {
  const s = slug.toLowerCase();
  return US_METROS.find((m) => metroSlug(m) === s || m.id === s);
}

export function haversineKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function churchesInMetro<T extends { lat: number; lng: number }>(
  churches: T[],
  metro: UsMetro,
): T[] {
  return churches.filter(
    (c) =>
      Number.isFinite(c.lat) &&
      Number.isFinite(c.lng) &&
      haversineKm(metro.lat, metro.lng, c.lat, c.lng) <= metro.radiusKm,
  );
}

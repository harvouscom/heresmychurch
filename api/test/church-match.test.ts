import { describe, it, expect } from "vitest";
import { nameSimilarity, normalizeChurchName, findLikelyDuplicates, scoreDuplicate, streetKey } from "../../shared/church-match";

const AUSTIN = { lat: 30.2672, lng: -97.7431 };
const metersNorth = (m: number) => ({ lat: AUSTIN.lat + m / 111_320, lng: AUSTIN.lng });

describe("church matching", () => {
  it("normalizes abbreviations, apostrophes, ampersands and accents", () => {
    expect(normalizeChurchName("St. Mary's Church")).toBe("saint mary church");
    expect(normalizeChurchName("Mt. Zion & 1st Baptist")).toBe("mount zion first baptist");
    expect(normalizeChurchName("Iglesia Bautista Emanuél")).toBe("iglesia bautista emanuel");
  });

  it("matches St. Mary's to Saint Mary Catholic Church", () => {
    expect(nameSimilarity("St. Mary's", "Saint Mary Catholic Church")).toBeGreaterThanOrEqual(0.85);
    const [m] = findLikelyDuplicates({ name: "St. Mary's", city: "Austin" }, [{ name: "Saint Mary Catholic Church", city: "Austin" }]);
    expect(m?.reasons).toContain("Similar name");
  });

  it("does not match First Baptist to First Presbyterian in the same city", () => {
    expect(nameSimilarity("First Baptist Church", "First Presbyterian Church")).toBeLessThan(0.85);
    expect(findLikelyDuplicates({ name: "First Baptist Church", city: "Austin", ...metersNorth(800) }, [{ name: "First Presbyterian Church", city: "Austin", ...AUSTIN }])).toEqual([]);
  });

  it("flags anything at the same spot, even an unnamed church", () => {
    const [m] = findLikelyDuplicates({ name: "Grace Fellowship", ...metersNorth(20) }, [{ name: "Unnamed Church", ...AUSTIN }]);
    expect(m).toBeTruthy();
    expect(m.reasons).toContain("20 m away");
  });

  it("does not match a same-named church 5 km away in another city", () => {
    expect(findLikelyDuplicates({ name: "Grace Church", city: "Round Rock", ...metersNorth(5000) }, [{ name: "Grace Church", city: "Austin", ...AUSTIN }])).toEqual([]);
  });

  it("catches small typos and extra generic words", () => {
    expect(nameSimilarity("Grace Communty Church", "Grace Community Church")).toBeGreaterThanOrEqual(0.85);
    expect(nameSimilarity("Grace Church", "Grace Community Church")).toBeGreaterThanOrEqual(0.85);
    expect(nameSimilarity("Grace Church", "Hope Church")).toBeLessThan(0.5);
  });

  it("uses the street address and ranks closer matches first", () => {
    expect(streetKey("123 N. Main St")).toBe("123 main");
    const s = scoreDuplicate({ name: "Redeemer", address: "123 Main Street" }, { name: "Redeemer Presbyterian", address: "123 N Main St" });
    expect(s.reasons).toContain("Same street address");
    const list = findLikelyDuplicates({ name: "Grace Church", ...AUSTIN }, [
      { id: "far", name: "Grace Church", ...metersNorth(1500) },
      { id: "near", name: "Grace Church", ...metersNorth(100) },
    ]);
    expect(list.map((m) => m.church.id)).toEqual(["near", "far"]);
  });
});

import { useEffect, useRef } from "react";
import type { SeasonalReport } from "../church-data";
import { getCountry } from "../../config/countries";
import { createGlobe } from "./lookup-particle-globe";
import globeCells from "./globe-cells.json";

// Lookup's aggregated particles provide a decorative geographic texture.
// Report metrics always come from the selected seasonal snapshot.
export function ReportGlobe({report}: {report: SeasonalReport}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const countryCode = report.countryCode || "US";
  const region = report.stateAbbrev;
  const world = report.scope === "world" || countryCode === "WORLD";
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const country = getCountry(countryCode);
    const bounds = region ? country?.regions[region]?.bounds : undefined;
    // Frame the mainland for the U.S. overview rather than centering the
    // combined Alaska/Hawaii bounding box over the Pacific.
    const regions = Object.values(country?.regions || {}).filter(region =>
      countryCode !== "US" || !["AK", "HI"].includes(region.abbrev));
    const countryBounds = regions.length ? [
      Math.min(...regions.map(r=>r.bounds[0])), Math.min(...regions.map(r=>r.bounds[1])),
      Math.max(...regions.map(r=>r.bounds[2])), Math.max(...regions.map(r=>r.bounds[3])),
    ] : null;
    const focusBounds = bounds || countryBounds;
    const lat = focusBounds ? (focusBounds[0]+focusBounds[2])/2 : 38;
    const lng = focusBounds ? (focusBounds[1]+focusBounds[3])/2 : -38;
    const scale = world ? 1.3 : region ? 2.2 : 1.7;
    const pinOffset = region ? 50 : 44;
    const globe = createGlobe(canvas, globeCells, {
      lat: world ? 26 : lat-pinOffset,
      lng: world ? -38 : lng,
      top: 20,
      scale,
      pinOffset,
      ...(world ? {} : { driftMin: lng - 10, driftMax: lng + 10, driftSpeed: .015 }),
    });
    // Only regional reports use a focus marker. A country is not a church.
    if (region && !world) globe.select({lat,lng});
    return () => globe.destroy();
  },[countryCode,region,world]);
  return <div className="report-globe" aria-hidden="true"><canvas ref={canvasRef}/></div>;
}

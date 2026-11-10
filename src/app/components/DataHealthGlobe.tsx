import { useEffect, useRef } from 'react';
import { PlaceFlag } from './PlaceFlag';
import type { RegionConfig } from '../config/countries';

export function DataHealthGlobe({ region, countryCode, countryName }: { region: RegionConfig; countryCode: string; countryName: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let disposed = false;
    let globe: { destroy(): void } | undefined;
    const [south, west, north, east] = region.bounds;
    const point = { lat: (south + north) / 2, lng: (west + east) / 2 };
    Promise.all([import('./report/lookup-particle-globe'), import('./report/globe-cells.json')]).then(([renderer, cells]) => {
      if (disposed || !canvas.current) return;
      // Frame the complete sphere inside the header. Keep its camera on this region.
      const instance = renderer.createGlobe(canvas.current, cells.default, { ...point, scale: .59, top: 24, driftSpeed: 0, pinOffset: 0 });
      instance.select(point);
      globe = instance;
    }).catch(() => { /* Keep the region label and CSS planet visible if canvas is unavailable. */ });
    return () => { disposed = true; globe?.destroy(); };
  }, [region.code]);
  return <figure className="health-region-globe" aria-label={`Church data globe centered on ${region.name}, ${countryName}`}>
    <div className="health-region-planet" aria-hidden="true" />
    <canvas ref={canvas} aria-hidden="true" />
    <figcaption className="health-globe-location"><PlaceFlag abbrev={region.abbrev} countryCode={countryCode} size="md" /><span><strong>{region.name}</strong><small>{countryName}</small></span>{countryCode === 'US' && <PlaceFlag abbrev="US" countryCode="WORLD" size="sm" />}</figcaption>
  </figure>;
}

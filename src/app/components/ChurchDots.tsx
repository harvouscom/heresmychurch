/**
 * ChurchDots — High-performance SVG circle renderer for church markers.
 *
 * Replaces per-church <Marker> components (which each carry 2 useState hooks,
 * 6 event handlers, and a wrapper <g>) with raw <circle> elements projected
 * once via useMapContext(). For 10k churches this eliminates ~20k React hooks
 * and ~60k function allocations per render.
 *
 * Additional optimisations:
 *  • Viewport culling in SVG-coordinate space (skips off-screen dots)
 *  • Event delegation (one handler on parent <g>, data-id hit testing)
 *  • React.memo isolation (hover/tooltip changes don't re-render dots)
 *  • Selected church rendered as a separate overlay (no sort per frame)
 */

import { memo, useMemo, useCallback } from "react";
// @ts-ignore — react-simple-maps doesn't ship type definitions for useMapContext
import { useMapContext } from "react-simple-maps";
import { getSizeCategory } from "./church-data";
import type { Church } from "./church-data";
import { ACTIVE_PIN_FILL } from "./map-constants";

interface ChurchDotsProps {
  churches: Church[];
  selectedChurchId: string | null;
  zoom: number;
  center: [number, number];
  onChurchClick: (church: Church, e?: React.MouseEvent<SVGGElement>) => void;
  onChurchHover: (church: Church | null) => void;
  /** When true (e.g. touch device), hover does not set tooltip — only tap/preview does. */
  disableHover?: boolean;
}

interface ProjectedChurch {
  id: string;
  x: number;
  y: number;
  r: number;
  color: string;
  church: Church;
}

export const ChurchDots = memo(function ChurchDots({
  churches,
  selectedChurchId,
  zoom,
  center,
  onChurchClick,
  onChurchHover,
  disableHover = false,
}: ChurchDotsProps) {
  const context = useMapContext();
  const projection = context?.projection;

  // ── O(1) lookup for event delegation ──
  const churchById = useMemo(() => {
    const map = new Map<string, Church>();
    for (const ch of churches) map.set(ch.id, ch);
    return map;
  }, [churches]);

  // ── Project all churches (stable unless churches array changes) ──
  const projected = useMemo(() => {
    if (!projection) return [];
    const result: ProjectedChurch[] = [];
    for (const ch of churches) {
      const coords = projection([ch.lng, ch.lat]);
      if (!coords) continue; // geoAlbersUsa returns null outside domain
      const cat = getSizeCategory(ch.attendance);
      result.push({
        id: ch.id,
        x: coords[0],
        y: coords[1],
        r: cat.radius,
        color: cat.color,
        church: ch,
      });
    }
    return result;
  }, [churches, projection]);

  // ── Viewport cull (runs when center/zoom changes after pan ends) ──
  const visible = useMemo(() => {
    if (!projection || projected.length === 0) return projected;
    // At zoom ≤ 1.5 the whole US is visible — skip culling
    if (zoom <= 1.5) return projected;

    // Convert geographic center → SVG coordinates
    const centerSvg = projection(center);
    if (!centerSvg) return projected;

    // ComposableMap default viewBox is 800×600
    // Visible SVG half-extents shrink with zoom; add 50% margin to prevent pop-in
    const halfW = (400 / zoom) * 1.5;
    const halfH = (300 / zoom) * 1.5;
    const cx = centerSvg[0];
    const cy = centerSvg[1];

    return projected.filter(
      (p) => Math.abs(p.x - cx) < halfW && Math.abs(p.y - cy) < halfH
    );
  }, [projected, center, zoom, projection]);

  // Sort by radius ascending so smaller (lower-attendance) circles render last and appear on top — easier to select when overlapping
  const visibleBySize = useMemo(
    () => [...visible].sort((a, b) => a.r - b.r),
    [visible]
  );

  // ── Event delegation handlers (one per parent <g>) ──
  const handleClick = useCallback(
    (e: React.MouseEvent<SVGGElement>) => {
      const id = (e.target as SVGElement).getAttribute("data-id");
      if (id) {
        const ch = churchById.get(id);
        if (ch) {
          e.stopPropagation(); // Prevent click from reaching background rect (navigate-back)
          onChurchClick(ch, e);
        }
      }
    },
    [churchById, onChurchClick]
  );

  const handleMouseOver = useCallback(
    (e: React.MouseEvent<SVGGElement>) => {
      if (disableHover) return;
      const id = (e.target as SVGElement).getAttribute("data-id");
      if (id) {
        const ch = churchById.get(id);
        if (ch) onChurchHover(ch);
      }
    },
    [churchById, onChurchHover, disableHover]
  );

  const handleMouseOut = useCallback(() => {
    if (!disableHover) onChurchHover(null);
  }, [onChurchHover, disableHover]);

  // Dots grow in screen size as you zoom in. On mobile, grow less (zoom^0.75) so they don't get too big.
  const isNarrow = typeof window !== "undefined" && window.innerWidth < 768;
  const zoomDiv = isNarrow ? Math.pow(zoom, 0.75) : Math.sqrt(zoom);
  // Scale down dot size on small screens so they don't dominate the map.
  const dotScale = isNarrow ? 0.6 : 1;

  // If context/projection not ready yet, render nothing
  if (!projection || visible.length === 0) return null;

  // ── Find selected entry for top-layer overlay ──
  const selectedEntry = selectedChurchId
    ? visible.find((v) => v.id === selectedChurchId)
    : null;

  return (
    <g
      onClick={handleClick}
      onMouseOver={handleMouseOver}
      onMouseOut={handleMouseOut}
      style={{ cursor: "pointer" }}
    >
      {/* Other church dots — single <g> transition instead of per-element */}
      <g
        opacity={selectedChurchId ? 0 : 1}
        style={{
          transition: "opacity 0.35s ease-out",
          pointerEvents: selectedChurchId ? "none" : "auto",
        }}
      >
        {visibleBySize.map((v) =>
          v.id === selectedChurchId ? null : (
            <g key={v.id}>
              {/* Larger invisible hit area (1.5×) for easier tap/click, especially on touch */}
              <circle
                data-id={v.id}
                cx={v.x}
                cy={v.y}
                r={(1.5 * v.r * dotScale) / zoomDiv}
                fill="transparent"
                stroke="none"
                style={{ cursor: "pointer" }}
              />
              <circle
                data-id={v.id}
                cx={v.x}
                cy={v.y}
                r={(v.r * dotScale) / zoomDiv}
                fill={v.color}
                fillOpacity={0.8}
                stroke="rgba(255,255,255,0.6)"
                strokeWidth={(0.8 * dotScale) / zoomDiv}
                style={{ cursor: "pointer", pointerEvents: "none" }}
              />
            </g>
          )
        )}
      </g>

      {/* Selected church — Lucide MapPin, drops in from above */}
      {selectedEntry && (() => {
        const pinScale = (1.2 * dotScale) / zoomDiv;
        return (
          <g
            key={selectedEntry.id}
            data-id={selectedEntry.id}
            transform={`translate(${selectedEntry.x},${selectedEntry.y}) scale(${pinScale})`}
            style={{ cursor: "pointer" }}
          >
            <g className="animate-pin-drop">
              <g transform="translate(-12,-22)">
                <path
                  data-id={selectedEntry.id}
                  d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0Z"
                  fill={ACTIVE_PIN_FILL}
                  stroke="rgba(255,255,255,0.9)"
                  strokeWidth={1.5}
                  strokeLinejoin="round"
                />
                <circle
                  data-id={selectedEntry.id}
                  cx={12}
                  cy={10}
                  r={3}
                  fill="white"
                />
              </g>
            </g>
          </g>
        );
      })()}
    </g>
  );
});

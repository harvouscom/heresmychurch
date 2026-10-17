"use client";

import {
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Filter,
  Key,
  Info,
  CircleHelp,
  ScrollText,
  ChevronUp,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";

const spring = { type: "spring" as const, stiffness: 300, damping: 24 };
const easeOut = { type: "tween" as const, ease: [0.25, 0.1, 0.25, 1], duration: 0.22 };

const morePanelVariants = {
  open: {
    height: "auto",
    opacity: 1,
    transition: spring,
  },
  closed: {
    height: 0,
    opacity: 0,
    transition: {
      height: { ...easeOut, delay: 0.08 },
      opacity: { duration: 0.1, ease: [0.25, 0.1, 0.25, 1] },
    },
  },
};

export function MapControls({
  focusedState,
  showFilterPanel,
  showLegend,
  onZoomIn,
  onZoomOut,
  onResetView,
  onToggleFilter,
  onToggleLegend,
  onShowAbout,
  onShowHelp,
  onShowAudit,
  showAuditButton = false,
  zoom,
  minZoom = 1,
  maxZoom = 500,
  compact = false,
}: {
  focusedState: string | null;
  showFilterPanel: boolean;
  showLegend: boolean;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetView: () => void;
  onToggleFilter: () => void;
  onToggleLegend: () => void;
  onShowAbout: () => void;
  onShowHelp: () => void;
  onShowAudit?: () => void;
  showAuditButton?: boolean;
  zoom: number;
  minZoom?: number;
  maxZoom?: number;
  compact?: boolean;
}) {
  const [moreOpen, setMoreOpen] = useState(false);
  const zoomInDisabled = zoom >= maxZoom;
  const zoomOutDisabled = zoom <= minZoom;
  const sizeClass = compact ? "w-8 h-8" : "w-9 h-9";
  const iconSize = compact ? 14 : 16;
  const gapClass = compact ? "gap-1.5" : "gap-2";

  /** Round map control: glass when idle, brand purple when its panel is open. */
  const controlClass = (active = false) =>
    [
      sizeClass,
      "rounded-full flex items-center justify-center shrink-0 border shadow-hmc-pill backdrop-blur-md transition-colors",
      "disabled:opacity-30 disabled:cursor-not-allowed",
      active
        ? "bg-hmc-brand border-hmc-brand text-white"
        : "bg-hmc-surface-glass border-hmc-border text-hmc-lilac hover:bg-hmc-surface-raised hover:text-white",
    ].join(" ");

  return (
    <div className={`flex flex-col ${gapClass}`}>
      {/* Always visible: zoom + refresh */}
      <button
        type="button"
        onClick={onZoomIn}
        disabled={zoomInDisabled}
        title="Zoom in"
        aria-label="Zoom in"
        className={controlClass()}
      >
        <ZoomIn size={iconSize} />
      </button>
      <button
        type="button"
        onClick={onZoomOut}
        disabled={zoomOutDisabled}
        title="Zoom out"
        aria-label="Zoom out"
        className={controlClass()}
      >
        <ZoomOut size={iconSize} />
      </button>
      <button
        type="button"
        onClick={onResetView}
        title="Reset view"
        aria-label="Reset view"
        className={controlClass()}
      >
        <RotateCcw size={iconSize} />
      </button>

      {/* More trigger: expand/collapse extra controls; chevron rotates like header pill / filters */}
      <button
        type="button"
        onClick={() => setMoreOpen((o) => !o)}
        aria-expanded={moreOpen}
        aria-controls="map-controls-more"
        aria-label={moreOpen ? "Close map options" : "More map options"}
        title={moreOpen ? "Close options" : "More options"}
        className={controlClass(moreOpen)}
      >
        <ChevronUp
          size={iconSize}
          className={`transition-transform duration-200 ${moreOpen ? "rotate-180" : ""}`}
        />
      </button>

      <AnimatePresence initial={false}>
        {moreOpen && (
          <motion.div
            id="map-controls-more"
            role="region"
            aria-label="Map options"
            variants={morePanelVariants}
            initial="closed"
            animate="open"
            exit="closed"
            className={`overflow-hidden flex flex-col ${gapClass}`}
          >
            {focusedState && (
              <button
                type="button"
                onClick={onToggleFilter}
                title="Filters"
                aria-label="Filters"
                aria-pressed={showFilterPanel}
                className={controlClass(showFilterPanel)}
              >
                <Filter size={iconSize} />
              </button>
            )}
            <button
              type="button"
              onClick={onToggleLegend}
              title="Map Key"
              aria-label="Map Key"
              aria-pressed={showLegend}
              className={controlClass(showLegend)}
            >
              <Key size={iconSize} />
            </button>
            <button type="button" onClick={onShowAbout} title="About" aria-label="About" className={controlClass()}>
              <Info size={iconSize} />
            </button>
            <button type="button" onClick={onShowHelp} title="Help" aria-label="Help" className={controlClass()}>
              <CircleHelp size={iconSize} />
            </button>
            {showAuditButton && onShowAudit && (
              <button
                type="button"
                onClick={onShowAudit}
                title="Change history"
                aria-label="Change history"
                className={controlClass()}
              >
                <ScrollText size={iconSize} />
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

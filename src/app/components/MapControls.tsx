"use client";

import {
  Plus,
  Minus,
  RotateCcw,
  Filter,
  Key,
  Info,
  CircleHelp,
  ScrollText,
  Ellipsis,
  MapPinPlus,
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
  onAddChurch,
  addingChurch = false,
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
  /** Turns on "pick a spot" mode for adding a church; shown inside a region. */
  onAddChurch?: () => void;
  addingChurch?: boolean;
}) {
  const [moreOpen, setMoreOpen] = useState(false);
  const zoomInDisabled = zoom >= maxZoom;
  const zoomOutDisabled = zoom <= minZoom;
  const sizeClass = compact ? "w-8 h-8" : "w-9 h-9";
  const iconSize = compact ? 14 : 16;
  const gapClass = "gap-1";

  /** Round map control: glass when idle, brand purple when its panel is open. */
  const controlClass = (active = false) =>
    [
      sizeClass,
      "rounded-lg flex items-center justify-center shrink-0 transition-[background-color,color,transform] duration-150 enabled:active:scale-95 focus-visible:outline-2 focus-visible:outline-purple-400",
      "disabled:opacity-30 disabled:cursor-not-allowed",
      active
        ? "bg-purple-500/25 text-white"
        : "text-purple-100/65 hover:bg-white/10 hover:text-white",
    ].join(" ");

  return (
    <div className={`map-control-surface flex flex-col ${gapClass} rounded-2xl border border-white/10 p-1 shadow-hmc-pill backdrop-blur-md`} role="group" aria-label="Map controls">
      {/* Always visible: zoom + refresh */}
      <button
        type="button"
        onClick={onZoomIn}
        disabled={zoomInDisabled}
        title="Zoom in"
        aria-label="Zoom in"
        className={controlClass()}
      >
        <Plus size={iconSize} />
      </button>
      <button
        type="button"
        onClick={onZoomOut}
        disabled={zoomOutDisabled}
        title="Zoom out"
        aria-label="Zoom out"
        className={controlClass()}
      >
        <Minus size={iconSize} />
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

      {focusedState && onAddChurch && (
        <button
          type="button"
          onClick={onAddChurch}
          aria-pressed={addingChurch}
          title={addingChurch ? "Cancel adding a church" : "Add a church on the map"}
          aria-label={addingChurch ? "Cancel adding a church" : "Add a church on the map"}
          className={controlClass(addingChurch)}
        >
          <MapPinPlus size={iconSize} />
        </button>
      )}

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
        <Ellipsis size={iconSize} />
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
            // Room around the buttons: the clip is for the height animation, not their shadows.
            className={`overflow-hidden -mx-3 px-3 -mb-3 pb-3 flex flex-col ${gapClass}`}
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

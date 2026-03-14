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

  return (
    <div className={`flex flex-col ${gapClass}`}>
      {/* Always visible: zoom + refresh */}
      <button
        onClick={onZoomIn}
        disabled={zoomInDisabled}
        className={`${sizeClass} rounded-full flex items-center justify-center shadow-md transition-colors disabled:opacity-30 disabled:cursor-not-allowed`}
        style={{ backgroundColor: "rgba(30,16,64,0.9)" }}
      >
        <ZoomIn size={iconSize} color="#C9A0DC" />
      </button>
      <button
        onClick={onZoomOut}
        disabled={zoomOutDisabled}
        className={`${sizeClass} rounded-full flex items-center justify-center shadow-md transition-colors disabled:opacity-30 disabled:cursor-not-allowed`}
        style={{ backgroundColor: "rgba(30,16,64,0.9)" }}
      >
        <ZoomOut size={iconSize} color="#C9A0DC" />
      </button>
      <button
        onClick={onResetView}
        title="Reset view"
        aria-label="Reset view"
        className={`${sizeClass} rounded-full flex items-center justify-center shadow-md transition-colors`}
        style={{ backgroundColor: "rgba(30,16,64,0.9)" }}
      >
        <RotateCcw size={iconSize} color="#C9A0DC" />
      </button>

      {/* More trigger: expand/collapse extra controls; chevron rotates like header pill / filters */}
      <button
        type="button"
        onClick={() => setMoreOpen((o) => !o)}
        aria-expanded={moreOpen}
        aria-controls="map-controls-more"
        aria-label={moreOpen ? "Close map options" : "More map options"}
        title={moreOpen ? "Close options" : "More options"}
        className={`${sizeClass} rounded-full flex items-center justify-center shadow-md transition-colors`}
        style={{
          backgroundColor: moreOpen ? "#6B21A8" : "rgba(30,16,64,0.9)",
        }}
      >
        <ChevronUp
          size={iconSize}
          color={moreOpen ? "#fff" : "#C9A0DC"}
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
                onClick={onToggleFilter}
                className={`${sizeClass} rounded-full flex items-center justify-center shadow-md transition-colors shrink-0`}
                style={{
                  backgroundColor: showFilterPanel
                    ? "#6B21A8"
                    : "rgba(30,16,64,0.9)",
                }}
              >
                <Filter size={iconSize} color={showFilterPanel ? "#fff" : "#C9A0DC"} />
              </button>
            )}
            <button
              onClick={onToggleLegend}
              title="Map Key"
              aria-label="Map Key"
              className={`${sizeClass} rounded-full flex items-center justify-center shadow-md transition-colors shrink-0`}
              style={{
                backgroundColor: showLegend
                  ? "#6B21A8"
                  : "rgba(30,16,64,0.9)",
              }}
            >
              <Key size={iconSize} color={showLegend ? "#fff" : "#C9A0DC"} />
            </button>
            <button
              onClick={onShowAbout}
              title="About"
              aria-label="About"
              className={`${sizeClass} rounded-full flex items-center justify-center shadow-md transition-colors shrink-0`}
              style={{ backgroundColor: "rgba(30,16,64,0.9)" }}
            >
              <Info size={iconSize} color="#C9A0DC" />
            </button>
            <button
              onClick={onShowHelp}
              title="Help"
              aria-label="Help"
              className={`${sizeClass} rounded-full flex items-center justify-center shadow-md transition-colors shrink-0`}
              style={{ backgroundColor: "rgba(30,16,64,0.9)" }}
            >
              <CircleHelp size={iconSize} color="#C9A0DC" />
            </button>
            {showAuditButton && onShowAudit && (
              <button
                onClick={onShowAudit}
                title="Change history"
                aria-label="Change history"
                className={`${sizeClass} rounded-full flex items-center justify-center shadow-md transition-colors shrink-0`}
                style={{ backgroundColor: "rgba(30,16,64,0.9)" }}
              >
                <ScrollText size={iconSize} color="#C9A0DC" />
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
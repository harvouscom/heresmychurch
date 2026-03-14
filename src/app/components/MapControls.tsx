import {
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Filter,
  Key,
  Info,
  CircleHelp,
} from "lucide-react";

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
  zoom: number;
  minZoom?: number;
  maxZoom?: number;
  compact?: boolean;
}) {
  const zoomInDisabled = zoom >= maxZoom;
  const zoomOutDisabled = zoom <= minZoom;
  const sizeClass = compact ? "w-8 h-8" : "w-9 h-9";
  const iconSize = compact ? 14 : 16;
  const gapClass = compact ? "gap-1.5" : "gap-2";

  return (
    <div className={`flex flex-col ${gapClass}`}>
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
        className={`${sizeClass} rounded-full flex items-center justify-center shadow-md transition-colors`}
        style={{ backgroundColor: "rgba(30,16,64,0.9)" }}
      >
        <RotateCcw size={iconSize} color="#C9A0DC" />
      </button>
      {focusedState && (
        <button
          onClick={onToggleFilter}
          className={`${sizeClass} rounded-full flex items-center justify-center shadow-md transition-colors`}
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
        className={`${sizeClass} rounded-full flex items-center justify-center shadow-md transition-colors`}
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
        className={`${sizeClass} rounded-full flex items-center justify-center shadow-md transition-colors`}
        style={{ backgroundColor: "rgba(30,16,64,0.9)" }}
      >
        <Info size={iconSize} color="#C9A0DC" />
      </button>
      <button
        onClick={onShowHelp}
        title="Help"
        aria-label="Help"
        className={`${sizeClass} rounded-full flex items-center justify-center shadow-md transition-colors`}
        style={{ backgroundColor: "rgba(30,16,64,0.9)" }}
      >
        <CircleHelp size={iconSize} color="#C9A0DC" />
      </button>
    </div>
  );
}
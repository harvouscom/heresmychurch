import {
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Filter,
} from "lucide-react";

export function MapControls({
  focusedState,
  showFilterPanel,
  onZoomIn,
  onZoomOut,
  onResetView,
  onToggleFilter,
  zoom,
}: {
  focusedState: string | null;
  showFilterPanel: boolean;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetView: () => void;
  onToggleFilter: () => void;
  zoom: number;
}) {
  const zoomInDisabled = zoom >= 120;
  const zoomOutDisabled = zoom <= 1;

  return (
    <div className="absolute left-4 bottom-6 z-20 flex flex-col gap-2">
      <button
        onClick={onZoomIn}
        disabled={zoomInDisabled}
        className="w-9 h-9 rounded-lg flex items-center justify-center shadow-md transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        style={{ backgroundColor: "rgba(30,16,64,0.9)" }}
      >
        <ZoomIn size={16} color="#C9A0DC" />
      </button>
      <button
        onClick={onZoomOut}
        disabled={zoomOutDisabled}
        className="w-9 h-9 rounded-lg flex items-center justify-center shadow-md transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        style={{ backgroundColor: "rgba(30,16,64,0.9)" }}
      >
        <ZoomOut size={16} color="#C9A0DC" />
      </button>
      <button
        onClick={onResetView}
        className="w-9 h-9 rounded-lg flex items-center justify-center shadow-md transition-colors"
        style={{ backgroundColor: "rgba(30,16,64,0.9)" }}
      >
        <RotateCcw size={16} color="#C9A0DC" />
      </button>
      {focusedState && (
        <button
          onClick={onToggleFilter}
          className="w-9 h-9 rounded-lg flex items-center justify-center shadow-md transition-colors"
          style={{
            backgroundColor: showFilterPanel
              ? "#6B21A8"
              : "rgba(30,16,64,0.9)",
          }}
        >
          <Filter size={16} color={showFilterPanel ? "#fff" : "#C9A0DC"} />
        </button>
      )}
    </div>
  );
}
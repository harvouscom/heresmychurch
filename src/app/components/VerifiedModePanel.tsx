import { CheckCircle2, Sparkles } from "lucide-react";
import { MapPopover } from "./ui/map-popover";

export interface VerifiedModePanelProps {
  open: boolean;
  onClose: () => void;
  onExitVerifiedMode: () => void;
  verifiedChurchCount: number | null;
}

export function VerifiedModePanel({
  open,
  onClose,
  onExitVerifiedMode,
  verifiedChurchCount,
}: VerifiedModePanelProps) {
  if (!open) return null;

  return (
    <MapPopover
      title="Verified mode"
      icon={<Sparkles size={14} className="text-purple-400" />}
      onClose={onClose}
      padded={false}
    >

      {/* Count badge */}
      <div className="px-4 py-3 border-b border-white/10">
        {verifiedChurchCount == null ? (
          <div className="flex items-center gap-2 text-xs text-white/40">
            <span className="inline-block w-16 h-3 rounded bg-white/10 animate-pulse" />
            loading…
          </div>
        ) : (
          <div className="flex items-baseline gap-1.5">
            <span className="text-2xl font-bold text-white tabular-nums">
              {verifiedChurchCount.toLocaleString()}
            </span>
            <span className="text-xs text-white/50">verified churches on map</span>
          </div>
        )}
      </div>

      {/* What "verified" means */}
      <div className="px-4 py-3 space-y-1.5">
        {[
          "Confirmed address",
          "Website listed",
          "Service times listed",
        ].map((item) => (
          <div key={item} className="flex items-center gap-2">
            <CheckCircle2 size={12} className="text-purple-400 flex-shrink-0" />
            <span className="text-xs text-white/60">{item}</span>
          </div>
        ))}
      </div>

      {/* Exit */}
      <div className="px-4 pb-3 pt-1 border-t border-white/10">
        <button
          type="button"
          onClick={onExitVerifiedMode}
          className="w-full text-xs text-white/40 hover:text-white/70 transition-colors text-left"
        >
          Exit verified mode
        </button>
      </div>
    </MapPopover>
  );
}

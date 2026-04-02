import { CheckCircle2, Sparkles } from "lucide-react";
import { CloseButton } from "./ui/close-button";

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
    <div
      className="absolute left-[58px] bottom-6 z-[35] rounded-xl shadow-2xl w-[260px]"
      style={{ backgroundColor: "rgba(30, 16, 64, 0.96)" }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-white/10">
        <div className="flex items-center gap-2">
          <Sparkles size={14} className="text-purple-400" />
          <span className="text-sm font-semibold text-white">Verified mode</span>
        </div>
        <CloseButton onClick={onClose} size="md" />
      </div>

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
          "Service times listed",
          "Denomination on file",
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
    </div>
  );
}

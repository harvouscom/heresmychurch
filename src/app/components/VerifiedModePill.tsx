import { Sparkles } from "lucide-react";

export function VerifiedModePill({
  onClick,
}: {
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-2 rounded-full border border-purple-200/70 bg-white/90 px-3 py-1.5 text-xs font-medium text-stone-700 shadow-sm hover:border-purple-300 hover:bg-white transition-colors"
    >
      <Sparkles className="h-4 w-4 text-purple-600" aria-hidden />
      Verified churches near you
    </button>
  );
}


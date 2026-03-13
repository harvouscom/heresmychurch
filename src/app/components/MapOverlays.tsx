import { motion, AnimatePresence } from "motion/react";
import { X, Mail } from "lucide-react";
import { ThreeDotLoader } from "./ThreeDotLoader";

const CONTACT_EMAIL = "hey@heresmychurch.com";
import { CloseButton } from "./ui/close-button";
import { StateFlag } from "./StateFlag";
import { getSizeCategory, getFallbackLocation, churchNeedsReview } from "./church-data";
import type { Church } from "./church-data";
import { formatFullAddress } from "./AddressInput";
import { WAITING_SAYINGS } from "./map-constants";

// --- Loading Overlay ---
export function LoadingOverlay({
  loadingStateName,
  sayingIndex,
}: {
  loadingStateName: string;
  sayingIndex: number | null;
}) {
  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/20 backdrop-blur-sm">
      <div
        className="flex flex-col items-center gap-3 px-8 py-6 rounded-2xl shadow-2xl text-white"
        style={{ backgroundColor: "rgba(30, 16, 64, 0.95)" }}
      >
        <ThreeDotLoader size={28} />
        <span className="text-sm font-medium">
          {loadingStateName
            ? `Loading churches in ${loadingStateName}...`
            : `Loading churches...`}
        </span>
        <div className="mt-2 pt-3 border-t border-white/10 max-w-[280px] text-center relative overflow-hidden" style={{ minHeight: 72 }}>
          <AnimatePresence mode="wait">
            {sayingIndex !== null && (
              <motion.div
                key={sayingIndex}
                initial={{ opacity: 0, y: 12, filter: "blur(4px)" }}
                animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                exit={{ opacity: 0, y: -12, filter: "blur(4px)" }}
                transition={{ duration: 0.5, ease: "easeInOut" }}
              >
                <p className="text-white/50 text-xs italic leading-relaxed">
                  "{WAITING_SAYINGS[sayingIndex].text}"
                </p>
                <p className="text-purple-400/60 text-[10px] mt-1.5 font-medium">
                  -- {WAITING_SAYINGS[sayingIndex].ref}
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

// --- Error Overlay (full screen, no churches loaded) ---
export function ErrorOverlay({
  focusedStateName,
  error,
  onRetry,
  onGoBack,
}: {
  focusedStateName: string;
  error: string;
  onRetry: () => void;
  onGoBack: () => void;
}) {
  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none">
      <div
        className="flex flex-col items-center gap-4 px-8 py-6 rounded-2xl shadow-2xl pointer-events-auto max-w-[340px]"
        style={{ backgroundColor: "rgba(30, 16, 64, 0.95)" }}
      >
        <div className="w-10 h-10 rounded-full bg-red-500/20 flex items-center justify-center">
          <X size={20} className="text-red-400" />
        </div>
        <div className="text-center">
          <div className="text-white font-semibold text-sm">
            Couldn't load {focusedStateName}
          </div>
          <div className="text-white/50 text-xs mt-1.5 leading-relaxed">
            {error}
          </div>
        </div>
        <div className="flex flex-wrap gap-3 justify-center">
          <button
            onClick={onRetry}
            className="px-5 py-2 rounded-full text-white text-sm font-medium shadow-lg hover:shadow-xl transition-all"
            style={{
              background:
                "linear-gradient(135deg, #6B21A8 0%, #A855F7 100%)",
            }}
          >
            Try Again
          </button>
          <button
            onClick={onGoBack}
            className="px-5 py-2 rounded-full text-white/60 text-sm border border-white/15 hover:bg-white/5 transition-all"
          >
            Go Back
          </button>
          <a
            href={`mailto:${CONTACT_EMAIL}`}
            className="flex items-center gap-2 px-5 py-2 rounded-full text-white/60 text-sm border border-white/15 hover:bg-white/5 transition-all"
          >
            <Mail size={14} />
            Email us
          </a>
        </div>
      </div>
    </div>
  );
}

// --- Error Banner (non-critical, churches still loaded) ---
export function ErrorBanner({
  error,
  onDismiss,
}: {
  error: string;
  onDismiss: () => void;
}) {
  return (
    <div className="absolute top-20 left-1/2 -translate-x-1/2 z-20">
      <div
        className="flex items-center gap-3 px-5 py-3 rounded-xl shadow-lg text-xs"
        style={{ backgroundColor: "rgba(180, 40, 60, 0.9)" }}
      >
        <span className="text-white">{error}</span>
        <button
          onClick={onDismiss}
          className="text-white/60 hover:text-white"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}

// --- State Tooltip (national view hover or pinned) ---
export function StateTooltip({
  hoveredState,
  states,
  tooltipPos,
  activeByState = {},
  reviewCount,
  pinned = false,
  onViewState,
  onClose,
}: {
  hoveredState: string;
  states: { abbrev: string; name: string; isPopulated: boolean; churchCount: number }[];
  tooltipPos: { x: number; y: number };
  activeByState?: Record<string, number>;
  reviewCount?: number;
  pinned?: boolean;
  onViewState?: () => void;
  onClose?: () => void;
}) {
  const info = states.find((s) => s.abbrev === hoveredState);
  const activeCount = activeByState[hoveredState] ?? 0;
  const interactive = pinned && (onViewState || onClose);
  return (
    <div
      className={`fixed z-[60] rounded-xl shadow-xl px-4 py-3 ${interactive ? "" : "pointer-events-none"}`}
      style={{
        left: tooltipPos.x + 16,
        top: tooltipPos.y - 40,
        minWidth: 160,
        backgroundColor: "rgba(30, 16, 64, 0.96)",
      }}
    >
      {pinned && onClose && (
        <CloseButton
          onClick={onClose}
          size="md"
          className="absolute -right-4 -top-4 shadow-md transition-colors"
          style={{ backgroundColor: "rgba(30, 16, 64, 0.9)" }}
        />
      )}
      <div className="flex items-center gap-2 text-sm font-semibold text-white">
        <StateFlag abbrev={hoveredState} size="sm" />
        {info?.name || hoveredState}
      </div>
      <div className="text-xs text-purple-300 mt-0.5">
        {info?.isPopulated
          ? `${info.churchCount.toLocaleString()} churches`
          : "Click to explore"}
      </div>
      {activeCount > 0 && (
        <div className="text-xs text-green-400/90 mt-1">
          {activeCount === 1 ? "1 person viewing now" : `${activeCount.toLocaleString()} people viewing now`}
        </div>
      )}
      {reviewCount != null && reviewCount > 0 && (
        <div className="text-pink-300 text-[11px] font-medium mt-1">
          {reviewCount.toLocaleString()} need review
        </div>
      )}
      {pinned && onViewState && (
        <button
          type="button"
          onClick={onViewState}
          className="mt-3 w-full py-2 rounded-lg text-sm font-medium bg-purple-500 hover:bg-purple-600 text-white"
        >
          View state
        </button>
      )}
    </div>
  );
}

// --- County Tooltip (state view hover over county) ---
export function CountyTooltip({
  countyFips,
  countyStats,
  tooltipPos,
}: {
  countyFips: string;
  countyStats: { byFips: Record<string, { churchCount: number; peoplePer: number; name?: string }> };
  tooltipPos: { x: number; y: number };
}) {
  const data = countyStats.byFips[countyFips];
  if (!data) return null;
  return (
    <div
      className="fixed z-50 pointer-events-none rounded-lg shadow-xl px-4 py-2.5"
      style={{
        left: tooltipPos.x + 16,
        top: tooltipPos.y - 40,
        backgroundColor: "rgba(30, 16, 64, 0.95)",
      }}
    >
      {data.name && (
        <div className="text-sm font-semibold text-white">
          {data.name}
        </div>
      )}
      <div className={data.name ? "text-xs text-purple-300 mt-0.5" : "text-sm text-white"}>
        {data.churchCount.toLocaleString()} churches · 1 per {data.peoplePer.toLocaleString()} people
      </div>
    </div>
  );
}

// --- Church Tooltip / Preview (hover or click on dot) ---
export function ChurchTooltip({
  church,
  tooltipPos,
  showReviewStatus = false,
  pinned = false,
  onViewChurch,
  onClose,
}: {
  church: Church;
  tooltipPos: { x: number; y: number };
  showReviewStatus?: boolean;
  pinned?: boolean;
  onViewChurch?: (church: Church) => void;
  onClose?: () => void;
}) {
  const hasAddressOrCity = church.address?.trim() || church.city?.trim();
  const displayLocation = hasAddressOrCity
    ? formatFullAddress(church.address, church.city, church.state)
    : getFallbackLocation(church);
  const interactive = pinned && (onViewChurch || onClose);
  return (
    <div
      className={`fixed z-[60] rounded-xl shadow-xl px-4 py-3 max-w-[300px] ${interactive ? "" : "pointer-events-none"}`}
      style={{
        left: tooltipPos.x + 16,
        top: tooltipPos.y - 70,
        minWidth: 160,
        backgroundColor: "rgba(30, 16, 64, 0.96)",
      }}
    >
      {pinned && onClose && (
        <CloseButton
          onClick={onClose}
          size="md"
          className="absolute -right-4 -top-4 shadow-md transition-colors"
          style={{ backgroundColor: "rgba(30, 16, 64, 0.9)" }}
        />
      )}
      <div className="text-sm font-semibold text-white">
        {church.name}
      </div>
      {displayLocation && (
        <div className="text-xs text-white/50 mt-0.5">
          {displayLocation}
        </div>
      )}
      <div className="flex items-center gap-3 mt-2">
        <div className="flex items-center gap-1.5">
          <div
            className="w-2.5 h-2.5 rounded-full"
            style={{
              backgroundColor: getSizeCategory(church.attendance).color,
            }}
          />
          <span className="text-xs text-purple-300">
            ~{church.attendance.toLocaleString()} attending
          </span>
        </div>
      </div>
      <div className="text-xs text-white/40 mt-1.5 flex items-center gap-1.5">
        <span
          className="inline-block w-1.5 h-1.5 rounded-full"
          style={{ backgroundColor: "#A855F7" }}
        />
        {church.denomination === "Other" || church.denomination === "Unknown" ? "Unspecified" : church.denomination}
      </div>
      {showReviewStatus && churchNeedsReview(church) && (
        <div className="text-pink-300 text-[11px] font-medium mt-1">
          Needs review
        </div>
      )}
      {pinned && onViewChurch && (
        <button
          type="button"
          onClick={() => onViewChurch(church)}
          className="mt-3 w-full py-2 rounded-lg text-sm font-medium bg-purple-500 hover:bg-purple-600 text-white"
        >
          View church
        </button>
      )}
    </div>
  );
}
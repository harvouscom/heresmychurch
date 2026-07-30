import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ThreeDotLoader } from "../ThreeDotLoader";
import { WAITING_SAYINGS } from "../map-constants";

/**
 * Loading empty-state for metro directory pages — same three-dot loader
 * and waiting sayings as the map overlay, tuned for the light content layout.
 */
export function MetroLoadingState({ placeName }: { placeName: string }) {
  const [sayingIndex, setSayingIndex] = useState<number | null>(null);

  useEffect(() => {
    const showTimer = setTimeout(() => {
      setSayingIndex(Math.floor(Math.random() * WAITING_SAYINGS.length));
    }, 800);

    const cycleTimer = setInterval(() => {
      setSayingIndex((prev) => {
        let next: number;
        do {
          next = Math.floor(Math.random() * WAITING_SAYINGS.length);
        } while (next === prev && WAITING_SAYINGS.length > 1);
        return next;
      });
    }, 3500);

    return () => {
      clearTimeout(showTimer);
      clearInterval(cycleTimer);
    };
  }, []);

  return (
    <div
      className="flex flex-col items-center justify-center rounded-xl border border-stone-200/80 bg-white/70 px-6 py-16 sm:py-20 text-center"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="text-purple-500">
        <ThreeDotLoader size={28} className="bg-purple-500" />
      </div>
      <p className="mt-5 text-sm font-medium text-stone-800">
        Loading churches in {placeName}…
      </p>
      <p className="mt-1 text-xs text-stone-400">
        Gathering the directory for this metro
      </p>

      <div
        className="mt-6 pt-5 border-t border-stone-200/80 w-full max-w-[280px] relative overflow-hidden"
        style={{ minHeight: 72 }}
      >
        <AnimatePresence mode="wait">
          {sayingIndex !== null && (
            <motion.div
              key={sayingIndex}
              initial={{ opacity: 0, y: 10, filter: "blur(4px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              exit={{ opacity: 0, y: -10, filter: "blur(4px)" }}
              transition={{ duration: 0.45, ease: "easeInOut" }}
            >
              <p className="text-stone-500 text-xs italic leading-relaxed">
                “{WAITING_SAYINGS[sayingIndex].text}”
              </p>
              <p className="text-purple-500/70 text-[10px] mt-1.5 font-medium">
                — {WAITING_SAYINGS[sayingIndex].ref}
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

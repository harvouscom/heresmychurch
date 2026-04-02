import { Megaphone, ChevronDown } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { announcements } from "../config/announcements";
import { CloseButton } from "./ui/close-button";

export function AnnouncementsPill({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const activeAnnouncements = announcements.filter((a) => !a.outOfDate);

  if (activeAnnouncements.length === 0 && !open) {
    return null;
  }

  const collapsedLabel =
    activeAnnouncements.length === 1
      ? "1 announcement"
      : `${activeAnnouncements.length} announcements`;

  return (
    <div className="flex flex-col items-center min-w-0 max-w-full">
      <button
        type="button"
        onClick={() => onOpenChange(!open)}
        className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-full min-w-0 truncate hover:opacity-90 transition-opacity cursor-pointer bg-purple-500/10 border border-purple-500/20 backdrop-blur-md"
        style={{
          boxShadow:
            "inset 0 1px 0 0 rgba(255, 255, 255, 0.2), inset 0 -1px 0 0 rgba(0, 0, 0, 0.1)",
        }}
        aria-expanded={open}
      >
        <Megaphone
          size={12}
          className="text-purple-700 flex-shrink-0"
          aria-hidden
        />
        <span className="text-purple-800 text-[11px] font-medium truncate">
          {collapsedLabel}
        </span>
        <ChevronDown
          size={12}
          className={`text-purple-700/70 flex-shrink-0 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
          aria-hidden
        />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.97 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="mt-2 rounded-2xl shadow-2xl overflow-hidden w-[min(360px,calc(100vw-3.5rem))] max-h-[390px] flex flex-col border border-purple-500/20"
            style={{
              backgroundColor: "rgba(30, 16, 64, 0.97)",
              boxShadow:
                "inset 0 1px 0 0 rgba(255, 255, 255, 0.06), inset 0 -1px 0 0 rgba(0, 0, 0, 0.2)",
            }}
          >
            <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-purple-500/20 flex-shrink-0">
              <span className="flex items-center gap-1.5 text-xs font-medium text-white uppercase tracking-widest">
                Announcements
              </span>
              <CloseButton
                onClick={() => onOpenChange(false)}
                className="[&>svg]:text-white/60 hover:bg-purple-500/20"
              />
            </div>
            <div className="px-5 py-4 space-y-4 overflow-y-auto flex-1 min-h-0">
              {activeAnnouncements.length === 0 ? (
                <p className="text-white/60 text-[11px]">No announcements right now.</p>
              ) : (
                <div className="space-y-3">
                  {activeAnnouncements.map((ann) => (
                    <div key={ann.id} className="space-y-1">
                      <p className="text-white text-sm font-medium">{ann.title}</p>
                      <p className="text-white/80 text-[13px] leading-relaxed">
                        {typeof ann.body === "string" && ann.body.includes("hey@heresmychurch.com")
                          ? ann.body.split("hey@heresmychurch.com").map((part, i, arr) => (
                              <span key={i}>
                                {part}
                                {i < arr.length - 1 && (
                                  <a
                                    href="mailto:hey@heresmychurch.com"
                                    className="text-purple-300 hover:text-purple-200 underline"
                                  >
                                    hey@heresmychurch.com
                                  </a>
                                )}
                              </span>
                            ))
                          : ann.body}
                      </p>
                      {ann.date && (
                        <p className="text-purple-300/90 text-[11px]">
                          {ann.date}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

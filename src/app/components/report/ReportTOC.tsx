import React, { useState, useRef, useEffect } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  MapPin,
  SearchCheck,
  Globe,
  Church,
  Languages,
  Sparkles,
  Scale,
  Lightbulb,
  Trophy,
  Heart,
  TrendingUp,
  LayoutGrid,
  ChevronUp,
  X,
} from "lucide-react";
import {
  REPORT_SECTIONS,
  type SectionId,
  type IconName,
  type ReportSection,
} from "./useReportScrollspy";
import { CloseButton } from "../ui/close-button";

const ICON_MAP: Record<IconName, React.ComponentType<{ className?: string }>> = {
  MapPin,
  SearchCheck,
  Globe,
  Church,
  Languages,
  Sparkles,
  Scale,
  Lightbulb,
  Trophy,
  Heart,
  TrendingUp,
  LayoutGrid,
};

interface ReportTOCProps {
  activeSection: SectionId;
  scrollProgress: number;
  onNavigate: (id: SectionId) => void;
  sections?: readonly ReportSection[];
}

// ── Unified floating TOC pill + compact expand ──
export function ReportTOC({
  activeSection,
  scrollProgress,
  onNavigate,
  sections = REPORT_SECTIONS,
}: ReportTOCProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const current = sections.find((s) => s.id === activeSection);
  const CurrentIcon = current ? ICON_MAP[current.icon] : null;

  // Close on click outside
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [isOpen]);

  return (
    <div ref={containerRef} className="fixed bottom-5 left-1/2 -translate-x-1/2 z-50 sm:left-6 sm:translate-x-0 sm:bottom-6">
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className="absolute bottom-full mb-2 left-0 w-64 rounded-xl bg-white shadow-xl overflow-hidden"
          >
            <div className="px-4 pt-3 pb-2 flex items-center justify-between border-b border-stone-100">
              <span className="text-xs font-semibold uppercase tracking-wider text-stone-400">
                Contents
              </span>
              <CloseButton
                onClick={() => setIsOpen(false)}
                size="sm"
                className="hover:bg-stone-100 active:bg-stone-200 [&>svg]:text-stone-400"
              />
            </div>
            <div className="[&>*]:border-0">
              {sections.map((section) => {
                const isActive = section.id === activeSection;
                const Icon = ICON_MAP[section.icon];
                return (
                  <button
                    key={section.id}
                    onClick={() => {
                      setIsOpen(false);
                      // Small delay so menu closes before scroll
                      setTimeout(() => onNavigate(section.id), 100);
                    }}
                    className={`w-full flex items-center gap-2.5 px-4 py-2 text-left transition-colors ${
                      isActive
                        ? "text-purple-700"
                        : "text-stone-500 hover:text-stone-700 hover:bg-stone-50"
                    }`}
                  >
                    <Icon className={`h-4 w-4 shrink-0 ${isActive ? "text-purple-600" : "text-stone-300"}`} />
                    <span className={`text-sm ${isActive ? "font-semibold" : ""}`}>
                      {section.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* The pill button */}
      <motion.button
        initial={{ y: 60, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: "spring", stiffness: 300, damping: 30, delay: 0.5 }}
        onClick={() => setIsOpen((o) => !o)}
        className="flex items-center gap-2 rounded-full bg-white/95 pl-4 pr-3 py-2.5 shadow-lg backdrop-blur-sm cursor-pointer hover:shadow-xl transition-shadow"
      >
        {/* Progress ring */}
        <div className="relative h-5 w-5 shrink-0">
          <svg className="h-5 w-5 -rotate-90" viewBox="0 0 20 20">
            <circle cx="10" cy="10" r="8" fill="none" stroke="#D6D3D1" strokeWidth="2" />
            <circle
              cx="10" cy="10" r="8" fill="none" stroke="#8B5CF6" strokeWidth="2"
              strokeDasharray={`${scrollProgress * 50.27} 50.27`}
              strokeLinecap="round"
              className="transition-all duration-300"
            />
          </svg>
          {CurrentIcon && (
            <div className="absolute inset-0 flex items-center justify-center">
              <CurrentIcon className="h-2.5 w-2.5 text-purple-600" />
            </div>
          )}
        </div>
        <span className="text-sm font-medium text-stone-700">{current?.label}</span>
        <ChevronUp className={`h-4 w-4 text-stone-400 transition-transform ${isOpen ? "rotate-180" : ""}`} />
      </motion.button>
    </div>
  );
}

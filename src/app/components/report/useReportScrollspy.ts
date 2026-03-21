import { useEffect, useState, useCallback, useRef } from "react";

export const REPORT_SECTIONS = [
  { id: "big-picture", label: "The Big Picture", icon: "Globe" },
  { id: "trending", label: "Trending", icon: "TrendingUp" },
  { id: "data-quality", label: "Data Quality", icon: "SearchCheck" },
  { id: "geo-density", label: "Where Are the Churches?", icon: "MapPin" },
  { id: "denominations", label: "Denomination Landscape", icon: "Church" },
  { id: "diversity", label: "Language & Diversity", icon: "Languages" },
  { id: "spotlights", label: "Church Spotlights", icon: "Sparkles" },
  { id: "takeaways", label: "Takeaways", icon: "Lightbulb" },
  { id: "state-rankings", label: "State Rankings", icon: "Trophy" },
  /** National reports only — matches scroll order on the page (before “How we compare”) */
  { id: "state-summaries", label: "State Summaries", icon: "LayoutGrid" },
  { id: "how-we-compare", label: "How We Compare", icon: "Scale" },
  { id: "contribute", label: "Contribute", icon: "Heart" },
  { id: "common-questions", label: "Common Questions", icon: "CircleHelp" },
] as const;

export type SectionId = (typeof REPORT_SECTIONS)[number]["id"];
export type IconName = (typeof REPORT_SECTIONS)[number]["icon"];
export type ReportSection = (typeof REPORT_SECTIONS)[number];

/**
 * @param reportKey When this changes (e.g. report loaded), scrollspy re-runs so the first section
 * is correct after async content mounts. Use `report?.generatedAt` or similar.
 */
export function useReportScrollspy(
  reportKey?: string | null,
  sections: readonly ReportSection[] = REPORT_SECTIONS
) {
  const [activeSection, setActiveSection] = useState<SectionId>("big-picture");
  const [scrollProgress, setScrollProgress] = useState(0);
  const rafRef = useRef(0);
  const sectionIdsKey = sections.map((s) => s.id).join("|");

  useEffect(() => {
    const update = () => {
      const elDoc = document.documentElement;
      const maxScroll = Math.max(0, elDoc.scrollHeight - window.innerHeight);
      const progress = maxScroll > 0 ? Math.min(window.scrollY / maxScroll, 1) : 0;
      setScrollProgress(progress);

      // Last section whose top has passed ~20% from the top of the viewport
      const trigger = window.innerHeight * 0.2;
      let current: SectionId = "big-picture";

      // Only treat as "at bottom" when there is scrollable height; otherwise initial short layout
      // looked like the bottom and we wrongly highlighted the last section.
      const atBottom = maxScroll > 0 && window.scrollY >= maxScroll - 100;
      if (atBottom) {
        current = sections[sections.length - 1]?.id ?? "big-picture";
      } else {
        for (const section of sections) {
          const el = document.getElementById(section.id);
          // Section not in DOM yet (e.g. report still rendering) — keep default first section
          if (!el) break;
          const top = el.getBoundingClientRect().top;
          if (top <= trigger) {
            current = section.id;
          } else {
            break;
          }
        }
      }

      setActiveSection(current);
    };

    const handleScroll = () => {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(update);
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    window.addEventListener("resize", handleScroll, { passive: true });
    // Run now and again after layout so async report sections are measured
    update();
    const raf0 = requestAnimationFrame(() => update());
    const t1 = setTimeout(update, 100);
    const t2 = setTimeout(update, 500);
    const t3 = setTimeout(update, 1200);

    return () => {
      window.removeEventListener("scroll", handleScroll);
      window.removeEventListener("resize", handleScroll);
      cancelAnimationFrame(rafRef.current);
      cancelAnimationFrame(raf0);
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, [reportKey, sectionIdsKey]);

  const scrollTo = useCallback((id: SectionId) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: "smooth" });
  }, []);

  return { activeSection, scrollProgress, scrollTo };
}

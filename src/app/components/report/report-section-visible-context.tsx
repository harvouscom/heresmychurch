import { createContext } from "react";

/**
 * Report `<Section>` sets this so chart/stat animations start with the section fade/slide,
 * instead of a separate IntersectionObserver on each chart.
 */
export const ReportSectionVisibleContext = createContext<boolean | undefined>(undefined);

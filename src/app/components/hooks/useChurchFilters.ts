import { useMemo } from "react";
import {
  getSizeCategory,
  getDenominationGroup,
  estimateBilingualProbability,
  sizeCategories,
} from "../church-data";
import type { Church, StateInfo } from "../church-data";

interface InterestingFact {
  icon: string;
  label: string;
  primary: string;
  secondary: string;
  abbrev?: string;
}

/** Minimal type for county stats used by state summary (underserved fact). */
type CountyStatsForSummary = {
  sortedByPerCapita: Array<{ name: string; peoplePer: number }>;
} | null;

export function useChurchFilters(
  churches: Church[],
  activeSize: Set<string>,
  activeDenominations: Set<string>,
  languageFilter: string,
  focusedState: string | null,
  states: StateInfo[],
  statePopulations: Record<string, number>,
  countyStats?: CountyStatsForSummary,
) {
  // Filter churches
  const filteredChurches = useMemo(() => {
    return churches.filter((church) => {
      const sizeCat = getSizeCategory(church.attendance);
      const denomGroup = getDenominationGroup(church.denomination);
      if (!activeSize.has(sizeCat.label) || !activeDenominations.has(denomGroup)) return false;

      if (languageFilter !== "all") {
        const bilingual = estimateBilingualProbability(church);
        if (languageFilter === "bilingual") {
          const hasMultipleLanguages = church.languages && church.languages.length >= 2;
          return hasMultipleLanguages || bilingual.probability >= 0.15;
        } else {
          const hasConfirmed = church.languages?.includes(languageFilter);
          if (hasConfirmed) return true;
          return bilingual.detectedLanguage === languageFilter && bilingual.probability >= 0.25;
        }
      }

      return true;
    });
  }, [churches, activeSize, activeDenominations, languageFilter]);

  // Language/bilingual stats for filter panel
  const languageStats = useMemo(() => {
    let bilingualCount = 0;
    const langCounts: Record<string, number> = {};
    const detectedLangs: Record<string, number> = {};

    churches.forEach((ch) => {
      const bilingual = estimateBilingualProbability(ch);
      const hasMultipleLanguages = ch.languages && ch.languages.length >= 2;
      if (hasMultipleLanguages || bilingual.probability >= 0.15) {
        bilingualCount++;
      }
      if (ch.languages) {
        ch.languages.forEach((lang) => {
          langCounts[lang] = (langCounts[lang] || 0) + 1;
        });
      }
      if (bilingual.detectedLanguage && bilingual.probability >= 0.25) {
        detectedLangs[bilingual.detectedLanguage] = (detectedLangs[bilingual.detectedLanguage] || 0) + 1;
      }
    });

    const mergedLangs: Record<string, { confirmed: number; estimated: number }> = {};
    const allLangs = new Set([...Object.keys(langCounts), ...Object.keys(detectedLangs)]);
    allLangs.forEach((lang) => {
      if (lang === "English" || lang === "Bilingual" || lang === "Multilingual") return;
      mergedLangs[lang] = {
        confirmed: langCounts[lang] || 0,
        estimated: detectedLangs[lang] || 0,
      };
    });

    const sortedLangs = Object.entries(mergedLangs)
      .map(([lang, counts]) => ({ lang, total: counts.confirmed + counts.estimated, ...counts }))
      .filter((l) => l.total > 0)
      .sort((a, b) => b.total - a.total);

    return { bilingualCount, sortedLangs };
  }, [churches]);

  // Denomination counts
  const denomCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    churches.forEach((ch) => {
      const group = getDenominationGroup(ch.denomination);
      counts[group] = (counts[group] || 0) + 1;
    });
    return counts;
  }, [churches]);

  // Size category counts
  const sizeCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    filteredChurches.forEach((ch) => {
      const cat = getSizeCategory(ch.attendance);
      counts[cat.label] = (counts[cat.label] || 0) + 1;
    });
    return counts;
  }, [filteredChurches]);

  // Summary stats
  const summaryStats = useMemo(() => {
    if (focusedState && churches.length > 0) {
      return computeStateSummary(churches, denomCounts, sizeCounts, countyStats ?? null);
    } else {
      return computeNationalSummary(states, statePopulations);
    }
  }, [focusedState, churches, states, denomCounts, sizeCounts, statePopulations, countyStats]);

  return {
    filteredChurches,
    languageStats,
    denomCounts,
    sizeCounts,
    summaryStats,
  };
}

// --- Helper: compute state-level summary stats ---
export function computeStateSummary(
  churches: Church[],
  denomCounts: Record<string, number>,
  sizeCounts: Record<string, number>,
  countyStats: CountyStatsForSummary,
) {
  const totalAttendance = churches.reduce((sum, ch) => sum + ch.attendance, 0);
  const avgAttendance = Math.round(totalAttendance / churches.length);
  const topDenoms = Object.entries(denomCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6);
  const topSizes = sizeCategories.map((cat) => ({
    label: cat.label,
    color: cat.color,
    count: sizeCounts[cat.label] || 0,
  }));

  const facts: InterestingFact[] = [];

  const largest = [...churches].sort((a, b) => b.attendance - a.attendance)[0];
  if (largest) {
    facts.push({
      icon: "trending",
      label: "Largest congregation",
      primary: largest.name,
      secondary: `~${largest.attendance.toLocaleString()} weekly`,
    });
  }

  facts.push({
    icon: "chart",
    label: "Average weekly attendance",
    primary: `~${avgAttendance.toLocaleString()} per church`,
    secondary: `~${totalAttendance.toLocaleString()} total`,
  });

  const denomAttendance: Record<string, { total: number; count: number }> = {};
  for (const ch of churches) {
    const d = getDenominationGroup(ch.denomination);
    if (!denomAttendance[d]) denomAttendance[d] = { total: 0, count: 0 };
    denomAttendance[d].total += ch.attendance;
    denomAttendance[d].count += 1;
  }
  const denomAvgs = Object.entries(denomAttendance)
    .filter(([, v]) => v.count >= 5)
    .map(([d, v]) => ({ denom: d, avg: Math.round(v.total / v.count), count: v.count }))
    .sort((a, b) => b.avg - a.avg);
  if (denomAvgs.length > 0) {
    const top = denomAvgs[0];
    facts.push({
      icon: "users",
      label: "Highest-attending denomination",
      primary: top.denom,
      secondary: `~${top.avg.toLocaleString()} avg weekly across ${top.count.toLocaleString()} churches`,
    });
  }

  const cityCounts: Record<string, number> = {};
  for (const ch of churches) {
    const city = ch.city?.trim();
    if (city) cityCounts[city] = (cityCounts[city] || 0) + 1;
  }
  const topCity = Object.entries(cityCounts).sort((a, b) => b[1] - a[1])[0];
  if (topCity) {
    const pctOfState = Math.round((topCity[1] / churches.length) * 100);
    facts.push({
      icon: "mapPin",
      label: "Church capital",
      primary: topCity[0],
      secondary: `${topCity[1].toLocaleString()} churches (${pctOfState}% of region)`,
    });
  }

  // Most underserved admin-2 (fewest churches per capita)
  if (countyStats?.sortedByPerCapita?.length > 0) {
    const underserved = countyStats.sortedByPerCapita[countyStats.sortedByPerCapita.length - 1];
    facts.push({
      icon: "mapPin",
      label: "Area that could use more churches",
      primary: underserved.name,
      secondary: `1 per ${underserved.peoplePer.toLocaleString()} people`,
    });
  }

  const bilingualByCity: Record<string, number> = {};
  for (const ch of churches) {
    const hasMultiple = ch.languages && ch.languages.length >= 2;
    const prob = estimateBilingualProbability(ch).probability;
    if (hasMultiple || prob >= 0.15) {
      const city = ch.city?.trim();
      if (city) bilingualByCity[city] = (bilingualByCity[city] || 0) + 1;
    }
  }
  const topBilingualCity = Object.entries(bilingualByCity).sort((a, b) => b[1] - a[1])[0];
  if (topBilingualCity && topBilingualCity[1] >= 3) {
    facts.push({
      icon: "globe",
      label: "Bilingual / multilingual hotspot",
      primary: topBilingualCity[0],
      secondary: `${topBilingualCity[1].toLocaleString()} multilingual churches`,
    });
  }

  return { type: "state" as const, totalAttendance, topDenoms, topSizes, interestingFacts: facts };
}

export function computeNationalSummary(
  states: StateInfo[],
  statePopulations: Record<string, number>,
) {
  const populated = states.filter((s) => s.isPopulated && s.churchCount > 0);
  const unpopulated = states.length - populated.length;
  const topStates = [...populated]
    .sort((a, b) => b.churchCount - a.churchCount)
    .slice(0, 3);

  const facts: InterestingFact[] = [];

  const hasPop = Object.keys(statePopulations).length > 0;
  if (hasPop && populated.length > 0) {
    const withPerCapita = populated
      .filter((s) => statePopulations[s.abbrev] && statePopulations[s.abbrev] > 0)
      .map((s) => ({
        ...s,
        perCapita: s.churchCount / statePopulations[s.abbrev],
        peoplePer: Math.round(statePopulations[s.abbrev] / s.churchCount),
      }));
    if (withPerCapita.length > 0) {
      const densest = [...withPerCapita].sort((a, b) => b.perCapita - a.perCapita)[0];
      facts.push({
        icon: "users",
        label: "Most churches per capita",
        primary: densest.name,
        secondary: `1 per ${densest.peoplePer.toLocaleString()} people`,
        abbrev: densest.abbrev,
      });

      const sparsest = [...withPerCapita].sort((a, b) => a.perCapita - b.perCapita)[0];
      if (sparsest.abbrev !== densest.abbrev) {
        facts.push({
          icon: "building",
          label: "Fewest churches per capita",
          primary: sparsest.name,
          secondary: `1 per ${sparsest.peoplePer.toLocaleString()} people`,
          abbrev: sparsest.abbrev,
        });
      }
    }
  }

  const allLoaded = states.length > 0 && states.every((s) => s.isPopulated);
  if (!allLoaded && populated.length >= 3) {
    const smallest = [...populated].sort((a, b) => a.churchCount - b.churchCount)[0];
    if (!topStates.find((s) => s.abbrev === smallest.abbrev)) {
      facts.push({
        icon: "search",
        label: "Fewest churches so far",
        primary: smallest.name,
        secondary: `${smallest.churchCount.toLocaleString()} churches`,
        abbrev: smallest.abbrev,
      });
    }
  }

  const totalChurchCount = populated.reduce((sum, s) => sum + s.churchCount, 0);
  const totalPop = hasPop ? populated.reduce((sum, s) => sum + (statePopulations[s.abbrev] || 0), 0) : 0;
  const nationalPeoplePer = totalPop > 0 && totalChurchCount > 0 ? Math.round(totalPop / totalChurchCount) : 0;

  if (hasPop && populated.length >= 2 && totalChurchCount > 0 && totalPop > 0) {
    const withPerCapita = populated
      .filter((s) => statePopulations[s.abbrev] && statePopulations[s.abbrev] > 0)
      .map((s) => ({
        ...s,
        peoplePer: Math.round(statePopulations[s.abbrev] / s.churchCount),
      }));
    if (withPerCapita.length > 0) {
      const mostAverage = withPerCapita.reduce((best, s) =>
        Math.abs(s.peoplePer - nationalPeoplePer) < Math.abs(best.peoplePer - nationalPeoplePer) ? s : best,
      );
      facts.push({
        icon: "mapPin",
        label: "Closest to country ratio",
        primary: mostAverage.name,
        secondary: `1 per ${mostAverage.peoplePer.toLocaleString()} people`,
        abbrev: mostAverage.abbrev,
      });
    }
  }

  const populationMillions = hasPop && totalPop > 0 ? (totalPop / 1e6).toFixed(1) : undefined;

  return {
    type: "national" as const,
    populated: populated.length,
    unpopulated,
    topStates,
    interestingFacts: facts.slice(0, 8),
    nationalPeoplePer: nationalPeoplePer > 0 ? nationalPeoplePer : undefined,
    populationMillions,
  };
}

export type WorldReviewStatsInput = {
  states: Record<string, { total: number; needsReview: number }>;
  percentage?: number;
} | null | undefined;

/** World summary from /churches/countries — reuses national summary shape (abbrev = ISO CC). */
export function computeWorldSummary(
  countries: Array<{
    code: string;
    name: string;
    churchCount: number;
    isPopulated: boolean;
    regionCount?: number;
    populatedRegions?: number;
  }>,
  reviewStats?: WorldReviewStatsInput,
) {
  const asStates: StateInfo[] = countries.map((c) => ({
    abbrev: c.code,
    name: c.name,
    lat: 0,
    lng: 0,
    churchCount: c.churchCount || 0,
    isPopulated: !!c.isPopulated && (c.churchCount || 0) > 0,
  }));
  const base = computeNationalSummary(asStates, {});
  const populated = countries.filter((c) => c.isPopulated && (c.churchCount || 0) > 0);
  const totalChurches = populated.reduce((sum, c) => sum + (c.churchCount || 0), 0);
  const nameByCode = Object.fromEntries(countries.map((c) => [c.code.toUpperCase(), c.name]));
  const facts: InterestingFact[] = [];

  // Fewest churches among populated countries (contrast to the top-3 podium).
  if (populated.length >= 2) {
    const fewest = [...populated].sort((a, b) => a.churchCount - b.churchCount)[0];
    if (!base.topStates.some((s) => s.abbrev === fewest.code)) {
      facts.push({
        icon: "search",
        label: "Fewest churches",
        primary: fewest.name,
        secondary: `${fewest.churchCount.toLocaleString()} churches`,
        abbrev: fewest.code,
      });
    }
  }

  // Largest share of the world total.
  if (populated.length > 0 && totalChurches > 0) {
    const top = [...populated].sort((a, b) => b.churchCount - a.churchCount)[0];
    const pct = Math.round((top.churchCount / totalChurches) * 1000) / 10;
    facts.push({
      icon: "chart",
      label: "Largest share of world total",
      primary: top.name,
      secondary: `${pct}%`,
      abbrev: top.code,
    });
  }

  // Region coverage across all supported countries.
  const regionTotal = countries.reduce((sum, c) => sum + (c.regionCount || 0), 0);
  const regionPopulated = countries.reduce((sum, c) => sum + (c.populatedRegions || 0), 0);
  if (regionTotal > 0) {
    facts.push({
      icon: "globe",
      label: "Regions mapped",
      primary: `${regionPopulated.toLocaleString()} of ${regionTotal.toLocaleString()}`,
      secondary: `${populated.length} of ${countries.length} countries`,
    });
  }

  // Review completeness from world rollup (states keyed by ISO CC).
  if (reviewStats?.states) {
    const entries = Object.entries(reviewStats.states)
      .filter(([, s]) => s.total > 0)
      .map(([cc, s]) => ({
        cc: cc.toUpperCase(),
        pctNeed: s.needsReview / s.total,
        total: s.total,
      }));
    if (entries.length >= 2) {
      const mostComplete = [...entries].sort((a, b) => a.pctNeed - b.pctNeed)[0];
      const mostNeeding = [...entries].sort((a, b) => b.pctNeed - a.pctNeed)[0];
      const label = (cc: string) => nameByCode[cc] || cc;
      facts.push({
        icon: "trending",
        label: "Most complete reviews",
        primary: label(mostComplete.cc),
        secondary: `${Math.round((1 - mostComplete.pctNeed) * 1000) / 10}% complete`,
        abbrev: mostComplete.cc,
      });
      if (mostNeeding.cc !== mostComplete.cc) {
        facts.push({
          icon: "search",
          label: "Most needing review",
          primary: label(mostNeeding.cc),
          secondary: `${Math.round(mostNeeding.pctNeed * 1000) / 10}% need review`,
          abbrev: mostNeeding.cc,
        });
      }
    }
  }

  // Keep any base facts that aren't duplicates of what we just added.
  for (const f of base.interestingFacts) {
    if (facts.some((x) => x.label === f.label && x.abbrev === f.abbrev)) continue;
    // World path already adds an explicit "Fewest churches" row.
    if (f.label.toLowerCase().includes("fewest")) continue;
    facts.push(f);
  }

  return {
    ...base,
    // Prefer explicit country coverage wording over "N countries" alone when partial.
    populated: populated.length,
    unpopulated: Math.max(0, countries.length - populated.length),
    interestingFacts: facts.slice(0, 8),
  };
}

/** Build denom/size counts + state summary for an intl (or any) church list. */
export function buildRegionSummaryStats(
  churches: Church[],
  countyStats: CountyStatsForSummary = null,
) {
  const denomCounts: Record<string, number> = {};
  const sizeCounts: Record<string, number> = {};
  for (const ch of churches) {
    const group = getDenominationGroup(ch.denomination);
    denomCounts[group] = (denomCounts[group] || 0) + 1;
    const cat = getSizeCategory(ch.attendance);
    sizeCounts[cat.label] = (sizeCounts[cat.label] || 0) + 1;
  }
  return computeStateSummary(churches, denomCounts, sizeCounts, countyStats);
}

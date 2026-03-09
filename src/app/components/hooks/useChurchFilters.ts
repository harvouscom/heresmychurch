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

export function useChurchFilters(
  churches: Church[],
  activeSize: Set<string>,
  activeDenominations: Set<string>,
  languageFilter: string,
  focusedState: string | null,
  states: StateInfo[],
  statePopulations: Record<string, number>,
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
      return computeStateSummary(churches, denomCounts, sizeCounts);
    } else {
      return computeNationalSummary(states, statePopulations);
    }
  }, [focusedState, churches, states, denomCounts, sizeCounts, statePopulations]);

  return {
    filteredChurches,
    languageStats,
    denomCounts,
    sizeCounts,
    summaryStats,
  };
}

// --- Helper: compute state-level summary stats ---
function computeStateSummary(
  churches: Church[],
  denomCounts: Record<string, number>,
  sizeCounts: Record<string, number>,
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

  if (topDenoms.length > 0) {
    const [topDenom, topCount] = topDenoms[0];
    const pct = Math.round((topCount / churches.length) * 100);
    facts.push({
      icon: "book",
      label: "Most common denomination",
      primary: topDenom,
      secondary: `${topCount.toLocaleString()} churches (${pct}%)`,
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
      secondary: `${topCity[1].toLocaleString()} churches (${pctOfState}% of state)`,
    });
  }

  return { type: "state" as const, totalAttendance, topDenoms, topSizes, interestingFacts: facts };
}

function computeNationalSummary(
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

  if (hasPop && populated.length >= 2) {
    const totalChurchCount = populated.reduce((sum, s) => sum + s.churchCount, 0);
    const totalPop = populated.reduce((sum, s) => sum + (statePopulations[s.abbrev] || 0), 0);
    if (totalPop > 0) {
      const peoplePer = Math.round(totalPop / totalChurchCount);
      facts.push({
        icon: "chart",
        label: "National ratio",
        primary: `1 church per ${peoplePer.toLocaleString()} people`,
        secondary: `${totalChurchCount.toLocaleString()} churches across ${populated.length} states`,
      });
    }
  }

  return {
    type: "national" as const,
    populated: populated.length,
    unpopulated,
    topStates,
    interestingFacts: facts.slice(0, 4),
  };
}

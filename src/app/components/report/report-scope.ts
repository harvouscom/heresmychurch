import { getCountry, isSupportedCountry } from "../../config/countries";
import type { SeasonalReport, SeasonalReportScope } from "../church-data";

const SEASON_SLUG_RE = /^[a-z]+-\d{4}$/;

export function isSeasonReportSlug(value: string | undefined): boolean {
  return Boolean(value && SEASON_SLUG_RE.test(value));
}

/** WORLD or a registered ISO country code (not a season slug). */
export function isReportCountryParam(value: string | undefined): boolean {
  if (!value) return false;
  const cc = value.toUpperCase();
  if (cc === "WORLD") return true;
  if (cc.length !== 2) return false;
  return isSupportedCountry(cc);
}

export function isWorldReport(
  scope?: SeasonalReportScope,
  countryCode?: string,
): boolean {
  return scope === "world" || (countryCode || "").toUpperCase() === "WORLD";
}

export function isRegionReport(scope?: SeasonalReportScope): boolean {
  return scope === "state" || scope === "region";
}

/** US national or US state (legacy scopes + countryCode US). */
export function isUsReport(report: Pick<SeasonalReport, "scope" | "countryCode">): boolean {
  if (isWorldReport(report.scope, report.countryCode)) return false;
  if (report.scope === "national" || report.scope === "state") return true;
  const cc = (report.countryCode || "US").toUpperCase();
  return cc === "US";
}

/** Noun for ranking rows: countries (world), counties (US state), or admin-1. */
export function reportUnitNoun(report: SeasonalReport): { one: string; many: string } {
  if (isWorldReport(report.scope, report.countryCode)) {
    return { one: "country", many: "countries" };
  }
  if (isRegionReport(report.scope)) {
    return { one: "county", many: "counties" };
  }
  const cc = (report.countryCode || "US").toUpperCase();
  return getCountry(cc)?.regionNoun ?? { one: "state", many: "states" };
}

export function reportPlaceLabel(report: SeasonalReport): string {
  if (isWorldReport(report.scope, report.countryCode)) return "the world";
  if (isRegionReport(report.scope)) {
    return report.stateName ?? report.stateAbbrev ?? "this state";
  }
  const cc = (report.countryCode || "US").toUpperCase();
  if (cc === "US") return "America";
  return getCountry(cc)?.name ?? cc;
}

export function reportMapHref(report: SeasonalReport): string {
  if (isWorldReport(report.scope, report.countryCode)) return "/world";
  if (isRegionReport(report.scope) && report.stateAbbrev) {
    return `/US/${encodeURIComponent(report.stateAbbrev)}`;
  }
  const cc = (report.countryCode || "US").toUpperCase();
  return `/${encodeURIComponent(cc)}`;
}

/** Rankings section title from singular/plural pair. */
export function rankingsSectionTitle(noun: { one: string; many: string }): string {
  const one = noun.one.charAt(0).toUpperCase() + noun.one.slice(1);
  return `${one} Rankings`;
}

/** Title-case place for hero/headings: "America", "Canada", "the World". */
export function reportPlaceTitle(report: SeasonalReport): string {
  const place = reportPlaceLabel(report);
  if (place === "the world") return "the World";
  return place;
}

/** Sentence-start scope phrase: "Nationally" / "Worldwide" / "Across Canada". */
export function reportScopeAdverb(report: SeasonalReport): string {
  if (isWorldReport(report.scope, report.countryCode)) return "Worldwide";
  if (isRegionReport(report.scope)) {
    return `In ${report.stateName ?? report.stateAbbrev ?? "this region"}`;
  }
  if (isUsReport(report)) return "Nationally";
  return `Across ${reportPlaceLabel(report)}`;
}

/** Mid-sentence scope phrase: "nationally" / "worldwide" / "across Canada". */
export function reportScopePhrase(report: SeasonalReport): string {
  if (isWorldReport(report.scope, report.countryCode)) return "worldwide";
  if (isRegionReport(report.scope)) {
    return `in ${report.stateName ?? report.stateAbbrev ?? "this region"}`;
  }
  if (isUsReport(report)) return "nationally";
  return `across ${reportPlaceLabel(report)}`;
}

import React, { useEffect, useState, useRef, useMemo } from "react";
import { usePrefersReducedMotion } from "../../hooks/usePrefersReducedMotion";
import { useParams, Link } from "react-router";
import { fetchCommunityStats, fetchReport, searchChurches } from "../api";
import type { SeasonalReport, SeasonalReportChanges, SeasonalReportCommunity } from "../church-data";
import { useReportScrollspy, REPORT_SECTIONS, type IconName } from "./useReportScrollspy";
import { ReportTOC } from "./ReportTOC";
import { ReportSectionVisibleContext } from "./report-section-visible-context";
import {
  StatCard,
  HorizontalBarChart,
  ChoroplethMap,
} from "./charts";
import { Button } from "../ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "../ui/accordion";
import { StateFlag } from "../StateFlag";
import { spotlightMapHref } from "../url-utils";
import {
  Building2,
  MapPinned,
  MapPin,
  Church,
  Map,
  SearchCheck,
  Globe,
  BarChart3,
  Users,
  Check,
  X,
  Minus,
  ShieldCheck,
  ExternalLink,
  PenLine,
  Sparkles,
  Ratio,
  Link2,
  Phone,
  Clock,
  GitBranch,
  Tags,
  Footprints,
  CalendarCheck,
  Languages,
  TrendingUp,
  Lightbulb,
  Trophy,
  Scale,
  Heart,
} from "lucide-react";
import logoImg from "../../../assets/a94bce1cf0860483364d5d9c353899b7da8233e7.png";

type LucideIcon = React.ComponentType<{ className?: string }>;

const SECTION_ICON_MAP: Record<IconName, LucideIcon> = {
  Globe,
  TrendingUp,
  SearchCheck,
  MapPin,
  Church,
  Languages,
  Sparkles,
  Lightbulb,
  Trophy,
  Scale,
  Heart,
};

function sectionIconFor(id: string): LucideIcon | null {
  const entry = REPORT_SECTIONS.find((s) => s.id === id);
  return entry ? SECTION_ICON_MAP[entry.icon] ?? null : null;
}

type SpotlightRow = SeasonalReport["spotlights"]["largest"][number];

/**
 * Purple button — opens this church on the map in a new tab.
 * Cached reports often omit `id`; we resolve via search API, then fall back to the state map.
 */
function ChurchSpotlightMapButton({ c }: { c: SpotlightRow }) {
  const directHref = useMemo(() => spotlightMapHref(c), [c.id, c.shortId, c.state]);
  const [searchHref, setSearchHref] = useState<string | null>(null);

  useEffect(() => {
    if (directHref) return;
    let cancelled = false;
    (async () => {
      try {
        const { results } = await searchChurches(c.name, 24, c.state);
        if (cancelled || !results.length) return;
        const norm = (s: string) => s.trim().toLowerCase();
        const wantN = norm(c.name);
        const wantC = c.city ? norm(c.city) : "";
        // Prefer exact name+city match; otherwise exact name only. Never guess with first result.
        const exact =
          results.find((r) => norm(r.name) === wantN && (!wantC || norm(r.city || "") === wantC)) ||
          results.find((r) => norm(r.name) === wantN);
        if (exact?.id) {
          const h = spotlightMapHref({
            id: exact.id,
            shortId: exact.shortId,
            state: exact.state || c.state,
          });
          if (h && !cancelled) setSearchHref(h);
        }
      } catch {
        // network / API — user still has state fallback below
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [directHref, c.name, c.city, c.state]);

  const stateFallback = `/state/${encodeURIComponent(c.state)}`;
  const href = directHref || searchHref || stateFallback;
  const isChurchDeepLink = Boolean(directHref || searchHref);

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex shrink-0 items-center gap-1 rounded-full bg-purple-700 px-2.5 py-1 text-[11px] font-semibold text-white shadow-[0_2px_6px_rgba(88,28,135,0.4)] transition-colors hover:bg-purple-800 hover:shadow-[0_3px_8px_rgba(88,28,135,0.5)]"
    >
      {isChurchDeepLink ? "View church" : "View on map"}
      <ExternalLink className="h-3 w-3 opacity-90" strokeWidth={2.5} aria-hidden />
    </a>
  );
}

// ── Season-aware copy ──
function useSectionCopy(r: SeasonalReport) {
  const isLaunch = r.season === "launch";
  const seasonLabel = r.season.charAt(0).toUpperCase() + r.season.slice(1);
  const date = new Date(r.generatedAt).toLocaleDateString("en-US", { month: "long", year: "numeric" });

  return {
    bigPicture: {
      title: "The Big Picture",
      description: isLaunch
        ? `Here's where we stand as of ${date}.`
        : `How the map has grown through ${seasonLabel} ${r.year}. Here's where we stand as of ${date}.`,
    },
    dataQuality: {
      title: "The Data Quality Challenge",
      description: isLaunch
        ? "Church data in America is fragmented — scattered across thousands of websites, denominational directories, and local records. We start with OpenStreetMap, then rely on the community to fill the gaps."
        : "Tracking our progress toward 99% accuracy. Every community correction brings us closer.",
    },
    geoDensity: {
      title: "Where Are the Churches?",
      description: isLaunch
        ? "Church density varies dramatically across the country. The Bible Belt lives up to its name, while the West and Northeast look very different."
        : "How church density has shifted across the country since our last report.",
    },
    denominations: {
      title: "The Denomination Landscape",
      description: isLaunch
        ? "America's churches span dozens of denominations and traditions. Here's how they break down nationally and regionally."
        : "How the denomination mix is evolving as more churches are mapped and verified.",
    },
    diversity: {
      title: "Language & Diversity",
      description: isLaunch
        ? "America's churches serve communities in dozens of languages. From Spanish-language services to Korean congregations, language diversity reflects the communities churches serve."
        : "New languages, new communities — tracking the linguistic diversity of American churches.",
    },
    spotlights: {
      title: "Church Spotlights",
      description: isLaunch
        ? "From megachurches serving thousands to small chapels anchoring rural communities — here are some of the churches at the edges of the data."
        : "Notable churches at both ends of the spectrum — the largest and smallest congregations we've mapped.",
    },
    howWeCompare: {
      title: "How We Compare",
      description: isLaunch
        ? "Most church directories are afterthoughts — a category inside a general-purpose map app. Here's what sets HMC apart."
        : "How HMC continues to differentiate from general-purpose directories.",
    },
    takeaways: {
      title: "Takeaways",
      description: isLaunch
        ? "Digging into the data surfaced some surprises. Here are the patterns and outliers that stood out."
        : `The key patterns and shifts from ${seasonLabel} ${r.year}.`,
    },
    stateRankings: {
      title: "State Rankings",
      description: isLaunch
        ? "How does each state stack up? Sort by any column to explore church coverage, data completeness, and community engagement across the country."
        : "Updated rankings — sort by any column to see how states compare and who's improving fastest.",
    },
  };
}

// ── Section wrapper with scroll-triggered animation ──
function Section({
  id,
  children,
}: {
  id: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLElement>(null);
  const [visible, setVisible] = useState(false);
  const reducedMotion = usePrefersReducedMotion();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          obs.disconnect();
        }
      },
      {
        rootMargin: "0px 0px 18% 0px",
        threshold: 0,
      },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  return (
    <section
      ref={ref}
      id={id}
      className="scroll-mt-12 mb-8 sm:mb-10 rounded-none bg-white p-6 sm:p-10 shadow-[0_1px_4px_rgba(0,0,0,0.06),0_4px_16px_rgba(0,0,0,0.04)]"
      style={{
        opacity: visible ? 1 : 0,
        transform: visible
          ? "rotate(-0.3deg)"
          : "translateY(16px) rotate(0deg)",
        transition: reducedMotion
          ? "opacity 0.2s ease-out, transform 0.2s ease-out"
          : "opacity 0.48s cubic-bezier(0.22, 1, 0.36, 1), transform 0.48s cubic-bezier(0.22, 1, 0.36, 1)",
        willChange: visible ? "auto" : "opacity, transform",
      }}
    >
      <ReportSectionVisibleContext.Provider value={visible}>{children}</ReportSectionVisibleContext.Provider>
    </section>
  );
}

function SectionHeading({
  title,
  description,
  icon: Icon,
}: {
  title: string;
  description: string;
  icon?: LucideIcon | null;
}) {
  return (
    <div className="mb-6">
      <div className="flex items-center gap-2.5">
        {Icon && (
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-100/60">
            <Icon className="h-4 w-4 text-purple-700" />
          </div>
        )}
        <h2 className="text-xl font-semibold text-stone-900 sm:text-2xl tracking-tight">{title}</h2>
      </div>
      <p className="text-pretty mt-2 text-sm text-stone-500 leading-relaxed sm:text-base">
        {description}
      </p>
    </div>
  );
}

// ── Delta badge (shows change from previous report) ──
function Delta({ value, label, suffix = "" }: { value: number; label: string; suffix?: string }) {
  if (value === 0) return null;
  const positive = value > 0;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${
      positive ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"
    }`}>
      {positive ? "↑" : "↓"} {Math.abs(value).toLocaleString()}{suffix} {label}
    </span>
  );
}

// ── Changes summary card (only shown for non-launch reports) ──
function ChangeSummary({ changes, previousSlug }: { changes: SeasonalReportChanges; previousSlug: string }) {
  return (
    <div className="mb-8 rounded-2xl bg-white p-6 sm:p-10">
      <h2 className="text-xl font-semibold text-stone-900 sm:text-2xl tracking-tight">What Changed</h2>
      <p className="text-pretty mt-2 text-sm text-stone-500">Since the{" "}
        <Link to={`/report/${previousSlug}`} className="text-purple-600 hover:text-purple-800 underline underline-offset-2">
          previous report
        </Link>
      </p>
      <div className="mt-5 flex flex-wrap gap-2">
        <Delta value={changes.netChurchChange} label="churches" />
        {changes.statesAdded.length > 0 && (
          <Delta value={changes.statesAdded.length} label="new states" />
        )}
        <Delta value={changes.dataQualityDelta} label="data quality" suffix="pp" />
        {changes.newLanguages.length > 0 && (
          <Delta value={changes.newLanguages.length} label="new languages" />
        )}
        {changes.correctionsThisSeason > 0 && (
          <Delta value={changes.correctionsThisSeason} label="corrections" />
        )}
        {(changes.churchesImprovedDelta ?? 0) > 0 && (
          <Delta value={changes.churchesImprovedDelta!} label="listings improved" />
        )}
      </div>
      {changes.highlights.length > 0 && (
        <ul className="mt-5 space-y-2">
          {changes.highlights.map((h, i) => (
            <li key={i} className="flex items-start gap-2 text-sm text-stone-600">
              <span className="text-purple-400 mt-0.5 shrink-0">•</span>
              {h}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function TrendingSection({ changes }: { changes?: SeasonalReportChanges }) {
  const growing = changes?.fastestGrowingStates ?? [];
  const movers = changes?.dataQualityMovers ?? [];
  const gainers = changes?.denominationShifts?.gainers ?? [];
  const losers = changes?.denominationShifts?.losers ?? [];
  const hasContent = growing.length > 0 || movers.length > 0 || gainers.length > 0 || losers.length > 0;

  return (
    <Section id="trending">
      <SectionHeading
        title="Trending"
        description="How things moved since the previous report: state growth, denomination share shifts, and quality improvements."
        icon={sectionIconFor("trending")}
      />

      <div className="space-y-4">
        {!hasContent && (
          <div className="rounded-xl bg-stone-50 px-5 py-4 ring-1 ring-stone-100">
            <h3 className="mb-2 text-lg font-semibold text-stone-900">What to expect</h3>
            <p className="text-pretty text-sm leading-relaxed text-stone-700/80">
              {!changes
                ? "Trend comparisons appear once a previous report exists. Future reports will show state growth, denomination share shifts, and data quality movers."
                : "As new seasonal reports are generated, this section will highlight where church counts are growing fastest, which denominations are gaining or losing share, and which states are improving data quality the most."}
            </p>
          </div>
        )}
        {growing.length > 0 && (
          <div className="rounded-xl bg-stone-50 px-5 py-4 ring-1 ring-stone-100">
            <h3 className="mb-3 text-lg font-semibold text-stone-900">Fastest-Growing States</h3>
            <div className="space-y-2.5">
              {growing.map((s, i) => (
                <div key={s.abbrev} className="flex items-center justify-between gap-3 text-sm">
                  <div className="min-w-0 text-stone-700">
                    <span className="mr-2 text-stone-400 tabular-nums">{i + 1}.</span>
                    <span className="font-medium text-stone-900">{s.name}</span>
                  </div>
                  <div className="shrink-0">
                    <span className="inline-flex items-center gap-1 rounded-full bg-green-50 px-2.5 py-0.5 text-xs font-semibold text-green-700">
                      +{s.delta.toLocaleString()} churches
                    </span>
                    <span className="ml-2 text-xs text-stone-500 tabular-nums">(+{s.pctChange.toFixed(1)}%)</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {(gainers.length > 0 || losers.length > 0) && (
          <div className="rounded-xl bg-stone-50 px-5 py-4 ring-1 ring-stone-100">
            <h3 className="mb-3 text-lg font-semibold text-stone-900">Denomination Share Shifts</h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <h4 className="mb-2 text-sm font-semibold text-green-700">Gainers</h4>
                <div className="space-y-2">
                  {gainers.map((d) => (
                    <div key={d.name} className="flex items-center justify-between gap-2 text-sm">
                      <span className="truncate text-stone-800">{d.name}</span>
                      <span className="shrink-0 tabular-nums font-semibold text-green-700">+{d.shareDelta.toFixed(1)} pp</span>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <h4 className="mb-2 text-sm font-semibold text-red-700">Losers</h4>
                <div className="space-y-2">
                  {losers.map((d) => (
                    <div key={d.name} className="flex items-center justify-between gap-2 text-sm">
                      <span className="truncate text-stone-800">{d.name}</span>
                      <span className="shrink-0 tabular-nums font-semibold text-red-700">{d.shareDelta.toFixed(1)} pp</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {movers.length > 0 && (
          <div className="rounded-xl bg-stone-50 px-5 py-4 ring-1 ring-stone-100">
            <h3 className="mb-3 text-lg font-semibold text-stone-900">Data Quality Movers</h3>
            <div className="space-y-2.5">
              {movers.map((s, i) => (
                <div key={s.abbrev} className="flex items-center justify-between gap-3 text-sm">
                  <div className="min-w-0 text-stone-700">
                    <span className="mr-2 text-stone-400 tabular-nums">{i + 1}.</span>
                    <span className="font-medium text-stone-900">{s.name}</span>
                    <span className="ml-2 text-xs text-stone-500">({s.currentPct.toFixed(1)}% still needs review)</span>
                  </div>
                  <span className="shrink-0 inline-flex items-center gap-1 rounded-full bg-green-50 px-2.5 py-0.5 text-xs font-semibold text-green-700">
                    +{s.improvement.toFixed(1)} pp improved
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </Section>
  );
}

// ── Insight card (textbook-style callout with eyebrow) ──
const INSIGHT_COLORS = {
  purple: { bg: "bg-purple-50", eyebrow: "text-purple-400" },
  pink: { bg: "bg-pink-50", eyebrow: "text-pink-400" },
} as const;

function Insight({ children, eyebrow = "Key Finding", color = "purple" }: { children: React.ReactNode; eyebrow?: string; color?: keyof typeof INSIGHT_COLORS }) {
  const c = INSIGHT_COLORS[color];
  return (
    <div className={`my-8 rounded-xl ${c.bg} px-5 py-4`}>
      <span className={`text-[11px] font-bold uppercase tracking-widest ${c.eyebrow}`}>
        {eyebrow}
      </span>
      <p className="text-pretty mt-1.5 text-sm sm:text-base text-stone-700/70 leading-relaxed">
        {children}
      </p>
    </div>
  );
}

// ── Transparency tables ──
function StateDataQualityTable({
  rows,
}: {
  rows: SeasonalReport["dataQuality"]["stateBreakdown"];
}) {
  if (!rows?.length) return null;
  return (
    <div className="mt-10">
      <h3 className="mb-2 text-lg font-semibold text-stone-900">States needing the most review</h3>
      <p className="text-pretty mb-4 text-sm text-stone-700/70">
        Share of listings missing two or more core fields (address, service times, denomination). Sorted with highest gap first — a roadmap for contributors.
      </p>
      <div className="max-h-[min(420px,55vh)] overflow-auto rounded-xl border border-stone-200/60">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10 border-b border-stone-200/60 bg-stone-50">
            <tr>
              <th className="px-4 py-2.5 text-left font-semibold text-stone-700/80">State</th>
              <th className="px-4 py-2.5 text-right font-semibold text-stone-700/80">Churches</th>
              <th className="px-4 py-2.5 text-right font-semibold text-stone-700/80">Need review</th>
              <th className="px-4 py-2.5 text-right font-semibold text-stone-700/80">% of state</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr
                key={row.abbrev}
                className={`border-b border-stone-100 ${i % 2 === 1 ? "bg-stone-50/50" : ""}`}
              >
                <td className="px-4 py-2">
                  <span className="inline-flex items-center gap-2 font-medium text-stone-800">
                    <StateFlag abbrev={row.abbrev} size="sm" />
                    {row.name}
                  </span>
                </td>
                <td className="px-4 py-2 text-right tabular-nums text-stone-600">{row.total.toLocaleString()}</td>
                <td className="px-4 py-2 text-right tabular-nums text-stone-600">{row.needsReview.toLocaleString()}</td>
                <td className="px-4 py-2 text-right tabular-nums font-medium text-purple-800">{row.pct}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function DenominationBreakdownByStateTable({
  breakdownByState,
  dominantByState,
}: {
  breakdownByState?: SeasonalReport["denominations"]["byStateBreakdown"];
  dominantByState: SeasonalReport["denominations"]["dominantByState"];
}) {
  const rows = Object.keys(dominantByState)
    .sort((a, b) => a.localeCompare(b))
    .map((abbrev) => {
      const fallback = dominantByState[abbrev];
      const b = breakdownByState?.[abbrev];
      const dominant = b?.top?.length
        ? b.top[0]
        : { denomination: fallback.denomination, count: fallback.count, pct: fallback.pct };
      return {
        abbrev,
        dominant: dominant ?? null,
        least: b?.least ?? null,
      };
    });
  const entries = rows;
  if (!entries.length) return null;
  return (
    <div className="mt-10">
      <h3 className="mb-2 text-lg font-semibold text-stone-900">Denomination breakdown by state</h3>
      <p className="text-pretty mb-4 text-sm text-stone-700/70">
        Hover or tap a state to see most/least dominant denomination shares.
      </p>
      <ChoroplethMap
        values={Object.fromEntries(entries.map((r) => [r.abbrev, r.dominant?.pct ?? 0]))}
        label="% dominant"
        details={Object.fromEntries(
          entries.map((r) => [
            r.abbrev,
            {
              primaryLabel: "Most",
              primaryValue: r.dominant
                ? `${r.dominant.denomination} ${r.dominant.pct}% (${r.dominant.count.toLocaleString()})`
                : "--",
              secondaryLabel: "Least",
              secondaryValue: r.least
                ? `${r.least.denomination} ${r.least.pct}% (${r.least.count.toLocaleString()})`
                : "--",
            },
          ])
        )}
      />
      <div className="mt-4">
        <h4 className="text-sm font-semibold text-stone-900">States with the widest spread</h4>
        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {entries
            .filter((r) => r.dominant && r.least)
            .map((r) => ({
              ...r,
              spread: (r.dominant?.pct ?? 0) - (r.least?.pct ?? 0),
            }))
            .sort((a, b) => b.spread - a.spread)
            .slice(0, 6)
            .map((r) => (
              <div key={r.abbrev} className="rounded-lg bg-stone-50 px-3 py-2 text-sm text-stone-700">
                <span className="inline-flex items-center gap-1.5 font-medium text-stone-900">
                  <StateFlag abbrev={r.abbrev} size="sm" />
                  {r.abbrev}
                </span>
                <span className="ml-2 text-stone-600">
                  {r.dominant?.denomination} {r.dominant?.pct}% vs {r.least?.denomination} {r.least?.pct}%
                </span>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}

// ── Takeaways — dynamically generated from report data ──
function Takeaways({ report: r }: { report: SeasonalReport }) {
  const { bigPicture: bp, community: cmRaw, dataQuality: dq, geoDensity: gd, denominations: dn, diversity: dv, spotlights: sp } = r;

  const items: { icon: LucideIcon; title: string; body: React.ReactNode; tone?: "community" }[] = [];

  // 1. Scale of the dataset
  if (bp.totalChurches > 0) {
    const ratio = Math.round(bp.totalChurches / bp.statesPopulated);
    items.push({
      icon: Building2,
      title: "A massive mapping effort",
      body: `${bp.totalChurches.toLocaleString()} churches across ${bp.statesPopulated} states — that's an average of ${ratio.toLocaleString()} churches per state right out of the gate.`,
    });
  }

  // 2. Most vs least churched contrast
  if (gd.mostChurched[0] && gd.leastChurched[0]) {
    const top = gd.mostChurched[0];
    const bottom = gd.leastChurched[0];
    const multiple = top.churchesPer10k > 0 && bottom.churchesPer10k > 0
      ? (top.churchesPer10k / bottom.churchesPer10k).toFixed(1)
      : null;
    items.push({
      icon: MapPinned,
      title: "The density divide",
      body: `${top.name} has ${top.churchesPer10k} churches per 10k people while ${bottom.name} has just ${bottom.churchesPer10k}${multiple ? ` — a ${multiple}x difference` : ""}. Where you live dramatically shapes how many churches are nearby.`,
    });
  }

  // 3. Dominant denomination surprise (skip "Unspecified")
  {
    const topDenoms = dn.national.filter((d) => d.name !== "Unspecified");
    if (topDenoms[0] && topDenoms[1]) {
      const gap = topDenoms[0].pct - topDenoms[1].pct;
      items.push({
        icon: Church,
        title: `${topDenoms[0].name} leads by ${gap.toFixed(1)} points`,
        body: `At ${topDenoms[0].pct}% of all mapped churches, ${topDenoms[0].name} is the most common denomination nationally. ${topDenoms[1].name} follows at ${topDenoms[1].pct}%. The top two alone account for ${(topDenoms[0].pct + topDenoms[1].pct).toFixed(1)}% of all churches.`,
      });
    }
  }

  // 4. Regional concentration
  if (dn.regionalPatterns[0]) {
    const p = dn.regionalPatterns[0];
    items.push({
      icon: Map,
      title: "Denominations cluster regionally",
      body: `${p.denomination} churches make up ${p.nationalPct}% of churches nationally but reach ${p.regionalPct}% in ${p.strongStates.slice(0, 3).join(", ")}. Denomination identity is still deeply tied to geography.`,
    });
  }

  // 5. Data quality gap
  if (dq.pctNeedsReview > 50) {
    const topMissing = dq.missingByField[0];
    items.push({
      icon: SearchCheck,
      title: "Most churches need your help",
      body: `${dq.pctNeedsReview}% of churches are still missing key information.${topMissing ? ` The most common gap: ${topMissing.field.toLowerCase()}, missing from ${topMissing.pct}% of listings.` : ""} This is a crowd-sourced project — every correction matters.`,
    });
  }

  // 6. Language diversity
  if (dv.bilingualChurches > 100) {
    items.push({
      icon: Globe,
      title: `${dv.bilingualChurches.toLocaleString()} multilingual churches`,
      body: `${dv.bilingualPct}% of churches offer services in more than one language across ${dv.languageDistribution.length} detected languages.${dv.languageDistribution[0] ? ` ${dv.languageDistribution[0].language} is the most common after English.` : ""}`,
    });
  }

  // 7. Megachurch vs small church contrast
  if (sp.largest[0] && sp.smallest[0]) {
    const L = sp.largest[0];
    const S = sp.smallest[0];
    items.push({
      icon: BarChart3,
      title: "From mega to micro",
      body: (
        <>
          {`The largest church by attendance (${L.name} `}
          <ChurchSpotlightMapButton c={L} />
          {` in ${L.city}, ${L.state}) draws an estimated ${L.attendance.toLocaleString()} weekly — while the smallest (${S.name} `}
          <ChurchSpotlightMapButton c={S} />
          {` in ${S.state}) serves about ${S.attendance.toLocaleString()}. America's churches span an enormous range.`}
        </>
      ),
    });
  }

  // 8. People per church nationally
  if (gd.national.peoplePer > 0) {
    items.push({
      icon: Users,
      title: `1 church for every ${gd.national.peoplePer.toLocaleString()} people`,
      body: `Nationally, there's roughly one church for every ${gd.national.peoplePer.toLocaleString()} Americans. That number hides huge variation — rural states have far more churches per person than urban ones.`,
    });
  }

  // 9. Community corrections (transparency) — green = community involvement
  if (cmRaw) {
    items.push({
      icon: Check,
      tone: "community",
      title: "Community-maintained data",
      body: (
        <>
          <span className="font-semibold text-green-600 tabular-nums">{cmRaw.totalCorrections.toLocaleString()}</span>{" "}
          corrections merged;{" "}
          <span className="font-semibold text-green-600 tabular-nums">{cmRaw.churchesImproved.toLocaleString()}</span>{" "}
          church listings improved at least once. That&apos;s{" "}
          <span className="font-semibold text-green-600 tabular-nums">{cmRaw.correctionsPerThousandChurches}</span>{" "}
          corrections per 1,000 mapped churches — proof the directory isn&apos;t static.
        </>
      ),
    });
  }

  // 10. Discoverability
  if (dq.pctWithContactPath != null && dq.pctWithServiceTimes != null) {
    items.push({
      icon: SearchCheck,
      title: "Can people find you?",
      body: `${dq.pctWithContactPath}% of listings have a website or phone on file; ${dq.pctWithServiceTimes}% have usable service times. Gaps here are the fastest wins for pastors and volunteers.`,
    });
  }

  // 11. Typical congregation size (median)
  if (dq.attendanceMedian != null && dq.attendanceMedian > 0 && dq.attendanceP25 != null && dq.attendanceP75 != null) {
    items.push({
      icon: BarChart3,
      title: `Median attendance ~${dq.attendanceMedian.toLocaleString()}`,
      body: `Among churches with an estimate, the middle of the pack sits around ${dq.attendanceMedian.toLocaleString()} weekly — with the 25th–75th percentile spanning ${dq.attendanceP25.toLocaleString()} to ${dq.attendanceP75.toLocaleString()}. Megachurch spotlights are outliers, not the norm.`,
    });
  }

  return (
    <>
      {items.map((item, i) => {
        const Icon = item.icon;
        const community = item.tone === "community";
        return (
          <div
            key={i}
            className={`group flex flex-col gap-3 rounded-xl p-5 transition-colors duration-200 sm:flex-row sm:gap-4 ${
              community
                ? "bg-green-50/50 hover:bg-green-50/80"
                : "bg-stone-50 hover:bg-purple-50/50"
            }`}
          >
            <div
              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors duration-200 ${
                community
                  ? "bg-green-100/90 group-hover:bg-green-200/80"
                  : "bg-purple-100/60 group-hover:bg-purple-200/60"
              }`}
            >
              <Icon
                className={`h-[18px] w-[18px] transition-colors duration-200 ${
                  community
                    ? "text-green-700 group-hover:text-green-800"
                    : "text-purple-700 group-hover:text-purple-800"
                }`}
              />
            </div>
            <div className="min-w-0 flex-1">
              <h4
                className={`font-semibold transition-colors duration-200 ${
                  community
                    ? "text-green-900 group-hover:text-green-950"
                    : "text-stone-900 group-hover:text-purple-900"
                }`}
              >
                {item.title}
              </h4>
              <p
                className={`text-pretty mt-1 text-sm leading-relaxed ${
                  community ? "text-stone-700/85" : "text-stone-700/70"
                }`}
              >
                {item.body}
              </p>
            </div>
          </div>
        );
      })}
    </>
  );
}

// ── Directory comparison ──
type FeatureSupport = "yes" | "partial" | "no";

const COMPARISON_FEATURES: {
  feature: string;
  hmc: FeatureSupport;
  googleMaps: FeatureSupport;
  churchFinder: FeatureSupport;
  churchOrg: FeatureSupport;
  hmcNote?: string;
}[] = [
  { feature: "100% free — no paid listings", hmc: "yes", googleMaps: "yes", churchFinder: "no", churchOrg: "no", hmcNote: "No premium tiers or sponsored results" },
  { feature: "Church-specific search", hmc: "yes", googleMaps: "partial", churchFinder: "yes", churchOrg: "yes", hmcNote: "Interactive map with filters" },
  { feature: "Denomination listed", hmc: "yes", googleMaps: "partial", churchFinder: "yes", churchOrg: "yes" },
  { feature: "Service times", hmc: "yes", googleMaps: "partial", churchFinder: "yes", churchOrg: "yes" },
  { feature: "Languages offered", hmc: "yes", googleMaps: "no", churchFinder: "no", churchOrg: "yes", hmcNote: "HMC detects and tracks across all churches" },
  { feature: "Ministry info", hmc: "yes", googleMaps: "no", churchFinder: "partial", churchOrg: "partial" },
  { feature: "Attendance estimates", hmc: "yes", googleMaps: "no", churchFinder: "no", churchOrg: "no", hmcNote: "Using building geometry + denomination benchmarks" },
  { feature: "Community corrections", hmc: "yes", googleMaps: "partial", churchFinder: "no", churchOrg: "no", hmcNote: "Anyone can suggest edits — no account needed" },
  { feature: "Open data source", hmc: "yes", googleMaps: "no", churchFinder: "no", churchOrg: "no", hmcNote: "Built on OpenStreetMap" },
];

function FeatureIcon({ support }: { support: FeatureSupport }) {
  if (support === "yes") return <Check className="h-4 w-4 text-green-600" />;
  if (support === "partial") return <Minus className="h-4 w-4 text-amber-500" />;
  return <X className="h-4 w-4 text-stone-300" />;
}

function DirectoryComparison({ report }: { report: SeasonalReport }) {
  const { bigPicture: bp, dataQuality: dq, diversity: dv } = report;

  return (
    <div>
      {/* Hero differentiators */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 mb-10">
        <div className="rounded-xl bg-purple-50 p-5 text-center ring-1 ring-purple-100">
          <div className="text-2xl font-bold text-purple-700">{bp.totalChurches.toLocaleString()}</div>
          <div className="text-sm text-stone-600 mt-1">Churches mapped</div>
          <div className="text-xs text-stone-400 mt-0.5">with denomination, attendance & more</div>
        </div>
        <div className="rounded-xl bg-purple-50 p-5 text-center ring-1 ring-purple-100">
          <div className="text-2xl font-bold text-purple-700">{dv.languageDistribution.length}</div>
          <div className="text-sm text-stone-600 mt-1">Languages tracked</div>
          <div className="text-xs text-stone-400 mt-0.5">no other directory tracks this</div>
        </div>
        <div className="rounded-xl bg-pink-50 p-5 text-center ring-1 ring-pink-100">
          <div className="text-2xl font-bold text-pink-600">{(100 - dq.pctNeedsReview).toFixed(2)}%</div>
          <div className="text-sm text-stone-600 mt-1">Currently Verified</div>
          <div className="text-xs text-stone-400 mt-0.5">targeting 99% accuracy</div>
        </div>
      </div>

      {/* Comparison table */}
      <div className="overflow-x-auto -mx-2">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-stone-200">
              <th className="text-left py-3 px-2 font-medium text-stone-500 w-[40%]">Feature</th>
              <th className="text-center py-3 px-2 font-semibold text-purple-700 w-[15%]">HMC</th>
              <th className="text-center py-3 px-2 font-medium text-stone-500 w-[15%]">Google Maps</th>
              <th className="text-center py-3 px-2 font-medium text-stone-500 w-[15%]">Church Finder</th>
              <th className="text-center py-3 px-2 font-medium text-stone-500 w-[15%]">Church.org</th>
            </tr>
          </thead>
          <tbody>
            {/* Coverage row — dynamic data */}
            <tr className="border-b border-stone-100 group hover:bg-stone-50 transition-colors">
              <td className="py-3 px-2">
                <div className="font-medium text-stone-700">Est. US churches represented</div>
                <div className="text-xs text-stone-400 mt-0.5">Out of ~380,000 estimated US churches</div>
              </td>
              <td className="py-3 px-2"><div className="flex items-center justify-center"><span className="text-xs font-semibold text-purple-700 tabular-nums">{bp.totalChurches.toLocaleString()} <span className="text-stone-400 font-normal">({((bp.totalChurches / 380000) * 100).toFixed(0)}%)</span></span></div></td>
              <td className="py-3 px-2"><div className="flex items-center justify-center"><span className="text-xs font-medium text-stone-500 tabular-nums">~350k</span></div></td>
              <td className="py-3 px-2"><div className="flex items-center justify-center"><span className="text-xs font-medium text-stone-500 tabular-nums">~280k</span></div></td>
              <td className="py-3 px-2"><div className="flex items-center justify-center"><span className="text-xs font-medium text-stone-500 tabular-nums">~38k</span></div></td>
            </tr>
            {COMPARISON_FEATURES.map((row) => (
              <tr key={row.feature} className="border-b border-stone-100 group hover:bg-stone-50 transition-colors">
                <td className="py-3 px-2">
                  <div className="font-medium text-stone-700">{row.feature}</div>
                  {row.hmcNote && (
                    <div className="text-xs text-stone-400 mt-0.5">{row.hmcNote}</div>
                  )}
                </td>
                <td className="py-3 px-2"><div className="flex items-center justify-center"><div className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-green-50"><FeatureIcon support={row.hmc} /></div></div></td>
                <td className="py-3 px-2"><div className="flex items-center justify-center"><FeatureIcon support={row.googleMaps} /></div></td>
                <td className="py-3 px-2"><div className="flex items-center justify-center"><FeatureIcon support={row.churchFinder} /></div></td>
                <td className="py-3 px-2"><div className="flex items-center justify-center"><FeatureIcon support={row.churchOrg} /></div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-stone-400">
        <span className="inline-flex items-center gap-1"><Check className="h-3 w-3 text-green-600" /> Full support</span>
        <span className="inline-flex items-center gap-1"><Minus className="h-3 w-3 text-amber-500" /> Partial / inconsistent</span>
        <span className="inline-flex items-center gap-1"><X className="h-3 w-3 text-stone-300" /> Not available</span>
      </div>
    </div>
  );
}

// ── Main page ──
export function SeasonalReportPage() {
  const { slug } = useParams<{ slug: string }>();
  const [report, setReport] = useState<SeasonalReport | null>(null);
  /** When the stored report predates `community`, fetch live totals from the API */
  const [communitySupplement, setCommunitySupplement] = useState<SeasonalReportCommunity | null>(null);
  const [communitySupplementDone, setCommunitySupplementDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const { activeSection, scrollProgress, scrollTo } = useReportScrollspy(
    report?.generatedAt
  );

  // The map page sets body { overflow: hidden; height: 100% } globally.
  // Override that so the report page can scroll normally.
  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const root = document.getElementById("root");

    // Save originals
    const origBodyOverflow = body.style.overflow;
    const origBodyHeight = body.style.height;
    const origHtmlOverflow = html.style.overflow;
    const origHtmlHeight = html.style.height;
    const origRootHeight = root?.style.height ?? "";
    const origRootMinHeight = root?.style.minHeight ?? "";

    // Override for scrollable report — use "visible" (not "auto") so
    // position:sticky works correctly (auto creates a scroll container)
    html.style.overflow = "visible";
    html.style.height = "auto";
    body.style.overflow = "visible";
    body.style.height = "auto";
    if (root) {
      root.style.height = "auto";
      root.style.minHeight = "100dvh";
    }

    return () => {
      html.style.overflow = origHtmlOverflow;
      html.style.height = origHtmlHeight;
      body.style.overflow = origBodyOverflow;
      body.style.height = origBodyHeight;
      if (root) {
        root.style.height = origRootHeight;
        root.style.minHeight = origRootMinHeight;
      }
    };
  }, []);

  useEffect(() => {
    if (!slug) return;
    setLoading(true);
    setError(null);
    setCommunitySupplement(null);
    setCommunitySupplementDone(false);
    fetchReport(slug)
      .then(setReport)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [slug]);

  useEffect(() => {
    if (!report) return;
    if (report.community != null) {
      setCommunitySupplementDone(true);
      return;
    }
    let cancelled = false;
    fetchCommunityStats()
      .then((s) => {
        if (cancelled) return;
        const tc = report.bigPicture.totalChurches;
        setCommunitySupplement({
          totalCorrections: s.totalCorrections,
          churchesImproved: s.churchesImproved,
          correctionsPerThousandChurches:
            tc > 0 ? Math.round((s.totalCorrections / tc) * 1000 * 100) / 100 : 0,
        });
      })
      .catch(() => {
        if (!cancelled) setCommunitySupplement(null);
      })
      .finally(() => {
        if (!cancelled) setCommunitySupplementDone(true);
      });
    return () => {
      cancelled = true;
    };
  }, [report]);

  // Scroll to hash fragment after report loads (e.g. /report/launch-2026#how-we-compare)
  useEffect(() => {
    if (!report || loading) return;
    const hash = window.location.hash.replace("#", "");
    if (!hash) return;
    // Small delay to let sections render
    const timer = setTimeout(() => {
      const el = document.getElementById(hash);
      if (el) el.scrollIntoView({ behavior: "smooth" });
    }, 300);
    return () => clearTimeout(timer);
  }, [report, loading]);

  // SEO: update document title and meta tags for the report
  useEffect(() => {
    if (!report) return;
    const prevTitle = document.title;
    document.title = `${report.title} — Here's My Church`;

    const setMeta = (selector: string, attr: string, content: string) => {
      const el = document.querySelector(selector);
      if (el) el.setAttribute(attr, content);
    };
    const description = `${report.subtitle} — ${report.bigPicture.totalChurches.toLocaleString()} churches across ${report.bigPicture.statesPopulated} states.`;

    setMeta('meta[name="description"]', "content", description);
    setMeta('meta[property="og:title"]', "content", `${report.title} — Here's My Church`);
    setMeta('meta[property="og:description"]', "content", description);
    setMeta('meta[property="og:url"]', "content", window.location.href);
    setMeta('meta[name="twitter:title"]', "content", `${report.title} — Here's My Church`);
    setMeta('meta[name="twitter:description"]', "content", description);
    setMeta('meta[name="twitter:url"]', "content", window.location.href);

    return () => { document.title = prevTitle; };
  }, [report]);

  if (loading) return null;
  if (error || !report) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-6">
        <div className="text-center">
          <h1 className="text-2xl font-semibold text-stone-900">Report not found</h1>
          <p className="text-pretty mt-2 text-stone-700/70">{error || "This report doesn't exist yet."}</p>
          <Link to="/" className="mt-4 inline-block text-purple-600 hover:text-stone-700 font-medium">
            Back to map
          </Link>
        </div>
      </div>
    );
  }

  const r = report;
  const { bigPicture: bp, community: communityRaw, dataQuality: dq, geoDensity: gd, denominations: dn, diversity: dv, spotlights: sp, stateRankings: sr } = r;
  /** Shown in the green panel; defaults so cached reports without `community` still get the section */
  const communityStats =
    communityRaw ??
    communitySupplement ?? {
      totalCorrections: 0,
      churchesImproved: 0,
      correctionsPerThousandChurches: 0,
    };
  const copy = useSectionCopy(r);

  return (
    <div className="min-h-screen bg-background">
      {/* Condensed header */}
      <header>
        <div className="mx-auto max-w-3xl px-6 py-8 sm:py-10">
          <div className="flex items-center justify-between">
            <Link
              to="/"
              className="inline-flex items-center gap-2 text-sm text-stone-400 hover:text-purple-600 transition-colors"
            >
              <div className="w-6 h-6 rounded overflow-hidden shrink-0">
                <img src={logoImg} alt="Here's My Church" className="w-full h-full object-cover" />
              </div>
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              heresmychurch.com
            </Link>
            <span className="text-xs text-stone-400">{new Date(r.generatedAt).toLocaleDateString("en-US", { month: "long", year: "numeric" })}</span>
          </div>
          <h1 className="mt-8 text-2xl font-bold text-stone-900 sm:text-4xl tracking-tight leading-[1.1]">
            The State of Churches in America
          </h1>
          <p className="text-pretty mt-2 text-base sm:text-lg text-stone-500 leading-relaxed">
            Here's My Church (HMC) is building the most accurate directory of Christian churches in America — crowd-sourced and 100% free.
          </p>
        </div>
      </header>

      {/* Body: TOC floats left of centered content */}
      <div className="mx-auto max-w-3xl px-6 pt-3 sm:pt-4">
        <main>
            {/* ── Changes from previous report (non-launch only) ── */}
            {r.changes && r.previousSlug && (
              <ChangeSummary changes={r.changes} previousSlug={r.previousSlug} />
            )}

            {/* ── Big Picture ── */}
            <Section id="big-picture">
              <SectionHeading
                title={copy.bigPicture.title}
                description={copy.bigPicture.description}
                icon={sectionIconFor("big-picture")}
              />
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:[&>*]:min-w-0">
                <StatCard
                  value={bp.totalChurches}
                  label="Churches Mapped"
                  sub={`~${((bp.totalChurches / 380000) * 100).toFixed(0)}% of est. 380k US churches`}
                />
                <StatCard
                  value={`${dq.pctNeedsReview}%`}
                  label="Still Need Review"
                  sub={`${dq.totalNeedsReview.toLocaleString()} churches`}
                  color="pink"
                />
              </div>

              {/* Community involvement */}
              <div className="mt-6 rounded-2xl bg-gradient-to-br from-green-50 via-emerald-50/80 to-green-50/90 px-5 py-5 ring-1 ring-green-100/80 sm:px-6">
                <div className="flex items-center gap-2.5">
                  <ShieldCheck className="h-5 w-5 text-green-600" aria-hidden />
                  <h3 className="text-lg font-semibold text-green-950">Community Involvement</h3>
                </div>
                <p className="text-pretty mt-1.5 text-sm leading-relaxed text-green-900/70">
                  Every listing can be improved by anyone — no account needed. Pastors, members, and neighbors submit corrections
                  that are reviewed and merged to keep the directory accurate and up to date.
                </p>
                <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-base">
                  <span className="inline-flex items-center gap-1.5 text-green-900/80">
                    <PenLine className="h-4 w-4 text-green-600/70" aria-hidden />
                    <span className="tabular-nums text-lg font-bold text-green-700">{communityStats.totalCorrections.toLocaleString()}</span>
                    {" "}corrections merged
                  </span>
                  <span className="inline-flex items-center gap-1.5 text-green-900/80">
                    <Sparkles className="h-4 w-4 text-green-600/70" aria-hidden />
                    <span className="tabular-nums text-lg font-bold text-green-700">{communityStats.churchesImproved.toLocaleString()}</span>
                    {" "}churches improved
                  </span>
                  <span className="inline-flex items-center gap-1.5 text-green-900/80">
                    <Ratio className="h-4 w-4 text-green-600/70" aria-hidden />
                    <span className="tabular-nums text-lg font-bold text-green-700">{communityStats.correctionsPerThousandChurches}</span>
                    {" "}per 1k churches
                  </span>
                </div>
                {!communityRaw && communitySupplementDone && communitySupplement == null && (
                  <p className="text-pretty mt-1.5 text-xs text-green-800/50">
                    Couldn&apos;t load community totals — try refreshing.
                  </p>
                )}
              </div>
              {r.changes &&
                (r.changes.netChurchChange !== 0 ||
                  r.changes.dataQualityDelta !== 0 ||
                  (r.changes.correctionsThisSeason ?? 0) > 0 ||
                  (r.changes.churchesImprovedDelta ?? 0) > 0) && (
                <Insight eyebrow="Dataset health (this season)">
                  {r.changes.netChurchChange !== 0 && (
                    <span>
                      Net churches {r.changes.netChurchChange > 0 ? "+" : ""}
                      {r.changes.netChurchChange.toLocaleString()}
                      {(r.changes.dataQualityDelta !== 0 ||
                        (r.changes.correctionsThisSeason ?? 0) > 0 ||
                        (r.changes.churchesImprovedDelta ?? 0) > 0)
                        ? ". "
                        : ""}
                    </span>
                  )}
                  {r.changes.dataQualityDelta !== 0 && (
                    <span>
                      Data needing review moved {r.changes.dataQualityDelta > 0 ? "down" : "up"} by{" "}
                      {Math.abs(r.changes.dataQualityDelta)} percentage points vs the previous report.
                    </span>
                  )}
                  {(r.changes.correctionsThisSeason ?? 0) > 0 && (
                    <span>
                      {" "}
                      <span className="font-semibold text-green-600 tabular-nums">
                        {r.changes.correctionsThisSeason!.toLocaleString()}
                      </span>{" "}
                      community corrections recorded this season.
                    </span>
                  )}
                  {(r.changes.churchesImprovedDelta ?? 0) > 0 && (
                    <span>
                      {" "}
                      <span className="font-semibold text-green-600 tabular-nums">
                        {r.changes.churchesImprovedDelta!.toLocaleString()}
                      </span>{" "}
                      listings improved via community submissions.
                    </span>
                  )}
                </Insight>
              )}
              {(() => {
                const topState = [...sr].sort((a, b) => b.pctComplete - a.pctComplete)[0];
                return topState ? (
                  <Insight eyebrow="At a Glance">
                    {bp.statesPopulated >= 50
                      ? `We've mapped churches across all 50 states — ${bp.totalChurches.toLocaleString()} and counting, representing ~${((bp.totalChurches / 380000) * 100).toFixed(0)}% of an estimated 380,000 US churches.`
                      : `We've covered ${bp.statesPopulated} of 50 states so far, with ${bp.totalChurches.toLocaleString()} churches mapped.`}
                    {` `}{topState.name} leads in data completeness at {topState.pctComplete}% verified.
                  </Insight>
                ) : (
                  <Insight eyebrow="At a Glance">
                    {bp.statesPopulated >= 50
                      ? `We've mapped churches across all 50 states — ${bp.totalChurches.toLocaleString()} and counting.`
                      : `We've covered ${bp.statesPopulated} of 50 states so far, with ${bp.totalChurches.toLocaleString()} churches mapped.`}
                  </Insight>
                );
              })()}
            </Section>

            <TrendingSection changes={r.changes} />

            {/* ── Data Quality ── */}
            <Section id="data-quality">
              <SectionHeading
                title={copy.dataQuality.title}
                description={copy.dataQuality.description}
                icon={sectionIconFor("data-quality")}
              />
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <StatCard
                  value={`${dq.pctNeedsReview}%`}
                  label="Need More Data"
                  sub={`${dq.totalNeedsReview.toLocaleString()} churches`}
                  color="pink"
                />
                <StatCard
                  value={`${(100 - dq.pctNeedsReview).toFixed(1)}%`}
                  label="Have Core Info"
                  sub="Address + service times + denomination"
                  color="pink"
                />
              </div>
              {(dq.pctWithWebsite != null ||
                dq.pctWithContactPath != null ||
                dq.pctWithServiceTimes != null) && (
                <div className="mt-6">
                  <h3 className="mb-3 text-lg font-semibold text-stone-900">Discoverability</h3>
                  <div className="rounded-xl bg-stone-50 px-5 py-4 ring-1 ring-stone-100">
                    <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-base">
                      {dq.pctWithWebsite != null && (
                        <span className="inline-flex items-center gap-1.5 text-stone-700">
                          <Link2 className="h-4 w-4 text-purple-500/70" aria-hidden />
                          <span className="tabular-nums text-lg font-bold text-purple-700">{dq.pctWithWebsite}%</span> website
                        </span>
                      )}
                      {dq.pctWithPhone != null && (
                        <span className="inline-flex items-center gap-1.5 text-stone-700">
                          <Phone className="h-4 w-4 text-purple-500/70" aria-hidden />
                          <span className="tabular-nums text-lg font-bold text-purple-700">{dq.pctWithPhone}%</span> phone
                        </span>
                      )}
                      {dq.pctWithContactPath != null && (
                        <span className="inline-flex items-center gap-1.5 text-stone-700">
                          <SearchCheck className="h-4 w-4 text-purple-500/70" aria-hidden />
                          <span className="tabular-nums text-lg font-bold text-purple-700">{dq.pctWithContactPath}%</span> website or phone
                        </span>
                      )}
                      {dq.pctWithServiceTimes != null && (
                        <span className="inline-flex items-center gap-1.5 text-stone-700">
                          <Clock className="h-4 w-4 text-purple-500/70" aria-hidden />
                          <span className="tabular-nums text-lg font-bold text-purple-700">{dq.pctWithServiceTimes}%</span> service times
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              )}
              {(dq.campusCount != null ||
                dq.pctWithMinistries != null ||
                dq.pctWithBuildingFootprint != null ||
                dq.pctVerifiedLast90Days != null) && (
                <div className="mt-6">
                  <h3 className="mb-3 text-lg font-semibold text-stone-900">Detail & confidence</h3>
                  <div className="rounded-xl bg-stone-50 px-5 py-4 ring-1 ring-stone-100">
                    <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-base">
                      {dq.campusCount != null && (
                        <span className="inline-flex items-center gap-1.5 text-stone-700">
                          <GitBranch className="h-4 w-4 text-purple-500/70" aria-hidden />
                          <span className="tabular-nums text-lg font-bold text-purple-700">{dq.campusCount.toLocaleString()}</span> campuses
                          {dq.campusPct != null && <span className="text-stone-500 text-sm ml-1">({dq.campusPct}%)</span>}
                        </span>
                      )}
                      {dq.pctWithMinistries != null && (
                        <span className="inline-flex items-center gap-1.5 text-stone-700">
                          <Tags className="h-4 w-4 text-purple-500/70" aria-hidden />
                          <span className="tabular-nums text-lg font-bold text-purple-700">{dq.pctWithMinistries}%</span> ministries
                        </span>
                      )}
                      {dq.pctWithBuildingFootprint != null && (
                        <span className="inline-flex items-center gap-1.5 text-stone-700">
                          <Footprints className="h-4 w-4 text-purple-500/70" aria-hidden />
                          <span className="tabular-nums text-lg font-bold text-purple-700">{dq.pctWithBuildingFootprint}%</span> building footprint
                        </span>
                      )}
                      {dq.pctVerifiedLast90Days != null && dq.pctVerifiedLast365Days != null && (
                        <span className="inline-flex items-center gap-1.5 text-stone-700">
                          <CalendarCheck className="h-4 w-4 text-purple-500/70" aria-hidden />
                          <span className="tabular-nums text-lg font-bold text-purple-700">{dq.pctVerifiedLast365Days}%</span> touched this year
                          <span className="text-stone-500 text-sm ml-1">({dq.pctVerifiedLast90Days}% last 90d)</span>
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              )}
              {(dq.attendanceMedian != null && dq.attendanceMedian > 0) && (
                <div className="mt-8">
                  <h3 className="mb-3 text-lg font-semibold text-stone-900">Estimated attendance distribution</h3>
                  <p className="text-pretty mb-4 text-sm text-stone-700/70">
                    Among churches with an estimate &gt; 0 — median and quartiles (not the megachurch-only spotlight list).
                  </p>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                    <StatCard
                      value={dq.attendanceP25 ?? "—"}
                      label="25th percentile"
                      sub="Lower quartile"
                    />
                    <StatCard value={dq.attendanceMedian} label="Median estimate" sub="Typical congregation size" />
                    <StatCard
                      value={dq.attendanceP75 ?? "—"}
                      label="75th percentile"
                      sub="Upper quartile"
                    />
                  </div>
                </div>
              )}
              {dq.topMinistries && dq.topMinistries.length > 0 && (
                <div className="mt-8">
                  <h3 className="mb-4 text-lg font-semibold text-stone-900">Top ministry tags</h3>
                  <HorizontalBarChart
                    data={dq.topMinistries.slice(0, 12).map((m) => ({
                      label: m.name,
                      value: m.count,
                      pct: m.pct,
                    }))}
                    showPct
                    color="#9333EA"
                  />
                </div>
              )}
              <StateDataQualityTable rows={dq.stateBreakdown} />
              <div className="mt-8">
                <h3 className="mb-4 text-lg font-semibold text-stone-900">What's Missing?</h3>
                <HorizontalBarChart
                  data={dq.missingByField.map((f) => ({
                    label: f.field,
                    value: f.count,
                    pct: f.pct,
                  }))}
                  showPct
                  color="#EC4899"
                />
              </div>
              <Insight eyebrow="The Gap" color="pink">
                Our data quality goal is ambitious: a complete address, service times, and denomination for every church. Right now {dq.pctNeedsReview}% of churches are missing 2 or more of these — and that's where you come in.
              </Insight>
            </Section>

            {/* ── Geographic Density ── */}
            <Section id="geo-density">
              <SectionHeading
                title={copy.geoDensity.title}
                description={copy.geoDensity.description}
                icon={sectionIconFor("geo-density")}
              />
              <ChoroplethMap
                values={Object.fromEntries(
                  Object.entries(gd.stateMetrics).map(([k, v]) => [k, v.churchesPer10k])
                )}
                label="churches per 10k people"
              />
              <div className="mt-8 grid grid-cols-1 gap-8 sm:grid-cols-2">
                <div>
                  <h3 className="mb-3 text-lg font-semibold text-stone-900">
                    Most Churched States
                  </h3>
                  <HorizontalBarChart
                    data={gd.mostChurched.slice(0, 8).map((s) => ({
                      label: s.name,
                      value: s.churchesPer10k,
                    }))}
                    color="#6B21A8"
                  />
                </div>
                <div>
                  <h3 className="mb-3 text-lg font-semibold text-stone-900">
                    Least Churched States
                  </h3>
                  <HorizontalBarChart
                    data={gd.leastChurched.slice(0, 8).map((s) => ({
                      label: s.name,
                      value: s.churchesPer10k,
                    }))}
                    color="#C084FC"
                  />
                </div>
              </div>
              <Insight eyebrow="By the Numbers">
                Nationally, there's roughly 1 church for every {gd.national.peoplePer.toLocaleString()} people.
                {gd.mostChurched[0] && ` ${gd.mostChurched[0].name} leads with ${gd.mostChurched[0].churchesPer10k} churches per 10,000 residents.`}
              </Insight>
            </Section>

            {/* ── Denomination Landscape ── */}
            <Section id="denominations">
              <SectionHeading
                title={copy.denominations.title}
                description={copy.denominations.description}
                icon={sectionIconFor("denominations")}
              />
              <HorizontalBarChart
                data={dn.national.filter((d) => d.name !== "Unspecified").slice(0, 12).map((d) => ({
                  label: d.name,
                  value: d.count,
                  pct: d.pct,
                }))}
                showPct
                color="#7C3AED"
              />

              {dn.regionalPatterns.length > 0 && (
                <div className="mt-8">
                  <h3 className="mb-2 text-lg font-semibold text-stone-900">
                    Where denominations run deep
                  </h3>
                  <p className="text-pretty mb-5 text-sm text-stone-700/70">
                    Some traditions are everywhere, but others are especially strong in a handful of states.
                    Here are the biggest standouts.
                  </p>
                  <div className="space-y-3">
                    {dn.regionalPatterns.slice(0, 8).map((p) => {
                      const multiplier = p.nationalPct > 0 ? Math.round(p.regionalPct / p.nationalPct) : 0;
                      return (
                        <div key={p.denomination} className="rounded-xl bg-stone-50 px-4 py-3.5 ring-1 ring-stone-100">
                          <div className="flex items-baseline justify-between gap-2">
                            <span className="text-sm font-semibold text-stone-900">{p.denomination}</span>
                            {multiplier >= 2 && (
                              <span className="shrink-0 rounded-full bg-purple-100 px-2 py-0.5 text-xs font-semibold text-purple-700">
                                {multiplier}x the national rate
                              </span>
                            )}
                          </div>
                          <p className="text-pretty mt-1 text-sm text-stone-600">
                            About <span className="font-semibold text-stone-800">{p.nationalPct}%</span> of churches nationally, but{" "}
                            <span className="font-semibold text-purple-700">{p.regionalPct}%</span> in{" "}
                            {p.strongStates.slice(0, 3).map((st, j, arr) => (
                              <React.Fragment key={st}>
                                <span className="font-medium text-stone-800">{st}</span>
                                {j < arr.length - 2 ? ", " : j === arr.length - 2 ? " and " : ""}
                              </React.Fragment>
                            ))}.
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              <DenominationBreakdownByStateTable
                breakdownByState={dn.byStateBreakdown}
                dominantByState={dn.dominantByState}
              />
              <Insight eyebrow="Key Finding">
                {(() => {
                  const top = dn.national.filter((d) => d.name !== "Unspecified");
                  return (
                    <>
                      {top[0] && `${top[0].name} churches are the most common at ${top[0].pct}% of all mapped churches.`}
                      {top[1] && ` ${top[1].name} follows at ${top[1].pct}%.`}
                    </>
                  );
                })()}
              </Insight>
            </Section>

            {/* ── Diversity ── */}
            <Section id="diversity">
              <SectionHeading
                title={copy.diversity.title}
                description={copy.diversity.description}
                icon={sectionIconFor("diversity")}
              />
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <StatCard
                  value={dv.bilingualChurches}
                  label="Multilingual Churches"
                  sub={`${dv.bilingualPct}% of all churches`}
                />
                <StatCard
                  value={dv.languageDistribution.length}
                  label="Languages Detected"
                />
              </div>
              {dv.languageDistribution.length > 0 && (
                <div className="mt-8">
                  <h3 className="mb-4 text-lg font-semibold text-stone-900">
                    Top Non-English Languages
                  </h3>
                  <HorizontalBarChart
                    data={dv.languageDistribution.slice(0, 10).map((l) => ({
                      label: l.language,
                      value: l.count,
                    }))}
                    color="#8B5CF6"
                  />
                </div>
              )}
              {dv.topBilingualStates.length > 0 && (
                <div className="mt-8">
                  <h3 className="mb-4 text-lg font-semibold text-stone-900">
                    Most Multilingual States
                  </h3>
                  <HorizontalBarChart
                    data={dv.topBilingualStates.slice(0, 8).map((s) => ({
                      label: s.name,
                      value: s.count,
                      pct: s.pct,
                    }))}
                    showPct
                    color="#A855F7"
                  />
                </div>
              )}
              <Insight eyebrow="Did You Know">
                {dv.languageDistribution[0] && `${dv.languageDistribution[0].language} is the most common non-English language, found in ${dv.languageDistribution[0].count.toLocaleString()} churches.`}
                {dv.topBilingualStates[0] && ` ${dv.topBilingualStates[0].name} leads in language diversity with ${dv.topBilingualStates[0].pct}% of its churches offering multilingual services.`}
              </Insight>
            </Section>

            {/* ── Spotlights ── */}
            <Section id="spotlights">
              <SectionHeading
                title={copy.spotlights.title}
                description={copy.spotlights.description}
                icon={sectionIconFor("spotlights")}
              />
              <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <StatCard
                  value={bp.totalAttendanceEstimate > 0
                    ? `${Math.round(bp.totalAttendanceEstimate / 1000000 * 10) / 10}M`
                    : "Estimating..."}
                  label="Est. Weekly Attendance"
                />
                {sp.largest[0] && (
                  <StatCard
                    value={sp.largest[0].attendance}
                    label="Largest Single-Church Attendance"
                    sub={
                      <span className="inline-flex flex-col items-center gap-2">
                        <span>
                          {sp.largest[0].name} ({sp.largest[0].state})
                        </span>
                        <ChurchSpotlightMapButton c={sp.largest[0]} />
                      </span>
                    }
                  />
                )}
              </div>
              <div className="grid grid-cols-1 gap-8 sm:grid-cols-2">
                <div>
                  <h3 className="mb-4 text-lg font-semibold text-stone-900">
                    Largest by Attendance
                  </h3>
                  <div className="space-y-4">
                    {sp.largest.slice(0, 5).map((c, i) => (
                      <div
                        key={`${c.name}-${c.state}-${i}`}
                        className="flex items-start gap-3 rounded-xl bg-stone-50 p-4"
                      >
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-purple-100/60 text-sm font-bold text-purple-700">
                          {i + 1}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="font-semibold text-stone-800 truncate min-w-0 break-words">{c.name}</div>
                          <div className="text-sm text-stone-500 inline-flex flex-wrap items-center gap-x-1.5 gap-y-0.5 mt-0.5">
                            <StateFlag abbrev={c.state} size="sm" />
                            {c.city}, {c.state} &middot; {c.attendance.toLocaleString()} est.
                          </div>
                          {c.denomination && (
                            <div className="text-xs text-stone-400">{c.denomination}</div>
                          )}
                          <div className="mt-2">
                            <ChurchSpotlightMapButton c={c} />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <h3 className="mb-4 text-lg font-semibold text-stone-900">
                    Smallest Congregations
                  </h3>
                  <div className="space-y-4">
                    {sp.smallest.slice(0, 5).map((c, i) => (
                      <div
                        key={`${c.name}-${c.state}-${i}`}
                        className="flex items-start gap-3 rounded-xl bg-stone-50 p-4"
                      >
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-purple-100/60 text-sm font-bold text-purple-700">
                          {i + 1}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="font-semibold text-stone-800 truncate min-w-0 break-words">{c.name}</div>
                          <div className="text-sm text-stone-500 inline-flex flex-wrap items-center gap-x-1.5 gap-y-0.5 mt-0.5">
                            <StateFlag abbrev={c.state} size="sm" />
                            {c.city}, {c.state} &middot; {c.attendance.toLocaleString()} est.
                          </div>
                          <div className="mt-2">
                            <ChurchSpotlightMapButton c={c} />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </Section>

            {/* ── Takeaways ── */}
            <Section id="takeaways">
              <SectionHeading
                title={copy.takeaways.title}
                description={copy.takeaways.description}
                icon={sectionIconFor("takeaways")}
              />
              <div className="space-y-4">
                <Takeaways report={r} />
              </div>
            </Section>

            {/* ── State Rankings ── */}
            <Section id="state-rankings">
              <SectionHeading
                title={copy.stateRankings.title}
                description={copy.stateRankings.description}
                icon={sectionIconFor("state-rankings")}
              />
              <StateRankingsTable data={sr} />
            </Section>

            {/* ── How We Compare ── */}
            <Section id="how-we-compare">
              <SectionHeading
                title={copy.howWeCompare.title}
                description={copy.howWeCompare.description}
                icon={sectionIconFor("how-we-compare")}
              />
              <DirectoryComparison report={r} />
              <div className="mt-10 rounded-xl bg-stone-50 p-5">
                <h3 className="text-sm font-semibold text-stone-700 mb-2">Our Data Sources</h3>
                <p className="text-pretty text-sm text-stone-500 leading-relaxed">
                  Church data sourced from OpenStreetMap and enriched with ARDA attendance benchmarks,
                  Census population data, and community corrections. Attendance estimates derived from
                  building geometry and denomination-specific benchmarks.
                </p>
              </div>
            </Section>

            {/* ── Contribute ── */}
            <Section id="contribute">
              <SectionHeading
                title="How You Can Contribute"
                description="HMC is a community project — every correction, addition, and review makes the data better for everyone."
                icon={sectionIconFor("contribute")}
              />
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div className="rounded-xl bg-stone-50 p-5 ring-1 ring-stone-100">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-purple-100/60 mb-3">
                    <SearchCheck className="h-[18px] w-[18px] text-purple-700" />
                  </div>
                  <h4 className="font-semibold text-stone-900">Review a church</h4>
                  <p className="text-pretty mt-1 text-sm text-stone-500 leading-relaxed">
                    Find your church on the map and verify the info is correct — address, service times, denomination.
                  </p>
                </div>
                <div className="rounded-xl bg-stone-50 p-5 ring-1 ring-stone-100">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-purple-100/60 mb-3">
                    <Church className="h-[18px] w-[18px] text-purple-700" />
                  </div>
                  <h4 className="font-semibold text-stone-900">Add a missing church</h4>
                  <p className="text-pretty mt-1 text-sm text-stone-500 leading-relaxed">
                    Know a church that isn't on the map? Add it in under a minute — no account needed.
                  </p>
                </div>
                <div className="rounded-xl bg-stone-50 p-5 ring-1 ring-stone-100">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-purple-100/60 mb-3">
                    <Globe className="h-[18px] w-[18px] text-purple-700" />
                  </div>
                  <h4 className="font-semibold text-stone-900">Share the project</h4>
                  <p className="text-pretty mt-1 text-sm text-stone-500 leading-relaxed">
                    The more people who know about HMC, the faster we reach 99% accuracy. Share with your church community.
                  </p>
                </div>
              </div>
              <div className="mt-8 flex flex-wrap gap-3">
                <Button asChild>
                  <Link to="/">Explore the Map</Link>
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    navigator.clipboard.writeText(window.location.href);
                  }}
                >
                  Copy Link
                </Button>
              </div>
            </Section>

            {/* ── FAQ ── */}
            <div className="mt-10 mb-6">
              <h2 className="text-lg font-semibold text-stone-900 sm:text-xl tracking-tight">
                Common Questions
              </h2>
              <p className="text-pretty mt-1.5 text-sm text-stone-500">
                Everything you need to know about Here&apos;s My Church.
              </p>
              <Accordion type="single" collapsible className="mt-4 border-stone-200/60">
                <AccordionItem value="this-project" className="border-stone-200/60">
                  <AccordionTrigger className="text-stone-800 hover:text-stone-900 hover:no-underline text-left">
                    What is this project?
                  </AccordionTrigger>
                  <AccordionContent className="text-stone-600 text-sm leading-relaxed">
                    Here&apos;s My Church (HMC) is a free, open-source, interactive map that helps people
                    discover Christian churches across all 50 U.S. states. No account needed. You can
                    browse by state, search and filter by denomination, size, or language, view church
                    details, and contribute by adding churches or suggesting edits.
                  </AccordionContent>
                </AccordionItem>
                <AccordionItem value="goals" className="border-stone-200/60">
                  <AccordionTrigger className="text-stone-800 hover:text-stone-900 hover:no-underline text-left">
                    What are the goals?
                  </AccordionTrigger>
                  <AccordionContent className="text-stone-600 text-sm leading-relaxed">
                    Make it easy for anyone to find a church near them, with data that&apos;s actually
                    up to date. We want every church to be included and kept accurate through community
                    contributions.
                  </AccordionContent>
                </AccordionItem>
                <AccordionItem value="add-church" className="border-stone-200/60">
                  <AccordionTrigger className="text-stone-800 hover:text-stone-900 hover:no-underline text-left">
                    How do I add a church?
                  </AccordionTrigger>
                  <AccordionContent className="text-stone-600 text-sm leading-relaxed space-y-2">
                    <p>
                      Click any state on the map to zoom in, then use the &quot;Add a Church&quot; button
                      in the state summary panel. You can also start a search and you&apos;ll see the
                      option to add your church. No account is required.
                    </p>
                    <p className="text-stone-400 text-xs italic">
                      We encourage you to find your church first; if it&apos;s already listed, please
                      update the information instead of adding a duplicate.
                    </p>
                  </AccordionContent>
                </AccordionItem>
                <AccordionItem value="suggest-edit" className="border-stone-200/60">
                  <AccordionTrigger className="text-stone-800 hover:text-stone-900 hover:no-underline text-left">
                    How do I suggest an edit?
                  </AccordionTrigger>
                  <AccordionContent className="text-stone-600 text-sm leading-relaxed">
                    Click a church on the map to open its detail panel, then use the &quot;Update Church
                    Info&quot; button to suggest corrections or add missing details. Submissions are
                    reviewed and merged to keep the map accurate.
                  </AccordionContent>
                </AccordionItem>
                <AccordionItem value="data-source" className="border-stone-200/60">
                  <AccordionTrigger className="text-stone-800 hover:text-stone-900 hover:no-underline text-left">
                    Where does the data come from?
                  </AccordionTrigger>
                  <AccordionContent className="text-stone-600 text-sm leading-relaxed">
                    We use OpenStreetMap church data with denomination matching, ARDA reference data,
                    U.S. Census population data, and community-submitted churches and corrections.
                    Attendance estimates are primarily based on building footprint area, with denomination
                    averages and regional scaling used where building data isn&apos;t available.
                  </AccordionContent>
                </AccordionItem>
                <AccordionItem value="how-we-compare" className="border-stone-200/60">
                  <AccordionTrigger className="text-stone-800 hover:text-stone-900 hover:no-underline text-left">
                    How does HMC compare to other directories?
                  </AccordionTrigger>
                  <AccordionContent className="text-stone-600 text-sm leading-relaxed space-y-2">
                    <p>
                      Most church directories are either a category inside a general-purpose map or paid
                      listing sites. HMC is different:
                    </p>
                    <ul className="space-y-1 text-sm">
                      <li className="flex items-start gap-2"><span className="text-purple-400 mt-0.5 shrink-0">•</span><span><span className="font-medium text-stone-800">Attendance estimates</span> — no other directory provides this</span></li>
                      <li className="flex items-start gap-2"><span className="text-purple-400 mt-0.5 shrink-0">•</span><span><span className="font-medium text-stone-800">Language tracking</span> — see which churches offer multilingual services</span></li>
                      <li className="flex items-start gap-2"><span className="text-purple-400 mt-0.5 shrink-0">•</span><span><span className="font-medium text-stone-800">Community corrections</span> — a purpose-built flow for fixing church data</span></li>
                      <li className="flex items-start gap-2"><span className="text-purple-400 mt-0.5 shrink-0">•</span><span><span className="font-medium text-stone-800">100% free</span> — no paid listings, no premium tiers, no sponsored results</span></li>
                      <li className="flex items-start gap-2"><span className="text-purple-400 mt-0.5 shrink-0">•</span><span><span className="font-medium text-stone-800">Open source</span> — built on OpenStreetMap, fully transparent</span></li>
                    </ul>
                  </AccordionContent>
                </AccordionItem>
                <AccordionItem value="data-updates" className="border-stone-200/60">
                  <AccordionTrigger className="text-stone-800 hover:text-stone-900 hover:no-underline text-left">
                    How often is the data updated?
                  </AccordionTrigger>
                  <AccordionContent className="text-stone-600 text-sm leading-relaxed">
                    Reference data is refreshed on a regular schedule. Community submissions and
                    corrections are reviewed and merged continuously.
                  </AccordionContent>
                </AccordionItem>
                <AccordionItem value="open-source" className="border-stone-200/60">
                  <AccordionTrigger className="text-stone-800 hover:text-stone-900 hover:no-underline text-left">
                    Is this open source?
                  </AccordionTrigger>
                  <AccordionContent className="text-stone-600 text-sm leading-relaxed">
                    Yes. The project is open source under the{" "}
                    <a
                      href="https://creativecommons.org/licenses/by-nc/4.0/"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline text-purple-600 hover:text-purple-800 transition-colors"
                    >
                      CC BY-NC 4.0
                    </a>{" "}
                    license. You can find the code on{" "}
                    <a
                      href="https://github.com/harvouscom/Heresmychurch"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline text-purple-600 hover:text-purple-800 transition-colors"
                    >
                      GitHub
                    </a>.
                  </AccordionContent>
                </AccordionItem>
                <AccordionItem value="expand-us" className="border-stone-200/60 border-b-0">
                  <AccordionTrigger className="text-stone-800 hover:text-stone-900 hover:no-underline text-left">
                    Are there plans to expand beyond the U.S.?
                  </AccordionTrigger>
                  <AccordionContent className="text-stone-600 text-sm leading-relaxed">
                    Yes. We plan to expand to other countries in the future.
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </div>

            <div className="pb-24" />
          </main>
        </div>

      {/* Floating TOC pill — works on all screen sizes */}
      <ReportTOC
        activeSection={activeSection}
        scrollProgress={scrollProgress}
        onNavigate={scrollTo}
      />
    </div>
  );
}

// ── State Rankings Table ──
function StateRankingsTable({
  data,
}: {
  data: SeasonalReport["stateRankings"];
}) {
  const [sortKey, setSortKey] = useState<keyof SeasonalReport["stateRankings"][0]>("churchCount");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const sorted = [...data].sort((a, b) => {
    const av = a[sortKey];
    const bv = b[sortKey];
    if (typeof av === "number" && typeof bv === "number") {
      return sortDir === "asc" ? av - bv : bv - av;
    }
    return sortDir === "asc"
      ? String(av).localeCompare(String(bv))
      : String(bv).localeCompare(String(av));
  });

  function toggleSort(key: typeof sortKey) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  const columns: { key: typeof sortKey; label: string; align?: string; community?: boolean }[] = [
    { key: "name", label: "State" },
    { key: "churchCount", label: "Churches", align: "right" },
    { key: "churchesPer10k", label: "Per 10k", align: "right" },
    { key: "pctComplete", label: "% Complete", align: "right" },
    { key: "corrections", label: "Corrections", align: "right", community: true },
  ];

  return (
    <div className="max-h-[min(420px,55vh)] overflow-auto rounded-xl border border-stone-200/60">
      <table className="w-full text-sm">
        <thead className="sticky top-0 z-10">
          <tr className="border-b border-stone-200/60 bg-stone-50">
            {columns.map((col) => (
              <th
                key={col.key}
                onClick={() => toggleSort(col.key)}
                className={`cursor-pointer select-none px-4 py-3 font-semibold text-stone-700/70 hover:text-stone-900 transition-colors ${
                  col.align === "right" ? "text-right" : "text-left"
                }`}
              >
                <span className="inline-flex items-center gap-1">
                  <span className={col.community ? "text-green-700/90" : undefined}>{col.label}</span>
                  {sortKey === col.key && (
                    <span className={col.community ? "text-green-600" : "text-purple-500"}>
                      {sortDir === "asc" ? "\u2191" : "\u2193"}
                    </span>
                  )}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row, i) => (
            <tr
              key={row.abbrev}
              className={`border-b border-stone-200/40 ${i % 2 === 0 ? "" : "bg-stone-50/50"} hover:bg-purple-50/30 transition-colors`}
            >
              <td className="px-4 py-2.5 font-medium text-stone-800">
                <span className="inline-flex items-center gap-2">
                  <StateFlag abbrev={row.abbrev} size="sm" />
                  {row.name}
                </span>
              </td>
              <td className="px-4 py-2.5 text-right tabular-nums">
                {row.churchCount.toLocaleString()}
              </td>
              <td className="px-4 py-2.5 text-right tabular-nums">{row.churchesPer10k}</td>
              <td className="px-4 py-2.5 text-right">
                <span
                  className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                    row.pctComplete >= 75
                      ? "bg-purple-100 text-purple-800"
                      : row.pctComplete >= 50
                      ? "bg-purple-50 text-purple-700"
                      : row.pctComplete >= 25
                      ? "bg-pink-50 text-pink-600"
                      : "bg-pink-100 text-pink-700"
                  }`}
                >
                  {row.pctComplete}%
                </span>
              </td>
              <td
                className={`px-4 py-2.5 text-right tabular-nums font-medium ${
                  row.corrections > 0 ? "text-green-600" : "text-stone-400"
                }`}
              >
                {row.corrections}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

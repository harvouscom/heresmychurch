import React, { useEffect, useState, useRef, useMemo } from "react";
import { usePrefersReducedMotion } from "../../hooks/usePrefersReducedMotion";
import { useParams, Link } from "react-router";
import { fetchCommunityStats, fetchReport, searchChurches } from "../api";
import type { SeasonalReport, SeasonalReportChanges, SeasonalReportCommunity } from "../church-data";
import { useReportScrollspy } from "./useReportScrollspy";
import { ReportTOC } from "./ReportTOC";
import { ReportSectionVisibleContext } from "./report-section-visible-context";
import {
  StatCard,
  HorizontalBarChart,
  TreemapChart,
  ChoroplethMap,
} from "./charts";
import { Button } from "../ui/button";
import { StateFlag } from "../StateFlag";
import { spotlightMapHref } from "../url-utils";
import {
  Building2,
  MapPinned,
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
} from "lucide-react";
import logoImg from "../../../assets/a94bce1cf0860483364d5d9c353899b7da8233e7.png";

type LucideIcon = React.ComponentType<{ className?: string }>;

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
        const exact =
          results.find((r) => norm(r.name) === wantN && (!wantC || norm(r.city || "") === wantC)) ||
          results.find((r) => norm(r.name) === wantN) ||
          results[0];
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
      className="inline-flex shrink-0 items-center gap-1 rounded-full bg-purple-600 px-2.5 py-1 text-[11px] font-semibold text-white shadow-sm transition-colors hover:bg-purple-700"
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
        ? "Here's My Church launched with an ambitious goal: build the most accurate church directory in America. Here's where we stand."
        : `How the map has grown through ${seasonLabel} ${r.year}. Here's the latest snapshot.`,
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
    // Positive rootMargin expands the viewport for intersection — sections animate in
    // while still below the fold (earlier, smoother stagger as you scroll).
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
      className="scroll-mt-12 mb-8 sm:mb-10 rounded-2xl bg-white p-6 sm:p-10 shadow-sm"
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(12px)",
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
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="mb-10">
      <h2 className="text-xl font-semibold text-stone-900 sm:text-2xl tracking-tight">{title}</h2>
      <p className="mt-3 text-lg text-stone-500 leading-relaxed">
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
    <div className="mb-8 rounded-2xl bg-white p-6 sm:p-10 shadow-sm">
      <h2 className="text-xl font-semibold text-stone-900 sm:text-2xl tracking-tight">What Changed</h2>
      <p className="mt-2 text-sm text-stone-500">Since the{" "}
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

// ── Insight card (textbook-style callout with eyebrow) ──
const INSIGHT_COLORS = {
  purple: { bg: "bg-purple-50", border: "border-purple-100", eyebrow: "text-purple-400" },
  pink: { bg: "bg-pink-50", border: "border-pink-100", eyebrow: "text-pink-400" },
} as const;

function Insight({ children, eyebrow = "Key Finding", color = "purple" }: { children: React.ReactNode; eyebrow?: string; color?: keyof typeof INSIGHT_COLORS }) {
  const c = INSIGHT_COLORS[color];
  return (
    <div className={`my-8 rounded-xl ${c.bg} border ${c.border} px-5 py-4`}>
      <span className={`text-[11px] font-bold uppercase tracking-widest ${c.eyebrow}`}>
        {eyebrow}
      </span>
      <p className="mt-1.5 text-sm sm:text-base text-stone-700/70 leading-relaxed">
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
      <p className="mb-4 text-sm text-stone-700/70">
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

function DominantByStateTable({
  dominantByState,
}: {
  dominantByState: SeasonalReport["denominations"]["dominantByState"];
}) {
  const entries = Object.entries(dominantByState).sort((a, b) => a[0].localeCompare(b[0]));
  if (!entries.length) return null;
  return (
    <div className="mt-10">
      <h3 className="mb-2 text-lg font-semibold text-stone-900">Dominant denomination by state</h3>
      <p className="mb-4 text-sm text-stone-700/70">
        Broad categories (same grouping as national totals). Useful for seeing regional tradition at a glance.
      </p>
      <div className="max-h-[min(420px,55vh)] overflow-auto rounded-xl border border-stone-200/60">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10 border-b border-stone-200/60 bg-stone-50">
            <tr>
              <th className="px-4 py-2.5 text-left font-semibold text-stone-700/80">State</th>
              <th className="px-4 py-2.5 text-left font-semibold text-stone-700/80">Top category</th>
              <th className="px-4 py-2.5 text-right font-semibold text-stone-700/80">Count</th>
              <th className="px-4 py-2.5 text-right font-semibold text-stone-700/80">% of state</th>
            </tr>
          </thead>
          <tbody>
            {entries.map(([abbrev, d], i) => (
              <tr
                key={abbrev}
                className={`border-b border-stone-100 ${i % 2 === 1 ? "bg-stone-50/50" : ""}`}
              >
                <td className="px-4 py-2">
                  <span className="inline-flex items-center gap-2 font-medium text-stone-800">
                    <StateFlag abbrev={abbrev} size="sm" />
                    {abbrev}
                  </span>
                </td>
                <td className="px-4 py-2 text-stone-700">{d.denomination}</td>
                <td className="px-4 py-2 text-right tabular-nums text-stone-600">{d.count.toLocaleString()}</td>
                <td className="px-4 py-2 text-right tabular-nums text-purple-800">{d.pct}%</td>
              </tr>
            ))}
          </tbody>
        </table>
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

  // 3. Dominant denomination surprise
  if (dn.national[0] && dn.national[1]) {
    const gap = dn.national[0].pct - dn.national[1].pct;
    items.push({
      icon: Church,
      title: `${dn.national[0].name} leads by ${gap.toFixed(1)} points`,
      body: `At ${dn.national[0].pct}% of all mapped churches, ${dn.national[0].name} is the most common denomination nationally. ${dn.national[1].name} follows at ${dn.national[1].pct}%. The top two alone account for ${(dn.national[0].pct + dn.national[1].pct).toFixed(1)}% of all churches.`,
    });
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

  // 12. Population represented
  if (bp.populationRepresented != null && bp.populationRepresented > 0) {
    const m =
      bp.populationRepresentedMillions != null
        ? bp.populationRepresentedMillions
        : Math.round((bp.populationRepresented / 1e6) * 10) / 10;
    items.push({
      icon: MapPinned,
      title: `~${m} million people in covered states`,
      body: `Census population in states where we list at least one church — the community footprint of what we're trying to keep accurate for seekers and leaders.`,
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
            className={`group flex gap-4 rounded-xl p-5 transition-colors duration-200 ${
              community
                ? "border border-green-100/90 bg-green-50/50 hover:bg-green-50/80"
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
            <div>
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
                className={`mt-1 text-sm leading-relaxed ${
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
        <div className="rounded-xl bg-purple-50 border border-purple-100 p-5 text-center">
          <div className="text-2xl font-bold text-purple-700">{bp.totalChurches.toLocaleString()}</div>
          <div className="text-sm text-stone-600 mt-1">Churches mapped</div>
          <div className="text-xs text-stone-400 mt-0.5">with denomination, attendance & more</div>
        </div>
        <div className="rounded-xl bg-purple-50 border border-purple-100 p-5 text-center">
          <div className="text-2xl font-bold text-purple-700">{dv.languageDistribution.length}</div>
          <div className="text-sm text-stone-600 mt-1">Languages tracked</div>
          <div className="text-xs text-stone-400 mt-0.5">no other directory tracks this</div>
        </div>
        <div className="rounded-xl bg-pink-50 border border-pink-100 p-5 text-center">
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
      <div className="mt-4 flex items-center gap-4 text-xs text-stone-400">
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
          <p className="mt-2 text-stone-700/70">{error || "This report doesn't exist yet."}</p>
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
  const hasPopulationStat = bp.populationRepresented != null && bp.populationRepresented > 0;
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
          <p className="mt-2 text-base sm:text-lg text-stone-500 leading-relaxed">
            Here's My Church (HMC) is building the most accurate directory of Christian churches in America — crowd-sourced and 100% free. This is where we stand as of {new Date(r.generatedAt).toLocaleDateString("en-US", { month: "long", year: "numeric" })}.
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
              />
              <div
                className={
                  hasPopulationStat
                    ? "grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 lg:[&>*]:min-w-0"
                    : "grid grid-cols-1 gap-4 sm:grid-cols-2 sm:[&>*]:min-w-0"
                }
              >
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
                {hasPopulationStat && (
                  <StatCard
                    value={
                      bp.populationRepresentedMillions != null
                        ? `${bp.populationRepresentedMillions}M`
                        : `${(bp.populationRepresented! / 1e6).toFixed(1)}M`
                    }
                    label="Population represented"
                    sub="Census population in states we cover"
                  />
                )}
              </div>

              {/* Community involvement — dedicated green band (matches map “Community Impact” convention) */}
              <div className="mt-8 rounded-2xl border border-green-200/90 bg-gradient-to-br from-green-50 via-emerald-50/80 to-green-50/90 p-6 shadow-[0_1px_0_0_rgba(22,101,52,0.06)] sm:p-8">
                <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-green-100/90 text-green-700 ring-1 ring-green-200/80">
                      <ShieldCheck className="h-5 w-5" aria-hidden />
                    </div>
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-green-700/90">
                        Community involvement
                      </p>
                      <h3 className="mt-1 text-lg font-semibold text-green-950 sm:text-xl">
                        Crowd-sourced contributions
                      </h3>
                      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-green-900/75">
                        Anyone can suggest edits on the map — no account required. These numbers are how much the
                        community has improved the directory so far.
                      </p>
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <StatCard
                    value={communityStats.totalCorrections}
                    label="Community corrections"
                    sub="All-time merged submissions"
                    color="green"
                  />
                  <StatCard
                    value={communityStats.churchesImproved}
                    label="Churches improved"
                    sub="Listings updated via community"
                    color="green"
                  />
                  <StatCard
                    value={communityStats.correctionsPerThousandChurches}
                    label="Corrections per 1k churches"
                    sub="National community activity"
                    color="green"
                  />
                </div>
                {!communityRaw && communitySupplementDone && communitySupplement == null && (
                  <p className="mt-4 text-center text-xs text-green-800/70">
                    Couldn&apos;t load community totals. Try refreshing — they come from the same live data as the map.
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
                    {bp.populationRepresented != null && bp.populationRepresented > 0 && (
                      <>
                        {" "}
                        Our mapped states include roughly{" "}
                        {(bp.populationRepresentedMillions != null
                          ? bp.populationRepresentedMillions
                          : Math.round((bp.populationRepresented / 1e6) * 10) / 10
                        ).toLocaleString()}
                        million people (U.S. Census).
                      </>
                    )}
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

            {/* ── Data Quality ── */}
            <Section id="data-quality">
              <SectionHeading
                title={copy.dataQuality.title}
                description={copy.dataQuality.description}
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
                <div className="mt-8">
                  <h3 className="mb-3 text-lg font-semibold text-stone-900">Discoverability</h3>
                  <p className="mb-4 text-sm text-stone-700/70">
                    How easy is it for someone to find service times, contact info, or a website? These percentages help leaders and seekers see where listings are strongest.
                  </p>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    {dq.pctWithWebsite != null && (
                      <StatCard value={`${dq.pctWithWebsite}%`} label="Has website" sub="Looks like a real URL" />
                    )}
                    {dq.pctWithPhone != null && (
                      <StatCard value={`${dq.pctWithPhone}%`} label="Has phone" sub="10+ digit number" />
                    )}
                    {dq.pctWithContactPath != null && (
                      <StatCard
                        value={`${dq.pctWithContactPath}%`}
                        label="Website or phone"
                        sub="At least one contact path"
                      />
                    )}
                    {dq.pctWithServiceTimes != null && (
                      <StatCard
                        value={`${dq.pctWithServiceTimes}%`}
                        label="Has service times"
                        sub="Non-placeholder schedule text"
                      />
                    )}
                  </div>
                </div>
              )}
              {(dq.campusCount != null ||
                dq.pctWithMinistries != null ||
                dq.pctWithBuildingFootprint != null ||
                dq.pctVerifiedLast90Days != null) && (
                <div className="mt-8">
                  <h3 className="mb-3 text-lg font-semibold text-stone-900">Listings detail & confidence</h3>
                  <p className="mb-4 text-sm text-stone-700/70">
                    Campuses, ministries, building footprints, and recent verification — context for how rich each listing is and how we estimate attendance.
                  </p>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    {dq.campusCount != null && (
                      <StatCard
                        value={dq.campusCount}
                        label="Campus / multi-site listings"
                        sub={dq.campusPct != null ? `${dq.campusPct}% of churches` : undefined}
                      />
                    )}
                    {dq.pctWithMinistries != null && (
                      <StatCard
                        value={`${dq.pctWithMinistries}%`}
                        label="Lists ministries"
                        sub="At least one ministry tag"
                      />
                    )}
                    {dq.pctWithBuildingFootprint != null && (
                      <StatCard
                        value={`${dq.pctWithBuildingFootprint}%`}
                        label="Building footprint (OSM)"
                        sub="Stronger attendance estimates"
                      />
                    )}
                    {dq.pctVerifiedLast90Days != null && dq.pctVerifiedLast365Days != null && (
                      <StatCard
                        value={`${dq.pctVerifiedLast365Days}%`}
                        label="Touched in last year"
                        sub={`${dq.pctVerifiedLast90Days}% in last 90 days (lastVerified)`}
                      />
                    )}
                  </div>
                </div>
              )}
              {(dq.attendanceMedian != null && dq.attendanceMedian > 0) && (
                <div className="mt-8">
                  <h3 className="mb-3 text-lg font-semibold text-stone-900">Estimated attendance distribution</h3>
                  <p className="mb-4 text-sm text-stone-700/70">
                    Among churches with an estimate &gt; 0 — median and quartiles (not the megachurch-only spotlight list).
                  </p>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                    <StatCard
                      value={dq.attendanceP25 ?? "—"}
                      label="25th percentile"
                      sub="Smaller half"
                    />
                    <StatCard value={dq.attendanceMedian} label="Median estimate" sub="Typical congregation size" />
                    <StatCard
                      value={dq.attendanceP75 ?? "—"}
                      label="75th percentile"
                      sub="Larger half"
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
              />
              <TreemapChart data={dn.national.filter((d) => d.name !== "Unspecified")} />
              <div className="mt-6">
                <HorizontalBarChart
                  data={dn.national.filter((d) => d.name !== "Unspecified").slice(0, 12).map((d) => ({
                    label: d.name,
                    value: d.count,
                    pct: d.pct,
                  }))}
                  showPct
                  color="#7C3AED"
                />
              </div>

              {dn.regionalPatterns.length > 0 && (
                <div className="mt-8">
                  <h3 className="mb-4 text-lg font-semibold text-stone-900">
                    Regional Patterns
                  </h3>
                  <p className="mb-4 text-sm text-stone-700/70">
                    Some denominations are much more concentrated in certain states than their national average.
                  </p>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {dn.regionalPatterns.slice(0, 6).map((p) => (
                      <div
                        key={p.denomination}
                        className="rounded-xl bg-stone-50 p-4"
                      >
                        <div className="font-semibold text-stone-800">{p.denomination}</div>
                        <div className="mt-1 text-sm text-stone-700/70">
                          {p.nationalPct}% nationally, up to {p.regionalPct}% in{" "}
                          <span className="inline-flex items-center gap-1 flex-wrap">
                            {p.strongStates.slice(0, 4).map((st, j) => (
                              <span key={st} className="inline-flex items-center gap-0.5">
                                <StateFlag abbrev={st} size="sm" />
                                {st}{j < Math.min(p.strongStates.length, 4) - 1 ? "," : ""}
                              </span>
                            ))}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <DominantByStateTable dominantByState={dn.dominantByState} />
              <Insight eyebrow="Key Finding">
                {dn.national[0] && `${dn.national[0].name} churches are the most common at ${dn.national[0].pct}% of all mapped churches.`}
                {dn.national[1] && ` ${dn.national[1].name} follows at ${dn.national[1].pct}%.`}
              </Insight>
            </Section>

            {/* ── Diversity ── */}
            <Section id="diversity">
              <SectionHeading
                title={copy.diversity.title}
                description={copy.diversity.description}
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
                  <div className="space-y-3">
                    {sp.largest.slice(0, 5).map((c, i) => (
                      <div
                        key={`${c.name}-${c.state}-${i}`}
                        className="flex items-start gap-3 rounded-xl bg-stone-50 p-4"
                      >
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-purple-200/60 text-sm font-bold text-purple-950">
                          {i + 1}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="font-semibold text-stone-800 truncate min-w-0">{c.name}</div>
                            <ChurchSpotlightMapButton c={c} />
                          </div>
                          <div className="text-sm text-stone-500 inline-flex items-center gap-1.5 mt-0.5">
                            <StateFlag abbrev={c.state} size="sm" />
                            {c.city}, {c.state} &middot; {c.attendance.toLocaleString()} est.
                          </div>
                          {c.denomination && (
                            <div className="text-xs text-stone-400">{c.denomination}</div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <h3 className="mb-4 text-lg font-semibold text-stone-900">
                    Smallest Congregations
                  </h3>
                  <div className="space-y-3">
                    {sp.smallest.slice(0, 5).map((c, i) => (
                      <div
                        key={`${c.name}-${c.state}-${i}`}
                        className="flex items-start gap-3 rounded-xl bg-stone-50 p-4"
                      >
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-purple-200/60 text-sm font-bold text-purple-950">
                          {i + 1}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="font-semibold text-stone-800 truncate min-w-0">{c.name}</div>
                            <ChurchSpotlightMapButton c={c} />
                          </div>
                          <div className="text-sm text-stone-500 inline-flex items-center gap-1.5 mt-0.5">
                            <StateFlag abbrev={c.state} size="sm" />
                            {c.city}, {c.state} &middot; {c.attendance.toLocaleString()} est.
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
              />
              <StateRankingsTable data={sr} />
            </Section>

            {/* ── How We Compare ── */}
            <Section id="how-we-compare">
              <SectionHeading
                title={copy.howWeCompare.title}
                description={copy.howWeCompare.description}
              />
              <DirectoryComparison report={r} />
              <div className="mt-10 rounded-xl bg-stone-50 p-5">
                <h3 className="text-sm font-semibold text-stone-700 mb-2">Our Data Sources</h3>
                <p className="text-sm text-stone-500 leading-relaxed">
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
              />
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div className="rounded-xl bg-stone-50 p-5">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-purple-100/60 mb-3">
                    <SearchCheck className="h-[18px] w-[18px] text-purple-700" />
                  </div>
                  <h4 className="font-semibold text-stone-900">Review a church</h4>
                  <p className="mt-1 text-sm text-stone-500 leading-relaxed">
                    Find your church on the map and verify the info is correct — address, service times, denomination.
                  </p>
                </div>
                <div className="rounded-xl bg-stone-50 p-5">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-purple-100/60 mb-3">
                    <Church className="h-[18px] w-[18px] text-purple-700" />
                  </div>
                  <h4 className="font-semibold text-stone-900">Add a missing church</h4>
                  <p className="mt-1 text-sm text-stone-500 leading-relaxed">
                    Know a church that isn't on the map? Add it in under a minute — no account needed.
                  </p>
                </div>
                <div className="rounded-xl bg-stone-50 p-5">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-purple-100/60 mb-3">
                    <Globe className="h-[18px] w-[18px] text-purple-700" />
                  </div>
                  <h4 className="font-semibold text-stone-900">Share the project</h4>
                  <p className="mt-1 text-sm text-stone-500 leading-relaxed">
                    The more people who know about HMC, the faster we reach 99% accuracy. Share with your church community.
                  </p>
                </div>
              </div>
              <div className="mt-8 flex gap-3">
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

            {/* ── Footer ── */}
            <footer className="pb-24">
              <p className="mt-4 text-xs text-stone-400 text-center">
                Generated {new Date(r.generatedAt).toLocaleDateString()} · heresmychurch.com
              </p>
            </footer>
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
    <div className="overflow-x-auto rounded-xl border border-stone-200/60">
      <table className="w-full text-sm">
        <thead>
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

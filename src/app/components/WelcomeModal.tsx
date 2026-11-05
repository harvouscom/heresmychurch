import { useEffect, useMemo, useState } from "react";
import { Map as MapIcon, Search, Clock, PlusCircle, PencilLine } from "lucide-react";
import { HmcDialog, HmcDialogBody, HmcDialogTitle } from "./ui/hmc-dialog";
import { CloseButton } from "./ui/close-button";
import { Button } from "./ui/button";
import { PlaceFlag } from "./PlaceFlag";
import { fetchCountries, type CountrySummary } from "./api";
import logoImg from "../../assets/a94bce1cf0860483364d5d9c353899b7da8233e7.png";

const FEATURES = [
  { icon: MapIcon, title: "Explore the map", body: "Browse churches by country, state, and county." },
  { icon: Search, title: "Search and filter", body: "Find churches by name, denomination, size, or language." },
  { icon: Clock, title: "See the details", body: "Address, website, service times, and more." },
  { icon: PlusCircle, title: "Add a church", body: "Missing one? Add it to the map." },
  { icon: PencilLine, title: "Keep it accurate", body: "Suggest corrections and help review listings." },
];

// Map dot palette (church-data size categories), lightest to darkest.
const DOT_COLORS = ["#E8D5F5", "#C9A0DC", "#A855F7", "#C9A0DC", "#E8D5F5"];

/** Deterministic scatter so the illustration is identical on every visit. */
function useGlobeDots(count: number) {
  return useMemo(() => {
    let seed = 7;
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const dots: { x: number; y: number; r: number; color: string; delay: number; ping: boolean }[] = [];
    while (dots.length < count) {
      const x = rand() * 2 - 1;
      const y = rand() * 2 - 1;
      if (x * x + y * y > 0.86) continue; // keep inside the globe
      const big = rand() > 0.85;
      dots.push({
        x: 100 + x * 92,
        y: 100 + y * 92,
        r: big ? 3.2 : 1.2 + rand() * 1.4,
        color: DOT_COLORS[Math.floor(rand() * DOT_COLORS.length)],
        delay: 0.15 + rand() * 0.9,
        ping: big && dots.filter((d) => d.ping).length < 4,
      });
    }
    return dots;
  }, [count]);
}

function GlobeIllustration({ className }: { className?: string }) {
  const dots = useGlobeDots(70);
  return (
    <svg
      viewBox="0 0 200 200"
      className={className}
      aria-hidden="true"
      // Fade the lower half so the title and copy sit on a clean background.
      style={{ maskImage: "linear-gradient(to bottom, #000 45%, transparent 85%)", WebkitMaskImage: "linear-gradient(to bottom, #000 45%, transparent 85%)" }}
    >
      <defs>
        <radialGradient id="welcome-globe" cx="38%" cy="32%" r="75%">
          <stop offset="0%" stopColor="#A855F7" stopOpacity="0.35" />
          <stop offset="60%" stopColor="#6B21A8" stopOpacity="0.18" />
          <stop offset="100%" stopColor="#1A0E38" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx="100" cy="100" r="96" fill="url(#welcome-globe)" />
      {/* Graticule */}
      <g fill="none" stroke="#E9D5FF" strokeOpacity="0.14" strokeWidth="0.6">
        <circle cx="100" cy="100" r="96" />
        {[0.35, 0.7].map((k) => (
          <ellipse key={`m${k}`} cx="100" cy="100" rx={96 * k} ry="96" />
        ))}
        {[-0.6, -0.3, 0, 0.3, 0.6].map((k) => {
          const y = 100 + k * 96;
          const half = Math.sqrt(1 - k * k) * 96;
          return <line key={`p${k}`} x1={100 - half} y1={y} x2={100 + half} y2={y} />;
        })}
      </g>
      {dots.map((d, i) => (
        <g key={i}>
          {d.ping && (
            <circle
              cx={d.x}
              cy={d.y}
              r={d.r}
              fill="none"
              stroke={d.color}
              strokeWidth="0.6"
              className="animate-hmc-ping"
              style={{ animationDelay: `${d.delay + 1}s` }}
            />
          )}
          <circle
            cx={d.x}
            cy={d.y}
            r={d.r}
            fill={d.color}
            fillOpacity={d.r > 3 ? 1 : 0.8}
            className="animate-hmc-dot-pop"
            style={{ animationDelay: `${d.delay}s` }}
          />
        </g>
      ))}
    </svg>
  );
}

const PILL_CLASS = "rounded-full bg-white/10 ring-1 ring-white/10 px-3 py-1 text-xs font-medium text-white tabular-nums";
/** Flags that fit one line of the hero column; the rest collapse into "+N". */
const MAX_FLAGS = 10;
// On short phones the hero sits above a scrolling list; the feature list needs the room more.
const FLAGS_ROW_CLASS = "mt-3 h-[18px] [@media(max-width:767px)_and_(max-height:700px)]:hidden";

interface WorldStats {
  churches: number;
  /** Countries with at least one church, most churches first. */
  countries: CountrySummary[];
}

// Survives close and reopen, so the About modal doesn't show placeholders a second time.
let lastWorldStats: WorldStats | null = null;

/**
 * Worldwide totals, independent of the route behind the modal.
 * undefined = still loading, null = unavailable (the pills are left out rather than
 * showing zeros: fetchCountries falls back to a zero-count registry when the API fails).
 */
function useWorldStats(): WorldStats | null | undefined {
  const [stats, setStats] = useState<WorldStats | null | undefined>(lastWorldStats ?? undefined);
  useEffect(() => {
    let cancelled = false;
    fetchCountries()
      .then(({ countries }) => {
        const populated = countries
          .filter((c) => c.churchCount > 0)
          .sort((a, b) => b.churchCount - a.churchCount);
        const next = populated.length
          ? { churches: populated.reduce((sum, c) => sum + c.churchCount, 0), countries: populated }
          : null;
        if (next) lastWorldStats = next;
        if (!cancelled) setStats(next ?? lastWorldStats);
      })
      .catch(() => {
        if (!cancelled) setStats(lastWorldStats);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return stats;
}

function WorldStatsBlock({ stats }: { stats: WorldStats | undefined }) {
  // Same footprint loading and loaded, so the hero text doesn't jump when numbers arrive.
  if (!stats) {
    return (
      <div className="mt-4" aria-hidden="true">
        <div className="flex flex-wrap gap-2">
          <span className={`${PILL_CLASS} w-[126px] animate-pulse`}>{"\u00A0"}</span>
          <span className={`${PILL_CLASS} w-[92px] animate-pulse`}>{"\u00A0"}</span>
        </div>
        <div className={FLAGS_ROW_CLASS} />
      </div>
    );
  }
  const shown = stats.countries.slice(0, MAX_FLAGS);
  const overflow = stats.countries.length - shown.length;
  return (
    <div className="mt-4 animate-hmc-rise">
      <div className="flex flex-wrap gap-2">
        <span className={PILL_CLASS}>{stats.churches.toLocaleString()} churches</span>
        <span className={PILL_CLASS}>{stats.countries.length.toLocaleString()} countries</span>
      </div>
      <div
        role="img"
        aria-label={`Countries on the map: ${stats.countries.map((c) => c.name).join(", ")}`}
        className={`${FLAGS_ROW_CLASS} flex items-center gap-1`}
      >
        {shown.map((c) => (
          <span key={c.code} title={c.name} className="inline-flex">
            <PlaceFlag abbrev={c.code} countryCode="WORLD" size="sm" />
          </span>
        ))}
        {overflow > 0 && (
          <span className="ml-1 text-xs font-medium text-hmc-text-muted tabular-nums">+{overflow}</span>
        )}
      </div>
    </div>
  );
}

export function WelcomeModal({ onClose }: { onClose: () => void }) {
  const worldStats = useWorldStats();
  return (
    <HmcDialog onClose={onClose} className="max-w-[880px] md:flex-row md:max-h-[min(640px,90dvh)]">
      <CloseButton onClick={onClose} size="md" className="absolute top-4 right-4 z-10" />

      {/* Hero */}
      <div
        className="relative flex-shrink-0 overflow-hidden px-6 pt-6 pb-5 md:w-[42%] md:px-8 md:py-8 md:flex md:flex-col md:justify-end short:!w-full short:!px-6 short:!py-5"
        style={{ background: "linear-gradient(160deg, #4C1D95 0%, #2A1260 55%, #1A0E38 100%)" }}
      >
        <GlobeIllustration className="pointer-events-none absolute -right-14 -top-10 w-56 opacity-90 md:right-auto md:-left-6 md:top-4 md:w-[115%]" />
        <div className="relative">
          <div className="w-14 h-14 md:w-16 md:h-16 rounded-xl overflow-hidden shadow-hmc-pill ring-1 ring-white/15 mb-4">
            <img src={logoImg} alt="" className="w-full h-full object-cover" />
          </div>
          <HmcDialogTitle className="text-white font-semibold text-[26px] md:text-[32px] leading-[1.1] text-balance">
            Here's My Church
          </HmcDialogTitle>
          <p className="text-hmc-text-muted text-sm leading-relaxed mt-2.5 max-w-[34ch] text-pretty">
            An interactive map of Christian churches worldwide, built to be the most accurate place to find one.
          </p>
          {worldStats !== null && <WorldStatsBlock stats={worldStats} />}
        </div>
      </div>

      {/* Features + CTA */}
      <div className="flex flex-col flex-1 min-h-0 min-w-0">
        <HmcDialogBody className="px-6 pt-5 pb-4 md:px-8 md:pt-8">
          <p className="text-hmc-text-subtle text-caption uppercase tracking-wider font-medium mb-3">What you can do</p>
          <ul className="space-y-1">
            {FEATURES.map(({ icon: Icon, title, body }, i) => (
              <li
                key={title}
                className="flex items-start gap-3 rounded-xl px-2 py-2 -mx-2 animate-hmc-rise"
                style={{ animationDelay: `${0.1 + i * 0.05}s` }}
              >
                <span className="flex-shrink-0 w-9 h-9 rounded-lg bg-hmc-brand-soft/15 ring-1 ring-hmc-brand-soft/25 flex items-center justify-center">
                  <Icon size={17} className="text-purple-200" />
                </span>
                <span className="min-w-0 pt-0.5">
                  <span className="block text-white text-sm font-medium leading-snug">{title}</span>
                  <span className="block text-hmc-text-muted text-[13px] leading-snug mt-0.5 text-pretty">{body}</span>
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-4 flex items-center gap-2 rounded-lg bg-white/5 px-3 py-2 text-xs text-hmc-text-muted text-pretty">
            <span className="text-purple-300" aria-hidden="true">{"✦"}</span>
            Free and open source, with data crowd-sourced by people like you.
          </p>
        </HmcDialogBody>

        <div className="px-6 pb-5 pt-1 md:px-8 md:pb-7 flex-shrink-0">
          <Button variant="brand" size="block" onClick={onClose}>
            Start finding churches
          </Button>
          <p className="text-hmc-text-subtle text-caption text-center mt-3 text-pretty">
            An open-source project by{" "}
            <a href="https://harvous.com/about" target="_blank" rel="noopener noreferrer" className="underline hover:text-white transition-colors">Harvous</a>
            . Need help?{" "}
            <a href="mailto:hey@heresmychurch.com" className="underline hover:text-white transition-colors">hey@heresmychurch.com</a>
            <span className="block mt-1 opacity-70">Version {__APP_VERSION__}</span>
          </p>
        </div>
      </div>
    </HmcDialog>
  );
}

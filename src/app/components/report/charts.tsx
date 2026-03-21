import React, { useMemo, useEffect, useLayoutEffect, useState, useRef, useCallback, useContext } from "react";
import { createPortal } from "react-dom";
import { scaleLinear } from "d3-scale";
import {
  ComposableMap,
  Geographies,
  Geography,
} from "react-simple-maps";
import { GEO_URL } from "../map-constants";
import { usePrefersReducedMotion } from "../../hooks/usePrefersReducedMotion";
import { ReportSectionVisibleContext } from "./report-section-visible-context";

// ── In view: follow report section animation when inside `<Section>`, else own observer ──
function useInView(ref: React.RefObject<HTMLElement | SVGElement | null>, margin = "-30px") {
  const sectionVisible = useContext(ReportSectionVisibleContext);
  const [selfVisible, setSelfVisible] = useState(false);
  useEffect(() => {
    if (sectionVisible !== undefined) return;
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setSelfVisible(true);
          obs.disconnect();
        }
      },
      { rootMargin: margin },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [ref, margin, sectionVisible]);
  return sectionVisible !== undefined ? sectionVisible : selfVisible;
}

// ── Animated number counter — updates text via ref (no per-frame React re-renders) ──
function useCountUp(target: number, duration = 650) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref);
  const reduced = usePrefersReducedMotion();
  const rafId = useRef(0);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!inView) el.textContent = "0";
  }, [inView]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!inView) {
      el.textContent = "0";
      return;
    }
    if (target === 0) {
      el.textContent = "0";
      return;
    }
    if (reduced) {
      el.textContent = target.toLocaleString();
      return;
    }
    const start = performance.now();
    let last = -1;
    const tick = (now: number) => {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - (1 - progress) * (1 - progress);
      const v = Math.round(eased * target);
      if (v !== last) {
        last = v;
        el.textContent = v.toLocaleString();
      }
      if (progress < 1) rafId.current = requestAnimationFrame(tick);
    };
    rafId.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId.current);
  }, [inView, target, duration, reduced]);

  return { ref };
}

// ── Floating tooltip — portaled to body so `fixed` uses viewport coords (report sections use `transform`, which breaks fixed positioning for in-tree nodes) ──
const TOOLTIP_CURSOR_GAP_X = 10;
function Tooltip({
  x,
  y,
  children,
  anchor = "top",
}: {
  x: number;
  y: number;
  children: React.ReactNode;
  anchor?: "top" | "bottom";
}) {
  const el = (
    <div
      className="pointer-events-none fixed z-[100] max-w-[min(20rem,calc(100vw-1.5rem))] rounded-lg bg-stone-900 px-3 py-1.5 text-xs text-white shadow-lg"
      style={{
        left: x + TOOLTIP_CURSOR_GAP_X,
        top: anchor === "top" ? y : y + 8,
        transform:
          anchor === "top"
            ? "translate(0, calc(-100% - 8px))"
            : "translate(0, 0)",
      }}
    >
      {children}
    </div>
  );
  if (typeof document === "undefined") return null;
  return createPortal(el, document.body);
}

// ── StatCard with animated count-up ──
const STAT_COLORS = {
  purple: {
    value: "text-purple-700",
    label: "text-purple-900",
    card: "bg-stone-50",
    sub: "text-stone-500",
  },
  pink: {
    value: "text-pink-600",
    label: "text-pink-900",
    card: "bg-stone-50",
    sub: "text-stone-500",
  },
  /** Community involvement — matches app convention (green) */
  green: {
    value: "text-green-600",
    label: "text-green-800",
    card: "bg-green-50/70 border border-green-100/90",
    sub: "text-green-700/70",
  },
} as const;

export function StatCard({
  value,
  label,
  sub,
  hint,
  color = "purple",
}: {
  value: string | number;
  label: string;
  sub?: React.ReactNode;
  hint?: React.ReactNode;
  color?: keyof typeof STAT_COLORS;
}) {
  const isNumber = typeof value === "number";
  const counter = useCountUp(isNumber ? value : 0);
  const c = STAT_COLORS[color];

  return (
    <div
      className={`flex w-full min-w-0 flex-col items-center gap-1 text-center rounded-xl px-6 py-5 ${c.card}`}
    >
      {isNumber ? (
        <span ref={counter.ref} className={`block w-full text-3xl font-bold tabular-nums sm:text-4xl ${c.value}`} />
      ) : (
        <span className={`block w-full text-3xl font-bold tabular-nums sm:text-4xl ${c.value}`}>{value}</span>
      )}
      <span className={`block w-full text-sm font-medium ${c.label}`}>{label}</span>
      {sub != null && sub !== "" && (
        <div className={`block w-full text-xs ${c.sub}`}>{sub}</div>
      )}
      {hint != null && hint !== "" && (
        <div className="block w-full text-[11px] text-stone-400 mt-1 text-pretty">{hint}</div>
      )}
    </div>
  );
}

// ── Dismiss-on-tap-outside hook for touch devices ──
function useTapOutside(
  containerRef: React.RefObject<HTMLElement | SVGElement | null>,
  active: boolean,
  onDismiss: () => void,
) {
  useEffect(() => {
    if (!active) return;
    const handler = (e: PointerEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onDismiss();
      }
    };
    document.addEventListener("pointerdown", handler);
    return () => document.removeEventListener("pointerdown", handler);
  }, [active, containerRef, onDismiss]);
}

// ── HorizontalBarChart with hover highlight + tooltip ──
export function HorizontalBarChart({
  data,
  maxValue,
  color = "#A855F7",
  height = 28,
  showPct,
}: {
  data: { label: string; value: number; pct?: number }[];
  maxValue?: number;
  color?: string;
  height?: number;
  showPct?: boolean;
}) {
  const max = maxValue ?? Math.max(...data.map((d) => d.value), 1);
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref);
  const reduced = usePrefersReducedMotion();
  const [hovered, setHovered] = useState<number | null>(null);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; label: string; value: string } | null>(null);

  const select = useCallback((i: number, d: typeof data[0], e: React.MouseEvent | React.PointerEvent) => {
    setHovered(i);
    setTooltip({
      x: e.clientX,
      y: e.clientY,
      label: d.label,
      value: d.pct != null ? `${d.value.toLocaleString()} (${d.pct}%)` : d.value.toLocaleString(),
    });
  }, []);

  const dismiss = useCallback(() => {
    setHovered(null);
    setTooltip(null);
  }, []);

  useTapOutside(ref, hovered !== null, dismiss);

  return (
    <div ref={ref} className="flex flex-col gap-2">
      {tooltip && (
        <Tooltip x={tooltip.x} y={tooltip.y}>
          <span className="font-medium">{tooltip.label}</span>
          <span className="ml-1.5 text-purple-300">{tooltip.value}</span>
        </Tooltip>
      )}
      {data.map((d, i) => {
        const dimmed = hovered !== null && hovered !== i;
        return (
          <div
            key={d.label}
            className="flex items-center gap-3 cursor-default"
            onMouseEnter={(e) => select(i, d, e)}
            onMouseLeave={dismiss}
            onClick={(e) => { hovered === i ? dismiss() : select(i, d, e); }}
            style={{
              opacity: dimmed ? 0.35 : 1,
              transition: "opacity 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
            }}
          >
            <span className="w-28 shrink-0 text-right text-sm text-stone-600 truncate sm:w-40">
              {d.label}
            </span>
            <div className="relative flex-1 overflow-hidden rounded" style={{ height }}>
              <div className="absolute inset-0 rounded bg-stone-200/50" />
              <div
                className="absolute inset-y-0 left-0 origin-left rounded"
                style={{
                  backgroundColor: color,
                  width: `${Math.max((d.value / max) * 100, 1)}%`,
                  transform: reduced || inView ? "scaleX(1)" : "scaleX(0)",
                  transition: reduced
                    ? "none"
                    : `transform 0.42s cubic-bezier(0.22, 1, 0.36, 1) ${Math.min(i * 0.012, 0.14)}s, filter 0.2s cubic-bezier(0.4, 0, 0.2, 1)`,
                  filter: hovered === i ? "brightness(1.15)" : "none",
                  willChange: reduced ? undefined : "transform",
                }}
              />
            </div>
            <span
              className="w-16 shrink-0 text-right text-sm font-medium tabular-nums text-stone-700"
              style={{
                opacity: reduced || inView ? (dimmed ? 0.35 : 1) : 0,
                transition: reduced ? "none" : `opacity 0.22s ease-out ${Math.min(i * 0.012, 0.14) + 0.06}s`,
              }}
            >
              {showPct && d.pct != null ? `${d.pct}%` : d.value.toLocaleString()}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ── Treemap with hover tooltip + highlight ──
export function TreemapChart({
  data,
  width = 600,
  height = 320,
}: {
  data: { name: string; count: number; pct: number }[];
  width?: number;
  height?: number;
}) {
  const colors = [
    "#4C1D95", "#6B21A8", "#7C3AED", "#8B5CF6", "#A855F7",
    "#C084FC", "#D8B4FE", "#E9D5FF", "#F3E8FF", "#FAF5FF",
    "#EDE9FE", "#DDD6FE", "#C4B5FD", "#A78BFA", "#818CF8",
    "#6366F1", "#4F46E5", "#4338CA", "#3730A3", "#312E81",
    "#1E1B4B", "#7E22CE",
  ];

  const rects = useMemo(() => {
    const total = data.reduce((s, d) => s + d.count, 0);
    if (!total) return [];
    const items = data.filter((d) => d.count > 0).slice(0, 20);
    const result: {
      name: string;
      count: number;
      pct: number;
      x: number;
      y: number;
      w: number;
      h: number;
      color: string;
    }[] = [];
    let y = 0;
    const remaining = [...items];
    let idx = 0;
    while (remaining.length > 0 && y < height) {
      const rowFraction = remaining[0].count / total;
      const rowHeight = Math.max(rowFraction * height * (remaining.length > 1 ? 2 : 1), 30);
      const clampedRowHeight = Math.min(rowHeight, height - y);
      let rowTotal = 0;
      const rowItems: typeof items = [];
      for (const item of remaining) {
        rowItems.push(item);
        rowTotal += item.count;
        const frac = rowTotal / total;
        if (frac * height >= clampedRowHeight * 0.8) break;
      }
      remaining.splice(0, rowItems.length);
      let x = 0;
      for (const item of rowItems) {
        const w = rowTotal > 0 ? (item.count / rowTotal) * width : width / rowItems.length;
        result.push({
          name: item.name,
          count: item.count,
          pct: item.pct,
          x,
          y,
          w,
          h: clampedRowHeight,
          color: colors[idx % colors.length],
        });
        x += w;
        idx++;
      }
      y += clampedRowHeight;
    }
    return result;
  }, [data, width, height]);

  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const inView = useInView(svgRef);
  const reduced = usePrefersReducedMotion();
  const [hovered, setHovered] = useState<string | null>(null);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; name: string; count: number; pct: number } | null>(null);

  const selectRect = useCallback((r: typeof rects[0], e: React.MouseEvent) => {
    setHovered(r.name);
    setTooltip({
      x: e.clientX,
      y: e.clientY - 12,
      name: r.name,
      count: r.count,
      pct: r.pct,
    });
  }, []);

  const dismiss = useCallback(() => {
    setHovered(null);
    setTooltip(null);
  }, []);

  useTapOutside(containerRef, hovered !== null, dismiss);

  return (
    <div ref={containerRef} className="relative">
      {tooltip && (
        <Tooltip x={tooltip.x} y={tooltip.y}>
          <span className="font-medium">{tooltip.name}</span>
          <span className="ml-1.5 text-stone-400">{tooltip.count.toLocaleString()} churches</span>
          <span className="ml-1 text-purple-300">({tooltip.pct}%)</span>
        </Tooltip>
      )}
      <svg
        ref={svgRef}
        viewBox={`0 0 ${width} ${height}`}
        className="w-full rounded-lg overflow-hidden"
        style={{
          opacity: reduced || inView ? 1 : 0,
          transition: reduced ? "none" : "opacity 0.2s ease-out",
          willChange: reduced ? undefined : inView ? "auto" : "opacity",
        }}
        onMouseLeave={dismiss}
      >
        {rects.map((r) => {
          const isHovered = hovered === r.name;
          const dimmed = hovered !== null && !isHovered;
          return (
            <g
              key={r.name}
              onMouseMove={(e) => selectRect(r, e)}
              onClick={(e) => { hovered === r.name ? dismiss() : selectRect(r, e); }}
              style={{ cursor: "default" }}
            >
              <rect
                x={r.x}
                y={r.y}
                width={r.w}
                height={r.h}
                fill={r.color}
                stroke="white"
                strokeWidth={isHovered ? 3 : 2}
                rx={4}
                style={{
                  opacity: dimmed ? 0.4 : 1,
                  filter: isHovered ? "brightness(1.2)" : "none",
                  transition: "opacity 0.2s cubic-bezier(0.4, 0, 0.2, 1), filter 0.2s cubic-bezier(0.4, 0, 0.2, 1), stroke-width 0.15s cubic-bezier(0.4, 0, 0.2, 1)",
                }}
              />
              {r.w > 60 && r.h > 30 && (
                <g style={{ opacity: dimmed ? 0.3 : 1, transition: "opacity 0.2s cubic-bezier(0.4, 0, 0.2, 1)" }}>
                  <text
                    x={r.x + r.w / 2}
                    y={r.y + r.h / 2 - 6}
                    textAnchor="middle"
                    fill="white"
                    fontSize={r.w > 100 ? 13 : 10}
                    fontWeight="600"
                    style={{ pointerEvents: "none" }}
                  >
                    {r.name}
                  </text>
                  <text
                    x={r.x + r.w / 2}
                    y={r.y + r.h / 2 + 10}
                    textAnchor="middle"
                    fill="rgba(255,255,255,0.8)"
                    fontSize={10}
                    style={{ pointerEvents: "none" }}
                  >
                    {r.pct}%
                  </text>
                </g>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// ── ChoroplethMap with hover tooltip ──
const STATE_FIPS_TO_ABBREV: Record<string, string> = {
  "01":"AL","02":"AK","04":"AZ","05":"AR","06":"CA","08":"CO","09":"CT","10":"DE",
  "12":"FL","13":"GA","15":"HI","16":"ID","17":"IL","18":"IN","19":"IA","20":"KS",
  "21":"KY","22":"LA","23":"ME","24":"MD","25":"MA","26":"MI","27":"MN","28":"MS",
  "29":"MO","30":"MT","31":"NE","32":"NV","33":"NH","34":"NJ","35":"NM","36":"NY",
  "37":"NC","38":"ND","39":"OH","40":"OK","41":"OR","42":"PA","44":"RI","45":"SC",
  "46":"SD","47":"TN","48":"TX","49":"UT","50":"VT","51":"VA","53":"WA","54":"WV",
  "55":"WI","56":"WY","11":"DC",
};

const STATE_NAMES: Record<string, string> = {
  AL:"Alabama",AK:"Alaska",AZ:"Arizona",AR:"Arkansas",CA:"California",
  CO:"Colorado",CT:"Connecticut",DE:"Delaware",FL:"Florida",GA:"Georgia",
  HI:"Hawaii",ID:"Idaho",IL:"Illinois",IN:"Indiana",IA:"Iowa",KS:"Kansas",
  KY:"Kentucky",LA:"Louisiana",ME:"Maine",MD:"Maryland",MA:"Massachusetts",
  MI:"Michigan",MN:"Minnesota",MS:"Mississippi",MO:"Missouri",MT:"Montana",
  NE:"Nebraska",NV:"Nevada",NH:"New Hampshire",NJ:"New Jersey",NM:"New Mexico",
  NY:"New York",NC:"North Carolina",ND:"North Dakota",OH:"Ohio",OK:"Oklahoma",
  OR:"Oregon",PA:"Pennsylvania",RI:"Rhode Island",SC:"South Carolina",SD:"South Dakota",
  TN:"Tennessee",TX:"Texas",UT:"Utah",VT:"Vermont",VA:"Virginia",WA:"Washington",
  WV:"West Virginia",WI:"Wisconsin",WY:"Wyoming",DC:"District of Columbia",
};

export function ChoroplethMap({
  values,
  label,
  colorRange = ["#F3E8FF", "#4C1D95"],
  details,
}: {
  values: Record<string, number>;
  label?: string;
  colorRange?: [string, string];
  details?: Record<
    string,
    {
      primaryLabel: string;
      primaryValue: string;
      secondaryLabel?: string;
      secondaryValue?: string;
    }
  >;
}) {
  const { scale, min, max } = useMemo(() => {
    const vals = Object.values(values).filter((v) => v > 0);
    const min = Math.min(...vals, 0);
    const max = Math.max(...vals, 1);
    return {
      scale: scaleLinear<string>().domain([min, max]).range(colorRange),
      min,
      max,
    };
  }, [values, colorRange]);

  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, "-40px");
  const reduced = usePrefersReducedMotion();
  const [tooltip, setTooltip] = useState<{ x: number; y: number; name: string; abbrev: string; value: number } | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const dismiss = useCallback(() => {
    setHoveredId(null);
    setTooltip(null);
  }, []);

  useTapOutside(ref, hoveredId !== null, dismiss);

  return (
    <div
      ref={ref}
      className="w-full relative"
      style={{
        opacity: reduced || inView ? 1 : 0,
        transition: reduced ? "none" : "opacity 0.2s ease-out",
        willChange: reduced ? undefined : inView ? "auto" : "opacity",
      }}
    >
      {tooltip && (
        <Tooltip x={tooltip.x} y={tooltip.y}>
          <span className="font-medium">{tooltip.name}</span>
          {details?.[tooltip.abbrev] ? (
            <span className="ml-1.5 inline-flex flex-col">
              <span className="text-purple-300">
                {details[tooltip.abbrev].primaryLabel}: {details[tooltip.abbrev].primaryValue}
              </span>
              {details[tooltip.abbrev].secondaryLabel && details[tooltip.abbrev].secondaryValue && (
                <span className="text-stone-300">
                  {details[tooltip.abbrev].secondaryLabel}: {details[tooltip.abbrev].secondaryValue}
                </span>
              )}
            </span>
          ) : (
            <>
              <span className="ml-1.5 text-purple-300">
                {tooltip.value > 0 ? tooltip.value.toLocaleString() : "—"}
              </span>
              {label && tooltip.value > 0 && (
                <span className="ml-0.5 text-stone-400">{label}</span>
              )}
            </>
          )}
        </Tooltip>
      )}
      <ComposableMap projection="geoAlbersUsa" width={800} height={500}>
        <Geographies geography={GEO_URL}>
          {({ geographies }: { geographies: any[] }) =>
            geographies.map((geo) => {
              const abbrev = STATE_FIPS_TO_ABBREV[geo.id];
              const val = abbrev ? values[abbrev] : undefined;
              const isHovered = hoveredId === geo.id;
              return (
                <Geography
                  key={geo.rsmKey}
                  geography={geo}
                  fill={val != null && val > 0 ? scale(val) : "#E7E5E0"}
                  stroke={isHovered ? "#7C3AED" : "#fff"}
                  strokeWidth={isHovered ? 1.5 : 0.5}
                  onMouseEnter={(e: React.MouseEvent) => {
                    setHoveredId(geo.id);
                    if (abbrev) {
                      setTooltip({
                        x: e.clientX,
                        y: e.clientY - 12,
                        name: STATE_NAMES[abbrev] ?? abbrev,
                        abbrev,
                        value: val ?? 0,
                      });
                    }
                  }}
                  onMouseMove={(e: React.MouseEvent) => {
                    if (abbrev) {
                      setTooltip({
                        x: e.clientX,
                        y: e.clientY - 12,
                        name: STATE_NAMES[abbrev] ?? abbrev,
                        abbrev,
                        value: val ?? 0,
                      });
                    }
                  }}
                  onMouseLeave={dismiss}
                  onClick={(e: React.MouseEvent) => {
                    if (hoveredId === geo.id) {
                      dismiss();
                    } else {
                      setHoveredId(geo.id);
                      if (abbrev) {
                        setTooltip({
                          x: e.clientX,
                          y: e.clientY - 12,
                          name: STATE_NAMES[abbrev] ?? abbrev,
                          abbrev,
                          value: val ?? 0,
                        });
                      }
                    }
                  }}
                  style={{
                    default: {
                      outline: "none",
                      cursor: "default",
                      transition: "fill 0.2s cubic-bezier(0.4, 0, 0.2, 1), stroke 0.15s cubic-bezier(0.4, 0, 0.2, 1), stroke-width 0.15s cubic-bezier(0.4, 0, 0.2, 1)",
                    },
                    hover: {
                      outline: "none",
                      filter: "brightness(1.15)",
                      cursor: "default",
                    },
                    pressed: { outline: "none" },
                  }}
                />
              );
            })
          }
        </Geographies>
      </ComposableMap>
      {label && (
        <div className="mt-2 flex items-center justify-center gap-2 text-xs text-stone-500">
          <span>{min.toLocaleString()}</span>
          <div
            className="h-3 w-32 rounded"
            style={{
              background: `linear-gradient(to right, ${colorRange[0]}, ${colorRange[1]})`,
            }}
          />
          <span>{max.toLocaleString()}</span>
          <span className="ml-1">{label}</span>
        </div>
      )}
    </div>
  );
}

// ── DonutChart with hover pull-out + tooltip ──
export function DonutChart({
  data,
  size = 200,
}: {
  data: { name: string; value: number; color: string }[];
  size?: number;
}) {
  const total = data.reduce((s, d) => s + d.value, 0);
  const radius = size / 2 - 14; // slightly smaller to allow room for hover pull-out
  const innerRadius = radius * 0.6;
  const [hovered, setHovered] = useState<string | null>(null);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; name: string; value: number; pct: string } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const reduced = usePrefersReducedMotion();

  const dismiss = useCallback(() => {
    setHovered(null);
    setTooltip(null);
  }, []);

  useTapOutside(containerRef, hovered !== null, dismiss);

  let cumAngle = -Math.PI / 2;
  const arcs = data.map((d) => {
    const angle = (d.value / total) * Math.PI * 2;
    const startAngle = cumAngle;
    cumAngle += angle;
    const endAngle = cumAngle;
    const midAngle = (startAngle + endAngle) / 2;
    const x1 = Math.cos(startAngle) * radius + size / 2;
    const y1 = Math.sin(startAngle) * radius + size / 2;
    const x2 = Math.cos(endAngle) * radius + size / 2;
    const y2 = Math.sin(endAngle) * radius + size / 2;
    const ix1 = Math.cos(startAngle) * innerRadius + size / 2;
    const iy1 = Math.sin(startAngle) * innerRadius + size / 2;
    const ix2 = Math.cos(endAngle) * innerRadius + size / 2;
    const iy2 = Math.sin(endAngle) * innerRadius + size / 2;
    const largeArc = angle > Math.PI ? 1 : 0;
    const path = `M${x1},${y1} A${radius},${radius} 0 ${largeArc} 1 ${x2},${y2} L${ix2},${iy2} A${innerRadius},${innerRadius} 0 ${largeArc} 0 ${ix1},${iy1} Z`;
    // Pull-out offset direction
    const tx = Math.cos(midAngle) * 4;
    const ty = Math.sin(midAngle) * 4;
    return { ...d, path, tx, ty, pct: ((d.value / total) * 100).toFixed(1) };
  });

  return (
    <div ref={containerRef} className="relative inline-block">
      {tooltip && (
        <Tooltip x={tooltip.x} y={tooltip.y}>
          <span className="font-medium">{tooltip.name}</span>
          <span className="ml-1.5 text-purple-300">{tooltip.pct}%</span>
          <span className="ml-1 text-stone-400">({tooltip.value.toLocaleString()})</span>
        </Tooltip>
      )}
      <svg
        viewBox={`0 0 ${size} ${size}`}
        className="w-full max-w-[200px]"
        onMouseLeave={dismiss}
      >
        {arcs.map((a) => {
          const isHovered = hovered === a.name;
          const dimmed = hovered !== null && !isHovered;
          return (
            <path
              key={a.name}
              d={a.path}
              fill={a.color}
              stroke="white"
              strokeWidth={2}
              style={{
                transform: isHovered ? `translate(${a.tx}px, ${a.ty}px)` : "translate(0, 0)",
                opacity: dimmed ? 0.4 : 1,
                filter: isHovered ? "brightness(1.15)" : "none",
                transition: reduced
                  ? "none"
                  : "transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.18s ease-out, filter 0.18s ease-out",
                cursor: "default",
              }}
              onMouseEnter={(e) => {
                setHovered(a.name);
                setTooltip({
                  x: e.clientX,
                  y: e.clientY - 12,
                  name: a.name,
                  value: a.value,
                  pct: a.pct,
                });
              }}
              onMouseMove={(e) => {
                setTooltip({
                  x: e.clientX,
                  y: e.clientY - 12,
                  name: a.name,
                  value: a.value,
                  pct: a.pct,
                });
              }}
              onClick={(e) => {
                if (hovered === a.name) {
                  dismiss();
                } else {
                  setHovered(a.name);
                  setTooltip({
                    x: e.clientX,
                    y: e.clientY - 12,
                    name: a.name,
                    value: a.value,
                    pct: a.pct,
                  });
                }
              }}
            />
          );
        })}
      </svg>
    </div>
  );
}

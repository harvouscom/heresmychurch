/**
 * Canonical service-time format: "Sun 9:00 AM; Sun 11:00 AM; Wed 7:00 PM"
 * Also accepts common OSM `service_times` / informal strings and normalizes them.
 */

export const SERVICE_DAYS = [
  { short: "Sun", full: "Sunday", osm: "Su" },
  { short: "Mon", full: "Monday", osm: "Mo" },
  { short: "Tue", full: "Tuesday", osm: "Tu" },
  { short: "Wed", full: "Wednesday", osm: "We" },
  { short: "Thu", full: "Thursday", osm: "Th" },
  { short: "Fri", full: "Friday", osm: "Fr" },
  { short: "Sat", full: "Saturday", osm: "Sa" },
] as const;

export type ServiceDayShort = (typeof SERVICE_DAYS)[number]["short"];

export interface ParsedServiceTime {
  day: ServiceDayShort | "?";
  dayFull: string;
  /** Display time, e.g. "9:00 AM" or "10:00 AM–12:00 PM" */
  time: string;
  label?: string;
}

const DAY_LOOKUP: Record<string, ServiceDayShort> = (() => {
  const m: Record<string, ServiceDayShort> = {};
  for (const d of SERVICE_DAYS) {
    m[d.short.toLowerCase()] = d.short;
    m[d.full.toLowerCase()] = d.short;
    m[d.osm.toLowerCase()] = d.short;
  }
  // Extra abbreviations seen in the wild
  m.thurs = "Thu";
  m.thur = "Thu";
  m.tues = "Tue";
  m.weds = "Wed";
  return m;
})();

function dayFull(short: ServiceDayShort | "?"): string {
  if (short === "?") return "Schedule";
  return SERVICE_DAYS.find((d) => d.short === short)?.full ?? short;
}

/** Convert hour/minute (+ optional am/pm) to "h:mm AM/PM". */
function to12h(hour: number, minute: number, periodHint?: string): string {
  let h = hour;
  let period = (periodHint || "").toUpperCase();
  if (period !== "AM" && period !== "PM") {
    // 24h clock
    period = h >= 12 ? "PM" : "AM";
    if (h === 0) h = 12;
    else if (h > 12) h -= 12;
  } else {
    // Already 12h; keep hour as given (1–12), but coerce 0→12
    if (h === 0) h = 12;
    if (h > 12) {
      // Mis-tagged 24h with AM/PM — trust the number as 24h
      period = h >= 12 ? "PM" : "AM";
      if (h > 12) h -= 12;
    }
  }
  const mm = String(Math.max(0, Math.min(59, minute))).padStart(2, "0");
  return `${h}:${mm} ${period}`;
}

interface TimeToken {
  time: string;
  label?: string;
}

/** Parse one or more times from a fragment like "10:00", "10:00,17:00", "8AM", "9:30 am to 10:30". */
function extractTimes(fragment: string): TimeToken[] {
  const raw = fragment.trim();
  if (!raw) return [];

  // Range with "to" / "–" / "-" between two clock times (keep as one display token)
  const range = raw.match(
    /^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*(?:to|–|-|—)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i,
  );
  if (range) {
    const start = to12h(
      parseInt(range[1], 10),
      range[2] ? parseInt(range[2], 10) : 0,
      range[3],
    );
    const end = to12h(
      parseInt(range[4], 10),
      range[5] ? parseInt(range[5], 10) : 0,
      range[6] || range[3],
    );
    return [{ time: `${start}–${end}` }];
  }

  const out: TimeToken[] = [];
  // Split on commas / "and" for multiple services on the same day
  const chunks = raw.split(/\s*(?:,|\/|and)\s*/i).map((s) => s.trim()).filter(Boolean);
  for (const chunk of chunks) {
    const withLabel = chunk.match(/^(.+?)\s+\(([^)]+)\)$/);
    const core = (withLabel ? withLabel[1] : chunk).trim();
    const label = withLabel?.[2]?.trim();

    let m = core.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(am|pm)?$/i);
    if (m) {
      out.push({
        time: to12h(parseInt(m[1], 10), parseInt(m[2], 10), m[3]),
        label,
      });
      continue;
    }
    m = core.match(/^(\d{1,2})\s*(am|pm)$/i);
    if (m) {
      out.push({ time: to12h(parseInt(m[1], 10), 0, m[2]), label });
      continue;
    }
  }
  return out;
}

function resolveDay(token: string): ServiceDayShort | null {
  return DAY_LOOKUP[token.trim().toLowerCase()] ?? null;
}

/**
 * Parse a free-form / OSM / canonical service-times string into display rows.
 */
export function parseServiceTimesForDisplay(value: string): ParsedServiceTime[] {
  if (!value || !value.trim()) return [];

  const results: ParsedServiceTime[] = [];
  // Prefer ";" segments (HMC + many OSM), but also handle comma-only multi-day lists
  // like "Sunday 8AM, Sunday 11AM" by first trying semicolon split, then a smarter pass.
  const segments = splitServiceSegments(value);

  for (const segment of segments) {
    const parsed = parseOneSegment(segment);
    if (parsed.length) {
      results.push(...parsed);
      continue;
    }
    // Last resort: keep readable raw text
    results.push({ day: "?", dayFull: "Schedule", time: segment, label: undefined });
  }

  return results;
}

/** Split into day-scoped segments. */
function splitServiceSegments(value: string): string[] {
  const trimmed = value.trim();
  if (trimmed.includes(";")) {
    return trimmed.split(";").map((s) => s.trim()).filter(Boolean);
  }

  // "Sunday 8AM, Sunday 11AM" / "Su 10:00, Su 17:00"
  const dayThenTime = trimmed.match(
    /(?:Su|Mo|Tu|We|Th|Fr|Sa|Sun|Mon|Tue|Wed|Thu|Fri|Sat|Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday)\s+/gi,
  );
  if (dayThenTime && dayThenTime.length >= 2 && trimmed.includes(",")) {
    // Split on comma only when the next token looks like a day
    return trimmed
      .split(/,\s*(?=(?:Su|Mo|Tu|We|Th|Fr|Sa|Sun|Mon|Tue|Wed|Thu|Fri|Sat|Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday)\b)/i)
      .map((s) => s.trim())
      .filter(Boolean);
  }

  return [trimmed];
}

function parseOneSegment(segment: string): ParsedServiceTime[] {
  const s = segment.trim();
  if (!s) return [];

  // Canonical: "Sun 9:00 AM" or "Sun 9:00 AM (Main)"
  const canonical = s.match(
    /^(Sun|Mon|Tue|Wed|Thu|Fri|Sat)\s+(\d{1,2}:\d{2}\s+(?:AM|PM))(?:\s+\((.+)\))?$/i,
  );
  if (canonical) {
    const day = resolveDay(canonical[1]) || "Sun";
    return [
      {
        day,
        dayFull: dayFull(day),
        time: canonical[2].replace(/\s+(am|pm)$/i, (_, p) => ` ${p.toUpperCase()}`),
        label: canonical[3]?.trim() || undefined,
      },
    ];
  }

  // Day range office hours: "Mo-Fr 08:30-17:00" / "Mo–Su 09:00-12:00"
  const dayRange = s.match(
    /^(Su|Mo|Tu|We|Th|Fr|Sa|Sun|Mon|Tue|Wed|Thu|Fri|Sat)\s*[-–—]\s*(Su|Mo|Tu|We|Th|Fr|Sa|Sun|Mon|Tue|Wed|Thu|Fri|Sat)\s+(.+)$/i,
  );
  if (dayRange) {
    const start = resolveDay(dayRange[1]);
    const end = resolveDay(dayRange[2]);
    const times = extractTimes(dayRange[3]);
    if (start && end && times.length) {
      const label = `${dayFull(start).slice(0, 3)}–${dayFull(end).slice(0, 3)}`;
      return times.map((t) => ({
        day: start,
        dayFull: label,
        time: t.time,
        label: t.label,
      }));
    }
  }

  // "Su 10:00" / "Su 10:00,17:00" / "Sunday 8AM" / "Wed 7:00 PM (Youth)"
  const dayPrefix = s.match(
    /^(Su|Mo|Tu|We|Th|Fr|Sa|Sun|Mon|Tue|Wed|Thu|Fri|Sat|Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday)\b\.?\s*(.*)$/i,
  );
  if (dayPrefix) {
    const day = resolveDay(dayPrefix[1]);
    if (day) {
      const rest = dayPrefix[2].trim();
      if (!rest) return [];
      const times = extractTimes(rest);
      if (times.length) {
        return times.map((t) => ({
          day,
          dayFull: dayFull(day),
          time: t.time,
          label: t.label,
        }));
      }
    }
  }

  // Time-only (common for Sunday services): "10:30 am", "9:00, 11:00"
  const timesOnly = extractTimes(s);
  if (timesOnly.length) {
    return timesOnly.map((t) => ({
      day: "Sun" as const,
      dayFull: "Sunday",
      time: t.time,
      label: t.label,
    }));
  }

  return [];
}

/**
 * Normalize any known service-times string into canonical HMC storage form.
 * Returns "" if nothing usable was found.
 */
export function normalizeServiceTimes(value: string | undefined | null): string {
  if (!value || !String(value).trim()) return "";
  const parsed = parseServiceTimesForDisplay(String(value));
  // Only rewrite when every entry is a concrete day + single clock time (not office-hour ranges).
  const usable = parsed.filter(
    (p) =>
      p.day !== "?" &&
      !String(p.dayFull).includes("–") &&
      /^\d{1,2}:\d{2}\s+(AM|PM)$/i.test(p.time),
  );
  if (!usable.length || usable.length !== parsed.length) {
    // Keep original trimmed if we couldn't confidently normalize (don't destroy data)
    return String(value).trim();
  }

  const dayOrder = SERVICE_DAYS.map((d) => d.short);
  const sorted = [...usable].sort((a, b) => {
    const di = dayOrder.indexOf(a.day as ServiceDayShort) - dayOrder.indexOf(b.day as ServiceDayShort);
    if (di !== 0) return di;
    return toSortMinutes(a.time) - toSortMinutes(b.time);
  });

  return sorted
    .map((p) => {
      const base = `${p.day} ${normalizeTimeToken(p.time)}`;
      return p.label ? `${base} (${p.label})` : base;
    })
    .join("; ");
}

function normalizeTimeToken(time: string): string {
  // Drop ranges for storage canonical form — take start only if range
  const range = time.match(/^(\d{1,2}:\d{2}\s+(?:AM|PM))\s*[–—-]/i);
  if (range) return range[1].replace(/\s+(am|pm)$/i, (_, p) => ` ${String(p).toUpperCase()}`);
  return time.replace(/\s+(am|pm)$/i, (_, p) => ` ${String(p).toUpperCase()}`);
}

function toSortMinutes(time: string): number {
  const m = time.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  if (!m) return 0;
  let h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  const p = m[3].toUpperCase();
  if (p === "PM" && h !== 12) h += 12;
  if (p === "AM" && h === 12) h = 0;
  return h * 60 + min;
}

/** Group parsed service times by day for display cards. */
export function groupServiceTimesByDay(
  parsed: ParsedServiceTime[],
): { day: string; dayFull: string; services: { time: string; label?: string }[] }[] {
  const groups = new Map<string, { dayFull: string; services: { time: string; label?: string }[] }>();
  const dayOrder = [...SERVICE_DAYS.map((d) => d.short), "?"];

  for (const svc of parsed) {
    const key = svc.day;
    const existing = groups.get(key);
    if (existing) {
      existing.services.push({ time: svc.time, label: svc.label });
    } else {
      groups.set(key, {
        dayFull: svc.dayFull,
        services: [{ time: svc.time, label: svc.label }],
      });
    }
  }

  return Array.from(groups.entries())
    .sort((a, b) => dayOrder.indexOf(a[0]) - dayOrder.indexOf(b[0]))
    .map(([day, data]) => ({ day, ...data }));
}

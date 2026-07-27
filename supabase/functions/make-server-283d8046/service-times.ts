/**
 * Normalize OSM / informal service-times strings to HMC canonical form:
 * "Sun 9:00 AM; Sun 11:00 AM; Wed 7:00 PM"
 */

const DAYS = [
  { short: "Sun", full: "Sunday", osm: "Su" },
  { short: "Mon", full: "Monday", osm: "Mo" },
  { short: "Tue", full: "Tuesday", osm: "Tu" },
  { short: "Wed", full: "Wednesday", osm: "We" },
  { short: "Thu", full: "Thursday", osm: "Th" },
  { short: "Fri", full: "Friday", osm: "Fr" },
  { short: "Sat", full: "Saturday", osm: "Sa" },
] as const;

type DayShort = (typeof DAYS)[number]["short"];

const DAY_LOOKUP: Record<string, DayShort> = (() => {
  const m: Record<string, DayShort> = {};
  for (const d of DAYS) {
    m[d.short.toLowerCase()] = d.short;
    m[d.full.toLowerCase()] = d.short;
    m[d.osm.toLowerCase()] = d.short;
  }
  m.thurs = "Thu";
  m.thur = "Thu";
  m.tues = "Tue";
  m.weds = "Wed";
  return m;
})();

function resolveDay(token: string): DayShort | null {
  return DAY_LOOKUP[token.trim().toLowerCase()] ?? null;
}

function to12h(hour: number, minute: number, periodHint?: string): string {
  let h = hour;
  let period = (periodHint || "").toUpperCase();
  if (period !== "AM" && period !== "PM") {
    period = h >= 12 ? "PM" : "AM";
    if (h === 0) h = 12;
    else if (h > 12) h -= 12;
  } else {
    if (h === 0) h = 12;
    if (h > 12) {
      period = h >= 12 ? "PM" : "AM";
      if (h > 12) h -= 12;
    }
  }
  return `${h}:${String(Math.max(0, Math.min(59, minute))).padStart(2, "0")} ${period}`;
}

function extractTimes(fragment: string): string[] {
  const raw = fragment.trim();
  if (!raw) return [];
  const range = raw.match(
    /^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*(?:to|–|-|—)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i,
  );
  if (range) {
    return [
      to12h(parseInt(range[1], 10), range[2] ? parseInt(range[2], 10) : 0, range[3]),
    ];
  }
  const out: string[] = [];
  for (const chunk of raw.split(/\s*(?:,|\/|and)\s*/i).map((s) => s.trim()).filter(Boolean)) {
    const core = chunk.replace(/\s+\([^)]+\)$/, "").trim();
    let m = core.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(am|pm)?$/i);
    if (m) {
      out.push(to12h(parseInt(m[1], 10), parseInt(m[2], 10), m[3]));
      continue;
    }
    m = core.match(/^(\d{1,2})\s*(am|pm)$/i);
    if (m) out.push(to12h(parseInt(m[1], 10), 0, m[2]));
  }
  return out;
}

function splitSegments(value: string): string[] {
  const trimmed = value.trim();
  if (trimmed.includes(";")) return trimmed.split(";").map((s) => s.trim()).filter(Boolean);
  const dayThenTime = trimmed.match(
    /(?:Su|Mo|Tu|We|Th|Fr|Sa|Sun|Mon|Tue|Wed|Thu|Fri|Sat|Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday)\s+/gi,
  );
  if (dayThenTime && dayThenTime.length >= 2 && trimmed.includes(",")) {
    return trimmed
      .split(/,\s*(?=(?:Su|Mo|Tu|We|Th|Fr|Sa|Sun|Mon|Tue|Wed|Thu|Fri|Sat|Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday)\b)/i)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [trimmed];
}

function parseSegment(segment: string): { day: DayShort; time: string; label?: string }[] {
  const s = segment.trim();
  if (!s) return [];

  const canonical = s.match(
    /^(Sun|Mon|Tue|Wed|Thu|Fri|Sat)\s+(\d{1,2}:\d{2}\s+(?:AM|PM))(?:\s+\((.+)\))?$/i,
  );
  if (canonical) {
    const day = resolveDay(canonical[1]);
    if (!day) return [];
    return [{
      day,
      time: canonical[2].replace(/\s+(am|pm)$/i, (_, p) => ` ${String(p).toUpperCase()}`),
      label: canonical[3]?.trim() || undefined,
    }];
  }

  const dayPrefix = s.match(
    /^(Su|Mo|Tu|We|Th|Fr|Sa|Sun|Mon|Tue|Wed|Thu|Fri|Sat|Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday)\b\.?\s*(.*)$/i,
  );
  if (dayPrefix) {
    const day = resolveDay(dayPrefix[1]);
    if (day && dayPrefix[2].trim()) {
      const labelMatch = dayPrefix[2].match(/^(.*?)\s+\(([^)]+)\)$/);
      const rest = (labelMatch ? labelMatch[1] : dayPrefix[2]).trim();
      const label = labelMatch?.[2]?.trim();
      return extractTimes(rest).map((time) => ({ day, time, label }));
    }
  }

  // Bare times → assume Sunday (common for worship service tags)
  return extractTimes(s).map((time) => ({ day: "Sun" as const, time }));
}

/** Normalize to canonical storage string; preserve original if nothing parses. */
export function normalizeServiceTimes(value: string | undefined | null): string {
  if (!value || !String(value).trim()) return "";
  const raw = String(value).trim();
  const rows: { day: DayShort; time: string; label?: string }[] = [];
  for (const seg of splitSegments(raw)) {
    rows.push(...parseSegment(seg));
  }
  const usable = rows.filter((r) => /^\d{1,2}:\d{2}\s+(AM|PM)$/i.test(r.time));
  if (!usable.length) return raw;

  const dayOrder = DAYS.map((d) => d.short);
  usable.sort((a, b) => {
    const di = dayOrder.indexOf(a.day) - dayOrder.indexOf(b.day);
    if (di !== 0) return di;
    return timeMinutes(a.time) - timeMinutes(b.time);
  });
  return usable
    .map((r) => (r.label ? `${r.day} ${r.time} (${r.label})` : `${r.day} ${r.time}`))
    .join("; ");
}

function timeMinutes(time: string): number {
  const m = time.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  if (!m) return 0;
  let h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  const p = m[3].toUpperCase();
  if (p === "PM" && h !== 12) h += 12;
  if (p === "AM" && h === 12) h = 0;
  return h * 60 + min;
}

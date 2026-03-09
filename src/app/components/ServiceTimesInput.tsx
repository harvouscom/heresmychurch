import { Plus, X, Clock } from "lucide-react";
import { useState, useEffect, useCallback } from "react";

// ── Types ──

interface ServiceEntry {
  id: string;
  day: string;
  hour: string;
  minute: string;
  period: "AM" | "PM";
  label: string;
}

interface ServiceTimesInputProps {
  value: string; // canonical string like "Sun 9:00 AM; Sun 11:00 AM; Wed 7:00 PM"
  onChange: (value: string) => void;
  compact?: boolean; // for SuggestEditForm's tighter layout
}

// ── Constants ──

const DAYS = [
  { short: "Sun", full: "Sunday" },
  { short: "Mon", full: "Monday" },
  { short: "Tue", full: "Tuesday" },
  { short: "Wed", full: "Wednesday" },
  { short: "Thu", full: "Thursday" },
  { short: "Fri", full: "Friday" },
  { short: "Sat", full: "Saturday" },
];

const HOURS = ["12", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11"];
const MINUTES = ["00", "15", "30", "45"];

// ── Helpers ──

let idCounter = 0;
function newId() {
  return `svc-${++idCounter}-${Date.now()}`;
}

function makeEmpty(): ServiceEntry {
  return { id: newId(), day: "Sun", hour: "9", minute: "00", period: "AM", label: "" };
}

/** Serialize entries to canonical string */
function serialize(entries: ServiceEntry[]): string {
  if (entries.length === 0) return "";
  // Sort: day order, then time, for deterministic output
  const sorted = [...entries].sort((a, b) => {
    const dayOrder = DAYS.findIndex((d) => d.short === a.day) - DAYS.findIndex((d) => d.short === b.day);
    if (dayOrder !== 0) return dayOrder;
    const aTime = toMinutes(a);
    const bTime = toMinutes(b);
    return aTime - bTime;
  });

  return sorted
    .map((e) => {
      const time = `${e.day} ${e.hour}:${e.minute} ${e.period}`;
      return e.label.trim() ? `${time} (${e.label.trim()})` : time;
    })
    .join("; ");
}

function toMinutes(e: ServiceEntry): number {
  let h = parseInt(e.hour);
  if (e.period === "PM" && h !== 12) h += 12;
  if (e.period === "AM" && h === 12) h = 0;
  return h * 60 + parseInt(e.minute);
}

/** Parse canonical string back into entries */
function parse(value: string): ServiceEntry[] {
  if (!value || !value.trim()) return [];
  // Split on ";" and parse each entry
  const parts = value.split(";").map((s) => s.trim()).filter(Boolean);
  const entries: ServiceEntry[] = [];

  for (const part of parts) {
    // Match: Day H:MM AM/PM (optional label)
    const match = part.match(
      /^(Sun|Mon|Tue|Wed|Thu|Fri|Sat)\s+(\d{1,2}):(\d{2})\s+(AM|PM)(?:\s+\((.+)\))?$/i
    );
    if (match) {
      entries.push({
        id: newId(),
        day: match[1].charAt(0).toUpperCase() + match[1].slice(1).toLowerCase(),
        hour: match[2],
        minute: match[3],
        period: match[4].toUpperCase() as "AM" | "PM",
        label: match[5] || "",
      });
    }
  }

  return entries;
}

// Common service time presets
const PRESETS = [
  { label: "Sunday AM", entries: [{ day: "Sun", hour: "9", minute: "00", period: "AM" as const }, { day: "Sun", hour: "11", minute: "00", period: "AM" as const }] },
  { label: "Sunday + Wednesday", entries: [{ day: "Sun", hour: "10", minute: "00", period: "AM" as const }, { day: "Wed", hour: "7", minute: "00", period: "PM" as const }] },
  { label: "Saturday evening", entries: [{ day: "Sat", hour: "5", minute: "00", period: "PM" as const }] },
];

// ── Component ──

export function ServiceTimesInput({ value, onChange, compact }: ServiceTimesInputProps) {
  const [entries, setEntries] = useState<ServiceEntry[]>(() => parse(value));
  const [showPresets, setShowPresets] = useState(false);

  // Sync serialized output when entries change
  useEffect(() => {
    const serialized = serialize(entries);
    if (serialized !== value) {
      onChange(serialized);
    }
  }, [entries]); // eslint-disable-line react-hooks/exhaustive-deps

  const addEntry = useCallback(() => {
    setEntries((prev) => {
      // Smart default: if there are existing entries, suggest same day or next common day
      if (prev.length > 0) {
        const lastEntry = prev[prev.length - 1];
        return [...prev, { ...makeEmpty(), day: lastEntry.day, hour: lastEntry.hour === "9" ? "11" : "9" }];
      }
      return [...prev, makeEmpty()];
    });
  }, []);

  const removeEntry = useCallback((id: string) => {
    setEntries((prev) => prev.filter((e) => e.id !== id));
  }, []);

  const updateEntry = useCallback((id: string, field: keyof ServiceEntry, val: string) => {
    setEntries((prev) =>
      prev.map((e) => (e.id === id ? { ...e, [field]: val } : e))
    );
  }, []);

  const applyPreset = useCallback((preset: typeof PRESETS[number]) => {
    setEntries(
      preset.entries.map((e) => ({
        id: newId(),
        ...e,
        label: "",
      }))
    );
    setShowPresets(false);
  }, []);

  const selectClass = compact
    ? "bg-white/8 rounded px-1.5 py-1 text-white text-[10px] border border-white/10 focus:border-purple-500/50 focus:outline-none transition-colors appearance-none cursor-pointer"
    : "bg-white/8 rounded-lg px-2 py-1.5 text-white text-[11px] border border-white/10 focus:border-purple-500/50 focus:outline-none transition-colors appearance-none cursor-pointer";

  return (
    <div className="space-y-2">
      {/* Entries */}
      {entries.map((entry, idx) => (
        <div key={entry.id} className="flex items-center gap-1.5 flex-wrap">
          {/* Day */}
          <select
            value={entry.day}
            onChange={(e) => updateEntry(entry.id, "day", e.target.value)}
            className={selectClass}
            style={{ minWidth: compact ? 52 : 60 }}
          >
            {DAYS.map((d) => (
              <option key={d.short} value={d.short} className="bg-[#1E1040]">
                {d.short}
              </option>
            ))}
          </select>

          {/* Hour */}
          <select
            value={entry.hour}
            onChange={(e) => updateEntry(entry.id, "hour", e.target.value)}
            className={selectClass}
            style={{ minWidth: compact ? 38 : 44 }}
          >
            {HOURS.map((h) => (
              <option key={h} value={h} className="bg-[#1E1040]">
                {h}
              </option>
            ))}
          </select>

          <span className="text-white/30 text-xs font-bold">:</span>

          {/* Minute */}
          <select
            value={entry.minute}
            onChange={(e) => updateEntry(entry.id, "minute", e.target.value)}
            className={selectClass}
            style={{ minWidth: compact ? 38 : 44 }}
          >
            {MINUTES.map((m) => (
              <option key={m} value={m} className="bg-[#1E1040]">
                {m}
              </option>
            ))}
          </select>

          {/* AM/PM */}
          <div className="flex rounded-md overflow-hidden border border-white/10">
            <button
              type="button"
              onClick={() => updateEntry(entry.id, "period", "AM")}
              className={`px-1.5 py-0.5 text-[10px] font-semibold transition-colors ${
                entry.period === "AM"
                  ? "bg-purple-500/40 text-white"
                  : "bg-white/5 text-white/30 hover:text-white/50"
              }`}
            >
              AM
            </button>
            <button
              type="button"
              onClick={() => updateEntry(entry.id, "period", "PM")}
              className={`px-1.5 py-0.5 text-[10px] font-semibold transition-colors ${
                entry.period === "PM"
                  ? "bg-purple-500/40 text-white"
                  : "bg-white/5 text-white/30 hover:text-white/50"
              }`}
            >
              PM
            </button>
          </div>

          {/* Optional label */}
          <input
            type="text"
            value={entry.label}
            onChange={(e) => updateEntry(entry.id, "label", e.target.value)}
            placeholder="label"
            maxLength={20}
            className={`flex-1 min-w-[60px] bg-white/5 rounded px-2 py-1 text-[10px] text-white/60 border border-white/5 focus:border-purple-500/30 focus:outline-none transition-colors placeholder:text-white/15 ${
              compact ? "max-w-[70px]" : "max-w-[100px]"
            }`}
          />

          {/* Remove */}
          <button
            type="button"
            onClick={() => removeEntry(entry.id)}
            className="flex-shrink-0 w-5 h-5 rounded flex items-center justify-center hover:bg-red-500/20 transition-colors group"
          >
            <X size={10} className="text-white/20 group-hover:text-red-400 transition-colors" />
          </button>
        </div>
      ))}

      {/* Add / Presets row */}
      <div className="flex items-center gap-2 flex-wrap">
        <button
          type="button"
          onClick={addEntry}
          className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium text-purple-300 hover:text-purple-200 bg-purple-500/10 hover:bg-purple-500/20 transition-colors"
        >
          <Plus size={10} />
          Add service
        </button>

        {entries.length === 0 && (
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowPresets(!showPresets)}
              className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium text-white/30 hover:text-white/50 bg-white/5 hover:bg-white/8 transition-colors"
            >
              <Clock size={9} />
              Quick presets
            </button>
            {showPresets && (
              <div
                className="absolute left-0 bottom-full mb-1 rounded-lg shadow-xl border border-white/10 p-1.5 z-50 w-[180px]"
                style={{ backgroundColor: "rgba(30, 16, 64, 0.98)" }}
              >
                {PRESETS.map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => applyPreset(preset)}
                    className="w-full text-left px-2.5 py-1.5 rounded-md text-[10px] text-white/60 hover:text-white hover:bg-white/8 transition-colors"
                  >
                    {preset.label}
                    <span className="block text-[9px] text-white/25 mt-0.5">
                      {preset.entries
                        .map((e) => `${e.day} ${e.hour}:${e.minute.padStart(2, "0")} ${e.period}`)
                        .join(", ")}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Preview of canonical output */}
      {entries.length > 0 && (
        <div className="text-[9px] text-white/20 leading-relaxed px-0.5">
          Stored as: <span className="text-white/30 font-mono">{serialize(entries)}</span>
        </div>
      )}
    </div>
  );
}

// ── Display helper for ChurchDetailPanel ──

interface ParsedServiceTime {
  day: string;
  dayFull: string;
  time: string;
  label?: string;
}

export function parseServiceTimesForDisplay(value: string): ParsedServiceTime[] {
  if (!value) return [];
  const parts = value.split(";").map((s) => s.trim()).filter(Boolean);
  const results: ParsedServiceTime[] = [];

  for (const part of parts) {
    const match = part.match(
      /^(Sun|Mon|Tue|Wed|Thu|Fri|Sat)\s+(\d{1,2}:\d{2}\s+(?:AM|PM))(?:\s+\((.+)\))?$/i
    );
    if (match) {
      const dayInfo = DAYS.find((d) => d.short.toLowerCase() === match[1].toLowerCase());
      results.push({
        day: match[1],
        dayFull: dayInfo?.full || match[1],
        time: match[2],
        label: match[3],
      });
    } else {
      // Fallback for non-canonical strings
      results.push({ day: "?", dayFull: "Unknown", time: part, label: undefined });
    }
  }

  return results;
}

/** Group parsed service times by day for display */
export function groupServiceTimesByDay(
  parsed: ParsedServiceTime[]
): { day: string; dayFull: string; services: { time: string; label?: string }[] }[] {
  const groups = new Map<string, { dayFull: string; services: { time: string; label?: string }[] }>();
  const dayOrder = DAYS.map((d) => d.short);

  for (const svc of parsed) {
    const existing = groups.get(svc.day);
    if (existing) {
      existing.services.push({ time: svc.time, label: svc.label });
    } else {
      groups.set(svc.day, { dayFull: svc.dayFull, services: [{ time: svc.time, label: svc.label }] });
    }
  }

  // Sort by day order
  return Array.from(groups.entries())
    .sort((a, b) => dayOrder.indexOf(a[0]) - dayOrder.indexOf(b[0]))
    .map(([day, data]) => ({ day, ...data }));
}

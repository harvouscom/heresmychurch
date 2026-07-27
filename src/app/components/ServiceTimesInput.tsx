import { Plus, Clock } from "lucide-react";
import { useState, useEffect, useCallback } from "react";
import {
  SERVICE_DAYS,
  normalizeServiceTimes,
  parseServiceTimesForDisplay,
  groupServiceTimesByDay,
  type ParsedServiceTime,
} from "../lib/service-times";

export { parseServiceTimesForDisplay, groupServiceTimesByDay, normalizeServiceTimes };
export type { ParsedServiceTime };

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

const DAYS = SERVICE_DAYS.map((d) => ({ short: d.short, full: d.full }));
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
  const sorted = [...entries].sort((a, b) => {
    const dayOrder = DAYS.findIndex((d) => d.short === a.day) - DAYS.findIndex((d) => d.short === b.day);
    if (dayOrder !== 0) return dayOrder;
    return toMinutes(a) - toMinutes(b);
  });

  return sorted.map((e) => formatEntryStored(e)).join("; ");
}

/** Format a single entry as stored (e.g. "Sun 9:00 AM" or "Sun 9:00 AM (Main Service)") */
function formatEntryStored(e: ServiceEntry): string {
  const time = `${e.day} ${e.hour}:${e.minute} ${e.period}`;
  return e.label.trim() ? `${time} (${e.label.trim()})` : time;
}

function toMinutes(e: ServiceEntry): number {
  let h = parseInt(e.hour, 10);
  if (e.period === "PM" && h !== 12) h += 12;
  if (e.period === "AM" && h === 12) h = 0;
  return h * 60 + parseInt(e.minute, 10);
}

/** Parse canonical / OSM / informal strings into editable entries */
function parse(value: string): ServiceEntry[] {
  if (!value || !value.trim()) return [];

  const normalized = normalizeServiceTimes(value);
  const parts = (normalized || value).split(";").map((s) => s.trim()).filter(Boolean);
  const entries: ServiceEntry[] = [];

  for (const part of parts) {
    const match = part.match(
      /^(Sun|Mon|Tue|Wed|Thu|Fri|Sat)\s+(\d{1,2}):(\d{2})\s+(AM|PM)(?:\s+\((.+)\))?$/i,
    );
    if (match) {
      entries.push({
        id: newId(),
        day: match[1].charAt(0).toUpperCase() + match[1].slice(1).toLowerCase(),
        hour: String(parseInt(match[2], 10)), // strip leading zero for select values
        minute: match[3],
        period: match[4].toUpperCase() as "AM" | "PM",
        label: match[5] || "",
      });
    }
  }

  return entries;
}

const PRESETS = [
  {
    label: "Sunday AM",
    entries: [
      { day: "Sun", hour: "9", minute: "00", period: "AM" as const },
      { day: "Sun", hour: "11", minute: "00", period: "AM" as const },
    ],
  },
  {
    label: "Sunday + Wednesday",
    entries: [
      { day: "Sun", hour: "10", minute: "00", period: "AM" as const },
      { day: "Wed", hour: "7", minute: "00", period: "PM" as const },
    ],
  },
  {
    label: "Saturday evening",
    entries: [{ day: "Sat", hour: "5", minute: "00", period: "PM" as const }],
  },
];

// ── Component ──

export function ServiceTimesInput({ value, onChange, compact }: ServiceTimesInputProps) {
  const [entries, setEntries] = useState<ServiceEntry[]>(() => parse(value));
  const [showPresets, setShowPresets] = useState(false);

  // If parent value changes to a different string we can't reverse from local entries
  // (e.g. opening suggest-edit on an OSM church), re-hydrate.
  useEffect(() => {
    const serialized = serialize(entries);
    const incoming = normalizeServiceTimes(value) || value.trim();
    if (incoming && incoming !== serialized) {
      const next = parse(value);
      if (next.length) setEntries(next);
    }
    // Only react to external value changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  // Sync serialized output when entries change
  useEffect(() => {
    const serialized = serialize(entries);
    if (serialized !== value) {
      onChange(serialized);
    }
  }, [entries]); // eslint-disable-line react-hooks/exhaustive-deps

  const addEntry = useCallback(() => {
    setEntries((prev) => {
      if (prev.length > 0) {
        const lastEntry = prev[prev.length - 1];
        return [
          ...prev,
          { ...makeEmpty(), day: lastEntry.day, hour: lastEntry.hour === "9" ? "11" : "9" },
        ];
      }
      return [...prev, makeEmpty()];
    });
  }, []);

  const removeEntry = useCallback((id: string) => {
    setEntries((prev) => prev.filter((e) => e.id !== id));
  }, []);

  const updateEntry = useCallback((id: string, field: keyof ServiceEntry, val: string) => {
    setEntries((prev) => prev.map((e) => (e.id === id ? { ...e, [field]: val } : e)));
  }, []);

  const applyPreset = useCallback((preset: (typeof PRESETS)[number]) => {
    setEntries(
      preset.entries.map((e) => ({
        id: newId(),
        ...e,
        label: "",
      })),
    );
    setShowPresets(false);
  }, []);

  const selectClass = compact
    ? "bg-white/8 rounded px-1.5 py-1 text-white text-[10px] border border-white/10 focus:border-purple-500/50 focus:outline-none transition-colors appearance-none cursor-pointer"
    : "bg-white/8 rounded-lg px-2 py-1.5 text-white text-[11px] border border-white/10 focus:border-purple-500/50 focus:outline-none transition-colors appearance-none cursor-pointer";

  const inputClass = compact
    ? "bg-white/5 rounded px-2 py-1 text-[10px] text-white/90 border border-white/5 focus:border-purple-500/30 focus:outline-none transition-colors placeholder:text-white/40"
    : "bg-white/5 rounded-lg px-2 py-1.5 text-[11px] text-white/90 border border-white/5 focus:border-purple-500/30 focus:outline-none transition-colors placeholder:text-white/40";

  const amPmClass = compact
    ? "px-2 py-1 text-[10px] font-semibold transition-colors"
    : "px-2.5 py-1.5 text-[11px] font-semibold transition-colors";

  return (
    <div className="space-y-2">
      {entries.map((entry) => (
        <div
          key={entry.id}
          className="rounded-lg border border-white/10 bg-white/[0.04] p-2.5 space-y-2"
        >
          <div className="flex items-center gap-2 flex-nowrap">
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

            <div className={`flex overflow-hidden border border-white/10 ${compact ? "rounded" : "rounded-lg"}`}>
              <button
                type="button"
                onClick={() => updateEntry(entry.id, "period", "AM")}
                className={`${amPmClass} ${
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
                className={`${amPmClass} ${
                  entry.period === "PM"
                    ? "bg-purple-500/40 text-white"
                    : "bg-white/5 text-white/30 hover:text-white/50"
                }`}
              >
                PM
              </button>
            </div>
          </div>

          <input
            type="text"
            value={entry.label}
            onChange={(e) => updateEntry(entry.id, "label", e.target.value)}
            placeholder="Optional label (e.g. Spanish, Youth) to differentiate"
            maxLength={20}
            className={`${inputClass} w-full`}
          />

          <div className={`leading-relaxed text-white/60 ${compact ? "text-[10px]" : "text-[11px]"}`}>
            Stored as: <span className="text-white/90 font-mono">{formatEntryStored(entry)}</span>
          </div>
        </div>
      ))}

      <div className="flex items-center gap-2 flex-wrap">
        <button
          type="button"
          onClick={addEntry}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium text-purple-300 hover:text-purple-200 bg-purple-500/10 hover:bg-purple-500/20 transition-colors"
        >
          <Plus size={11} />
          Add service
        </button>

        {entries.length > 0 && (
          <button
            type="button"
            onClick={() => removeEntry(entries[entries.length - 1].id)}
            className="px-3 py-1.5 rounded-lg text-[11px] font-medium text-white/65 hover:bg-white/5 transition-colors"
          >
            Remove
          </button>
        )}

        {entries.length === 0 && (
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowPresets(!showPresets)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium text-white/30 hover:text-white/50 bg-white/5 hover:bg-white/8 transition-colors"
            >
              <Clock size={11} />
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
    </div>
  );
}

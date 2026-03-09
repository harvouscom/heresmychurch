import type { Church } from "./church-data";
import { DENOMINATION_GROUPS, COMMON_LANGUAGES, COMMON_MINISTRIES } from "./church-data";
import type { SuggestionConsensus } from "./api";
import { fetchSuggestions, submitSuggestion } from "./api";
import {
  X,
  Send,
  Check,
  Users,
  Globe,
  MapPin,
  Church as ChurchIcon,
  AlertCircle,
  Loader2,
  Clock,
  Languages,
  Heart,
  User,
  Phone,
  Mail,
} from "lucide-react";
import { useState, useEffect, useCallback } from "react";
import { ServiceTimesInput } from "./ServiceTimesInput";

interface SuggestEditFormProps {
  church: Church;
  onClose: () => void;
}

type EditableField = "website" | "address" | "attendance" | "denomination" | "serviceTimes" | "languages" | "ministries" | "pastorName" | "phone" | "email";

const FIELD_CONFIG: {
  key: EditableField;
  label: string;
  icon: typeof Globe;
  placeholder: string;
  type: "text" | "number" | "select" | "chips-languages" | "chips-ministries";
  group: "core" | "extended";
}[] = [
  {
    key: "website",
    label: "Website",
    icon: Globe,
    placeholder: "https://www.example.com",
    type: "text",
    group: "core",
  },
  {
    key: "address",
    label: "Address",
    icon: MapPin,
    placeholder: "123 Main St, City, State",
    type: "text",
    group: "core",
  },
  {
    key: "attendance",
    label: "Weekly Attendance",
    icon: Users,
    placeholder: "Enter estimated weekly attendance",
    type: "number",
    group: "core",
  },
  {
    key: "denomination",
    label: "Denomination",
    icon: ChurchIcon,
    placeholder: "Select denomination",
    type: "select",
    group: "core",
  },
  {
    key: "serviceTimes",
    label: "Service Times",
    icon: Clock,
    placeholder: "e.g., Sunday 9am, 11am; Wed 7pm",
    type: "text",
    group: "extended",
  },
  {
    key: "languages",
    label: "Languages",
    icon: Languages,
    placeholder: "Select languages offered",
    type: "chips-languages",
    group: "extended",
  },
  {
    key: "ministries",
    label: "Ministries",
    icon: Heart,
    placeholder: "Select ministries offered",
    type: "chips-ministries",
    group: "extended",
  },
  {
    key: "pastorName",
    label: "Lead Pastor",
    icon: User,
    placeholder: "Pastor John Smith",
    type: "text",
    group: "extended",
  },
  {
    key: "phone",
    label: "Phone",
    icon: Phone,
    placeholder: "(555) 123-4567",
    type: "text",
    group: "extended",
  },
  {
    key: "email",
    label: "Email",
    icon: Mail,
    placeholder: "info@church.org",
    type: "text",
    group: "extended",
  },
];

function VoteProgress({
  consensus,
}: {
  consensus: SuggestionConsensus | undefined;
}) {
  if (!consensus || consensus.votes === 0) return null;
  const { votes, needed, approved, submissions } = consensus;

  return (
    <div className="mt-2 space-y-1.5">
      {/* Progress bar */}
      <div className="flex items-center gap-2">
        <div className="flex-1 h-1.5 rounded-full bg-white/10 overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{
              width: `${Math.min((votes / needed) * 100, 100)}%`,
              backgroundColor: approved ? "#22c55e" : "#a855f7",
            }}
          />
        </div>
        <span className="text-[10px] text-white/50 font-medium tabular-nums">
          {votes}/{needed}
        </span>
      </div>

      {/* Submission breakdown */}
      {submissions.length > 0 && (
        <div className="space-y-1">
          {submissions.slice(0, 3).map((s, i) => (
            <div
              key={i}
              className="flex items-center justify-between gap-2 text-[10px]"
            >
              <span className="text-white/40 truncate flex-1 min-w-0">
                "{s.value}"
              </span>
              <span className="text-white/30 flex-shrink-0">
                {s.count} {s.count === 1 ? "vote" : "votes"}
              </span>
            </div>
          ))}
        </div>
      )}

      {approved && (
        <div className="flex items-center gap-1 text-[10px] text-green-400/80">
          <Check size={10} />
          <span>Approved by community consensus</span>
        </div>
      )}
    </div>
  );
}

// Helper to determine if a field is "empty" on the church — these get highlighted
function isFieldEmpty(church: Church, field: EditableField): boolean {
  switch (field) {
    case "website": return !church.website;
    case "address": return !church.address;
    case "attendance": return !church.attendance || church.attendance === 0;
    case "denomination": return !church.denomination || church.denomination === "Unknown" || church.denomination === "Other";
    case "serviceTimes": return !church.serviceTimes;
    case "languages": return !church.languages || church.languages.length === 0;
    case "ministries": return !church.ministries || church.ministries.length === 0;
    case "pastorName": return !church.pastorName;
    case "phone": return !church.phone;
    case "email": return !church.email;
  }
}

export function SuggestEditForm({ church, onClose }: SuggestEditFormProps) {
  const [consensus, setConsensus] = useState<Record<
    string,
    SuggestionConsensus
  > | null>(null);
  const [myVotes, setMyVotes] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [values, setValues] = useState<Record<string, string>>({
    website: church.website || "",
    address: [church.address, church.city, church.state]
      .filter(Boolean)
      .join(", "),
    attendance: String(church.attendance),
    denomination: church.denomination,
    serviceTimes: church.serviceTimes || "",
    languages: (church.languages || []).join(", "),
    ministries: (church.ministries || []).join(", "),
    pastorName: church.pastorName || "",
    phone: church.phone || "",
    email: church.email || "",
  });

  // Track chip selections for languages/ministries
  const [chipLanguages, setChipLanguages] = useState<Set<string>>(
    new Set(church.languages || [])
  );
  const [chipMinistries, setChipMinistries] = useState<Set<string>>(
    new Set(church.ministries || [])
  );

  // Sync chip state to values
  useEffect(() => {
    setValues(v => ({ ...v, languages: Array.from(chipLanguages).join(", ") }));
  }, [chipLanguages]);
  useEffect(() => {
    setValues(v => ({ ...v, ministries: Array.from(chipMinistries).join(", ") }));
  }, [chipMinistries]);

  const loadSuggestions = useCallback(async () => {
    try {
      setLoading(true);
      const data = await fetchSuggestions(church.id);
      setConsensus(data.consensus);
      setMyVotes(data.myVotes);
    } catch (err) {
      console.error("Failed to load suggestions:", err);
    } finally {
      setLoading(false);
    }
  }, [church.id]);

  useEffect(() => {
    loadSuggestions();
  }, [loadSuggestions]);

  const handleSubmit = async (field: EditableField) => {
    const value = values[field]?.trim();
    if (!value) return;

    setSubmitting(field);
    setError(null);

    try {
      const result = await submitSuggestion(church.id, field, value);
      if (result.allFields) {
        setConsensus(result.allFields);
      }
      setSubmitted((prev) => new Set([...prev, field]));
      setMyVotes((prev) => ({ ...prev, [field]: value }));

      // Clear the submitted indicator after 2s
      setTimeout(() => {
        setSubmitted((prev) => {
          const next = new Set(prev);
          next.delete(field);
          return next;
        });
      }, 2000);
    } catch (err: any) {
      setError(err.message || "Failed to submit suggestion");
    } finally {
      setSubmitting(null);
    }
  };

  // Count empty fields to show badge
  const emptyCount = FIELD_CONFIG.filter(f => isFieldEmpty(church, f.key)).length;

  return (
    <div
      className="h-full flex flex-col overflow-hidden"
      style={{
        backgroundColor: "#1E1040",
        fontFamily: "'Livvic', sans-serif",
      }}
    >
      {/* Header */}
      <div className="flex-shrink-0 px-5 pt-5 pb-4 border-b border-white/10">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-5 h-5 rounded-full bg-purple-500/20 flex items-center justify-center">
                <Users size={10} className="text-purple-400" />
              </div>
              <span className="text-[10px] uppercase tracking-wider text-purple-400/70 font-semibold">
                Community Corrections
              </span>
            </div>
            <h2 className="text-white font-bold text-base leading-tight truncate">
              {church.name}
            </h2>
            <p className="text-white/40 text-[11px] mt-1.5 leading-relaxed">
              Suggest corrections below. Changes are applied when{" "}
              <span className="text-purple-400 font-semibold">3 people</span>{" "}
              agree on the same value.
              {emptyCount > 0 && (
                <span className="text-pink-400/80">
                  {" "}This church is missing {emptyCount} {emptyCount === 1 ? "field" : "fields"} — help fill them in!
                </span>
              )}
            </p>
          </div>
          <button
            onClick={onClose}
            className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center hover:bg-white/10 transition-colors"
          >
            <X size={18} className="text-white/60" />
          </button>
        </div>
      </div>

      {/* Form fields */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 size={20} className="text-purple-400 animate-spin" />
          </div>
        ) : (
          <>
            {/* Core fields */}
            {FIELD_CONFIG.filter(f => f.group === "core").map((fieldConfig) => (
              <FieldRow
                key={fieldConfig.key}
                fieldConfig={fieldConfig}
                values={values}
                setValues={setValues}
                consensus={consensus}
                myVotes={myVotes}
                submitting={submitting}
                submitted={submitted}
                handleSubmit={handleSubmit}
                isEmpty={isFieldEmpty(church, fieldConfig.key)}
                chipLanguages={chipLanguages}
                setChipLanguages={setChipLanguages}
                chipMinistries={chipMinistries}
                setChipMinistries={setChipMinistries}
              />
            ))}

            {/* Divider for extended fields */}
            <div className="flex items-center gap-3 py-1">
              <div className="flex-1 h-px bg-white/8" />
              <span className="text-[9px] uppercase tracking-wider text-white/25 font-semibold">
                Service Details & Contact
              </span>
              <div className="flex-1 h-px bg-white/8" />
            </div>

            {/* Extended fields */}
            {FIELD_CONFIG.filter(f => f.group === "extended").map((fieldConfig) => (
              <FieldRow
                key={fieldConfig.key}
                fieldConfig={fieldConfig}
                values={values}
                setValues={setValues}
                consensus={consensus}
                myVotes={myVotes}
                submitting={submitting}
                submitted={submitted}
                handleSubmit={handleSubmit}
                isEmpty={isFieldEmpty(church, fieldConfig.key)}
                chipLanguages={chipLanguages}
                setChipLanguages={setChipLanguages}
                chipMinistries={chipMinistries}
                setChipMinistries={setChipMinistries}
              />
            ))}

            {error && (
              <div className="flex items-center gap-2 rounded-lg p-3 bg-red-500/10 border border-red-500/20">
                <AlertCircle size={14} className="text-red-400 flex-shrink-0" />
                <p className="text-red-300/80 text-xs">{error}</p>
              </div>
            )}
          </>
        )}

        {/* Info note */}
        <div className="pt-3 border-t border-white/5">
          <p className="text-white/25 text-[10px] leading-relaxed text-center">
            Corrections require 3 independent votes to take effect. For
            attendance, the approved value is the average of all votes. Your
            vote can be updated once per day.
          </p>
        </div>
      </div>
    </div>
  );
}

// Extracted field row component
function FieldRow({
  fieldConfig,
  values,
  setValues,
  consensus,
  myVotes,
  submitting,
  submitted,
  handleSubmit,
  isEmpty,
  chipLanguages,
  setChipLanguages,
  chipMinistries,
  setChipMinistries,
}: {
  fieldConfig: (typeof FIELD_CONFIG)[number];
  values: Record<string, string>;
  setValues: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  consensus: Record<string, SuggestionConsensus> | null;
  myVotes: Record<string, string>;
  submitting: string | null;
  submitted: Set<string>;
  handleSubmit: (field: EditableField) => void;
  isEmpty: boolean;
  chipLanguages: Set<string>;
  setChipLanguages: React.Dispatch<React.SetStateAction<Set<string>>>;
  chipMinistries: Set<string>;
  setChipMinistries: React.Dispatch<React.SetStateAction<Set<string>>>;
}) {
  const { key, label, icon: Icon, placeholder, type } = fieldConfig;
  const fieldConsensus = consensus?.[key];
  const hasVoted = !!myVotes[key];
  const isSubmitting = submitting === key;
  const justSubmitted = submitted.has(key);

  return (
    <div
      className={`rounded-xl p-3.5 border ${
        isEmpty
          ? "bg-pink-500/5 border-pink-500/15"
          : "bg-white/5 border-white/5"
      }`}
    >
      <div className="flex items-center gap-2 mb-2.5">
        <Icon size={13} className={isEmpty ? "text-pink-400" : "text-purple-400"} />
        <span className="text-[10px] uppercase tracking-wider text-white/40 font-semibold">
          {label}
        </span>
        {isEmpty && !fieldConsensus?.approved && !hasVoted && (
          <span className="ml-auto text-[9px] px-1.5 py-0.5 rounded-full bg-pink-500/15 text-pink-400 font-semibold">
            MISSING
          </span>
        )}
        {fieldConsensus?.approved && (
          <span className="ml-auto text-[9px] px-1.5 py-0.5 rounded-full bg-green-500/20 text-green-400 font-semibold">
            APPROVED
          </span>
        )}
        {hasVoted && !fieldConsensus?.approved && (
          <span className="ml-auto text-[9px] px-1.5 py-0.5 rounded-full bg-purple-500/20 text-purple-400 font-semibold">
            VOTED
          </span>
        )}
      </div>

      {type === "chips-languages" ? (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-1.5">
            {COMMON_LANGUAGES.map((lang) => (
              <button
                key={lang}
                onClick={() => {
                  setChipLanguages(prev => {
                    const next = new Set(prev);
                    if (next.has(lang)) next.delete(lang);
                    else next.add(lang);
                    return next;
                  });
                }}
                className={`px-2 py-0.5 rounded-full text-[10px] font-medium transition-all border ${
                  chipLanguages.has(lang)
                    ? "bg-purple-500/30 border-purple-500/50 text-purple-300"
                    : "bg-white/5 border-white/8 text-white/40 hover:text-white/60"
                }`}
              >
                {chipLanguages.has(lang) && <Check size={8} className="inline mr-0.5" />}
                {lang}
              </button>
            ))}
          </div>
          <div className="flex justify-end">
            <button
              onClick={() => handleSubmit(key)}
              disabled={isSubmitting || chipLanguages.size === 0 || justSubmitted}
              className="flex-shrink-0 w-9 h-9 rounded-lg flex items-center justify-center transition-all disabled:opacity-30"
              style={{
                backgroundColor: justSubmitted
                  ? "rgba(34, 197, 94, 0.3)"
                  : "rgba(168, 85, 247, 0.3)",
              }}
            >
              {isSubmitting ? (
                <Loader2 size={14} className="text-purple-300 animate-spin" />
              ) : justSubmitted ? (
                <Check size={14} className="text-green-400" />
              ) : (
                <Send size={14} className="text-purple-300" />
              )}
            </button>
          </div>
        </div>
      ) : type === "chips-ministries" ? (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-1.5">
            {COMMON_MINISTRIES.map((ministry) => (
              <button
                key={ministry}
                onClick={() => {
                  setChipMinistries(prev => {
                    const next = new Set(prev);
                    if (next.has(ministry)) next.delete(ministry);
                    else next.add(ministry);
                    return next;
                  });
                }}
                className={`px-2 py-0.5 rounded-full text-[10px] font-medium transition-all border ${
                  chipMinistries.has(ministry)
                    ? "bg-purple-500/30 border-purple-500/50 text-purple-300"
                    : "bg-white/5 border-white/8 text-white/40 hover:text-white/60"
                }`}
              >
                {chipMinistries.has(ministry) && <Check size={8} className="inline mr-0.5" />}
                {ministry}
              </button>
            ))}
          </div>
          <div className="flex justify-end">
            <button
              onClick={() => handleSubmit(key)}
              disabled={isSubmitting || chipMinistries.size === 0 || justSubmitted}
              className="flex-shrink-0 w-9 h-9 rounded-lg flex items-center justify-center transition-all disabled:opacity-30"
              style={{
                backgroundColor: justSubmitted
                  ? "rgba(34, 197, 94, 0.3)"
                  : "rgba(168, 85, 247, 0.3)",
              }}
            >
              {isSubmitting ? (
                <Loader2 size={14} className="text-purple-300 animate-spin" />
              ) : justSubmitted ? (
                <Check size={14} className="text-green-400" />
              ) : (
                <Send size={14} className="text-purple-300" />
              )}
            </button>
          </div>
        </div>
      ) : key === "serviceTimes" ? (
        <div className="space-y-2">
          <ServiceTimesInput
            value={values[key]}
            onChange={(val) =>
              setValues((v) => ({ ...v, [key]: val }))
            }
            compact
          />
          <div className="flex justify-end">
            <button
              onClick={() => handleSubmit(key)}
              disabled={isSubmitting || !values[key]?.trim() || justSubmitted}
              className="flex-shrink-0 w-9 h-9 rounded-lg flex items-center justify-center transition-all disabled:opacity-30"
              style={{
                backgroundColor: justSubmitted
                  ? "rgba(34, 197, 94, 0.3)"
                  : "rgba(168, 85, 247, 0.3)",
              }}
            >
              {isSubmitting ? (
                <Loader2 size={14} className="text-purple-300 animate-spin" />
              ) : justSubmitted ? (
                <Check size={14} className="text-green-400" />
              ) : (
                <Send size={14} className="text-purple-300" />
              )}
            </button>
          </div>
        </div>
      ) : (
        <div className="flex gap-2">
          {type === "select" ? (
            <select
              value={values[key]}
              onChange={(e) =>
                setValues((v) => ({ ...v, [key]: e.target.value }))
              }
              className="flex-1 bg-white/8 rounded-lg px-3 py-2 text-white text-xs border border-white/10 focus:border-purple-500/50 focus:outline-none transition-colors appearance-none"
            >
              <option value="" className="bg-[#1E1040]">
                Select...
              </option>
              {DENOMINATION_GROUPS.filter(
                (g) => g.label !== "Other" && g.label !== "Non-denominational"
              ).map((g) => (
                <option
                  key={g.label}
                  value={g.label}
                  className="bg-[#1E1040]"
                >
                  {g.label}
                </option>
              ))}
              <option value="Non-denominational" className="bg-[#1E1040]">
                Non-denominational
              </option>
              <option value="Unknown" className="bg-[#1E1040]">
                Unknown / Other
              </option>
            </select>
          ) : (
            <input
              type={type}
              value={values[key]}
              onChange={(e) =>
                setValues((v) => ({ ...v, [key]: e.target.value }))
              }
              placeholder={placeholder}
              min={type === "number" ? 1 : undefined}
              max={type === "number" ? 50000 : undefined}
              className="flex-1 bg-white/8 rounded-lg px-3 py-2 text-white text-xs border border-white/10 focus:border-purple-500/50 focus:outline-none transition-colors placeholder:text-white/20"
            />
          )}
          <button
            onClick={() => handleSubmit(key)}
            disabled={
              isSubmitting ||
              !values[key]?.trim() ||
              justSubmitted
            }
            className="flex-shrink-0 w-9 h-9 rounded-lg flex items-center justify-center transition-all disabled:opacity-30"
            style={{
              backgroundColor: justSubmitted
                ? "rgba(34, 197, 94, 0.3)"
                : "rgba(168, 85, 247, 0.3)",
            }}
          >
            {isSubmitting ? (
              <Loader2
                size={14}
                className="text-purple-300 animate-spin"
              />
            ) : justSubmitted ? (
              <Check size={14} className="text-green-400" />
            ) : (
              <Send size={14} className="text-purple-300" />
            )}
          </button>
        </div>
      )}

      <VoteProgress consensus={fieldConsensus} />
    </div>
  );
}
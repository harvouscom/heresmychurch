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
  ShieldCheck,
  Pencil,
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
  { key: "website", label: "Website", icon: Globe, placeholder: "https://www.example.com", type: "text", group: "core" },
  { key: "address", label: "Address", icon: MapPin, placeholder: "123 Main St, City, State", type: "text", group: "core" },
  { key: "attendance", label: "Est. Avg. Weekly Attendance", icon: Users, placeholder: "Enter estimated weekly attendance", type: "number", group: "core" },
  { key: "denomination", label: "Denomination", icon: ChurchIcon, placeholder: "Select denomination", type: "select", group: "core" },
  { key: "serviceTimes", label: "Service Times", icon: Clock, placeholder: "e.g., Sunday 9am, 11am; Wed 7pm", type: "text", group: "extended" },
  { key: "languages", label: "Languages", icon: Languages, placeholder: "Select languages offered", type: "chips-languages", group: "extended" },
  { key: "ministries", label: "Ministries", icon: Heart, placeholder: "Select ministries offered", type: "chips-ministries", group: "extended" },
  { key: "pastorName", label: "Lead Pastor", icon: User, placeholder: "Pastor John Smith", type: "text", group: "extended" },
  { key: "phone", label: "Phone", icon: Phone, placeholder: "(555) 123-4567", type: "text", group: "extended" },
  { key: "email", label: "Email", icon: Mail, placeholder: "info@church.org", type: "text", group: "extended" },
];

// Helper to determine if a field is "empty" on the church
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

// Get the current display value for a field
function getCurrentValue(church: Church, field: EditableField): string {
  switch (field) {
    case "website": return church.website || "";
    case "address": return [church.address, church.city, church.state].filter(Boolean).join(", ");
    case "attendance": return church.attendance ? String(church.attendance) : "";
    case "denomination": return church.denomination || "";
    case "serviceTimes": return church.serviceTimes || "";
    case "languages": return (church.languages || []).join(", ");
    case "ministries": return (church.ministries || []).join(", ");
    case "pastorName": return church.pastorName || "";
    case "phone": return church.phone || "";
    case "email": return church.email || "";
  }
}

export function SuggestEditForm({ church, onClose }: SuggestEditFormProps) {
  const [consensus, setConsensus] = useState<Record<string, SuggestionConsensus> | null>(null);
  const [myVotes, setMyVotes] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  // Track which fields are in "edit mode" (user wants to submit their own value)
  const [editingFields, setEditingFields] = useState<Set<string>>(new Set());
  const [values, setValues] = useState<Record<string, string>>({});
  // Chip selections
  const [chipLanguages, setChipLanguages] = useState<Set<string>>(new Set(church.languages || []));
  const [chipMinistries, setChipMinistries] = useState<Set<string>>(new Set(church.ministries || []));

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

  const handleSubmit = async (field: EditableField, value?: string) => {
    const val = (value ?? values[field])?.trim();
    if (!val) return;

    setSubmitting(field);
    setError(null);

    try {
      const result = await submitSuggestion(church.id, field, val);
      if (result.allFields) {
        setConsensus(result.allFields);
      }
      setSubmitted((prev) => new Set([...prev, field]));
      setMyVotes((prev) => ({ ...prev, [field]: val }));
      // Close edit mode after successful submit
      setEditingFields((prev) => {
        const next = new Set(prev);
        next.delete(field);
        return next;
      });

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

  // "Verify" = submit the top suggestion's value as your own vote
  const handleVerify = async (field: EditableField, topValue: string) => {
    await handleSubmit(field, topValue);
  };

  const emptyCount = FIELD_CONFIG.filter(f => isFieldEmpty(church, f.key)).length;

  return (
    <div
      className="h-full flex flex-col overflow-hidden"
      style={{ backgroundColor: "#1E1040", fontFamily: "'Livvic', sans-serif" }}
    >
      {/* Header */}
      <div className="flex-shrink-0 px-5 pt-5 pb-4 border-b border-white/10">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[10px] uppercase tracking-wider text-purple-400/70 font-semibold">
                Community Corrections
              </span>
            </div>
            <h2 className="text-white font-semibold text-[22px] leading-tight truncate">
              {church.name}
            </h2>
            <p className="text-white/40 text-[11px] mt-1.5 leading-relaxed">
              Verify existing suggestions or submit your own.
              Changes apply when{" "}
              <span className="text-purple-400 font-semibold">3 people</span>{" "}
              agree.
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
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 size={20} className="text-purple-400 animate-spin" />
          </div>
        ) : (
          <>
            {/* Core fields */}
            {FIELD_CONFIG.filter(f => f.group === "core").map((fieldConfig) => (
              <FieldCard
                key={fieldConfig.key}
                fieldConfig={fieldConfig}
                church={church}
                consensus={consensus}
                myVotes={myVotes}
                submitting={submitting}
                submitted={submitted}
                isEditing={editingFields.has(fieldConfig.key)}
                onStartEdit={() => {
                  setEditingFields(prev => new Set(prev).add(fieldConfig.key));
                  // Pre-fill with current value
                  setValues(v => ({ ...v, [fieldConfig.key]: getCurrentValue(church, fieldConfig.key) }));
                }}
                onCancelEdit={() => {
                  setEditingFields(prev => {
                    const next = new Set(prev);
                    next.delete(fieldConfig.key);
                    return next;
                  });
                }}
                onVerify={(topValue) => handleVerify(fieldConfig.key, topValue)}
                onSubmitEdit={() => handleSubmit(fieldConfig.key)}
                values={values}
                setValues={setValues}
                chipLanguages={chipLanguages}
                setChipLanguages={setChipLanguages}
                chipMinistries={chipMinistries}
                setChipMinistries={setChipMinistries}
              />
            ))}

            {/* Divider */}
            <div className="flex items-center gap-3 py-1">
              <div className="flex-1 h-px bg-white/8" />
              <span className="text-[9px] uppercase tracking-wider text-white/25 font-semibold">
                Service Details & Contact
              </span>
              <div className="flex-1 h-px bg-white/8" />
            </div>

            {/* Extended fields */}
            {FIELD_CONFIG.filter(f => f.group === "extended").map((fieldConfig) => (
              <FieldCard
                key={fieldConfig.key}
                fieldConfig={fieldConfig}
                church={church}
                consensus={consensus}
                myVotes={myVotes}
                submitting={submitting}
                submitted={submitted}
                isEditing={editingFields.has(fieldConfig.key)}
                onStartEdit={() => {
                  setEditingFields(prev => new Set(prev).add(fieldConfig.key));
                  setValues(v => ({ ...v, [fieldConfig.key]: getCurrentValue(church, fieldConfig.key) }));
                }}
                onCancelEdit={() => {
                  setEditingFields(prev => {
                    const next = new Set(prev);
                    next.delete(fieldConfig.key);
                    return next;
                  });
                }}
                onVerify={(topValue) => handleVerify(fieldConfig.key, topValue)}
                onSubmitEdit={() => handleSubmit(fieldConfig.key)}
                values={values}
                setValues={setValues}
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

// ── Field Card Component ──
// Shows: current value, top suggestion with Verify button, Edit button to open input
function FieldCard({
  fieldConfig,
  church,
  consensus,
  myVotes,
  submitting,
  submitted,
  isEditing,
  onStartEdit,
  onCancelEdit,
  onVerify,
  onSubmitEdit,
  values,
  setValues,
  chipLanguages,
  setChipLanguages,
  chipMinistries,
  setChipMinistries,
}: {
  fieldConfig: (typeof FIELD_CONFIG)[number];
  church: Church;
  consensus: Record<string, SuggestionConsensus> | null;
  myVotes: Record<string, string>;
  submitting: string | null;
  submitted: Set<string>;
  isEditing: boolean;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onVerify: (topValue: string) => void;
  onSubmitEdit: () => void;
  values: Record<string, string>;
  setValues: React.Dispatch<React.SetStateAction<Record<string, string>>>;
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
  const empty = isFieldEmpty(church, key);
  const currentValue = getCurrentValue(church, key);

  // Top suggestion from existing submissions
  const topSubmission = fieldConsensus?.submissions?.[0];
  const hasExistingSuggestion = topSubmission && fieldConsensus && fieldConsensus.votes > 0 && !fieldConsensus.approved;

  return (
    <div
      className={`rounded-xl p-3.5 border transition-colors ${
        empty
          ? "bg-pink-500/5 border-pink-500/15"
          : "bg-white/[0.03] border-white/6"
      }`}
    >
      {/* Field header */}
      <div className="flex items-center gap-2 mb-2">
        <Icon size={13} className={empty ? "text-pink-400" : "text-purple-400"} />
        <span className="text-[10px] uppercase tracking-wider text-white/40 font-semibold">
          {label}
        </span>
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
        {empty && !fieldConsensus?.approved && !hasVoted && (
          <span className="ml-auto text-[9px] px-1.5 py-0.5 rounded-full bg-pink-500/15 text-pink-400 font-semibold">
            MISSING
          </span>
        )}
      </div>

      {/* Current value display */}
      {currentValue && !empty && (
        <div className="mb-2.5 px-2.5 py-1.5 rounded-lg bg-white/[0.04]">
          <p className="text-[10px] text-white/30 mb-0.5">Current value</p>
          <p className="text-white/60 text-xs truncate">{currentValue}</p>
        </div>
      )}

      {/* Approved consensus value */}
      {fieldConsensus?.approved && fieldConsensus.value && (
        <div className="mb-2 px-2.5 py-2 rounded-lg bg-green-500/8 border border-green-500/15">
          <div className="flex items-center gap-1.5 mb-1">
            <Check size={10} className="text-green-400" />
            <span className="text-[10px] text-green-400/70 font-medium">Community approved</span>
          </div>
          <p className="text-green-300/90 text-xs">{fieldConsensus.value}</p>
        </div>
      )}

      {/* Just submitted feedback */}
      {justSubmitted && (
        <div className="flex items-center gap-2 py-2 px-2.5 rounded-lg bg-green-500/10 border border-green-500/15 mb-2">
          <Check size={12} className="text-green-400" />
          <span className="text-green-400 text-xs font-medium">Vote recorded!</span>
        </div>
      )}

      {/* Not approved: show suggestions + verify/edit */}
      {!fieldConsensus?.approved && !justSubmitted && (
        <>
          {/* Existing suggestions to verify */}
          {hasExistingSuggestion && !isEditing && (
            <div className="space-y-1.5 mb-2.5">
              {fieldConsensus.submissions.map((s, i) => (
                <div
                  key={i}
                  className="flex items-center gap-2 px-2.5 py-2 rounded-lg bg-white/[0.04] border border-white/6"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-white/70 text-xs truncate">"{s.value}"</p>
                    <div className="flex items-center gap-2 mt-1">
                      {/* Mini progress */}
                      <div className="flex-1 h-1 rounded-full bg-white/8 overflow-hidden max-w-[60px]">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{
                            width: `${Math.min((s.count / (fieldConsensus.needed)) * 100, 100)}%`,
                            background: "linear-gradient(90deg, #a855f7, #ec4899)",
                          }}
                        />
                      </div>
                      <span className="text-white/30 text-[10px]">
                        {s.count}/{fieldConsensus.needed}
                      </span>
                    </div>
                  </div>
                  {/* Verify button (agree with this value) */}
                  {myVotes[key]?.trim() === s.value.trim() ? (
                    <div className="flex items-center gap-1 px-2 py-1 rounded-lg bg-purple-500/10 flex-shrink-0">
                      <Check size={10} className="text-purple-400" />
                      <span className="text-purple-400 text-[10px] font-medium">Your vote</span>
                    </div>
                  ) : (
                    <button
                      onClick={() => onVerify(s.value)}
                      disabled={isSubmitting}
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-pink-500/15 text-pink-300 text-[10px] font-medium hover:bg-pink-500/25 transition-colors disabled:opacity-50 flex-shrink-0 cursor-pointer"
                    >
                      {isSubmitting ? (
                        <Loader2 size={10} className="animate-spin" />
                      ) : (
                        <ShieldCheck size={10} />
                      )}
                      Verify
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Action buttons: Edit (to show input) */}
          {!isEditing && (
            <button
              onClick={onStartEdit}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-500/12 text-purple-300 text-[11px] font-medium hover:bg-purple-500/20 transition-colors cursor-pointer"
            >
              <Pencil size={10} />
              {hasExistingSuggestion ? "Submit different value" : (empty ? "Add value" : "Suggest correction")}
            </button>
          )}

          {/* Edit mode: input form */}
          {isEditing && (
            <div className="space-y-2 mt-1">
              <EditInput
                fieldKey={key}
                type={type}
                placeholder={placeholder}
                values={values}
                setValues={setValues}
                chipLanguages={chipLanguages}
                setChipLanguages={setChipLanguages}
                chipMinistries={chipMinistries}
                setChipMinistries={setChipMinistries}
              />
              <div className="flex items-center gap-2">
                <button
                  onClick={onSubmitEdit}
                  disabled={isSubmitting || !values[key]?.trim()}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-500/20 text-purple-300 text-[11px] font-medium hover:bg-purple-500/30 transition-colors disabled:opacity-30 cursor-pointer"
                >
                  {isSubmitting ? (
                    <Loader2 size={10} className="animate-spin" />
                  ) : (
                    <Send size={10} />
                  )}
                  Submit
                </button>
                <button
                  onClick={onCancelEdit}
                  className="px-3 py-1.5 rounded-lg text-white/40 text-[11px] font-medium hover:bg-white/5 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Edit Input ──
// Renders the appropriate input control for a field type
function EditInput({
  fieldKey,
  type,
  placeholder,
  values,
  setValues,
  chipLanguages,
  setChipLanguages,
  chipMinistries,
  setChipMinistries,
}: {
  fieldKey: string;
  type: string;
  placeholder: string;
  values: Record<string, string>;
  setValues: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  chipLanguages: Set<string>;
  setChipLanguages: React.Dispatch<React.SetStateAction<Set<string>>>;
  chipMinistries: Set<string>;
  setChipMinistries: React.Dispatch<React.SetStateAction<Set<string>>>;
}) {
  if (type === "chips-languages") {
    return (
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
            className={`px-2 py-0.5 rounded-full text-[10px] font-medium transition-all border cursor-pointer ${
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
    );
  }

  if (type === "chips-ministries") {
    return (
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
            className={`px-2 py-0.5 rounded-full text-[10px] font-medium transition-all border cursor-pointer ${
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
    );
  }

  if (fieldKey === "serviceTimes") {
    return (
      <ServiceTimesInput
        value={values[fieldKey] || ""}
        onChange={(val) => setValues((v) => ({ ...v, [fieldKey]: val }))}
        compact
      />
    );
  }

  if (type === "select") {
    return (
      <select
        value={values[fieldKey] || ""}
        onChange={(e) => setValues((v) => ({ ...v, [fieldKey]: e.target.value }))}
        className="w-full bg-white/8 rounded-lg px-3 py-2 text-white text-xs border border-white/10 focus:border-purple-500/50 focus:outline-none transition-colors appearance-none"
      >
        <option value="" className="bg-[#1E1040]">Select...</option>
        {DENOMINATION_GROUPS.filter((g) => g.label !== "Unspecified").map((g) => (
          <option key={g.label} value={g.label} className="bg-[#1E1040]">{g.label}</option>
        ))}
        <option value="Unknown" className="bg-[#1E1040]">I don't know</option>
      </select>
    );
  }

  return (
    <input
      type={type === "number" ? "number" : "text"}
      value={values[fieldKey] || ""}
      onChange={(e) => setValues((v) => ({ ...v, [fieldKey]: e.target.value }))}
      placeholder={placeholder}
      min={type === "number" ? 1 : undefined}
      max={type === "number" ? 50000 : undefined}
      className="w-full bg-white/8 rounded-lg px-3 py-2 text-white text-xs border border-white/10 focus:border-purple-500/50 focus:outline-none transition-colors placeholder:text-white/20"
    />
  );
}
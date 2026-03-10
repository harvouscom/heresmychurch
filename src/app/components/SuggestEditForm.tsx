import type { Church } from "./church-data";
import { DENOMINATION_GROUPS, COMMON_LANGUAGES, COMMON_MINISTRIES } from "./church-data";
import { submitSuggestion } from "./api";
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
  Pencil,
} from "lucide-react";
import { useState, useEffect } from "react";
import { ServiceTimesInput } from "./ServiceTimesInput";
import { AddressInput, serializeAddress, parseAddressValue } from "./AddressInput";
import { geocodeAddress } from "./AddChurchForm";
import { normalizePhone } from "./ui/utils";

interface SuggestEditFormProps {
  church: Church;
  onClose: () => void;
  focusField?: string | null;
  onChurchUpdated?: () => void;
}

type EditableField = "website" | "address" | "attendance" | "denomination" | "serviceTimes" | "languages" | "ministries" | "pastorName" | "phone" | "email";

const FIELD_CONFIG: {
  key: EditableField;
  label: string;
  icon: typeof Globe;
  placeholder: string;
  type: "text" | "number" | "select" | "address" | "chips-languages" | "chips-ministries";
  group: "core" | "extended";
}[] = [
  { key: "website", label: "Website", icon: Globe, placeholder: "https://www.example.com", type: "text", group: "core" },
  { key: "address", label: "Address", icon: MapPin, placeholder: "Street, city, state", type: "address", group: "core" },
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

// Get the current display value for a field (for address, serialized JSON for AddressInput)
function getCurrentValue(church: Church, field: EditableField): string {
  switch (field) {
    case "website": return church.website || "";
    case "address": return serializeAddress({
      address: church.address || "",
      city: church.city || "",
      state: church.state || "",
    });
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

export function SuggestEditForm({ church, onClose, focusField, onChurchUpdated }: SuggestEditFormProps) {
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

  // Auto-focus on a specific field when focusField prop is set
  useEffect(() => {
    if (focusField) {
      setEditingFields(new Set([focusField]));
      setValues(v => ({ ...v, [focusField]: getCurrentValue(church, focusField as EditableField) }));
      setTimeout(() => {
        document.getElementById(`field-${focusField}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 100);
    }
  }, [focusField]);

  const handleSubmit = async (field: EditableField, value?: string) => {
    let val = (value ?? values[field])?.trim();
    if (!val) return;
    if (field === "phone") {
      val = normalizePhone(val);
      if (!val) return;
    }

    setSubmitting(field);
    setError(null);

    // For address, geocode so map pin and nearby list stay correct
    if (field === "address") {
      const parts = parseAddressValue(val);
      if (parts.address && parts.city && parts.state) {
        try {
          const coords = await geocodeAddress(parts.address, parts.city, parts.state);
          if (coords) {
            val = serializeAddress({ ...parts, lat: coords.lat, lng: coords.lng });
          } else {
            setError("We couldn't find that address on the map. Your correction will still be saved; location may need a manual update later.");
            // Continue to submit without coords
          }
        } catch {
          setError("We couldn't look up that address. Your correction will still be saved.");
          // Continue to submit without coords
        }
      }
    }

    try {
      await submitSuggestion(church.id, field, val);
      setSubmitted((prev) => new Set([...prev, field]));
      // Close edit mode after successful submit
      setEditingFields((prev) => {
        const next = new Set(prev);
        next.delete(field);
        return next;
      });
      onChurchUpdated?.();

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
                Update Church Info
              </span>
            </div>
            <h2 className="text-white font-semibold text-[22px] leading-tight truncate">
              {church.name}
            </h2>
            <p className="text-white/40 text-[11px] mt-1.5 leading-relaxed">
              Help keep this church&apos;s information accurate and up to date.
              {emptyCount > 0 && (
                <span className="text-white">
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
            {/* Core fields */}
            {FIELD_CONFIG.filter(f => f.group === "core").map((fieldConfig) => (
              <FieldCard
                key={fieldConfig.key}
                fieldConfig={fieldConfig}
                church={church}

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

        {/* Info note */}
        <div className="pt-3 border-t border-white/5 text-balance">
          <p className="text-white/25 text-[10px] leading-relaxed text-center">
            Your edits are applied immediately. You can update each field
            once per day.
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Field Card Component ──
// Shows: current value and edit button to open input
function FieldCard({
  fieldConfig,
  church,
  submitting,
  submitted,
  isEditing,
  onStartEdit,
  onCancelEdit,
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
  submitting: string | null;
  submitted: Set<string>;
  isEditing: boolean;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSubmitEdit: () => void;
  values: Record<string, string>;
  setValues: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  chipLanguages: Set<string>;
  setChipLanguages: React.Dispatch<React.SetStateAction<Set<string>>>;
  chipMinistries: Set<string>;
  setChipMinistries: React.Dispatch<React.SetStateAction<Set<string>>>;
}) {
  const { key, label, icon: Icon, placeholder, type } = fieldConfig;
  const isSubmitting = submitting === key;
  const justSubmitted = submitted.has(key);
  const empty = isFieldEmpty(church, key);
  const currentValue = getCurrentValue(church, key);
  const displayValue = key === "address" ? [church.address, church.city, church.state].filter(Boolean).join(", ") : currentValue;
  const canSubmitAddress = key !== "address" || (() => {
    const p = parseAddressValue(values[key] ?? "");
    return !!(p.address.trim() && p.city.trim() && p.state.trim());
  })();

  return (
    <div
      id={`field-${key}`}
      className={`rounded-xl p-3.5 border transition-colors ${
        empty
          ? "bg-pink-500/5 border-pink-500/15"
          : "bg-white/[0.03] border-white/6"
      }`}
    >
      {/* Field header */}
      <div className="flex items-center gap-2 mb-2">
        <Icon size={13} className={empty ? "text-white" : "text-purple-400"} />
        <span className="text-[10px] uppercase tracking-wider text-white/40 font-semibold">
          {label}
        </span>
        {empty && (
          <span className="ml-auto text-[9px] px-1.5 py-0.5 rounded-full bg-pink-500/15 text-white font-medium">
            MISSING
          </span>
        )}
      </div>

      {/* Current value display */}
      {displayValue && !empty && (
        <div className="mb-2.5 px-2.5 py-1.5 rounded-lg bg-white/[0.04]">
          <p className="text-[10px] text-white/30 mb-0.5">Current value</p>
          <p className="text-white/60 text-xs truncate">{displayValue}</p>
        </div>
      )}

      {/* Just submitted feedback */}
      {justSubmitted && (
        <div className="flex items-center gap-2 py-2 px-2.5 rounded-lg bg-green-500/10 border border-green-500/15 mb-2">
          <Check size={12} className="text-green-400" />
          <span className="text-green-400 text-xs font-medium">Updated!</span>
        </div>
      )}

      {/* Edit controls */}
      {!justSubmitted && (
        <>
          {/* Action buttons: Edit (to show input) */}
          {!isEditing && (
            <button
              onClick={onStartEdit}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-500/12 text-purple-300 text-[11px] font-medium hover:bg-purple-500/20 transition-colors cursor-pointer"
            >
              <Pencil size={10} />
              {empty ? "Add value" : "Edit"}
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
                  disabled={isSubmitting || (key === "address" ? !canSubmitAddress : !values[key]?.trim())}
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

  if (fieldKey === "address") {
    return (
      <AddressInput
        value={values[fieldKey] || ""}
        onChange={(val) => setValues((v) => ({ ...v, [fieldKey]: val }))}
        compact
      />
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
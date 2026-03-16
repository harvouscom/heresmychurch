import type { Church } from "./church-data";
import { DENOMINATION_GROUPS, COMMON_LANGUAGES, COMMON_MINISTRIES } from "./church-data";
import { submitSuggestion, searchChurches } from "./api";
import type { SearchResult } from "./api";
import {
  Send,
  Check,
  Users,
  Globe,
  MapPin,
  Church as ChurchIcon,
  AlertCircle,
  Clock,
  Languages,
  Heart,
  User,
  Phone,
  Mail,
  Pencil,
  Link2,
  Search,
} from "lucide-react";
import { ThreeDotLoader } from "./ThreeDotLoader";
import { useState, useEffect, useRef, useMemo } from "react";
import { ServiceTimesInput } from "./ServiceTimesInput";
import { AddressInput, serializeAddress, parseAddressValue } from "./AddressInput";
import { geocodeAddress } from "./AddChurchForm";
import { normalizePhone } from "./ui/utils";
import { CloseButton } from "./ui/close-button";
import { STATE_NAMES, STATE_NEIGHBORS } from "./map-constants";
import { matchQueryToChurch } from "./church-search-match";

function normalizeStateAbbrev(churchState: string | undefined, churchId: string): string {
  const s = (churchState ?? "").trim();
  const u = s.toUpperCase();
  if (u.length === 2) return u;
  const byName = Object.entries(STATE_NAMES).find(([, name]) => name.toUpperCase() === u);
  if (byName) return byName[0];
  if (!churchId?.trim()) return "";
  const id = churchId.trim();
  if (id.startsWith("community-")) {
    const parts = id.split("-");
    const abbr = (parts[1] ?? "").toUpperCase().slice(0, 2);
    return abbr.length === 2 ? abbr : "";
  }
  const dash = id.indexOf("-");
  if (dash === 2) return id.slice(0, 2).toUpperCase();
  return "";
}

interface SuggestEditFormProps {
  church: Church;
  allChurches?: Church[];
  onClose: () => void;
  focusField?: string | null;
  onChurchUpdated?: () => void;
  /** Called when user submits an edit that needs moderation (e.g. so parent can refetch pending list) */
  onPendingSubmitted?: () => void;
  /** Field names with pending suggestions from server (persists across close/reopen, prevents duplicate submit) */
  pendingFieldsForChurch?: string[];
}

type EditableField = "name" | "website" | "address" | "attendance" | "denomination" | "serviceTimes" | "languages" | "ministries" | "pastorName" | "phone" | "email" | "homeCampusId" | "reportClosed" | "reportDuplicate";

const REPORT_CLOSED_LABEL = "Church has closed or doesn't exist anymore";
const REPORT_DUPLICATE_LABEL = "This church is a duplicate";

const FIELD_CONFIG: {
  key: EditableField;
  label: string;
  icon: typeof Globe;
  placeholder: string;
  type: "text" | "number" | "select" | "address" | "chips-languages" | "chips-ministries" | "main-campus-search";
  group: "core" | "extended";
}[] = [
  { key: "name", label: "Church Name", icon: ChurchIcon, placeholder: "e.g., Grace Community Church", type: "text", group: "core" },
  { key: "website", label: "Website", icon: Globe, placeholder: "https://www.example.com", type: "text", group: "core" },
  { key: "address", label: "Address", icon: MapPin, placeholder: "Street, city, state", type: "address", group: "core" },
  { key: "homeCampusId", label: "Link to main campus", icon: Link2, placeholder: "Search for the main campus...", type: "main-campus-search", group: "core" },
  { key: "attendance", label: "Est. Avg. Weekly Attendance", icon: Users, placeholder: "Enter estimated weekly attendance", type: "number", group: "core" },
  { key: "denomination", label: "Denomination", icon: ChurchIcon, placeholder: "Select denomination", type: "select", group: "core" },
  { key: "serviceTimes", label: "Service Times", icon: Clock, placeholder: "e.g., Sunday 9am, 11am; Wed 7pm", type: "text", group: "extended" },
  { key: "languages", label: "Languages", icon: Languages, placeholder: "Select languages offered", type: "chips-languages", group: "extended" },
  { key: "ministries", label: "Ministries", icon: Heart, placeholder: "Select ministries offered", type: "chips-ministries", group: "extended" },
  { key: "pastorName", label: "Pastor Name", icon: User, placeholder: "Pastor John Smith", type: "text", group: "extended" },
  { key: "phone", label: "Phone", icon: Phone, placeholder: "(555) 123-4567", type: "text", group: "extended" },
  { key: "email", label: "Email", icon: Mail, placeholder: "info@church.org", type: "text", group: "extended" },
];

// Fields that are optional — don't count toward "missing" and show "Optional" badge when empty
const OPTIONAL_FIELDS: EditableField[] = ["phone", "email", "homeCampusId"];

function isOptionalField(field: EditableField): boolean {
  return OPTIONAL_FIELDS.includes(field);
}

// Helper to determine if a field is "empty" on the church
function isFieldEmpty(church: Church, field: EditableField): boolean {
  switch (field) {
    case "name": return !church.name;
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
    case "homeCampusId": return !church.homeCampusId;
    case "reportClosed": return false;
    case "reportDuplicate": return false;
  }
}

// Get the current display value for a field (for address, serialized JSON for AddressInput)
function getCurrentValue(church: Church, field: EditableField): string {
  switch (field) {
    case "name": return church.name || "";
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
    case "homeCampusId": return church.homeCampusId || "";
    case "reportClosed": return "";
    case "reportDuplicate": return "";
  }
}

export function SuggestEditForm({ church, allChurches, onClose, focusField, onChurchUpdated, onPendingSubmitted, pendingFieldsForChurch = [] }: SuggestEditFormProps) {
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState<Set<string>>(new Set());
  const [pendingModeration, setPendingModeration] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [showReportClosedConfirm, setShowReportClosedConfirm] = useState(false);
  const [showDuplicatePicker, setShowDuplicatePicker] = useState(false);
  const [selectedCanonicalChurchId, setSelectedCanonicalChurchId] = useState<string | null>(null);
  const [showDuplicateConfirm, setShowDuplicateConfirm] = useState(false);

  // Server-backed + just-submitted pending: persists across close/reopen and prevents duplicate submissions
  const effectivePending = useMemo(
    () => new Set<string>([...pendingModeration, ...pendingFieldsForChurch]),
    [pendingModeration, pendingFieldsForChurch]
  );
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
      const result = await submitSuggestion(church.id, field, val);
      setSubmitted((prev) => new Set([...prev, field]));
      // Close edit mode after successful submit
      setEditingFields((prev) => {
        const next = new Set(prev);
        next.delete(field);
        return next;
      });
      if (result.needsModeration) {
        setPendingModeration((prev) => new Set([...prev, field]));
        onPendingSubmitted?.();
      } else {
        onChurchUpdated?.();
      }

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

  const emptyCount = FIELD_CONFIG.filter(f => isFieldEmpty(church, f.key) && !isOptionalField(f.key)).length;

  return (
    <div
      className="h-full flex flex-col overflow-hidden rounded-[20px]"
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
            <h2 className="text-white font-semibold text-[22px] leading-tight line-clamp-2 text-pretty">
              {church.name}
            </h2>
            <p className="text-white/60 text-[11px] mt-1.5 leading-relaxed">
              Help keep this church&apos;s information accurate and up to date.
              {emptyCount > 0 && (
                <span className="text-white">
                  {" "}This church is missing {emptyCount} {emptyCount === 1 ? "field" : "fields"} — help fill them in!
                </span>
              )}
            </p>
          </div>
          <CloseButton onClick={onClose} size="md" />
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
                allChurches={allChurches}
                submitting={submitting}
                submitted={submitted}
                pendingModeration={effectivePending}
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
                onSubmitWithValue={fieldConfig.key === "homeCampusId" ? (val) => handleSubmit("homeCampusId", val) : undefined}
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
              <span className="text-[9px] uppercase tracking-wider text-white/55 font-semibold">
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
                allChurches={allChurches}
                submitting={submitting}
                submitted={submitted}
                pendingModeration={effectivePending}
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
                onSubmitWithValue={fieldConfig.key === "homeCampusId" ? (val) => handleSubmit("homeCampusId", val) : undefined}
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

            {effectivePending.size > 0 && (
              <div className="flex items-center gap-2 rounded-lg p-3 bg-amber-500/10 border border-amber-500/20">
                <Clock size={14} className="text-amber-400 flex-shrink-0" />
                <p className="text-amber-300/80 text-xs">
                  Changes to {Array.from(effectivePending).map((f) => f === "reportClosed" ? REPORT_CLOSED_LABEL : f === "reportDuplicate" ? REPORT_DUPLICATE_LABEL : FIELD_CONFIG.find(c => c.key === f)?.label ?? f).join(", ")} require review and will be applied once approved.
                </p>
              </div>
            )}

            {/* Church closed / doesn't exist — requires review */}
            <div className="pt-2 border-t border-white/5 space-y-2">
              {effectivePending.has("reportClosed") ? (
                <div className="flex items-center gap-2 rounded-lg p-3 bg-amber-500/10 border border-amber-500/20">
                  <Clock size={14} className="text-amber-400 flex-shrink-0" />
                  <p className="text-amber-300/80 text-xs">
                    Report submitted — pending review. This church will be removed from the list if approved.
                  </p>
                </div>
              ) : submitting === "reportClosed" ? (
                <div className="flex items-center gap-2 rounded-lg p-3 bg-white/5 border border-white/10">
                  <ThreeDotLoader className="text-white/60" />
                  <p className="text-white/60 text-xs">Submitting…</p>
                </div>
              ) : showReportClosedConfirm ? (
                <div className="rounded-xl bg-red-500/10 border border-red-500/20 p-4 space-y-3">
                  <p className="text-red-200/90 text-sm">
                    Are you sure? This will submit a report for review. If approved, this church will be removed from the map.
                  </p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setShowReportClosedConfirm(false)}
                      className="flex-1 px-3 py-2 rounded-lg text-sm font-medium text-white/80 bg-white/10 hover:bg-white/15 border border-white/10 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        setShowReportClosedConfirm(false);
                        setSubmitting("reportClosed");
                        setError(null);
                        try {
                          const result = await submitSuggestion(church.id, "reportClosed", "closed");
                          setPendingModeration((prev) => new Set([...prev, "reportClosed"]));
                          onPendingSubmitted?.();
                          if (!result.needsModeration) onChurchUpdated?.();
                        } catch (err: any) {
                          setError(err.message ?? "Failed to submit report");
                        } finally {
                          setSubmitting(null);
                        }
                      }}
                      className="flex-1 px-3 py-2 rounded-lg text-sm font-medium text-white bg-red-600 hover:bg-red-500 transition-colors"
                    >
                      Yes, submit report
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowReportClosedConfirm(true)}
                  className="w-full flex items-center gap-2 px-4 py-3 rounded-xl bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 transition-colors text-left"
                >
                  <AlertCircle size={16} className="text-red-400 flex-shrink-0" />
                  <span className="text-red-300/90 text-sm font-medium">
                    {REPORT_CLOSED_LABEL}
                  </span>
                </button>
              )}
            </div>

            {/* This church is a duplicate — requires review */}
            <div className="pt-2 border-t border-white/5">
              {effectivePending.has("reportDuplicate") ? (
                <div className="flex items-center gap-2 rounded-lg p-3 bg-amber-500/10 border border-amber-500/20">
                  <Clock size={14} className="text-amber-400 flex-shrink-0" />
                  <p className="text-amber-300/80 text-xs">
                    Duplicate report submitted — pending review. This church will be removed from the list if approved.
                  </p>
                </div>
              ) : submitting === "reportDuplicate" ? (
                <div className="flex items-center gap-2 rounded-lg p-3 bg-white/5 border border-white/10">
                  <ThreeDotLoader className="text-white/60" />
                  <p className="text-white/60 text-xs">Submitting…</p>
                </div>
              ) : showDuplicateConfirm && selectedCanonicalChurchId ? (
                <div className="rounded-xl bg-amber-500/10 border border-amber-500/20 p-4 space-y-3">
                  <p className="text-amber-200/90 text-sm">
                    Are you sure? This will report that <strong>{church.name}</strong> is a duplicate of{" "}
                    <strong>{allChurches?.find((c) => c.id === selectedCanonicalChurchId)?.name ?? "the selected church"}</strong>.
                    The report will be reviewed.
                  </p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setShowDuplicateConfirm(false);
                        setSelectedCanonicalChurchId(null);
                      }}
                      className="flex-1 px-3 py-2 rounded-lg text-sm font-medium text-white/80 bg-white/10 hover:bg-white/15 border border-white/10 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        const canonicalId = selectedCanonicalChurchId;
                        setShowDuplicateConfirm(false);
                        setSelectedCanonicalChurchId(null);
                        setSubmitting("reportDuplicate");
                        setError(null);
                        try {
                          const result = await submitSuggestion(church.id, "reportDuplicate", canonicalId);
                          setPendingModeration((prev) => new Set([...prev, "reportDuplicate"]));
                          onPendingSubmitted?.();
                          if (!result.needsModeration) onChurchUpdated?.();
                        } catch (err: any) {
                          setError(err.message ?? "Failed to submit report");
                        } finally {
                          setSubmitting(null);
                        }
                      }}
                      className="flex-1 px-3 py-2 rounded-lg text-sm font-medium text-white bg-amber-600 hover:bg-amber-500 transition-colors"
                    >
                      Yes, submit report
                    </button>
                  </div>
                </div>
              ) : showDuplicatePicker ? (
                <div className="rounded-xl bg-amber-500/10 border border-amber-500/20 p-3 space-y-2">
                  <p className="text-amber-200/90 text-xs font-medium">Search for the church that is already in the list (the one to keep):</p>
                  <MainCampusSearch
                    currentChurchId={church.id}
                    churchState={church.state ?? ""}
                    allChurches={allChurches}
                    onSelect={(churchId) => {
                      setSelectedCanonicalChurchId(churchId);
                      setShowDuplicatePicker(false);
                      setShowDuplicateConfirm(true);
                    }}
                    submitting={submitting === "reportDuplicate"}
                    onCancel={() => setShowDuplicatePicker(false)}
                  />
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowDuplicatePicker(true)}
                  className="w-full flex items-center gap-2 px-4 py-3 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 transition-colors text-left"
                >
                  <Link2 size={16} className="text-amber-400 flex-shrink-0" />
                  <span className="text-amber-300/90 text-sm font-medium">
                    {REPORT_DUPLICATE_LABEL}
                  </span>
                </button>
              )}
            </div>

        {/* Info note */}
        <div className="pt-3 border-t border-white/5 text-pretty">
          <p className="text-white/55 text-[10px] leading-relaxed text-center">
            Most edits are applied immediately. Changes to name, website, address, reporting a church as closed, or reporting a duplicate require a brief review.
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Main campus search (for homeCampusId field) ──
function MainCampusSearch({
  currentChurchId,
  churchState,
  allChurches,
  onSelect,
  submitting,
  onCancel,
}: {
  currentChurchId: string;
  churchState: string;
  allChurches?: Church[];
  onSelect: (churchId: string) => void;
  submitting: boolean;
  onCancel: () => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<(SearchResult & { _tier: number })[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stateNorm = normalizeStateAbbrev(churchState, currentChurchId);

  const priorityStates = (() => {
    if (!stateNorm) return undefined;
    const neighbors = STATE_NEIGHBORS[stateNorm] || [];
    const list = Array.from(new Set([stateNorm, ...neighbors].filter((s) => s.length === 2)));
    return list.length ? list : undefined;
  })();

  // Local search through already-loaded state churches (instant, complete)
  const localSearch = (q: string): (SearchResult & { _tier: number })[] => {
    if (!allChurches?.length || !q) return [];
    const scored: { church: Church; score: number }[] = [];
    for (const c of allChurches) {
      if (c.id === currentChurchId) continue;
      const { matched, score } = matchQueryToChurch(q, {
        name: c.name,
        city: c.city,
        denomination: c.denomination,
        address: c.address || "",
      });
      if (matched) {
        scored.push({ church: c, score });
      }
    }

    scored.sort((a, b) => {
      const aName = (a.church.name || "").toLowerCase();
      const bName = (b.church.name || "").toLowerCase();
      if (b.score !== a.score) return b.score - a.score;
      return aName.localeCompare(bName);
    });

    return scored.slice(0, 50).map(({ church }) => ({
      id: church.id,
      shortId: church.shortId,
      name: church.name,
      city: church.city,
      state: church.state,
      denomination: church.denomination,
      attendance: church.attendance,
      lat: church.lat,
      lng: church.lng,
      address: church.address || "",
      _tier: 0,
    }));
  };

  useEffect(() => {
    const q = query.trim();
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    if (!q || q.length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }

    // Immediately show local same-state results (no network needed)
    const local = localSearch(q);
    if (local.length) setResults(local);

    setLoading(true);
    setError(null);
    timeoutRef.current = setTimeout(() => {
      timeoutRef.current = null;
      searchChurches(q, 50, undefined, priorityStates)
        .then((data) => {
          const norm = (x: string) => (x ?? "").trim().toUpperCase().slice(0, 2);
          const neighborSet = stateNorm ? new Set((STATE_NEIGHBORS[stateNorm] || []).map((s) => s.toUpperCase())) : new Set<string>();
          const tier = (r: SearchResult) => {
            const st = norm(r.state ?? "");
            if (!st) return 2;
            if (stateNorm && (st === stateNorm || (stateNorm === "DC" && st === "MD") || (stateNorm === "MD" && st === "DC")))
              return 0;
            if (neighborSet.has(st)) return 1;
            return 2;
          };
          // Server results: only keep tier 1 and 2 (nearby + national)
          const serverResults = (data.results || [])
            .filter((r) => r.id !== currentChurchId)
            .map((r) => ({ ...r, _tier: tier(r) }))
            .filter((r) => r._tier > 0);
          // Merge: local same-state + server nearby/national
          const localNow = localSearch(q);
          const seenIds = new Set(localNow.map((r) => r.id));
          const merged = [
            ...localNow,
            ...serverResults.filter((r) => !seenIds.has(r.id)),
          ];
          merged.sort((a, b) => a._tier - b._tier);
          setResults(merged);
        })
        .catch((err) => {
          // If server fails, we still have local results
          if (!local.length) {
            setError(err?.message || "Search failed");
            setResults([]);
          }
        })
        .finally(() => setLoading(false));
    }, 300);
    return () => { if (timeoutRef.current) clearTimeout(timeoutRef.current); };
  }, [query, currentChurchId, stateNorm, priorityStates?.join(",") ?? ""]);

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-white/60" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Church name or city..."
          className="w-full pl-8 pr-3 py-2 rounded-lg bg-white/10 border border-white/10 text-white placeholder:text-white/55 text-xs focus:outline-none focus:ring-2 focus:ring-purple-500/50"
          autoFocus
        />
      </div>
      {error && <p className="text-red-400 text-[10px]">{error}</p>}
      {loading && <p className="text-white/70 text-[10px]">Searching...</p>}
      {!loading && query.trim().length >= 2 && results.length === 0 && !error && (
        <p className="text-white/70 text-[10px]">No churches found. Try a different name or city.</p>
      )}
      {!loading && results.length > 0 && (
        <p className="text-white/40 text-[10px]">{results.length} church{results.length === 1 ? "" : "es"} found</p>
      )}
      <div className="max-h-60 overflow-y-auto space-y-1">
        {results.map((r, i) => {
          const prevTier = i > 0 ? results[i - 1]._tier : -1;
          const showHeader = r._tier !== prevTier && stateNorm;
          const tierLabel = r._tier === 0
            ? `In ${STATE_NAMES[stateNorm] || stateNorm}`
            : r._tier === 1
              ? "Nearby states"
              : "Other states";
          const hasAddress = r.address?.trim();
          const locationLine = hasAddress
            ? [r.address, r.city, r.state].filter(Boolean).join(", ")
            : [r.city, r.state].filter(Boolean).join(", ");
          return (
            <div key={r.id}>
              {showHeader && (
                <p className="text-[9px] text-white/40 uppercase tracking-wider px-2.5 pt-2 pb-0.5">{tierLabel}</p>
              )}
              <button
                type="button"
                disabled={submitting || selectedId !== null}
                onClick={() => { setSelectedId(r.id); onSelect(r.id); }}
                className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-left text-xs transition-colors ${
                  selectedId === r.id
                    ? "bg-purple-500/20 border border-purple-400/30"
                    : selectedId !== null
                      ? "bg-white/5 opacity-40"
                      : "bg-white/5 hover:bg-white/10"
                } disabled:cursor-default`}
              >
                {selectedId === r.id ? (
                  <span className="text-purple-400"><ThreeDotLoader size={12} /></span>
                ) : (
                  <div className="w-2 h-2 rounded-full bg-purple-400/60 flex-shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <span className="text-white font-medium truncate block">{r.name}</span>
                  {locationLine ? (
                    <span className="text-white/70 text-[10px] block truncate">{locationLine}</span>
                  ) : null}
                </div>
                {selectedId === r.id && (
                  <span className="text-purple-300 text-[10px] flex-shrink-0">Linking...</span>
                )}
              </button>
            </div>
          );
        })}
      </div>
      <button
        type="button"
        onClick={onCancel}
        className="px-3 py-1.5 rounded-lg text-white/65 text-[11px] font-medium hover:bg-white/5 transition-colors"
      >
        Cancel
      </button>
    </div>
  );
}

// ── Field Card Component ──
// Shows: current value and edit button to open input
function FieldCard({
  fieldConfig,
  church,
  allChurches,
  submitting,
  submitted,
  pendingModeration,
  isEditing,
  onStartEdit,
  onCancelEdit,
  onSubmitEdit,
  onSubmitWithValue,
  values,
  setValues,
  chipLanguages,
  setChipLanguages,
  chipMinistries,
  setChipMinistries,
}: {
  fieldConfig: (typeof FIELD_CONFIG)[number];
  church: Church;
  allChurches?: Church[];
  submitting: string | null;
  submitted: Set<string>;
  pendingModeration: Set<string>;
  isEditing: boolean;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSubmitEdit: () => void;
  /** For main-campus-search: submit selected church id immediately */
  onSubmitWithValue?: (value: string) => void;
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
  const displayValue = key === "address"
    ? [church.address, church.city, church.state].filter(Boolean).join(", ")
    : key === "homeCampusId"
      ? (church.homeCampus ? `${church.homeCampus.name}, ${church.homeCampus.state}` : church.homeCampusId ? "Linked to main campus" : "")
      : currentValue;
  const   canSubmitAddress = key !== "address" || (() => {
    const p = parseAddressValue(values[key] ?? "");
    return !!(p.address.trim() && p.city.trim() && p.state.trim());
  })();
  const isMainCampusSearch = type === "main-campus-search";

  return (
    <div
      id={`field-${key}`}
      className={`rounded-xl p-3.5 border transition-colors ${
        empty && !isOptionalField(key)
          ? "bg-pink-500/5 border-pink-500/15"
          : "bg-white/[0.03] border-white/6"
      }`}
    >
      {/* Field header */}
      <div className="flex items-center gap-2 mb-2">
        <Icon size={13} className={empty && !isOptionalField(key) ? "text-white" : "text-purple-400"} />
        <span className="text-[10px] uppercase tracking-wider text-white/70 font-semibold">
          {label}
        </span>
        {empty && isOptionalField(key) && (
          <span className="ml-auto text-[9px] px-1.5 py-0.5 rounded-full bg-white/10 text-white/70 font-medium">
            Optional
          </span>
        )}
        {empty && !isOptionalField(key) && (
          <span className="ml-auto text-[9px] px-1.5 py-0.5 rounded-full bg-pink-500/15 text-white font-medium">
            MISSING
          </span>
        )}
      </div>

      {/* Current value display */}
      {displayValue && !empty && (
        <div className="mb-2.5 px-2.5 py-1.5 rounded-lg bg-white/[0.04]">
          <p className="text-[10px] text-white/55 mb-0.5">Current value</p>
          <p className="text-white/90 text-xs truncate">{displayValue}</p>
        </div>
      )}

      {/* Submitted for review: show persistently and do not show Edit (prevents duplicate submissions) */}
      {pendingModeration.has(key) ? (
        <div className="flex items-center gap-2 py-2 px-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20 mb-2">
          <Clock size={12} className="text-amber-400" />
          <span className="text-amber-300/90 text-xs font-medium">Submitted for review</span>
        </div>
      ) : justSubmitted ? (
        <div className="flex items-center gap-2 py-2 px-2.5 rounded-lg bg-green-500/10 border border-green-500/15 mb-2">
          <Check size={12} className="text-green-400" />
          <span className="text-green-400 text-xs font-medium">Updated!</span>
        </div>
      ) : null}

      {/* Edit controls: hidden when field is already submitted for review */}
      {!pendingModeration.has(key) && !justSubmitted && (
        <>
          {/* Action buttons: Edit (to show input) */}
          {!isEditing && (
            <button
              onClick={onStartEdit}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-500/12 text-purple-300 text-[11px] font-medium hover:bg-purple-500/20 transition-colors cursor-pointer"
            >
              <Pencil size={10} />
              {empty ? "Add" : "Edit"}
            </button>
          )}

          {/* Edit mode: input form */}
          {isEditing && (
            <div className="space-y-2 mt-1">
              {isMainCampusSearch && onSubmitWithValue ? (
                <MainCampusSearch
                  currentChurchId={church.id}
                  churchState={church.state}
                  allChurches={allChurches}
                  onSelect={(id) => onSubmitWithValue?.(id)}
                  submitting={isSubmitting}
                  onCancel={onCancelEdit}
                />
              ) : (
                <>
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
                        <ThreeDotLoader size={10} />
                      ) : (
                        <Send size={10} />
                      )}
                      Submit
                    </button>
                    <button
                      onClick={onCancelEdit}
                      className="px-3 py-1.5 rounded-lg text-white/65 text-[11px] font-medium hover:bg-white/5 transition-colors cursor-pointer"
                    >
                      Cancel
                    </button>
                  </div>
                </>
              )}
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
                : "bg-white/5 border-white/8 text-white/60 hover:text-white/80"
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
                : "bg-white/5 border-white/8 text-white/60 hover:text-white/80"
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
      className="w-full bg-white/8 rounded-lg px-3 py-2 text-white text-xs border border-white/10 focus:border-purple-500/50 focus:outline-none transition-colors placeholder:text-white/45"
    />
  );
}
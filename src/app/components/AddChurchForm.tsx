import { useState } from "react";
import {
  X,
  Plus,
  Check,
  Users,
  Globe,
  MapPin,
  Church as ChurchIcon,
  AlertCircle,
  Loader2,
  Clock,
  Phone,
  Mail,
  User,
  Languages,
  Heart,
  ChevronDown,
} from "lucide-react";
import type { Church } from "./church-data";
import { DENOMINATION_GROUPS, COMMON_LANGUAGES, COMMON_MINISTRIES } from "./church-data";
import { addChurch } from "./api";
import { ServiceTimesInput } from "./ServiceTimesInput";
import { normalizePhone } from "./ui/utils";

const MAX_SIMILAR_MATCHES = 5;
const MAX_DISTANCE_KM = 1.6; // ~1 mile

function haversineKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

/** Name similarity: fraction of input tokens that appear in the church name (or full string contained). */
function nameSimilarity(inputName: string, churchName: string): number {
  const input = inputName.trim().toLowerCase();
  const church = (churchName || "").trim().toLowerCase();
  if (!input) return 0;
  if (church.includes(input)) return 1;
  const inputTokens = tokenize(inputName);
  const churchTokens = new Set(tokenize(churchName));
  if (inputTokens.length === 0) return 0;
  const matchCount = inputTokens.filter((t) => churchTokens.has(t)).length;
  return matchCount / inputTokens.length;
}

export function findSimilarChurches(
  name: string,
  lat: number,
  lng: number,
  city: string,
  state: string,
  churches: Church[]
): Church[] {
  const nameNorm = name.trim().toLowerCase();
  if (!nameNorm || churches.length === 0) return [];
  const cityNorm = city.trim().toLowerCase();
  const scored = churches
    .filter((c) => (c.state || "").toUpperCase() === state.toUpperCase())
    .map((church) => {
      const nScore = nameSimilarity(name, church.name);
      const distKm =
        church.lat != null && church.lng != null
          ? haversineKm(lat, lng, church.lat, church.lng)
          : Infinity;
      const near = distKm <= MAX_DISTANCE_KM;
      const cityMatch =
        !!cityNorm &&
        !!church.city &&
        church.city.trim().toLowerCase() === cityNorm;
      const relevance = nScore * (1 + (cityMatch ? 0.3 : 0) + (near ? 0.3 : 0));
      return { church, nScore, near, cityMatch, relevance };
    })
    .filter(({ nScore, near, cityMatch }) => nScore >= 0.4 && (near || cityMatch))
    .sort((a, b) => b.relevance - a.relevance)
    .slice(0, MAX_SIMILAR_MATCHES)
    .map(({ church }) => church);
  return scored;
}

interface AddChurchFormProps {
  stateAbbrev: string;
  stateName: string;
  onClose: () => void;
  churches?: Church[];
  onSelectChurch?: (church: Church) => void;
}

export function AddChurchForm({
  stateAbbrev,
  stateName,
  onClose,
  churches = [],
  onSelectChurch,
}: AddChurchFormProps) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showExtended, setShowExtended] = useState(false);
  const [similarMatches, setSimilarMatches] = useState<Church[]>([]);
  const [showSimilarWarning, setShowSimilarWarning] = useState(false);

  // Core form fields
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [denomination, setDenomination] = useState("");
  const [attendance, setAttendance] = useState("");
  const [website, setWebsite] = useState("");

  // Extended form fields
  const [serviceTimes, setServiceTimes] = useState("");
  const [selectedLanguages, setSelectedLanguages] = useState<Set<string>>(new Set());
  const [selectedMinistries, setSelectedMinistries] = useState<Set<string>>(new Set());
  const [pastorName, setPastorName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");

  const submitToApi = async () => {
    setSubmitting(true);
    setError(null);
    setSuccess(null);
    setShowSimilarWarning(false);

    const parsedLat = parseFloat(lat);
    const parsedLng = parseFloat(lng);

    try {
      const result = await addChurch({
        name: name.trim(),
        address: address.trim() || undefined,
        city: city.trim() || undefined,
        state: stateAbbrev,
        lat: parsedLat,
        lng: parsedLng,
        denomination: denomination || undefined,
        attendance: attendance ? parseInt(attendance) : undefined,
        website: website.trim() || undefined,
        serviceTimes: serviceTimes.trim() || undefined,
        languages: selectedLanguages.size > 0 ? Array.from(selectedLanguages) : undefined,
        ministries: selectedMinistries.size > 0 ? Array.from(selectedMinistries) : undefined,
        pastorName: pastorName.trim() || undefined,
        phone: normalizePhone(phone) || undefined,
        email: email.trim() || undefined,
      });

      if (result.isDuplicate) {
        setSuccess("This church was already submitted!");
      } else {
        setSuccess("Church added to the map!");
      }

      setName("");
      setAddress("");
      setCity("");
      setLat("");
      setLng("");
      setDenomination("");
      setAttendance("");
      setWebsite("");
      setServiceTimes("");
      setSelectedLanguages(new Set());
      setSelectedMinistries(new Set());
      setPastorName("");
      setPhone("");
      setEmail("");
      setShowExtended(false);

      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      setError(err.message || "Failed to submit church");
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmit = async () => {
    if (!name.trim()) {
      setError("Church name is required");
      return;
    }
    if (!lat.trim() || !lng.trim()) {
      setError(
        "Latitude and longitude are required. You can find these on Google Maps by right-clicking a location."
      );
      return;
    }

    const parsedLat = parseFloat(lat);
    const parsedLng = parseFloat(lng);
    if (
      isNaN(parsedLat) ||
      isNaN(parsedLng) ||
      parsedLat < 18 ||
      parsedLat > 72 ||
      parsedLng < -180 ||
      parsedLng > -65
    ) {
      setError("Please enter valid US coordinates");
      return;
    }

    setError(null);

    if (churches.length > 0) {
      const similar = findSimilarChurches(
        name.trim(),
        parsedLat,
        parsedLng,
        city.trim(),
        stateAbbrev,
        churches
      );
      if (similar.length > 0) {
        setSimilarMatches(similar);
        setShowSimilarWarning(true);
        return;
      }
    }

    await submitToApi();
  };

  const toggleLanguage = (lang: string) => {
    setSelectedLanguages(prev => {
      const next = new Set(prev);
      if (next.has(lang)) next.delete(lang);
      else next.add(lang);
      return next;
    });
  };

  const toggleMinistry = (ministry: string) => {
    setSelectedMinistries(prev => {
      const next = new Set(prev);
      if (next.has(ministry)) next.delete(ministry);
      else next.add(ministry);
      return next;
    });
  };

  const inputClass =
    "w-full bg-white/8 rounded-lg px-3 py-2 text-white text-xs border border-white/10 focus:border-purple-500/50 focus:outline-none transition-colors placeholder:text-white/20";
  const labelClass =
    "text-[10px] uppercase tracking-wider text-white/40 font-semibold";

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center"
      style={{ fontFamily: "'Livvic', sans-serif" }}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div
        className="relative w-[95vw] max-w-[560px] max-h-[85vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden"
        style={{ backgroundColor: "#1A0E38" }}
      >
        {/* Header */}
        <div className="px-5 pt-5 pb-4 border-b border-white/8 flex-shrink-0">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <div className="w-5 h-5 rounded-full bg-purple-500/20 flex items-center justify-center">
                  <Plus size={10} className="text-purple-400" />
                </div>
                <span className="text-[10px] uppercase tracking-wider text-purple-400/70 font-semibold">
                  Community Submissions
                </span>
              </div>
              <h2 className="text-white font-bold text-base leading-tight">
                Add a Church in {stateName}
              </h2>
              <p className="text-white/40 text-[11px] mt-1 leading-relaxed">
                Don&apos;t see your church? Add it below and it will appear on the map right away.
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

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 py-4 min-h-0">
          {/* Success banner */}
          {success && (
            <div className="flex items-center gap-2 rounded-lg p-3 bg-green-500/10 border border-green-500/20 mb-4">
              <Check size={14} className="text-green-400 flex-shrink-0" />
              <p className="text-green-300/80 text-xs">{success}</p>
            </div>
          )}

          {/* Error banner */}
          {error && (
            <div className="flex items-center gap-2 rounded-lg p-3 bg-red-500/10 border border-red-500/20 mb-4">
              <AlertCircle size={14} className="text-red-400 flex-shrink-0" />
              <p className="text-red-300/80 text-xs">{error}</p>
              <button
                onClick={() => setError(null)}
                className="ml-auto flex-shrink-0"
              >
                <X size={12} className="text-red-400/50" />
              </button>
            </div>
          )}

          {/* Similar churches warning — suggest updating existing instead of adding */}
          {showSimilarWarning && similarMatches.length > 0 && (
            <div className="space-y-4 mb-4">
              <div className="flex items-center gap-2 rounded-lg p-3 bg-amber-500/10 border border-amber-500/20">
                <AlertCircle size={14} className="text-amber-400 flex-shrink-0" />
                <p className="text-amber-200/90 text-sm font-medium">
                  We found a church that might already be listed
                </p>
              </div>
              <p className="text-white/60 text-xs">
                If one of these is your church, update its info instead of adding a duplicate.
              </p>
              <ul className="space-y-2">
                {similarMatches.map((ch) => (
                  <li
                    key={ch.id}
                    className="rounded-xl p-3.5 bg-white/5 border border-white/10 flex flex-col gap-2"
                  >
                    <div>
                      <p className="text-white font-medium text-sm">{ch.name}</p>
                      {(ch.address || ch.city) && (
                        <p className="text-white/50 text-xs mt-0.5">
                          {[ch.address, ch.city].filter(Boolean).join(", ")}
                        </p>
                      )}
                      {ch.denomination && (
                        <p className="text-white/40 text-xs">{ch.denomination}</p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setShowSimilarWarning(false);
                        setSimilarMatches([]);
                        onSelectChurch?.(ch);
                      }}
                      className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-purple-500/20 text-purple-200 text-xs font-medium hover:bg-purple-500/30 transition-colors"
                    >
                      <ChurchIcon size={12} />
                      Update this church&apos;s info
                    </button>
                  </li>
                ))}
              </ul>
              <div className="flex flex-col gap-2 pt-2 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => submitToApi()}
                  disabled={submitting}
                  className="w-full inline-flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg bg-white/10 text-white/80 text-xs font-medium hover:bg-white/15 transition-colors disabled:opacity-50"
                >
                  {submitting ? (
                    <Loader2 size={12} className="animate-spin" />
                  ) : (
                    <Plus size={12} />
                  )}
                  This is a different church — add it anyway
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowSimilarWarning(false);
                    setSimilarMatches([]);
                  }}
                  className="text-white/50 text-xs hover:text-white/70"
                >
                  Back to form
                </button>
              </div>
            </div>
          )}

          {!showSimilarWarning && (
            /* ── Add church form ── */
            <div className="space-y-3.5">
              {/* Name (required) */}
              <div className="rounded-xl p-3.5 bg-white/5 border border-white/5">
                <div className="flex items-center gap-2 mb-2">
                  <ChurchIcon size={13} className="text-purple-400" />
                  <span className={labelClass}>Church Name *</span>
                </div>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g., Grace Community Church"
                  className={inputClass}
                />
              </div>

              {/* Address + City row */}
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl p-3.5 bg-white/5 border border-white/5">
                  <div className="flex items-center gap-2 mb-2">
                    <MapPin size={13} className="text-purple-400" />
                    <span className={labelClass}>Address</span>
                  </div>
                  <input
                    type="text"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="123 Main St"
                    className={inputClass}
                  />
                </div>
                <div className="rounded-xl p-3.5 bg-white/5 border border-white/5">
                  <div className="flex items-center gap-2 mb-2">
                    <MapPin size={13} className="text-purple-400" />
                    <span className={labelClass}>City</span>
                  </div>
                  <input
                    type="text"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    placeholder="Springfield"
                    className={inputClass}
                  />
                </div>
              </div>

              {/* Lat + Lng row */}
              <div className="rounded-xl p-3.5 bg-white/5 border border-white/5">
                <div className="flex items-center gap-2 mb-1.5">
                  <MapPin size={13} className="text-purple-400" />
                  <span className={labelClass}>Coordinates *</span>
                </div>
                <p className="text-[10px] text-white/25 mb-2">
                  Right-click any location on Google Maps and copy the
                  coordinates.
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    value={lat}
                    onChange={(e) => setLat(e.target.value)}
                    placeholder="Latitude (e.g., 33.749)"
                    className={inputClass}
                  />
                  <input
                    type="text"
                    value={lng}
                    onChange={(e) => setLng(e.target.value)}
                    placeholder="Longitude (e.g., -84.388)"
                    className={inputClass}
                  />
                </div>
              </div>

              {/* Denomination + Attendance row */}
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl p-3.5 bg-white/5 border border-white/5">
                  <div className="flex items-center gap-2 mb-2">
                    <ChurchIcon size={13} className="text-purple-400" />
                    <span className={labelClass}>Denomination</span>
                  </div>
                  <select
                    value={denomination}
                    onChange={(e) => setDenomination(e.target.value)}
                    className={`${inputClass} appearance-none`}
                  >
                    <option value="" className="bg-[#1A0E38]">
                      Select...
                    </option>
                    {DENOMINATION_GROUPS.filter((g) => g.label !== "Unspecified").map(
                      (g) => (
                        <option
                          key={g.label}
                          value={g.label}
                          className="bg-[#1A0E38]"
                        >
                          {g.label}
                        </option>
                      )
                    )}
                    <option value="Unknown" className="bg-[#1A0E38]">
                      I don't know
                    </option>
                  </select>
                </div>
                <div className="rounded-xl p-3.5 bg-white/5 border border-white/5">
                  <div className="flex items-center gap-2 mb-2">
                    <Users size={13} className="text-purple-400" />
                    <span className={labelClass}>Attendance</span>
                  </div>
                  <input
                    type="number"
                    value={attendance}
                    onChange={(e) => setAttendance(e.target.value)}
                    placeholder="Est. weekly"
                    min={1}
                    max={50000}
                    className={inputClass}
                  />
                </div>
              </div>

              {/* Website */}
              <div className="rounded-xl p-3.5 bg-white/5 border border-white/5">
                <div className="flex items-center gap-2 mb-2">
                  <Globe size={13} className="text-purple-400" />
                  <span className={labelClass}>Website</span>
                </div>
                <input
                  type="text"
                  value={website}
                  onChange={(e) => setWebsite(e.target.value)}
                  placeholder="https://www.example.com"
                  className={inputClass}
                />
              </div>

              {/* Extended fields toggle */}
              <button
                onClick={() => setShowExtended(!showExtended)}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-dashed border-white/10 hover:border-purple-500/30 hover:bg-white/[0.02] transition-all text-white/40 hover:text-white/60 text-xs"
              >
                {showExtended ? "Hide" : "Add"} Service Details, Languages & More
                <ChevronDown
                  size={14}
                  className={`transition-transform duration-200 ${showExtended ? "rotate-180" : ""}`}
                />
              </button>

              {showExtended && (
                <div className="space-y-3.5">
                  {/* Service Times */}
                  <div className="rounded-xl p-3.5 bg-white/5 border border-white/5">
                    <div className="flex items-center gap-2 mb-2">
                      <Clock size={13} className="text-purple-400" />
                      <span className={labelClass}>Service Times</span>
                    </div>
                    <ServiceTimesInput
                      value={serviceTimes}
                      onChange={setServiceTimes}
                    />
                  </div>

                  {/* Languages */}
                  <div className="rounded-xl p-3.5 bg-white/5 border border-white/5">
                    <div className="flex items-center gap-2 mb-2">
                      <Languages size={13} className="text-purple-400" />
                      <span className={labelClass}>
                        Languages{selectedLanguages.size > 0 ? ` (${selectedLanguages.size})` : ""}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {COMMON_LANGUAGES.map((lang) => (
                        <button
                          key={lang}
                          onClick={() => toggleLanguage(lang)}
                          className={`px-2.5 py-1 rounded-full text-[10px] font-medium transition-all border ${
                            selectedLanguages.has(lang)
                              ? "bg-purple-500/30 border-purple-500/50 text-purple-300"
                              : "bg-white/5 border-white/8 text-white/40 hover:text-white/60 hover:border-white/15"
                          }`}
                        >
                          {selectedLanguages.has(lang) && (
                            <Check size={9} className="inline mr-0.5" />
                          )}
                          {lang}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Ministries */}
                  <div className="rounded-xl p-3.5 bg-white/5 border border-white/5">
                    <div className="flex items-center gap-2 mb-2">
                      <Heart size={13} className="text-purple-400" />
                      <span className={labelClass}>
                        Ministries{selectedMinistries.size > 0 ? ` (${selectedMinistries.size})` : ""}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {COMMON_MINISTRIES.map((ministry) => (
                        <button
                          key={ministry}
                          onClick={() => toggleMinistry(ministry)}
                          className={`px-2.5 py-1 rounded-full text-[10px] font-medium transition-all border ${
                            selectedMinistries.has(ministry)
                              ? "bg-purple-500/30 border-purple-500/50 text-purple-300"
                              : "bg-white/5 border-white/8 text-white/40 hover:text-white/60 hover:border-white/15"
                          }`}
                        >
                          {selectedMinistries.has(ministry) && (
                            <Check size={9} className="inline mr-0.5" />
                          )}
                          {ministry}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Pastor + Contact row */}
                  <div className="rounded-xl p-3.5 bg-white/5 border border-white/5">
                    <div className="flex items-center gap-2 mb-2">
                      <User size={13} className="text-purple-400" />
                      <span className={labelClass}>Lead Pastor</span>
                    </div>
                    <input
                      type="text"
                      value={pastorName}
                      onChange={(e) => setPastorName(e.target.value)}
                      placeholder="Pastor John Smith"
                      className={inputClass}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-xl p-3.5 bg-white/5 border border-white/5">
                      <div className="flex items-center gap-2 mb-2">
                        <Phone size={13} className="text-purple-400" />
                        <span className={labelClass}>Phone</span>
                      </div>
                      <input
                        type="tel"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        placeholder="(555) 123-4567"
                        className={inputClass}
                      />
                    </div>
                    <div className="rounded-xl p-3.5 bg-white/5 border border-white/5">
                      <div className="flex items-center gap-2 mb-2">
                        <Mail size={13} className="text-purple-400" />
                        <span className={labelClass}>Email</span>
                      </div>
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="info@church.org"
                        className={inputClass}
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Submit button */}
              <button
                onClick={handleSubmit}
                disabled={submitting || !name.trim() || !lat.trim() || !lng.trim()}
                className="w-full py-3 rounded-xl text-sm font-semibold text-white transition-all disabled:opacity-30 flex items-center justify-center gap-2"
                style={{
                  background:
                    "linear-gradient(135deg, #6B21A8 0%, #A855F7 100%)",
                }}
              >
                {submitting ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    Submitting...
                  </>
                ) : (
                  <>
                    <Plus size={16} />
                    Submit Church
                  </>
                )}
              </button>

              {/* Info note */}
              <p className="text-white/20 text-[10px] leading-relaxed text-center pt-1">
                Your church will appear on the map immediately. Anyone can
                suggest corrections to keep the info accurate.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
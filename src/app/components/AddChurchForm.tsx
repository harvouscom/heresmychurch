import { useEffect, useId, useRef, useState } from "react";
import {
  X,
  Plus,
  Check,
  Users,
  Globe,
  MapPin,
  Church as ChurchIcon,
  AlertCircle,
  Clock,
  Phone,
  Mail,
  User,
  Languages,
  Heart,
  ChevronDown,
} from "lucide-react";
import { ThreeDotLoader } from "./ThreeDotLoader";
import type { Church } from "./church-data";
import { DENOMINATION_GROUPS, COMMON_LANGUAGES, COMMON_MINISTRIES } from "./church-data";
import { addChurch } from "./api";
import { ServiceTimesInput, normalizeServiceTimes } from "./ServiceTimesInput";
import { normalizePhone } from "./ui/utils";
import { CloseButton } from "./ui/close-button";
import { resolveRegionByAbbrev } from "../config/countries";
import { HmcDialog, HmcDialogTitle } from "./ui/hmc-dialog";
import { friendlyError } from "../lib/friendly-error";
import { toast } from "sonner";

/** Geocode an address to lat/lng using Nominatim (OpenStreetMap). Supports all HMC regions. */
export async function geocodeAddress(
  address: string,
  city: string,
  stateAbbrev: string
): Promise<{ lat: number; lng: number } | null> {
  const street = (address || "").trim();
  const ci = (city || "").trim();
  const st = (stateAbbrev || "").trim().toUpperCase();
  if (!street || !ci || !st) return null;
  const resolved = resolveRegionByAbbrev(st);
  if (!resolved) return null;
  const { country, region } = resolved;
  const cc = country.code.toUpperCase();
  const q =
    cc === "US"
      ? `${street}, ${ci}, ${st}, USA`
      : `${street}, ${ci}, ${region.name}`;
  const url = `https://nominatim.openstreetmap.org/search?${new URLSearchParams({
    q,
    format: "json",
    limit: "1",
    countrycodes: country.geocodeCountryCode || cc.toLowerCase(),
  })}`;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "HereIsMyChurch/1.0 (church map app)" },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const first = Array.isArray(data) ? data[0] : null;
    if (!first || first.lat == null || first.lon == null) return null;
    const lat = parseFloat(first.lat);
    const lng = parseFloat(first.lon);
    if (isNaN(lat) || isNaN(lng)) return null;
    const [s, w, n, e] = region.bounds;
    const pad = 0.5;
    if (lat < s - pad || lat > n + pad || lng < w - pad || lng > e + pad) return null;
    return { lat, lng };
  } catch {
    return null;
  }
}

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
  /** After successfully adding (or duplicate), navigate to that church's page. */
  onChurchAdded?: (state: string, shortId: string) => void;
}

export function AddChurchForm({
  stateAbbrev,
  stateName,
  onClose,
  churches = [],
  onSelectChurch,
  onChurchAdded,
}: AddChurchFormProps) {
  const fieldId = useId();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (error) errorRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [error]);
  const [showExtended, setShowExtended] = useState(false);
  const [similarMatches, setSimilarMatches] = useState<Church[]>([]);
  const [showSimilarWarning, setShowSimilarWarning] = useState(false);
  const [geocodedCoords, setGeocodedCoords] = useState<{ lat: number; lng: number } | null>(null);

  // Core form fields (lat/lng come from geocoding the address)
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
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

  const submitToApi = async (parsedLat: number, parsedLng: number, confirmAdd = false) => {
    setSubmitting(true);
    setError(null);

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
        serviceTimes: serviceTimes.trim()
          ? normalizeServiceTimes(serviceTimes) || serviceTimes.trim()
          : undefined,
        languages: selectedLanguages.size > 0 ? Array.from(selectedLanguages) : undefined,
        ministries: selectedMinistries.size > 0 ? Array.from(selectedMinistries) : undefined,
        pastorName: pastorName.trim() || undefined,
        phone: normalizePhone(phone) || undefined,
        email: email.trim() || undefined,
        confirmAdd: confirmAdd || undefined,
      });

      if (result.needsConfirmation && result.similar?.length) {
        setSimilarMatches(
          result.similar.map((ch) => ({
            id: ch.id,
            shortId: ch.shortId,
            name: ch.name,
            city: ch.city || "",
            state: ch.state || stateAbbrev,
            country: ch.country,
            address: ch.address,
            denomination: ch.denomination || "Unknown",
            lat: ch.lat ?? parsedLat,
            lng: ch.lng ?? parsedLng,
            attendance: 0,
          }))
        );
        setShowSimilarWarning(true);
        setGeocodedCoords({ lat: parsedLat, lng: parsedLng });
        return;
      }

      const church = result.church ?? result.existingChurch;
      const state = church?.state ?? stateAbbrev;
      const shortId = church?.shortId;

      const addedName = name.trim();
      if (result.isDuplicate) {
        toast.info("This church is already on the map", { description: addedName });
      } else if (result.needsModeration) {
        toast.success("Thanks! Your church was sent for review", {
          description: "It will appear on the map once it's approved.",
        });
      } else {
        toast.success(`${addedName} was added to the map`, { description: "Thanks for helping keep it complete." });
      }

      setName("");
      setAddress("");
      setCity("");
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
      setGeocodedCoords(null);
      setShowSimilarWarning(false);
      setSimilarMatches([]);

      onClose();
      if (shortId && state && onChurchAdded && !result.needsModeration) {
        onChurchAdded(state, shortId);
      }
    } catch (err: any) {
      setError(friendlyError(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmit = async () => {
    if (!name.trim()) {
      setError("Church name is required");
      return;
    }
    if (!address.trim() || !city.trim()) {
      setError("Street address and city are required so we can place the church on the map.");
      return;
    }

    setError(null);
    setSubmitting(true);
    let parsedLat: number;
    let parsedLng: number;
    try {
      const coords = await geocodeAddress(address.trim(), city.trim(), stateAbbrev);
      if (!coords) {
        setSubmitting(false);
        setError("We couldn't find that address. Please check the street address and city, and try again.");
        return;
      }
      parsedLat = coords.lat;
      parsedLng = coords.lng;
      setGeocodedCoords(coords);
    } catch {
      setSubmitting(false);
      setError("We couldn't look up that address. Please try again.");
      return;
    }
    setSubmitting(false);

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

    await submitToApi(parsedLat, parsedLng);
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

  // Unsaved-changes guard: closing a half-filled form asks first instead of losing input.
  const isDirty =
    !!(name.trim() || address.trim() || city.trim() || denomination || attendance || website.trim() ||
      serviceTimes.trim() || pastorName.trim() || phone.trim() || email.trim() ||
      selectedLanguages.size || selectedMinistries.size);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const requestClose = () => {
    if (isDirty && !submitting) setConfirmDiscard(true);
    else onClose();
  };

  const inputClass =
    "w-full bg-white/8 rounded-lg px-3 py-2 text-white text-xs border border-white/10 focus:border-purple-500/50 focus:outline-none transition-colors placeholder:text-white/45";
  const labelClass =
    "text-caption uppercase tracking-wider text-white/60 font-semibold";

  return (
    <HmcDialog onClose={requestClose} closeOnBackdrop={!isDirty} elevated className="w-[95vw] max-w-[560px] bg-hmc-surface-sunken">
        {/* Header */}
        <div className="px-5 pt-5 pb-4 border-b border-white/8 flex-shrink-0">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <div className="w-5 h-5 rounded-full bg-purple-500/20 flex items-center justify-center">
                  <Plus size={10} className="text-purple-400" />
                </div>
                <span className="text-caption uppercase tracking-wider text-purple-400/70 font-semibold">
                  Community Submissions
                </span>
              </div>
              <HmcDialogTitle className="text-white font-semibold text-base leading-tight">
                Add a Church in {stateName}
              </HmcDialogTitle>
              <p className="text-white/60 text-caption mt-1 leading-relaxed">
                Don&apos;t see your church? Add it below and it will appear on the map right away.
              </p>
            </div>
            <CloseButton onClick={requestClose} size="md" />
          </div>

        </div>

        {confirmDiscard && (
          <div role="alertdialog" aria-label="Discard this church?" className="flex flex-wrap items-center gap-2 px-5 py-3 bg-amber-500/10 border-b border-amber-500/20">
            <p className="text-amber-100 text-xs font-medium flex-1 min-w-[10rem]">Discard this church? What you&apos;ve entered will be lost.</p>
            <button
              type="button"
              autoFocus
              onClick={() => setConfirmDiscard(false)}
              className="px-3 py-1.5 rounded-full text-xs font-medium text-white/80 border border-white/15 hover:bg-white/5"
            >
              Keep editing
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded-full text-xs font-medium text-white bg-red-500/80 hover:bg-red-500"
            >
              Discard
            </button>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 py-4 min-h-0">
          {/* Error banner */}
          {error && (
            <div ref={errorRef} role="alert" className="flex items-center gap-2 rounded-lg p-3 bg-red-500/10 border border-red-500/20 mb-4">
              <AlertCircle size={14} className="text-red-400 flex-shrink-0" />
              <p className="text-red-200 text-xs">{error}</p>
              <button
                type="button"
                onClick={() => setError(null)}
                aria-label="Dismiss error"
                className="ml-auto flex-shrink-0 p-1 -m-1"
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
                        <p className="text-white/60 text-xs">{ch.denomination}</p>
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
                  onClick={() => geocodedCoords && submitToApi(geocodedCoords.lat, geocodedCoords.lng, true)}
                  disabled={submitting || !geocodedCoords}
                  className="w-full inline-flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg bg-purple-500/20 text-purple-200 text-xs font-medium hover:bg-purple-500/30 transition-colors disabled:opacity-50"
                >
                  {submitting ? (
                    <ThreeDotLoader size={12} />
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
                    setGeocodedCoords(null);
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
                  <label htmlFor={`${fieldId}-church-name`} className={labelClass}>Church name *</label>
                </div>
                <input id={`${fieldId}-church-name`} aria-required="true"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g., Grace Community Church"
                  className={inputClass}
                />
              </div>

              {/* Address + City (required — we use these to place the church on the map) */}
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl p-3.5 bg-white/5 border border-white/5">
                  <div className="flex items-center gap-2 mb-2">
                    <MapPin size={13} className="text-purple-400" />
                    <label htmlFor={`${fieldId}-street-address`} className={labelClass}>Street address *</label>
                  </div>
                  <input id={`${fieldId}-street-address`} aria-required="true"
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
                    <label htmlFor={`${fieldId}-city`} className={labelClass}>City *</label>
                  </div>
                  <input id={`${fieldId}-city`} aria-required="true"
                    type="text"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    placeholder="Springfield"
                    className={inputClass}
                  />
                </div>
              </div>
              <p className="text-caption text-white/60 -mt-1">
                We&apos;ll look up the location from this address to place the church on the map.
              </p>

              {/* Denomination + Attendance row */}
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl p-3.5 bg-white/5 border border-white/5">
                  <div className="flex items-center gap-2 mb-2">
                    <ChurchIcon size={13} className="text-purple-400" />
                    <label htmlFor={`${fieldId}-denomination`} className={labelClass}>Denomination</label>
                  </div>
                  <select id={`${fieldId}-denomination`}
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
                    <label htmlFor={`${fieldId}-attendance`} className={labelClass}>Attendance</label>
                  </div>
                  <input id={`${fieldId}-attendance`}
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
                  <label htmlFor={`${fieldId}-website`} className={labelClass}>Website</label>
                </div>
                <input id={`${fieldId}-website`}
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
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-dashed border-white/10 hover:border-purple-500/30 hover:bg-white/[0.02] transition-all text-white/60 hover:text-white/60 text-xs"
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
                      <span className={labelClass}>Service times</span>
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
                          className={`px-2.5 py-1 rounded-full text-caption font-medium transition-all border ${
                            selectedLanguages.has(lang)
                              ? "bg-purple-500/30 border-purple-500/50 text-purple-300"
                              : "bg-white/5 border-white/8 text-white/60 hover:text-white/60 hover:border-white/15"
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
                          className={`px-2.5 py-1 rounded-full text-caption font-medium transition-all border ${
                            selectedMinistries.has(ministry)
                              ? "bg-purple-500/30 border-purple-500/50 text-purple-300"
                              : "bg-white/5 border-white/8 text-white/60 hover:text-white/60 hover:border-white/15"
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
                      <label htmlFor={`${fieldId}-lead-pastor`} className={labelClass}>Lead pastor</label>
                    </div>
                    <input id={`${fieldId}-lead-pastor`}
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
                        <label htmlFor={`${fieldId}-phone`} className={labelClass}>Phone</label>
                      </div>
                      <input id={`${fieldId}-phone`}
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
                        <label htmlFor={`${fieldId}-email`} className={labelClass}>Email</label>
                      </div>
                      <input id={`${fieldId}-email`}
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
                disabled={submitting || !name.trim() || !address.trim() || !city.trim()}
                className="w-full py-3 rounded-xl text-sm font-semibold text-white transition-all disabled:opacity-30 flex items-center justify-center gap-2"
                style={{
                  background:
                    "linear-gradient(135deg, #6B21A8 0%, #A855F7 100%)",
                }}
              >
                {submitting ? (
                  <>
                    <ThreeDotLoader size={16} />
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
              <p className="text-white/50 text-caption leading-relaxed text-center pt-1">
                Your church will appear on the map immediately. Anyone can
                suggest corrections to keep the info accurate.
              </p>
            </div>
          )}
        </div>
    </HmcDialog>
  );
}
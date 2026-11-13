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
import { addChurch, searchChurches } from "./api";
import { serializeAddress } from "./AddressInput";
import { findLikelyDuplicates } from "../../../shared/church-match";
import { ServiceTimesInput, normalizeServiceTimes } from "./ServiceTimesInput";
import { normalizePhone } from "../lib/phone";
import { CloseButton } from "./ui/close-button";
import { resolveRegionByAbbrev } from "../config/countries";
import { HmcDialog, HmcDialogBody, HmcDialogTitle } from "./ui/hmc-dialog";
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

/** A possible existing listing, with why it matched ("Same name", "120 m away"). */
export type SimilarChurch = Church & { matchReasons?: string[]; distanceM?: number };

/** Existing churches in this region that look like the one being added (shared/church-match.ts). */
export function findSimilarChurches(
  name: string,
  lat: number,
  lng: number,
  city: string,
  state: string,
  churches: Church[],
  address = ""
): SimilarChurch[] {
  if (!name.trim() || churches.length === 0) return [];
  const pool = churches.filter((c) => (c.state || "").toUpperCase() === state.toUpperCase());
  return findLikelyDuplicates({ name, lat, lng, city, address }, pool, { limit: MAX_SIMILAR_MATCHES })
    .map((m) => ({ ...m.church, matchReasons: m.reasons, distanceM: m.distanceM }));
}

/** Values typed into the add form, in the shape the correction form expects. */
export type TypedChurchFields = Partial<Record<string, string>>;

interface AddChurchFormProps {
  stateAbbrev: string;
  stateName: string;
  onClose: () => void;
  churches?: Church[];
  /** Chose an existing listing instead; `typed` carries what was entered so it isn't lost. */
  onSelectChurch?: (church: Church, typed?: TypedChurchFields) => void;
  /** After successfully adding (or duplicate), navigate to that church's page. */
  onChurchAdded?: (state: string, shortId: string) => void;
  /** Prefill from a deep link (/add?name=&city=). */
  initialName?: string;
  initialCity?: string;
  /** Shows "Pick on map": closes the form to drop a pin, carrying what was typed. */
  onPickOnMap?: (typed: TypedChurchFields) => void;
}

export function AddChurchForm({
  stateAbbrev,
  stateName,
  onClose,
  churches = [],
  onSelectChurch,
  onChurchAdded,
  initialName = "",
  initialCity = "",
  onPickOnMap,
}: AddChurchFormProps) {
  const fieldId = useId();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (error) errorRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [error]);
  const [showExtended, setShowExtended] = useState(false);
  const [similarMatches, setSimilarMatches] = useState<SimilarChurch[]>([]);
  const [showSimilarWarning, setShowSimilarWarning] = useState(false);
  const [geocodedCoords, setGeocodedCoords] = useState<{ lat: number; lng: number } | null>(null);

  // Core form fields (lat/lng come from geocoding the address)
  const [name, setName] = useState(initialName);
  const [address, setAddress] = useState("");
  const [city, setCity] = useState(initialCity);
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
            matchReasons: ch.reasons,
            distanceM: ch.distanceM,
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
        churches,
        address.trim()
      );
      if (similar.length > 0) {
        setSimilarMatches(similar);
        setShowSimilarWarning(true);
        return;
      }
    }

    await submitToApi(parsedLat, parsedLng);
  };

  const typedFields = (): TypedChurchFields => ({
    name: name.trim(),
    ...(address.trim() || city.trim() ? { address: serializeAddress({ address: address.trim(), city: city.trim(), state: stateAbbrev }) } : {}),
    denomination,
    attendance,
    website: website.trim(),
    serviceTimes: serviceTimes.trim() ? normalizeServiceTimes(serviceTimes) || serviceTimes.trim() : "",
    languages: Array.from(selectedLanguages).join(", "),
    ministries: Array.from(selectedMinistries).join(", "),
    pastorName: pastorName.trim(),
    phone: phone.trim(),
    email: email.trim(),
  });
  const chooseExisting = (church: Church) => {
    setShowSimilarWarning(false);
    setSimilarMatches([]);
    const { name: _typedName, ...rest } = typedFields();
    onSelectChurch?.(church, rest);
  };

  // "Already on the map?" while typing: the loaded region first, the search API when none is loaded.
  const [typeahead, setTypeahead] = useState<SimilarChurch[]>([]);
  const [dismissedTypeahead, setDismissedTypeahead] = useState(false);
  useEffect(() => {
    const q = name.trim();
    if (q.length < 3 || dismissedTypeahead) { setTypeahead([]); return; }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      const input = { name: q, city: city.trim(), address: address.trim() };
      const rank = (pool: Church[]) => findLikelyDuplicates(input, pool, { minName: 0.6, limit: 3 })
        .map((m) => ({ ...m.church, matchReasons: m.reasons, distanceM: m.distanceM }));
      if (churches.length) { setTypeahead(rank(churches.filter((c) => (c.state || "").toUpperCase() === stateAbbrev.toUpperCase()))); return; }
      try {
        const res = await searchChurches(q, 8, stateAbbrev, undefined, resolveRegionByAbbrev(stateAbbrev)?.country.code, controller.signal);
        const pool = res.results.map((r) => ({ ...r, state: r.state || stateAbbrev } as unknown as Church));
        if (!controller.signal.aborted) setTypeahead(rank(pool));
      } catch { /* search is a convenience; the submit-time check still runs */ }
    }, 250);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [name, city, address, churches, stateAbbrev, dismissedTypeahead]);

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
    "w-full bg-white/8 rounded-lg px-3 py-2.5 text-white text-xs border border-white/10 focus:border-purple-500/50 focus:outline-none transition-colors placeholder:text-white/45";
  const labelClass = "block text-xs text-white/70 font-medium mb-1";
  const sectionClass = "flex items-center gap-2 text-sm font-semibold text-white";
  const chipClass = (on: boolean) =>
    `px-2.5 py-1 rounded-full text-caption font-medium transition-all border ${
      on ? "bg-purple-500/30 border-purple-500/50 text-purple-300" : "bg-white/5 border-white/8 text-white/60 hover:text-white/80 hover:border-white/15"
    }`;
  const optionalCount = [denomination, attendance, website.trim(), serviceTimes.trim(), pastorName.trim(), phone.trim(), email.trim()].filter(Boolean).length + (selectedLanguages.size ? 1 : 0) + (selectedMinistries.size ? 1 : 0);

  return (
    <HmcDialog onClose={requestClose} closeOnBackdrop={!isDirty} elevated className="w-[95vw] max-w-[560px] bg-hmc-surface-sunken">
        {/* Header */}
        <div className="px-5 pt-5 pb-4 border-b border-white/8 flex-shrink-0">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <HmcDialogTitle className="text-white font-semibold text-base leading-tight">
                Add a church in {stateName}
              </HmcDialogTitle>
              <p className="text-white/60 text-xs mt-1 leading-relaxed">
                It shows on the map right away and is checked automatically. Only a name and location are needed.
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
        <HmcDialogBody className="px-5 py-4">
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
                      <MatchReasons reasons={ch.matchReasons} />
                    </div>
                    <button
                      type="button"
                      onClick={() => chooseExisting(ch)}
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
            <div className="space-y-6">
              {/* 1. The church */}
              <section className="space-y-2" aria-labelledby={`${fieldId}-sec-name`}>
                <h3 id={`${fieldId}-sec-name`} className={sectionClass}>
                  <ChurchIcon size={14} className="text-purple-400" /> The church
                </h3>
                <label htmlFor={`${fieldId}-church-name`} className={labelClass}>Name</label>
                <input id={`${fieldId}-church-name`} aria-required="true"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g., Grace Community Church"
                  autoComplete="off"
                  className={`${inputClass} text-sm`}
                />
                {typeahead.length > 0 && (
                  <div className="rounded-xl border border-amber-400/25 bg-amber-400/[0.06] p-3" aria-live="polite">
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <p className="text-amber-100 text-xs font-semibold">Already on the map? Update it instead.</p>
                      <button type="button" onClick={() => setDismissedTypeahead(true)} className="whitespace-nowrap text-white/50 text-caption hover:text-white/80">Not these</button>
                    </div>
                    <ul className="space-y-1">
                      {typeahead.map((ch) => (
                        <li key={ch.id}>
                          <button
                            type="button"
                            onClick={() => chooseExisting(ch)}
                            className="group w-full flex items-start gap-2 text-left rounded-lg px-2 py-1.5 hover:bg-white/5 transition-colors"
                          >
                            <span className="min-w-0 flex-1">
                              <span className="block text-white text-xs font-medium">{ch.name}</span>
                              <span className="block text-white/50 text-caption truncate">{[ch.address, ch.city].filter(Boolean).join(", ") || ch.denomination}</span>
                              <MatchReasons reasons={ch.matchReasons} />
                            </span>
                            <span className="text-purple-300 text-caption font-medium opacity-70 group-hover:opacity-100 pt-0.5">That&apos;s it</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                    <p className="text-white/45 text-caption mt-1.5">What you&apos;ve typed comes with you.</p>
                  </div>
                )}
              </section>

              {/* 2. Where it is */}
              <section className="space-y-2" aria-labelledby={`${fieldId}-sec-where`}>
                <div className="flex items-center justify-between gap-2">
                  <h3 id={`${fieldId}-sec-where`} className={sectionClass}>
                    <MapPin size={14} className="text-purple-400" /> Where it is
                  </h3>
                  {onPickOnMap && (
                    <button
                      type="button"
                      onClick={() => onPickOnMap({ ...typedFields(), name: name.trim() })}
                      className="inline-flex items-center gap-1.5 rounded-full border border-purple-400/30 px-2.5 py-1 text-caption font-medium text-purple-200 hover:bg-purple-500/15 transition-colors"
                    >
                      <MapPin size={12} /> Pick on map
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-[1fr_11rem] gap-2">
                  <div>
                    <label htmlFor={`${fieldId}-street-address`} className={labelClass}>Street address</label>
                    <input id={`${fieldId}-street-address`} aria-required="true"
                      type="text"
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      placeholder="123 Main St"
                      autoComplete="street-address"
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label htmlFor={`${fieldId}-city`} className={labelClass}>City</label>
                    <input id={`${fieldId}-city`} aria-required="true"
                      type="text"
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                      placeholder="Springfield"
                      autoComplete="address-level2"
                      className={inputClass}
                    />
                  </div>
                </div>
                <p className="text-caption text-white/50">
                  We place the church on the map from its address{onPickOnMap ? ", or you can drop a pin" : ""}.
                </p>
              </section>

              {/* 3. Optional details */}
              <section aria-labelledby={`${fieldId}-sec-more`}>
                <button
                  type="button"
                  id={`${fieldId}-sec-more`}
                  aria-expanded={showExtended}
                  onClick={() => setShowExtended(!showExtended)}
                  className="w-full flex items-center gap-3 rounded-xl bg-white/[0.04] hover:bg-white/[0.07] px-3.5 py-3 text-left transition-colors"
                >
                  <span className="w-7 h-7 rounded-full bg-purple-500/20 flex items-center justify-center flex-shrink-0">
                    <Plus size={14} className={`text-purple-300 transition-transform ${showExtended ? "rotate-45" : ""}`} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-white text-xs font-semibold">
                      Add details people look for{optionalCount > 0 ? ` · ${optionalCount} added` : ""}
                    </span>
                    <span className="block text-white/50 text-caption">Service times, website, denomination, languages, contact. All optional.</span>
                  </span>
                  <ChevronDown size={14} className={`text-white/50 transition-transform duration-200 ${showExtended ? "rotate-180" : ""}`} />
                </button>

                {showExtended && (
                  <div className="space-y-4 pt-4">
                    <div>
                      <span className={labelClass}><Clock size={12} className="inline mr-1 -mt-0.5 text-purple-400" />Service times</span>
                      <ServiceTimesInput value={serviceTimes} onChange={setServiceTimes} />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div>
                        <label htmlFor={`${fieldId}-website`} className={labelClass}><Globe size={12} className="inline mr-1 -mt-0.5 text-purple-400" />Website</label>
                        <input id={`${fieldId}-website`}
                          type="url"
                          value={website}
                          onChange={(e) => setWebsite(e.target.value)}
                          placeholder="https://www.example.com"
                          className={inputClass}
                        />
                      </div>
                      <div>
                        <label htmlFor={`${fieldId}-denomination`} className={labelClass}>Denomination</label>
                        <select id={`${fieldId}-denomination`}
                          value={denomination}
                          onChange={(e) => setDenomination(e.target.value)}
                          className={`${inputClass} appearance-none`}
                        >
                          <option value="" className="bg-[#1A0E38]">Select…</option>
                          {DENOMINATION_GROUPS.filter((g) => g.label !== "Unspecified").map((g) => (
                            <option key={g.label} value={g.label} className="bg-[#1A0E38]">{g.label}</option>
                          ))}
                          <option value="Unknown" className="bg-[#1A0E38]">I don&apos;t know</option>
                        </select>
                      </div>
                    </div>

                    <div>
                      <span className={labelClass}><Languages size={12} className="inline mr-1 -mt-0.5 text-purple-400" />Languages{selectedLanguages.size > 0 ? ` (${selectedLanguages.size})` : ""}</span>
                      <div className="flex flex-wrap gap-1.5">
                        {COMMON_LANGUAGES.map((lang) => (
                          <button key={lang} type="button" aria-pressed={selectedLanguages.has(lang)} onClick={() => toggleLanguage(lang)} className={chipClass(selectedLanguages.has(lang))}>
                            {selectedLanguages.has(lang) && <Check size={9} className="inline mr-0.5" />}{lang}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <span className={labelClass}><Heart size={12} className="inline mr-1 -mt-0.5 text-purple-400" />Ministries{selectedMinistries.size > 0 ? ` (${selectedMinistries.size})` : ""}</span>
                      <div className="flex flex-wrap gap-1.5">
                        {COMMON_MINISTRIES.map((ministry) => (
                          <button key={ministry} type="button" aria-pressed={selectedMinistries.has(ministry)} onClick={() => toggleMinistry(ministry)} className={chipClass(selectedMinistries.has(ministry))}>
                            {selectedMinistries.has(ministry) && <Check size={9} className="inline mr-0.5" />}{ministry}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div>
                        <label htmlFor={`${fieldId}-lead-pastor`} className={labelClass}><User size={12} className="inline mr-1 -mt-0.5 text-purple-400" />Lead pastor</label>
                        <input id={`${fieldId}-lead-pastor`} type="text" value={pastorName} onChange={(e) => setPastorName(e.target.value)} placeholder="Pastor John Smith" className={inputClass} />
                      </div>
                      <div>
                        <label htmlFor={`${fieldId}-attendance`} className={labelClass}><Users size={12} className="inline mr-1 -mt-0.5 text-purple-400" />Weekly attendance</label>
                        <input id={`${fieldId}-attendance`} type="number" value={attendance} onChange={(e) => setAttendance(e.target.value)} placeholder="Estimate" min={1} max={50000} className={inputClass} />
                      </div>
                      <div>
                        <label htmlFor={`${fieldId}-phone`} className={labelClass}><Phone size={12} className="inline mr-1 -mt-0.5 text-purple-400" />Phone</label>
                        <input id={`${fieldId}-phone`} type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(555) 123-4567" className={inputClass} />
                      </div>
                      <div>
                        <label htmlFor={`${fieldId}-email`} className={labelClass}><Mail size={12} className="inline mr-1 -mt-0.5 text-purple-400" />Church email</label>
                        <input id={`${fieldId}-email`} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="info@church.org" className={inputClass} />
                      </div>
                    </div>
                    <p className="text-caption text-white/50 -mt-2">
                      The church email is reviewed before it&apos;s shown, because it&apos;s where the church&apos;s sign-in links go.
                    </p>
                  </div>
                )}
              </section>

              {/* Submit */}
              <div className="space-y-2.5">
                <button
                  onClick={handleSubmit}
                  disabled={submitting || !name.trim() || !address.trim() || !city.trim()}
                  className="w-full py-3 rounded-xl text-sm font-semibold text-white transition-all disabled:opacity-30 flex items-center justify-center gap-2"
                  style={{ background: "linear-gradient(135deg, #6B21A8 0%, #A855F7 100%)" }}
                >
                  {submitting ? (<><ThreeDotLoader size={16} /> Adding…</>) : (<><Plus size={16} /> Add to the map</>)}
                </button>
                <p className="text-white/50 text-caption leading-relaxed text-center">
                  Anyone can suggest corrections later to keep it accurate.
                </p>
              </div>
            </div>
          )}
        </HmcDialogBody>
    </HmcDialog>
  );
}
function MatchReasons({ reasons }: { reasons?: string[] }) {
  if (!reasons?.length) return null;
  return (
    <span className="mt-1 flex flex-wrap gap-1">
      {reasons.map((r) => (
        <span key={r} className="rounded-full bg-white/8 px-2 py-0.5 text-[10px] text-white/70">{r}</span>
      ))}
    </span>
  );
}

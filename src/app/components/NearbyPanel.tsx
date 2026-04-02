import { useEffect, useMemo, useState } from "react";
import { ExternalLink, Loader2, LocateFixed, MapPin } from "lucide-react";
import type { Church } from "./church-data";
import { CloseButton } from "./ui/close-button";
import { Button } from "./ui/button";
import { spotlightMapHref } from "./url-utils";
import { STATE_NAMES } from "./map-constants";

const SESSION_LOC_KEY = "hmc_easter_loc";

function haversineMiles(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 3958.7613;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const s1 = Math.sin(dLat / 2);
  const s2 = Math.sin(dLng / 2);
  const h = s1 * s1 + Math.cos(lat1) * Math.cos(lat2) * s2 * s2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export interface NearbyPanelProps {
  open: boolean;
  onClose: () => void;
  churches: Church[] | null;
  onLocationResolved?: (loc: { lat: number; lng: number }) => void;
}

export function NearbyPanel({ open, onClose, churches, onLocationResolved }: NearbyPanelProps) {
  const [geoLoading, setGeoLoading] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [permState, setPermState] = useState<PermissionState | null>(null);
  const [myLoc, setMyLoc] = useState<{ lat: number; lng: number } | null>(null);
  const [selectedState, setSelectedState] = useState<string>("");

  // Check permission state and restore session location on open
  useEffect(() => {
    if (!open) return;
    // Check permission state so we know what Chrome thinks before the user clicks
    if (navigator.permissions) {
      navigator.permissions.query({ name: "geolocation" }).then((result) => {
        setPermState(result.state);
        result.onchange = () => setPermState(result.state);
      }).catch(() => {});
    }
    try {
      const raw = sessionStorage.getItem(SESSION_LOC_KEY);
      if (!raw) return;
      const { lat, lng } = JSON.parse(raw) as { lat?: number; lng?: number };
      if (typeof lat === "number" && typeof lng === "number") setMyLoc({ lat, lng });
    } catch { /* ignore */ }
  }, [open]);

  const requestLocation = () => {
    setGeoError(null);

    if (!navigator.geolocation) {
      setGeoError("Geolocation isn't supported here. Use the state picker below.");
      return;
    }

    setGeoLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGeoLoading(false);
        const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setMyLoc(loc);
        setSelectedState("");
        try { sessionStorage.setItem(SESSION_LOC_KEY, JSON.stringify(loc)); } catch { /* ignore */ }
        onLocationResolved?.(loc);
      },
      (err) => {
        setGeoLoading(false);
        // Show the raw code so we can diagnose exactly what the browser is returning.
        if (err.code === 1) {
          setGeoError("Blocked (code 1): Location is denied for this site. Click the lock icon in the address bar → Site settings → Location → Allow, then reload.");
        } else if (err.code === 2) {
          setGeoError("Unavailable (code 2): Browser can't determine location. Check System Settings → Privacy & Security → Location Services → enable your browser.");
        } else {
          setGeoError(`Timed out (code ${err.code}): No location was returned. Try the state picker below.`);
        }
      },
      { enableHighAccuracy: false, timeout: 8_000, maximumAge: 300_000 }
    );
  };

  // GPS-based nearest churches
  const nearest = useMemo(() => {
    if (!myLoc || !churches?.length) return [];
    return churches
      .filter((c) => typeof c.lat === "number" && typeof c.lng === "number")
      .map((c) => ({ c, miles: haversineMiles(myLoc, { lat: c.lat, lng: c.lng }) }))
      .sort((a, b) => a.miles - b.miles)
      .slice(0, 8);
  }, [myLoc, churches]);

  // State-picker fallback: churches in selected state, sorted by city then name
  const stateResults = useMemo(() => {
    if (!selectedState || !churches?.length) return [];
    return churches
      .filter((c) => c.state === selectedState)
      .sort((a, b) => {
        const cityA = a.city || "";
        const cityB = b.city || "";
        return cityA.localeCompare(cityB) || a.name.localeCompare(b.name);
      })
      .slice(0, 20);
  }, [selectedState, churches]);

  // Sorted unique states that have verified churches
  const availableStates = useMemo(() => {
    if (!churches?.length) return [];
    const abbrevs = [...new Set(churches.map((c) => c.state))].sort();
    return abbrevs.filter((a) => STATE_NAMES[a]);
  }, [churches]);

  const showGpsResults = myLoc && !selectedState;
  const showStateResults = !!selectedState;

  if (!open) return null;

  return (
    <div
      className="absolute inset-0 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div className="absolute inset-0 backdrop-blur-sm bg-black/30" />

      <div
        className="relative w-full max-w-md rounded-2xl shadow-2xl overflow-hidden bg-white"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4 px-6 pt-6 pb-4 border-b border-stone-200/70">
          <div className="min-w-0">
            <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-purple-700">
              <LocateFixed className="h-4 w-4" aria-hidden />
              Find nearby
            </div>
            <h2 className="mt-2 text-xl font-bold text-stone-900 tracking-tight">
              Churches near you
            </h2>
            <p className="mt-1.5 text-sm text-stone-500">
              Your location is only used for this session and is never saved.
            </p>
          </div>
          <CloseButton onClick={onClose} size="md" className="text-stone-700 flex-shrink-0" />
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4">

          {/* Permission state badge — visible so we can diagnose */}
          {permState && (
            <div className={`text-xs px-3 py-2 rounded-lg flex items-center gap-2 ${
              permState === "granted" ? "bg-green-50 text-green-700 border border-green-100" :
              permState === "denied"  ? "bg-red-50 text-red-700 border border-red-100" :
                                        "bg-stone-50 text-stone-500 border border-stone-200"
            }`}>
              <span className="font-semibold">Browser permission:</span> {permState}
              {permState === "denied" && (
                <span className="ml-1">— click the lock icon in the address bar → Location → Allow</span>
              )}
            </div>
          )}

          {/* GPS button */}
          <Button
            onClick={(e) => { e.stopPropagation(); requestLocation(); }}
            disabled={geoLoading}
            className="w-full inline-flex items-center justify-center gap-2"
          >
            {geoLoading
              ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              : <LocateFixed className="h-4 w-4" aria-hidden />}
            {geoLoading ? "Waiting for permission…" : myLoc && !selectedState ? "Update my location" : "Use my location"}
          </Button>

          {geoLoading && (
            <p className="text-xs text-stone-400 text-center leading-relaxed">
              Look for a <span className="font-medium text-stone-600">location permission prompt</span> at the top of your browser window and click Allow.
            </p>
          )}

          {geoError && (
            <p className="text-sm text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3.5 py-2.5 leading-relaxed">
              {geoError}
            </p>
          )}

          {/* Divider + state picker */}
          {!geoLoading && (
            <>
              <div className="flex items-center gap-3">
                <div className="flex-1 h-px bg-stone-200" />
                <span className="text-xs text-stone-400 font-medium">or pick your state</span>
                <div className="flex-1 h-px bg-stone-200" />
              </div>

              <select
                value={selectedState}
                onChange={(e) => { setSelectedState(e.target.value); setMyLoc(null); }}
                className="w-full rounded-xl border border-stone-200 px-3 py-2.5 text-sm text-stone-700 bg-white focus:outline-none focus:ring-2 focus:ring-purple-400 focus:border-transparent"
              >
                <option value="">Select a state…</option>
                {availableStates.map((abbrev) => (
                  <option key={abbrev} value={abbrev}>
                    {STATE_NAMES[abbrev]} ({abbrev})
                  </option>
                ))}
              </select>
            </>
          )}

          {/* Loading church data */}
          {(showGpsResults || showStateResults) && !churches && (
            <p className="text-sm text-stone-400 text-center py-2">Loading church data…</p>
          )}

          {/* GPS results */}
          {showGpsResults && churches && nearest.length === 0 && (
            <p className="text-sm text-stone-400 text-center py-2">No verified churches found near you.</p>
          )}

          {showGpsResults && churches && nearest.length > 0 && (
            <ChurchList items={nearest.map(({ c, miles }) => ({ c, label: `${miles.toFixed(miles < 10 ? 1 : 0)} mi away` }))} />
          )}

          {/* State results */}
          {showStateResults && churches && stateResults.length === 0 && (
            <p className="text-sm text-stone-400 text-center py-2">No verified churches found in {STATE_NAMES[selectedState] || selectedState}.</p>
          )}

          {showStateResults && churches && stateResults.length > 0 && (
            <ChurchList items={stateResults.map((c) => ({ c, label: c.city || STATE_NAMES[c.state] || c.state }))} />
          )}
        </div>
      </div>
    </div>
  );
}

function ChurchList({ items }: { items: { c: Church; label: string }[] }) {
  return (
    <ul className="space-y-2 max-h-[40vh] overflow-y-auto -mx-1 px-1">
      {items.map(({ c, label }) => {
        const href = spotlightMapHref({ id: c.id, shortId: c.shortId, state: c.state }) || `/state/${c.state}`;
        return (
          <li key={c.id}>
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-start gap-3 rounded-xl border border-stone-200/70 px-3.5 py-3 hover:border-purple-200 hover:bg-purple-50/40 transition-colors group"
              onClick={(e) => e.stopPropagation()}
            >
              <MapPin className="h-4 w-4 text-purple-500 flex-shrink-0 mt-0.5" aria-hidden />
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-stone-900 truncate text-sm">{c.name}</div>
                <div className="text-xs text-stone-500 mt-0.5">
                  {c.city ? `${c.city}, ${c.state}` : c.state}
                  <span className="mx-1.5 text-stone-300">·</span>
                  {label}
                </div>
                {c.serviceTimes && (
                  <div className="text-xs text-stone-400 mt-1 truncate">{c.serviceTimes}</div>
                )}
              </div>
              <ExternalLink className="h-3.5 w-3.5 text-stone-300 flex-shrink-0 mt-0.5 group-hover:text-purple-400 transition-colors" aria-hidden />
            </a>
          </li>
        );
      })}
    </ul>
  );
}

import { useState, useEffect } from "react";

// US state abbreviations and names for dropdown
const US_STATES: { abbrev: string; name: string }[] = [
  { abbrev: "AL", name: "Alabama" }, { abbrev: "AK", name: "Alaska" }, { abbrev: "AZ", name: "Arizona" },
  { abbrev: "AR", name: "Arkansas" }, { abbrev: "CA", name: "California" }, { abbrev: "CO", name: "Colorado" },
  { abbrev: "CT", name: "Connecticut" }, { abbrev: "DE", name: "Delaware" }, { abbrev: "DC", name: "D.C." },
  { abbrev: "FL", name: "Florida" }, { abbrev: "GA", name: "Georgia" }, { abbrev: "HI", name: "Hawaii" },
  { abbrev: "ID", name: "Idaho" }, { abbrev: "IL", name: "Illinois" }, { abbrev: "IN", name: "Indiana" },
  { abbrev: "IA", name: "Iowa" }, { abbrev: "KS", name: "Kansas" }, { abbrev: "KY", name: "Kentucky" },
  { abbrev: "LA", name: "Louisiana" }, { abbrev: "ME", name: "Maine" }, { abbrev: "MD", name: "Maryland" },
  { abbrev: "MA", name: "Massachusetts" }, { abbrev: "MI", name: "Michigan" }, { abbrev: "MN", name: "Minnesota" },
  { abbrev: "MS", name: "Mississippi" }, { abbrev: "MO", name: "Missouri" }, { abbrev: "MT", name: "Montana" },
  { abbrev: "NE", name: "Nebraska" }, { abbrev: "NV", name: "Nevada" }, { abbrev: "NH", name: "New Hampshire" },
  { abbrev: "NJ", name: "New Jersey" }, { abbrev: "NM", name: "New Mexico" }, { abbrev: "NY", name: "New York" },
  { abbrev: "NC", name: "North Carolina" }, { abbrev: "ND", name: "North Dakota" }, { abbrev: "OH", name: "Ohio" },
  { abbrev: "OK", name: "Oklahoma" }, { abbrev: "OR", name: "Oregon" }, { abbrev: "PA", name: "Pennsylvania" },
  { abbrev: "RI", name: "Rhode Island" }, { abbrev: "SC", name: "South Carolina" }, { abbrev: "SD", name: "South Dakota" },
  { abbrev: "TN", name: "Tennessee" }, { abbrev: "TX", name: "Texas" }, { abbrev: "UT", name: "Utah" },
  { abbrev: "VT", name: "Vermont" }, { abbrev: "VA", name: "Virginia" }, { abbrev: "WA", name: "Washington" },
  { abbrev: "WV", name: "West Virginia" }, { abbrev: "WI", name: "Wisconsin" }, { abbrev: "WY", name: "Wyoming" },
];

export interface AddressParts {
  address: string;
  city: string;
  state: string;
  /** Optional coordinates (e.g. from geocoding) for address corrections */
  lat?: number;
  lng?: number;
}

const INPUT_CLASS =
  "w-full bg-white/8 rounded-lg px-3 py-2 text-white text-xs border border-white/10 focus:border-purple-500/50 focus:outline-none transition-colors placeholder:text-white/20";

/** Serialize address parts to a single string (JSON) for form/API. Includes lat/lng when provided. */
export function serializeAddress(parts: AddressParts): string {
  const obj: Record<string, string | number> = {
    address: (parts.address || "").trim(),
    city: (parts.city || "").trim(),
    state: (parts.state || "").trim().toUpperCase().slice(0, 2),
  };
  if (typeof parts.lat === "number" && !isNaN(parts.lat) && typeof parts.lng === "number" && !isNaN(parts.lng)) {
    obj.lat = parts.lat;
    obj.lng = parts.lng;
  }
  return JSON.stringify(obj);
}

/** Parse stored value (JSON or legacy comma-separated) back to address parts. Extracts lat/lng from JSON when present. */
export function parseAddressValue(value: string): AddressParts {
  if (!value || !value.trim()) {
    return { address: "", city: "", state: "" };
  }
  const trimmed = value.trim();
  if (trimmed.startsWith("{")) {
    try {
      const o = JSON.parse(trimmed) as Record<string, string | number>;
      const lat = typeof o.lat === "number" && !isNaN(o.lat) ? o.lat : undefined;
      const lng = typeof o.lng === "number" && !isNaN(o.lng) ? o.lng : undefined;
      return {
        address: String(o.address ?? "").trim(),
        city: String(o.city ?? "").trim(),
        state: String(o.state ?? "").trim().toUpperCase().slice(0, 2),
        ...(lat !== undefined && lng !== undefined ? { lat, lng } : {}),
      };
    } catch {
      return { address: "", city: "", state: "" };
    }
  }
  // Legacy: "street, city, state"
  const parts = trimmed.split(",").map((s) => s.trim());
  return {
    address: parts[0] ?? "",
    city: parts[1] ?? "",
    state: (parts[2] ?? "").toUpperCase().slice(0, 2),
  };
}

/** Build a single display address string from raw address/city/state, without duplicating state (e.g. no ", IA, IA"). */
export function formatFullAddress(
  address: string | undefined,
  city: string | undefined,
  state: string | undefined
): string {
  let street = "";
  let ci = city ?? "";
  let st = (state ?? "").trim().toUpperCase().slice(0, 2);

  if (address?.trim()) {
    const raw = address.trim();
    if (raw.startsWith("{")) {
      const parsed = parseAddressValue(raw);
      street = parsed.address;
      if (!ci) ci = parsed.city;
      if (!st) st = parsed.state;
    } else {
      street = raw;
    }
  }

  const parts = [street, ci, st].filter(Boolean);
  let joined = parts.join(", ");
  // Avoid duplicate trailing "city, state": e.g. ", Johnston, IA, Johnston, IA" -> ", Johnston, IA"
  if (ci && st) {
    const suffix = `, ${ci}, ${st}`;
    if (joined.endsWith(suffix + suffix)) {
      joined = joined.slice(0, -suffix.length);
    }
  }
  // Avoid duplicate trailing state: ", IA, IA" -> ", IA"
  if (st && joined.endsWith(`, ${st}, ${st}`)) {
    joined = joined.slice(0, -(`, ${st}`.length));
  }
  return joined;
}

interface AddressInputProps {
  value: string;
  onChange: (value: string) => void;
  compact?: boolean;
}

export function AddressInput({ value, onChange, compact }: AddressInputProps) {
  const parsed = parseAddressValue(value);
  const [street, setStreet] = useState(parsed.address);
  const [city, setCity] = useState(parsed.city);
  const [stateAbbrev, setStateAbbrev] = useState(parsed.state);

  useEffect(() => {
    const next = serializeAddress({ address: street, city, state: stateAbbrev });
    if (next !== value) {
      onChange(next);
    }
  }, [street, city, stateAbbrev]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync from external value (e.g. when church data loads)
  useEffect(() => {
    const p = parseAddressValue(value);
    setStreet(p.address);
    setCity(p.city);
    setStateAbbrev(p.state);
  }, [value]);

  const gap = compact ? "gap-2" : "gap-3";
  return (
    <div className={`flex flex-col ${gap}`}>
      <div>
        <label className="block text-[10px] text-white/40 font-medium mb-1">Street address</label>
        <input
          type="text"
          value={street}
          onChange={(e) => setStreet(e.target.value)}
          placeholder="123 Main St"
          className={INPUT_CLASS}
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-[10px] text-white/40 font-medium mb-1">City</label>
          <input
            type="text"
            value={city}
            onChange={(e) => setCity(e.target.value)}
            placeholder="Springfield"
            className={INPUT_CLASS}
          />
        </div>
        <div>
          <label className="block text-[10px] text-white/40 font-medium mb-1">State</label>
          <select
            value={stateAbbrev}
            onChange={(e) => setStateAbbrev(e.target.value)}
            className={`${INPUT_CLASS} appearance-none cursor-pointer`}
          >
            <option value="" className="bg-[#1E1040] text-white/50">State</option>
            {US_STATES.map((s) => (
              <option key={s.abbrev} value={s.abbrev} className="bg-[#1E1040]">
                {s.abbrev} – {s.name}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}

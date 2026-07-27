import { getCountry } from "../config/countries";
import { STATE_NAMES } from "./map-constants";
import { StateFlag } from "./StateFlag";

type Size = "sm" | "md";

const dimensions: Record<Size, { width: number; height: number }> = {
  sm: { width: 16, height: 11 },
  md: { width: 24, height: 16 },
};

/** Flagcdn widths — pick the next size up from our display box. */
const FLAGCDN_W: Record<Size, number> = { sm: 20, md: 40 };

type FlagTarget =
  | { kind: "us-state"; abbrev: string }
  | { kind: "country"; cc: string };

/**
 * Resolve a place id to a flag.
 * - WORLD / ALL: `abbrev` is an ISO country code
 * - US: `abbrev` is a US state (CA = California, not Canada)
 * - Other countries: show the parent country's national flag for regions
 */
function resolveFlagTarget(
  abbrev: string,
  parentCountryCode: string,
): FlagTarget | null {
  const code = abbrev.trim().toUpperCase();
  if (!code) return null;
  const parent = parentCountryCode.trim().toUpperCase() || "US";

  if (parent === "WORLD" || parent === "ALL") {
    if (getCountry(code)) return { kind: "country", cc: code };
    return null;
  }

  if (parent === "US") {
    if (STATE_NAMES[code] || code === "DC") return { kind: "us-state", abbrev: code };
    if (getCountry(code)) return { kind: "country", cc: code };
    return { kind: "us-state", abbrev: code };
  }

  if (getCountry(parent)) return { kind: "country", cc: parent };
  if (getCountry(code)) return { kind: "country", cc: code };
  return null;
}

function CountryFlagImg({
  cc,
  size,
}: {
  cc: string;
  size: Size;
}) {
  const { width, height } = dimensions[size];
  const src = `https://flagcdn.com/w${FLAGCDN_W[size]}/${cc.toLowerCase()}.png`;
  return (
    <span
      className="inline-flex items-center justify-center overflow-hidden rounded-sm flex-shrink-0 bg-white/10"
      style={{ width, height }}
      aria-hidden
    >
      <img
        src={src}
        alt=""
        width={width}
        height={height}
        className="h-full w-full object-cover"
        loading="lazy"
        decoding="async"
      />
    </span>
  );
}

/**
 * Flag for a listed place: US state flag, national flag (ISO CC), or parent
 * country flag for subnational regions outside the US.
 */
export function PlaceFlag({
  abbrev,
  countryCode = "US",
  size = "sm",
}: {
  abbrev: string;
  /** Viewing context: US | WORLD | FR | … */
  countryCode?: string;
  size?: Size;
}) {
  const target = resolveFlagTarget(abbrev, countryCode);
  if (!target) return null;
  if (target.kind === "us-state") {
    return <StateFlag abbrev={target.abbrev} size={size} />;
  }
  return <CountryFlagImg cc={target.cc} size={size} />;
}

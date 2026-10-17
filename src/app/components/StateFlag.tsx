type Size = "sm" | "md";

const dimensions: Record<Size, { width: number; height: number }> = {
  sm: { width: 16, height: 11 },
  md: { width: 24, height: 16 },
};

/** Flagcdn widths — the next size up from the display box (retina-sharp). */
const FLAGCDN_W: Record<Size, number> = { sm: 40, md: 80 };

/**
 * US state flag as a small image (flagcdn, same source as country flags in PlaceFlag).
 * Replaces the us-state-flags package, whose inline SVGs were ~2.4 MB of the main bundle.
 * flagcdn has no DC flag, so DC is drawn inline (white field, two red bars, three stars).
 */
export function StateFlag({
  abbrev,
  size = "sm",
}: {
  abbrev: string;
  size?: Size;
}) {
  const { width, height } = dimensions[size];
  const code = abbrev.trim().toLowerCase();
  return (
    <span
      className="inline-flex items-center justify-center overflow-hidden rounded-sm flex-shrink-0 bg-white/10"
      style={{ width, height }}
      aria-hidden
    >
      {code === "dc" ? (
        <DcFlag />
      ) : (
        <img
          src={`https://flagcdn.com/w${FLAGCDN_W[size]}/us-${code}.png`}
          alt=""
          width={width}
          height={height}
          className="h-full w-full object-cover"
          loading="lazy"
          decoding="async"
        />
      )}
    </span>
  );
}

function DcFlag() {
  const star = "M0,-1 L0.2245,-0.309 L0.9511,-0.309 L0.3633,0.118 L0.5878,0.809 L0,0.382 L-0.5878,0.809 L-0.3633,0.118 L-0.9511,-0.309 L-0.2245,-0.309 Z";
  return (
    <svg viewBox="0 0 30 20" className="h-full w-full" aria-hidden>
      <rect width="30" height="20" fill="#fff" />
      <rect y="8" width="30" height="3" fill="#E91436" />
      <rect y="13.5" width="30" height="3" fill="#E91436" />
      {[8, 15, 22].map((x) => (
        <path key={x} d={star} transform={`translate(${x} 4.2) scale(2)`} fill="#E91436" />
      ))}
    </svg>
  );
}

import { useEffect, useState } from "react";
import { MapPin, Plus, X, Church as ChurchIcon, Loader2 } from "lucide-react";
import type { Church } from "./church-data";
import type { MapPress } from "./MapLibreCanvas";
import type { ReverseGeocodeResult } from "./api";

export type PressAddress = ReverseGeocodeResult | null | "loading";

/** Banner shown while placement mode waits for a click on the map. */
export function PlacementBanner({ onCancel }: { onCancel: () => void }) {
  return (
    <div className="pointer-events-auto absolute left-1/2 top-[max(6.5rem,calc(env(safe-area-inset-top)+6rem))] z-30 -translate-x-1/2 flex w-max max-w-[calc(100vw-1.5rem)] items-center gap-2 rounded-full bg-hmc-surface/95 py-2 pl-4 pr-2 text-xs text-white shadow-hmc-panel border border-white/10" role="status">
      <MapPin size={14} className="flex-shrink-0 text-purple-300" />
      <span className="whitespace-nowrap">Tap the map where the church is</span>
      <button type="button" onClick={onCancel} className="flex-shrink-0 rounded-full px-2 py-0.5 text-white/60 hover:bg-white/10 hover:text-white">Cancel</button>
    </div>
  );
}

const describe = (a: PressAddress) => a === "loading" ? null : a ? [a.address, a.city].filter(Boolean).join(", ") : "";

/**
 * "Add a church here" card at a spot picked on the map: the address there, any listed churches
 * already within ~150 m, and named places of worship the basemap shows nearby.
 */
export function AddHerePopover({
  press,
  address,
  regionName,
  nearbyChurches,
  onOpenChurch,
  onAdd,
  onCancel,
}: {
  press: MapPress;
  address: PressAddress;
  regionName: string;
  nearbyChurches: (Church & { distanceM?: number })[];
  onOpenChurch: (church: Church) => void;
  onAdd: (name?: string) => void;
  onCancel: () => void;
}) {
  const [narrow, setNarrow] = useState(() => typeof window !== "undefined" && window.matchMedia("(max-width: 639px)").matches);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)");
    const on = () => setNarrow(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  const width = 300;
  const left = Math.min(Math.max(press.x, width / 2 + 12), (typeof window !== "undefined" ? window.innerWidth : 1024) - width / 2 - 12);
  const place = describe(address);
  return (
    <div
      role="dialog"
      aria-label="Add a church here"
      className={`pointer-events-auto z-50 rounded-2xl border border-white/10 bg-hmc-surface/95 p-4 text-white shadow-hmc-panel backdrop-blur ${narrow ? "fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))]" : "absolute"}`}
      style={narrow ? undefined : { left, top: press.y, width, transform: "translate(-50%, calc(-100% - 48px))" }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold">Add a church here?</p>
          <p className="mt-0.5 text-caption text-white/60">
            {address === "loading" ? (
              <span className="inline-flex items-center gap-1"><Loader2 size={11} className="animate-spin" /> Finding the address…</span>
            ) : place || `A spot in ${regionName}`}
          </p>
        </div>
        <button type="button" onClick={onCancel} aria-label="Cancel" className="-m-1 rounded-full p-1 text-white/50 hover:bg-white/10 hover:text-white"><X size={14} /></button>
      </div>

      {nearbyChurches.length > 0 && (
        <div className="mt-3">
          <p className="mb-1 text-caption font-semibold text-amber-100">Already listed right here</p>
          <ul className="space-y-0.5">
            {nearbyChurches.map((ch) => (
              <li key={ch.id}>
                <button type="button" onClick={() => onOpenChurch(ch)} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-white/5">
                  <ChurchIcon size={12} className="flex-shrink-0 text-purple-300" />
                  <span className="min-w-0 flex-1 truncate text-xs">{ch.name}</span>
                  {ch.distanceM != null && <span className="text-[10px] text-white/50">{Math.max(10, Math.round(ch.distanceM / 10) * 10)} m</span>}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {press.nearbyPlaces.length > 0 && (
        <div className="mt-3">
          <p className="mb-1 text-caption font-semibold text-white/80">Is it one of these?</p>
          <div className="flex flex-wrap gap-1.5">
            {press.nearbyPlaces.map((p) => (
              <button key={p.name} type="button" onClick={() => onAdd(p.name)} className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-caption text-white/80 hover:border-purple-400/40 hover:text-white">
                {p.name}
              </button>
            ))}
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={() => onAdd()}
        className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-xs font-semibold text-white"
        style={{ background: "linear-gradient(135deg, #6B21A8 0%, #A855F7 100%)" }}
      >
        <Plus size={14} /> Add a church at this spot
      </button>
      <p className="mt-2 text-center text-[10px] text-white/45">Drag the pin to fine-tune the spot.</p>
    </div>
  );
}

import { LocateFixed, Sparkles } from "lucide-react";
import { Button } from "../ui/button";
import { CloseButton } from "../ui/close-button";

interface Easter2026SpecialReportBlurbModalProps {
  onClose: () => void;
}

export function Easter2026SpecialReportBlurbModal({ onClose }: Easter2026SpecialReportBlurbModalProps) {
  const requestLocationForSession = () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        try {
          sessionStorage.setItem(
            "hmc_easter_loc",
            JSON.stringify({ lat: pos.coords.latitude, lng: pos.coords.longitude })
          );
        } catch {
          // ignore
        }
      },
      () => {
        // ignore (user can retry from the Verified panel)
      },
      { enableHighAccuracy: false, timeout: 12000, maximumAge: 0 }
    );
  };

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 backdrop-blur-sm bg-black/30" />

      <div
        className="relative w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden bg-white"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 px-6 pt-6 pb-4 border-b border-stone-200/70">
          <div className="min-w-0">
            <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-purple-700">
              <Sparkles className="h-4 w-4" aria-hidden />
              Special report
            </div>
            <h2 className="mt-2 text-xl font-bold text-stone-900 tracking-tight">
              Easter 2026: Service times across the map
            </h2>
            <p className="mt-2 text-sm text-stone-600 text-pretty">
              Lots of people are looking for a church for Easter. We pulled together churches across all states that
              currently have service times listed — and you can quickly see the closest verified listings near you
              (address, website, and service times on file).
            </p>
          </div>
          <CloseButton onClick={onClose} size="md" className="text-stone-700" />
        </div>

        <div className="px-6 py-5">
          <div className="flex flex-col sm:flex-row gap-3 sm:justify-end">
            <Button variant="outline" onClick={onClose}>
              Maybe later
            </Button>
            <Button variant="outline" onClick={requestLocationForSession} className="inline-flex items-center gap-2">
              <LocateFixed className="h-4 w-4" aria-hidden />
              Use my location
            </Button>
            <Button
              onClick={() => {
                onClose();
                window.location.href = "/?verified=1";
              }}
            >
              View verified dots on map
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}


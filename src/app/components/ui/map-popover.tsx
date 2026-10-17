import * as React from "react";

import { CloseButton } from "./close-button";
import { Panel } from "./panel";
import { cn } from "./utils";

/**
 * Popover that opens beside the bottom-left map controls (Filters, Map key, Verified mode).
 * Escape closes it. Pass `padded={false}` when the content brings its own sections.
 */
export function MapPopover({
  title,
  icon,
  onClose,
  padded = true,
  className,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  onClose: () => void;
  padded?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <Panel
      variant="glass"
      elevation="menu"
      radius="panel"
      role="dialog"
      aria-label={title}
      className={cn(
        "absolute left-[58px] bottom-6 z-[var(--z-popovers)] w-[268px] max-h-[70vh] overflow-y-auto",
        "animate-in fade-in-0 slide-in-from-left-1 duration-150",
        className,
      )}
    >
      <div
        className={cn(
          "flex items-center justify-between",
          padded ? "px-4 pt-4 pb-3" : "px-4 pt-4 pb-3 border-b border-hmc-border",
        )}
      >
        <div className="flex items-center gap-2">
          {icon}
          <span className="font-display text-sm font-semibold text-hmc-text">{title}</span>
        </div>
        <CloseButton onClick={onClose} size="md" />
      </div>
      <div className={padded ? "px-4 pb-4" : undefined}>{children}</div>
    </Panel>
  );
}

import * as React from "react";

import { cn } from "./utils";

/**
 * The dark purple surface used for map panels, cards and popovers.
 *  - solid: opaque panel (detail card, side panels)
 *  - glass: translucent + blur, for things floating over the map (pills, controls, popovers)
 */
export interface PanelProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "solid" | "glass";
  elevation?: "pill" | "menu" | "panel" | "none";
  radius?: "menu" | "panel" | "full";
}

export const Panel = React.forwardRef<HTMLDivElement, PanelProps>(
  ({ variant = "solid", elevation = "panel", radius = "panel", className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "text-hmc-text border border-hmc-border",
        variant === "glass" ? "bg-hmc-surface-glass backdrop-blur-md" : "bg-hmc-surface",
        elevation === "pill" && "shadow-hmc-pill",
        elevation === "menu" && "shadow-hmc-menu",
        elevation === "panel" && "shadow-hmc-panel",
        radius === "menu" && "rounded-menu",
        radius === "panel" && "rounded-panel",
        radius === "full" && "rounded-full",
        className,
      )}
      {...props}
    />
  ),
);
Panel.displayName = "Panel";

import * as React from "react";
import { X } from "lucide-react";
import { cn } from "./utils";

const sizeClasses = {
  sm: "w-6 h-6",
  md: "w-8 h-8",
  lg: "w-9 h-9",
} as const;

const iconSizes = {
  sm: 14,
  md: 16,
  lg: 20,
} as const;

export interface CloseButtonProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  size?: "sm" | "md" | "lg";
  ariaLabel?: string;
  className?: string;
}

export function CloseButton({
  onClick,
  size = "sm",
  className,
  ariaLabel = "Close",
  ...rest
}: CloseButtonProps) {
  const iconSize = iconSizes[size];
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      className={cn(
        "relative rounded-full flex items-center justify-center hover:bg-white/10 active:bg-white/20 transition-colors flex-shrink-0",
        "after:absolute after:inset-[-6px] after:content-['']",
        sizeClasses[size],
        className
      )}
      {...rest}
    >
      <X size={iconSize} className="text-white/50" />
    </button>
  );
}

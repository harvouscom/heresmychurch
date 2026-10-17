import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";

import { cn } from "./utils";

/**
 * Here's My Church modal: the dark purple card used across the map UI, on Radix Dialog
 * (focus trap, Escape to close, scroll lock, focus returns to the trigger, labelled for
 * screen readers).
 *
 * Usage: render while the modal should be open (most callers mount it conditionally),
 * and give it a title, either as <HmcDialogTitle> inside the content (keeps the caller's
 * header layout) or via the `title` prop for a visually hidden label.
 */
export interface HmcDialogProps {
  onClose: () => void;
  children: React.ReactNode;
  /** Card classes (width, padding, layout). Defaults to a max-w-md column. */
  className?: string;
  /** Visually hidden accessible title, for dialogs without a visible <HmcDialogTitle>. */
  title?: string;
  /** Close when the backdrop is clicked (default true). */
  closeOnBackdrop?: boolean;
  /** Close on Escape (default true). Forms with unsaved input may want to confirm first. */
  closeOnEscape?: boolean;
  /** Raise above another open dialog/panel (e.g. a form opened from a modal). */
  elevated?: boolean;
  /** "dark" (default): purple card. "light": white card for the cream-themed flows. */
  tone?: "dark" | "light";
  /** Only position the content; the child brings its own card (e.g. a motion.div). */
  bare?: boolean;
}

// Stop React synthetic events from bubbling (through the portal) to map handlers on
// ancestors, matching the old cards' onClick={e => e.stopPropagation()}.
const stop = (e: React.SyntheticEvent) => e.stopPropagation();
const STOP_HANDLERS = {
  onClick: stop,
  onMouseDown: stop,
  onMouseMove: stop,
  onPointerDown: stop,
  onTouchStart: stop,
  onWheel: stop,
  onKeyDown: stop,
};

export function HmcDialog({
  onClose,
  children,
  className,
  title,
  closeOnBackdrop = true,
  closeOnEscape = true,
  elevated = false,
  tone = "dark",
  bare = false,
}: HmcDialogProps) {
  const z = elevated ? "z-[calc(var(--z-modals)+5)]" : "z-[var(--z-modals)]";
  return (
    <DialogPrimitive.Root open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogPrimitive.Portal>
        <div {...STOP_HANDLERS}>
          <DialogPrimitive.Overlay
            className={cn(
              "fixed inset-0 bg-[#0B0618]/35 backdrop-blur-sm",
              "data-[state=open]:animate-in data-[state=open]:fade-in-0",
              z,
            )}
          />
          <DialogPrimitive.Content
            aria-describedby={undefined}
            onPointerDownOutside={(e) => { if (!closeOnBackdrop) e.preventDefault(); }}
            onInteractOutside={(e) => { if (!closeOnBackdrop) e.preventDefault(); }}
            onEscapeKeyDown={(e) => { if (!closeOnEscape) e.preventDefault(); }}
            className={cn(
              "fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 outline-none",
              "w-[calc(100%-2rem)] max-w-md",
              !bare && [
                "max-h-[85dvh] flex flex-col overflow-hidden rounded-panel shadow-hmc-panel border",
                tone === "dark"
                  ? "bg-hmc-surface text-hmc-text border-hmc-border"
                  : "bg-white text-stone-900 border-stone-200/70",
                "data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-[0.97] duration-200",
              ],
              z,
              className,
            )}
          >
            {title ? <DialogPrimitive.Title className="sr-only">{title}</DialogPrimitive.Title> : null}
            {children}
          </DialogPrimitive.Content>
        </div>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

/** Visible dialog title; rounded like all titles. Use asChild to keep an existing <h2>. */
export const HmcDialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title ref={ref} className={cn("font-display", className)} {...props} />
));
HmcDialogTitle.displayName = "HmcDialogTitle";

/** Optional description, wired to aria-describedby by Radix. */
export const HmcDialogDescription = DialogPrimitive.Description;

/** Wrap an element (e.g. the existing <CloseButton>) so it closes the dialog. */
export const HmcDialogClose = DialogPrimitive.Close;

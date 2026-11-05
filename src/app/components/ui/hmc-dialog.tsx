import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { usePresence } from "motion/react";

import { cn } from "./utils";

/**
 * Here's My Church modal: the dark purple card used across the map UI, on Radix Dialog
 * (focus trap, Escape to close, scroll lock, focus returns to the trigger, labelled for
 * screen readers).
 *
 * Usage: render while the modal should be open (most callers mount it conditionally),
 * and give it a title, either as <HmcDialogTitle> inside the content (keeps the caller's
 * header layout) or via the `title` prop for a visually hidden label.
 *
 * Exit animation: mount it inside <AnimatePresence> with a `key`. Without one the modal
 * still works and simply disappears on unmount.
 *
 * Scrolling: put the content that can grow in <HmcDialogBody>, with headers and footers
 * as its siblings. On short screens (see the `short` variant) the whole card scrolls
 * instead, because fixed headers and footers would leave the body too small to read.
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
/** Keep in step with the duration of the exit classes below. */
const EXIT_MS = 150;

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
  // Under AnimatePresence, stay mounted long enough to play the exit. Radix stays open
  // meanwhile, so focus returns to the trigger only once the card has gone.
  const [isPresent, safeToRemove] = usePresence();
  React.useEffect(() => {
    if (isPresent || !safeToRemove) return;
    const timer = window.setTimeout(safeToRemove, EXIT_MS);
    return () => window.clearTimeout(timer);
  }, [isPresent, safeToRemove]);
  return (
    <DialogPrimitive.Root open onOpenChange={(open) => { if (!open && isPresent) onClose(); }}>
      <DialogPrimitive.Portal>
        <div {...STOP_HANDLERS}>
          <DialogPrimitive.Overlay
            className={cn(
              "hmc-dialog-backdrop fixed inset-0 bg-[#0B0618]/35 backdrop-blur-sm",
              isPresent
                ? "animate-in fade-in-0 duration-200"
                : "animate-out fade-out-0 duration-150 [animation-fill-mode:forwards]",
              z,
            )}
          />
          <DialogPrimitive.Content
            aria-describedby={undefined}
            onPointerDownOutside={(e) => { if (!closeOnBackdrop) e.preventDefault(); }}
            onInteractOutside={(e) => { if (!closeOnBackdrop) e.preventDefault(); }}
            onEscapeKeyDown={(e) => { if (!closeOnEscape) e.preventDefault(); }}
            className={cn(
              // Centred in what's visible, which the keyboard shortens (see useIosFullBleed).
              "fixed left-1/2 top-[calc((100dvh-var(--hmc-keyboard,0px))/2)] -translate-x-1/2 -translate-y-1/2 outline-none transition-[top,max-height] duration-300 ease-out",
              "w-[calc(100%-2rem)] max-w-md",
              isPresent
                ? "animate-in fade-in-0 zoom-in-[0.97] slide-in-from-bottom-2 duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]"
                : "animate-out fade-out-0 zoom-out-[0.98] duration-150 ease-in [animation-fill-mode:forwards]",
              !bare && [
                "max-h-[min(85dvh,calc(100dvh-var(--hmc-keyboard,0px)-1.5rem))] short:max-h-[calc(100dvh-var(--hmc-keyboard,0px)-1.5rem)] flex flex-col overflow-hidden rounded-panel shadow-hmc-panel border",
                tone === "dark"
                  ? "bg-hmc-surface text-hmc-text border-hmc-border"
                  : "bg-white text-stone-900 border-stone-200/70",
              ],
              z,
              className,
            )}
          >
            {title ? <DialogPrimitive.Title className="sr-only">{title}</DialogPrimitive.Title> : null}
            {bare ? children : (
              // Layout-neutral normally; becomes the card's scroller on short screens. It
              // isn't positioned, so an absolute close button stays put while it scrolls.
              <div className="contents short:block short:min-h-0 short:flex-1 short:overflow-y-auto short:overscroll-contain">
                {children}
              </div>
            )}
          </DialogPrimitive.Content>
        </div>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

/**
 * The part of a modal that scrolls. Fades its top and bottom edges only while there is
 * more to see, so a row cut off by the card reads as "keep scrolling".
 */
export const HmcDialogBody = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, children, ...props }, forwardedRef) => {
    const localRef = React.useRef<HTMLDivElement>(null);
    React.useImperativeHandle(forwardedRef, () => localRef.current as HTMLDivElement);
    useScrollEdges(localRef);
    return (
      <div
        ref={localRef}
        className={cn(
          "hmc-scroll-edges flex-1 min-h-0 overflow-y-auto overscroll-contain",
          "short:flex-none short:overflow-visible",
          className,
        )}
        {...props}
      >
        {children}
      </div>
    );
  },
);
HmcDialogBody.displayName = "HmcDialogBody";

/** Sets data-more-above / data-more-below on a scroller while content is hidden that way. */
export function useScrollEdges(ref: React.RefObject<HTMLElement | null>) {
  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => {
      const above = el.scrollTop > 1;
      const below = el.scrollHeight - el.clientHeight - el.scrollTop > 1;
      el.toggleAttribute("data-more-above", above);
      el.toggleAttribute("data-more-below", below);
    };
    update();
    el.addEventListener("scroll", update, { passive: true });
    // Content arrives late in most modals (fetches, lazy sections), so watch it too.
    const ro = new ResizeObserver(update);
    ro.observe(el);
    Array.from(el.children).forEach((child) => ro.observe(child));
    return () => {
      el.removeEventListener("scroll", update);
      ro.disconnect();
    };
  }, [ref]);
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

import { Toaster as Sonner, type ToasterProps } from "sonner";

/**
 * App-wide toasts in the Here's My Church style: dark purple glass, rounded, bottom
 * centre (above the search bar on phones). Mounted once in RootLayout; call
 * `toast.success("…")` from "sonner" anywhere.
 */
const Toaster = (props: ToasterProps) => (
  <Sonner
    theme="dark"
    position="top-center"
    offset={88}
    mobileOffset={{ top: 76 }}
    gap={8}
    toastOptions={{
      classNames: {
        toast:
          "!rounded-panel !border !border-hmc-border !bg-hmc-surface-glass !backdrop-blur-md !shadow-hmc-menu !text-white !font-sans !px-4 !py-3 !gap-2.5",
        title: "!text-sm !font-medium",
        description: "!text-xs !text-hmc-text-muted",
        icon: "!text-hmc-lilac",
        success: "[&_[data-icon]]:!text-green-400",
        error: "[&_[data-icon]]:!text-red-400",
        actionButton: "!bg-hmc-brand !text-white !rounded-full !text-xs !font-medium",
      },
    }}
    style={{ zIndex: "var(--z-toasts, 90)" } as React.CSSProperties}
    {...props}
  />
);

export { Toaster };

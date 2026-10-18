import { Outlet } from "react-router";
import { MotionConfig } from "motion/react";
import { SeoCanonical } from "./components/SeoCanonical";
import { Toaster } from "./components/ui/sonner";

export function RootLayout() {
  return (
    // reducedMotion="user": Motion animations follow the OS "reduce motion" setting.
    <MotionConfig reducedMotion="user">
      <SeoCanonical />
      <Outlet />
      <Toaster />
    </MotionConfig>
  );
}

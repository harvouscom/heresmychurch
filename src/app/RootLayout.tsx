import { Outlet } from "react-router";
import { SeoCanonical } from "./components/SeoCanonical";
import { Toaster } from "./components/ui/sonner";

export function RootLayout() {
  return (
    <>
      <SeoCanonical />
      <Outlet />
      <Toaster />
    </>
  );
}

import { Outlet } from "react-router";
import { SeoCanonical } from "./components/SeoCanonical";

export function RootLayout() {
  return (
    <>
      <SeoCanonical />
      <Outlet />
    </>
  );
}

import { RouterProvider } from "react-router";
import { router } from "./routes";
import { AppErrorBoundary } from "./components/ErrorBoundary";

export default function App() {
  return (
    <AppErrorBoundary>
      <div className="size-full">
        <RouterProvider router={router} />
      </div>
    </AppErrorBoundary>
  );
}
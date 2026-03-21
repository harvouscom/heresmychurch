import { RouterProvider } from "react-router";
import { router } from "./routes";
import { AppErrorBoundary } from "./components/ErrorBoundary";

export default function App() {
  return (
    <AppErrorBoundary>
      <div className="size-full" style={{ fontFamily: "'Livvic', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif" }}>
        <RouterProvider router={router} />
      </div>
    </AppErrorBoundary>
  );
}
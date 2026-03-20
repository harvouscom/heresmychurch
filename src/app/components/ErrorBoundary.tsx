import React from "react";
import { Church, RefreshCw, Mail } from "lucide-react";

const CONTACT_EMAIL = "hey@heresmychurch.com";

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class AppErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("[AppErrorBoundary] Caught error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          className="flex items-center justify-center min-h-screen"
          style={{
            backgroundColor: "#1A0E38",
            fontFamily: "'Livvic', sans-serif",
          }}
        >
          <div className="flex flex-col items-center gap-5 px-8 py-10 rounded-2xl max-w-md text-center">
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center"
              style={{
                background: "linear-gradient(135deg, #6B21A8 0%, #A855F7 100%)",
              }}
            >
              <Church size={28} className="text-white" />
            </div>
            <div>
              <h1 className="text-white text-xl font-semibold mb-2">
                Something went wrong
              </h1>
              <p className="text-white/50 text-sm leading-relaxed">
                The app ran into an unexpected error. This is usually temporary
                — refreshing the page should fix it.
              </p>
            </div>
            {this.state.error && (
              <div className="w-full rounded-lg bg-white/5 border border-white/10 px-4 py-3">
                <p className="text-red-300/70 text-xs font-mono break-all">
                  {this.state.error.message}
                </p>
              </div>
            )}
            <div className="flex flex-wrap gap-3 justify-center">
              <button
                onClick={() => window.location.reload()}
                className="flex items-center gap-2 px-6 py-3 rounded-full text-white text-sm font-medium shadow-lg hover:shadow-xl transition-all"
                style={{
                  background: "linear-gradient(135deg, #6B21A8 0%, #A855F7 100%)",
                }}
              >
                <RefreshCw size={16} />
                Refresh Page
              </button>
              <a
                href={`mailto:${CONTACT_EMAIL}`}
                className="flex items-center gap-2 px-6 py-3 rounded-full text-white/60 text-sm border border-white/15 hover:bg-white/5 transition-all"
              >
                <Mail size={16} />
                Email us
              </a>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

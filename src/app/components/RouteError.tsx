import { useRouteError } from "react-router";
import { RefreshCw, Home, Mail } from "lucide-react";

const CONTACT_EMAIL = "hey@heresmychurch.com";
import logoImg from "../../assets/a94bce1cf0860483364d5d9c353899b7da8233e7.png";

export function RouteError() {
  const error = useRouteError();
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
      ? error
      : "An unexpected error occurred";

  console.error("[RouteError]", error);

  return (
    <div
      className="flex items-center justify-center min-h-screen"
      style={{
        backgroundColor: "#1A0E38",
        fontFamily: "'Livvic', sans-serif",
      }}
    >
      <div className="flex flex-col items-center gap-5 px-8 py-10 rounded-2xl max-w-md text-center">
        <div className="w-16 h-16 rounded-2xl overflow-hidden flex items-center justify-center">
          <img src={logoImg} alt="Here's My Church" className="w-full h-full object-cover" />
        </div>
        <div>
          <h1 className="text-white text-xl font-bold mb-2">
            Something went wrong
          </h1>
          <p className="text-white/50 text-sm leading-relaxed">
            Here&apos;s My Church ran into an unexpected error. This is usually
            temporary — try refreshing or going home.
          </p>
        </div>
        <div className="w-full rounded-lg bg-white/5 border border-white/10 px-4 py-3">
          <p className="text-red-300/70 text-xs font-mono break-all">
            {message}
          </p>
        </div>
        <div className="flex flex-wrap gap-3 justify-center">
          <button
            onClick={() => window.location.reload()}
            className="flex items-center gap-2 px-5 py-2.5 rounded-full text-white text-sm font-medium shadow-lg hover:shadow-xl transition-all"
            style={{
              background: "linear-gradient(135deg, #6B21A8 0%, #A855F7 100%)",
            }}
          >
            <RefreshCw size={15} />
            Refresh
          </button>
          <a
            href="/"
            className="flex items-center gap-2 px-5 py-2.5 rounded-full text-white/60 text-sm border border-white/15 hover:bg-white/5 transition-all"
          >
            <Home size={15} />
            Home
          </a>
          <a
            href={`mailto:${CONTACT_EMAIL}`}
            className="flex items-center gap-2 px-5 py-2.5 rounded-full text-white/60 text-sm border border-white/15 hover:bg-white/5 transition-all"
          >
            <Mail size={15} />
            Email us
          </a>
        </div>
      </div>
    </div>
  );
}

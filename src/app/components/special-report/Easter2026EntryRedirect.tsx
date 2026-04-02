import { useEffect } from "react";

export function Easter2026EntryRedirect() {
  useEffect(() => {
    window.location.replace("/?verified=1");
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-3xl px-6 py-10 text-sm text-stone-500">
        Redirecting to the verified Easter map…
      </div>
    </div>
  );
}


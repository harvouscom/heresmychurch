import { useLayoutEffect } from "react";
import { createRoot } from "react-dom/client";
import App from "./app/App.tsx";
import "./styles/index.css";

function AppStartup() {
  useLayoutEffect(() => {
    // Swap the initial loading surface for the app in the same painted frame.
    window.dispatchEvent(new Event("hmc-app-ready"));
  }, []);
  return <App />;
}

createRoot(document.getElementById("root")!).render(<AppStartup />);

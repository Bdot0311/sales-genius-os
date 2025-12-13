import { createRoot } from "react-dom/client";
import { HelmetProvider } from "react-helmet-async";
import App from "./App.tsx";
import "./index.css";

// Import white label hook at app initialization
import { useWhiteLabel } from "./hooks/use-white-label";

function Root() {
  // Apply white label settings on app load
  useWhiteLabel();
  return (
    <HelmetProvider>
      <App />
    </HelmetProvider>
  );
}

createRoot(document.getElementById("root")!).render(<Root />);

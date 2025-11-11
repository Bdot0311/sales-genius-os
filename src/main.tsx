import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Import white label hook at app initialization
import { useWhiteLabel } from "./hooks/use-white-label";

function Root() {
  // Apply white label settings on app load
  useWhiteLabel();
  return <App />;
}

createRoot(document.getElementById("root")!).render(<Root />);

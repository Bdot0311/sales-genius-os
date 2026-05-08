import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Aggressively unregister any existing service worker on ALL hosts and clear
// its caches. Stale precached index.html was pointing at old hashed chunks
// after recent perf rebuilds, causing blank screens on revisit (especially
// mobile, where SWs persist longest). We are NOT re-registering a SW until
// the PWA caching strategy is reworked to be safe across deploys.
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then((registrations) => {
    registrations.forEach((r) => r.unregister());
  }).catch(() => {});
  if (typeof caches !== 'undefined') {
    caches.keys().then((keys) => {
      keys.forEach((k) => caches.delete(k));
    }).catch(() => {});
  }
}

createRoot(document.getElementById("root")!).render(<App />);

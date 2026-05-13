import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Clean up legacy PWA caches/SWs, but preserve our push notification SW
// (registered at /push-sw.js with scope /push-sw/).
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then((registrations) => {
    registrations.forEach((r) => {
      const scriptUrl = r.active?.scriptURL || r.installing?.scriptURL || r.waiting?.scriptURL || '';
      if (!scriptUrl.includes('/push-sw.js')) {
        r.unregister();
      }
    });
  }).catch(() => {});
}

if (typeof caches !== 'undefined') {
  caches.keys().then((keys) => {
    keys.forEach((k) => {
      // Don't nuke push-related caches if any
      if (!k.includes('push')) caches.delete(k);
    });
  }).catch(() => {});
}

createRoot(document.getElementById("root")!).render(<App />);

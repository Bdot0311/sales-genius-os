import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Remove legacy PWA caches on every boot. Some mobile browsers persisted an
// old app shell that referenced deleted hashed chunks, producing a blank page.
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.ready
    .then((registration) => registration.update().catch(() => {}))
    .catch(() => {});
  navigator.serviceWorker.getRegistrations().then((registrations) => {
    registrations.forEach((r) => r.unregister());
  }).catch(() => {});
}

if (typeof caches !== 'undefined') {
  caches.keys().then((keys) => {
    keys.forEach((k) => caches.delete(k));
  }).catch(() => {});
}

createRoot(document.getElementById("root")!).render(<App />);

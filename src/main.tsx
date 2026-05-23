import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Self-heal stale chunk references after a redeploy. When a dynamic import
// fails because the hashed chunk URL no longer exists, force a one-shot
// reload so the browser fetches the fresh index.html + new chunk hashes.
const CHUNK_RELOAD_KEY = "__chunk_reload_attempt__";
const CHUNK_RELOAD_WINDOW_MS = 30_000;
const isChunkLoadError = (msg: string) =>
  /Importing a module script failed|Failed to fetch dynamically imported module|error loading dynamically imported module|ChunkLoadError/i.test(
    msg
  );
const tryReload = () => {
  try {
    const lastReload = Number(sessionStorage.getItem(CHUNK_RELOAD_KEY) || 0);
    if (Date.now() - lastReload < CHUNK_RELOAD_WINDOW_MS) return;
    sessionStorage.setItem(CHUNK_RELOAD_KEY, String(Date.now()));
  } catch {}
  location.reload();
};
window.addEventListener("vite:preloadError", (e) => {
  e.preventDefault();
  tryReload();
});
window.addEventListener("error", (e) => {
  if (e?.message && isChunkLoadError(e.message)) tryReload();
});
window.addEventListener("unhandledrejection", (e) => {
  const msg = String((e as PromiseRejectionEvent)?.reason?.message || (e as PromiseRejectionEvent)?.reason || "");
  if (isChunkLoadError(msg)) tryReload();
});
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

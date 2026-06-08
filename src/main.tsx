import { createRoot } from "react-dom/client";
import * as Sentry from "@sentry/react";
import App from "./App.tsx";
import "./index.css";

Sentry.init({
  dsn: "https://3419bbc0b0d5de6af9e00fd6f7b96295@o4511526216597504.ingest.us.sentry.io/4511526241697792",
  sendDefaultPii: true,
  tracesSampleRate: 0.1,
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 1.0,
  environment: import.meta.env.MODE,
  // Filter out noise from browser extensions, third-party scripts, and known
  // non-actionable rejections. These do not originate from our code.
  ignoreErrors: [
    // Browser-extension injected content scripts (LastPass/password managers etc.)
    "Object Not Found Matching Id",
    "MethodName:update",
    "MethodName:getProperty",
    // Generic noisy / non-actionable runtime errors
    "ResizeObserver loop limit exceeded",
    "ResizeObserver loop completed with undelivered notifications",
    "Non-Error promise rejection captured",
    // Network/abort noise users can't act on
    "Network request failed",
    "Load failed",
    "AbortError",
    "The user aborted a request",
    // Chunk reloads are self-healed above; no need to alert
    "Failed to fetch dynamically imported module",
    "Importing a module script failed",
    "ChunkLoadError",
  ],
  denyUrls: [
    // Browser extensions
    /extensions\//i,
    /^chrome:\/\//i,
    /^chrome-extension:\/\//i,
    /^moz-extension:\/\//i,
    /^safari-extension:\/\//i,
    /^safari-web-extension:\/\//i,
  ],
  beforeSend(event, hint) {
    const ex: any = hint?.originalException;
    const msg = typeof ex === "string" ? ex : ex?.message || event.message || "";
    if (typeof msg === "string" && /Object Not Found Matching Id|MethodName:(update|getProperty)/i.test(msg)) {
      return null;
    }
    return event;
  },
});

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

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
  const reason: any = (e as PromiseRejectionEvent)?.reason;
  const msg = String(reason?.message || reason || "");
  if (isChunkLoadError(msg)) { tryReload(); return; }
  // Suppress empty-object rejections (non-actionable, typically from third-party scripts).
  if (reason && typeof reason === "object" && !(reason instanceof Error) && !msg.length && Object.keys(reason).length === 0) {
    e.preventDefault();
  }
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

// Error monitoring is loaded after the first paint so it stays off the LCP
// critical path. Errors thrown before this resolves are still caught by the
// window listeners above.
const bootDeferred = () => {
  void import("./lib/sentry").then(({ initSentry }) => initSentry());
  // Expose public site tools to browser AI agents (WebMCP). No-op when unsupported.
  void import("./lib/webmcp").then(({ registerWebMcpTools }) => registerWebMcpTools());
};
if (typeof requestIdleCallback === "function") {
  requestIdleCallback(bootDeferred, { timeout: 3000 });
} else {
  setTimeout(bootDeferred, 1200);
}


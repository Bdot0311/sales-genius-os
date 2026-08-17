import { createRoot, hydrateRoot } from "react-dom/client";
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
  // Suppress rejections whose reason is a DOM Event (CustomEvent/ErrorEvent etc.).
  // Safari + browser extensions / third-party scripts reject with Event objects that
  // carry no stack or message, so they are pure noise.
  if (typeof Event !== "undefined" && reason instanceof Event) {
    e.preventDefault();
    return;
  }
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

const rootEl = document.getElementById("root")!;
// The homepage ships with its hero prerendered into #root at build time
// (scripts/prerender.mjs, marked data-prerendered). Adopt that markup instead
// of discarding it so the hero's static paint counts as LCP. Every other route
// still mounts fresh — including the crawler link-index the SEO plugin seeds,
// which createRoot() clears as before.
if (rootEl.dataset.prerendered === "true") {
  hydrateRoot(rootEl, <App />);
} else {
  createRoot(rootEl).render(<App />);
}

// Error monitoring is loaded after the first paint so it stays off the LCP
// critical path. Errors thrown before this resolves are still caught by the
// window listeners above.
// Traffic attribution is read immediately (before any SPA navigation can strip
// the landing URL's utm params) and stored for the rest of the session.
void import("./lib/attribution").then(({ initAttribution }) => initAttribution());

let deferredBooted = false;
const bootDeferred = () => {
  if (deferredBooted) return;
  deferredBooted = true;
  void import("./lib/sentry").then(({ initSentry }) => initSentry());
  // Analytics SDKs (posthog-js, @heycatch/sdk, gtag.js) are ~500 KB of source
  // combined. Loading them here keeps them off the LCP/TTI critical path; any
  // event captured before they resolve is queued by their facades and replayed.
  void import("./lib/posthog").then(({ initPostHog }) => initPostHog());
  void import("./lib/heycatch").then(({ initHeycatch }) => initHeycatch());
  void import("./lib/google-analytics").then(({ initGoogleAnalytics }) => initGoogleAnalytics());
  // Expose public site tools to browser AI agents (WebMCP). No-op when unsupported.
  void import("./lib/webmcp").then(({ registerWebMcpTools }) => registerWebMcpTools());
};

// Analytics/monitoring previously began in the first idle slot, which often
// lands inside Lighthouse's TBT window and creates a burst of long tasks. GTM
// still records the landing page immediately; heavier SDKs start after a real
// interaction or after the initial audit/paint window has passed.
const bootEvents = ["pointerdown", "keydown", "touchstart", "scroll"] as const;
const startDeferred = () => {
  bootEvents.forEach((event) => window.removeEventListener(event, startDeferred));
  bootDeferred();
};
bootEvents.forEach((event) => window.addEventListener(event, startDeferred, { once: true, passive: true }));
window.setTimeout(startDeferred, 8_000);


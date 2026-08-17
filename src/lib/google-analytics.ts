/**
 * Google Analytics 4 (gtag.js) loader.
 *
 * The measurement ID comes from the linked Google Analytics connector
 * (VITE_LOVABLE_CONNECTOR_GOOGLE_ANALYTICS_API_KEY). gtag is initialised
 * lazily after first paint so the script tag never blocks LCP. The global
 * `window.gtag` function is set synchronously so any calls made before the
 * script downloads are queued in `dataLayer` and replayed automatically.
 */

const measurementId = import.meta.env.VITE_LOVABLE_CONNECTOR_GOOGLE_ANALYTICS_API_KEY as string | undefined;

let initialized = false;
let initialPageviewSent = false;

export const isGoogleAnalyticsEnabled = Boolean(measurementId);

export function initGoogleAnalytics(): void {
  if (!isGoogleAnalyticsEnabled || typeof window === "undefined" || initialized) return;
  initialized = true;

  window.dataLayer = window.dataLayer || [];
  const gtag = (
    command: "event" | "config" | "js",
    targetId: string | Date,
    config?: Record<string, unknown>,
  ) => {
    window.dataLayer.push([command, targetId, config]);
  };
  window.gtag = gtag;

  gtag("js", new Date());
  gtag("config", measurementId as string, { send_page_view: true });

  const script = document.createElement("script");
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${measurementId}`;
  document.head.appendChild(script);
}

/**
 * Send an SPA page_view event. The very first pageview is handled by the
 * initial `gtag('config')` command, so this function skips the first call to
 * avoid double-counting the landing page.
 */
export function sendPageview(path: string): void {
  if (typeof window === "undefined" || typeof window.gtag !== "function") return;
  if (!initialPageviewSent) {
    initialPageviewSent = true;
    return;
  }
  window.gtag("event", "page_view", { page_path: path });
}

if (!measurementId && import.meta.env.DEV) {
  console.warn(
    "[ga] No measurement ID found (VITE_LOVABLE_CONNECTOR_GOOGLE_ANALYTICS_API_KEY). Google Analytics is not initialised.",
  );
}

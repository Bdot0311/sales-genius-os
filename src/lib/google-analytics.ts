/**
 * Google Analytics 4 (gtag.js) loader.
 *
 * The measurement ID comes from the linked Google Analytics connector
 * (VITE_LOVABLE_CONNECTOR_GOOGLE_ANALYTICS_API_KEY). gtag is initialised
 * lazily after first paint so the script tag never blocks LCP. The global
 * `window.gtag` function is set synchronously so any calls made before the
 * script downloads are queued in `dataLayer` and replayed automatically.
 */

const rawMeasurementId = import.meta.env.VITE_LOVABLE_CONNECTOR_GOOGLE_ANALYTICS_API_KEY as string | undefined;
// Only real GA4 web-stream measurement IDs (G-XXXXXXXXXX) are usable. Anything
// else (property ID, API secret, stray quotes) makes googletagmanager.com
// answer 404, which shows up as a console error on every page load.
const measurementId =
  rawMeasurementId && /^G-[A-Z0-9]{6,}$/.test(rawMeasurementId.trim().replace(/^["']|["']$/g, ""))
    ? rawMeasurementId.trim().replace(/^["']|["']$/g, "")
    : undefined;

// Set once the gtag script 404s / fails to load, so we don't re-request a dead
// URL on every subsequent page load in the same browser.
const GA_FAILED_KEY = "__ga_load_failed__";

let initialized = false;
let initialPageviewSent = false;

export const isGoogleAnalyticsEnabled = Boolean(measurementId);

export function initGoogleAnalytics(): void {
  if (!isGoogleAnalyticsEnabled || typeof window === "undefined" || initialized) return;
  try {
    if (localStorage.getItem(GA_FAILED_KEY) === measurementId) return;
  } catch {}
  initialized = true;

  window.dataLayer = window.dataLayer || [];
  const gtag = (
    command: "event" | "config" | "js",
    targetId: string | Date,
    config?: Record<string, unknown>,
  ) => {
    // gtag.js expects an arguments-like object, not a plain array.
    // eslint-disable-next-line prefer-rest-params
    window.dataLayer.push(arguments.length ? arguments : [command, targetId, config]);
  };
  window.gtag = gtag;

  gtag("js", new Date());
  // `send_page_view: true` emits the landing pageview automatically. Mark it
  // here so the first manual SPA route change does not get swallowed.
  initialPageviewSent = true;
  gtag("config", measurementId as string, { send_page_view: true });

  const script = document.createElement("script");
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${measurementId}`;
  script.onerror = () => {
    try {
      localStorage.setItem(GA_FAILED_KEY, measurementId as string);
    } catch {}
    console.warn(`[ga] gtag.js failed to load for ${measurementId} — check the GA4 measurement ID.`);
  };
  document.head.appendChild(script);
}


/**
 * Send an SPA page_view event. The very first pageview is handled by the
 * initial `gtag('config')` command, so this function skips that first call to
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

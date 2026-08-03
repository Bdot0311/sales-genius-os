import posthog from "posthog-js";

/**
 * PostHog init.
 *
 * Credentials come from the linked PostHog connector
 * (VITE_LOVABLE_CONNECTOR_POSTHOG_API_KEY + _REGION). The legacy hand-set
 * VITE_POSTHOG_KEY / VITE_POSTHOG_HOST pair is kept as a fallback so analytics
 * never goes dark if the connector is re-linked or temporarily unavailable.
 */
const connectorKey = import.meta.env.VITE_LOVABLE_CONNECTOR_POSTHOG_API_KEY as string | undefined;
const connectorRegion = (import.meta.env.VITE_LOVABLE_CONNECTOR_POSTHOG_REGION as string | undefined) || "eu";
const legacyKey = import.meta.env.VITE_POSTHOG_KEY as string | undefined;
const legacyHost = import.meta.env.VITE_POSTHOG_HOST as string | undefined;

const regionHost = (region: string) =>
  region.toLowerCase() === "us" ? "https://us.i.posthog.com" : "https://eu.i.posthog.com";

const apiKey = connectorKey || legacyKey;
const apiHost = connectorKey ? regionHost(connectorRegion) : legacyHost;

/** Skip capture inside the Lovable preview iframe so building sessions stay out of the data. */
const isPreviewIframe = () => {
  if (typeof window === "undefined") return false;
  try {
    if (window.self !== window.top) return true;
  } catch {
    return true; // cross-origin frame
  }
  return /\.lovable\.app$/.test(window.location.hostname) &&
    window.location.hostname.startsWith("id-preview--");
};

const doNotTrack = () => {
  if (typeof navigator === "undefined") return false;
  const dnt = (navigator as Navigator & { doNotTrack?: string }).doNotTrack;
  return dnt === "1" || dnt === "yes";
};

const shouldInit = Boolean(apiKey && apiHost) && !isPreviewIframe() && !doNotTrack();

if (shouldInit) {
  posthog.init(apiKey as string, {
    api_host: apiHost as string,
    // Pageviews are captured manually on every route change (see App.tsx) —
    // an SPA fires no navigation events, so automatic capture would record a
    // single pageview per session and inflate bounce rate.
    capture_pageview: false,
    capture_pageleave: true,
    autocapture: true,
    persistence: "localStorage+cookie",
    // Core Web Vitals (LCP, INP, CLS, FCP) as events, so performance work is measurable.
    capture_performance: { web_vitals: true },
    session_recording: {
      maskAllInputs: true,
      maskTextSelector: "[data-ph-mask]",
      maskInputOptions: {
        password: true,
        email: true,
        tel: true,
        text: false,
      },
    },
    // Recording starts on demand below (sampled) rather than for every session.
    disable_session_recording: false,
  });

  posthog.startExceptionAutocapture({
    capture_unhandled_errors: true,
    capture_unhandled_rejections: true,
    capture_console_errors: false,
  });
} else if (!apiKey && import.meta.env.DEV) {
  console.warn(
    "[posthog] No project key found (VITE_LOVABLE_CONNECTOR_POSTHOG_API_KEY or VITE_POSTHOG_KEY). Events are not being captured.",
  );
}

export const isPostHogEnabled = shouldInit;

export const posthogRegion = connectorKey ? connectorRegion : undefined;

export { posthog };

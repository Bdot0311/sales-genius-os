/**
 * Single call site for product analytics.
 *
 * Every event fans out to PostHog, HeyCatch and Google Analytics (when present),
 * so a funnel step never ends up recorded in one tool and missing from another.
 */
import { isPostHogEnabled, posthog } from "@/lib/posthog";
import { analytics as heycatch } from "@/lib/heycatch";
import { sendPageview as gaPageview } from "@/lib/google-analytics";
import { getAttributionProps } from "@/lib/attribution";

type Props = Record<string, string | number | boolean | null | undefined>;

const clean = (props?: Props): Record<string, string | number | boolean> => {
  const out: Record<string, string | number | boolean> = {};
  for (const [k, v] of Object.entries(props ?? {})) {
    if (v !== null && v !== undefined) out[k] = v;
  }
  return out;
};

export function captureEvent(event: string, props?: Props) {
  // Attribution (utm_source / medium / first-touch) rides along on every event
  // automatically, so traffic is never bucketed as "Direct" by mistake.
  const properties = { ...getAttributionProps(), ...clean(props) };
  try {
    if (isPostHogEnabled) posthog.capture(event, properties);
  } catch { /* analytics must never break the app */ }
  try {
    // HeyCatch reserves the "$" prefix for its own built-in events (it tracks
    // pageviews itself), so only forward our own custom events to it.
    if (!event.startsWith("$")) void heycatch.trackEvent(event, properties);
  } catch { /* noop */ }

  try {
    if (typeof window !== "undefined" && typeof window.gtag === "function" && !event.startsWith("$")) {
      window.gtag("event", event, properties);
    }
  } catch { /* noop */ }
}

/** Fire an event only the first time for this browser — used for activation milestones. */
export function captureOnce(event: string, props?: Props) {
  if (typeof window === "undefined") return;
  const key = `_or_tracked_${event}`;
  try {
    if (localStorage.getItem(key)) return;
    localStorage.setItem(key, "1");
  } catch { /* private mode — still capture */ }
  captureEvent(event, props);
}

/** Manual SPA pageview. */
export function capturePageview(path: string, extra?: Props) {
  captureEvent("$pageview", {
    $current_url: typeof window !== "undefined" ? window.location.href : path,
    path,
    ...clean(extra),
  });
  gaPageview(path);
}

export const Analytics = {
  signupCompleted: (method: "email" | "google" = "email") =>
    captureOnce("signup_completed", { method }),

  /** Someone clicked a "get your free leads / book campaign setup" CTA. */
  freeLeadsCtaClicked: (source: string, plan?: string | null) =>
    captureEvent("free_leads_cta_click", {
      source,
      plan: plan ?? undefined,
      path: typeof window !== "undefined" ? window.location.pathname : undefined,
    }),

  /** Someone clicked a "see how it works / demo" CTA. */
  demoCtaClicked: (source: string) =>
    captureEvent("demo_cta_click", {
      source,
      path: typeof window !== "undefined" ? window.location.pathname : undefined,
    }),


  firstSearchRun: () => captureOnce("first_search_run"),

  firstLeadViewed: (leadId?: string) =>
    captureOnce("first_lead_viewed", leadId ? { lead_id: leadId } : undefined),

  firstEmailGenerated: () => captureOnce("first_email_generated"),

  firstSequenceSent: () => captureOnce("first_sequence_sent"),
};


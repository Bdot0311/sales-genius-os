declare global {
  interface Window {
    gtag?: (...args: any[]) => void;
  }
}

function track(event: string, params?: Record<string, string | number | boolean>) {
  if (typeof window !== "undefined" && typeof window.gtag === "function") {
    window.gtag("event", event, params ?? {});
  }
}

// Fire an event only the first time — tracked in localStorage per session user.
function trackOnce(event: string, params?: Record<string, string | number | boolean>) {
  if (typeof window === "undefined") return;
  const key = `_or_tracked_${event}`;
  if (localStorage.getItem(key)) return;
  localStorage.setItem(key, "1");
  track(event, params);
}

export const Analytics = {
  // Already fired by AuthForm.tsx via gtag directly — kept here for reference.
  signupCompleted: (method: "email" | "google" = "email") =>
    trackOnce("signup_completed", { method }),

  firstSearchRun: () =>
    trackOnce("first_search_run"),

  firstLeadViewed: (leadId?: string) =>
    trackOnce("first_lead_viewed", leadId ? { lead_id: leadId } : {}),

  firstEmailGenerated: () =>
    trackOnce("first_email_generated"),

  firstSequenceSent: () =>
    trackOnce("first_sequence_sent"),
};

// Sentry is initialised lazily (after the first paint) so its bundle never sits
// on the critical path of the homepage LCP. See src/main.tsx.
import * as Sentry from "@sentry/react";

export function initSentry() {
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
      // Chunk reloads are self-healed in main.tsx; no need to alert
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
      if (
        typeof msg === "string" &&
        /Object Not Found Matching|MethodName:(update|getProperty)|Non-Error promise rejection/i.test(msg)
      ) {
        return null;
      }
      // Drop promise rejections whose reason is a DOM Event (CustomEvent, ErrorEvent...).
      // Sentry reports these as `Event \`CustomEvent\` (type=unhandledrejection) captured
      // as promise rejection` — no stack, no message, not actionable (Safari/extensions).
      if (typeof Event !== "undefined" && ex instanceof Event) return null;
      if (/captured as promise rejection/i.test(String(event.message || ""))) return null;
      if (event.exception?.values?.some((v) => /^(Custom)?Event$/.test(v.type ?? ""))) return null;
      // Drop empty-object promise rejections — no stack, no message, not actionable.
      // Typically thrown by third-party scripts or aborted fetches that reject with `{}`.
      if (
        ex &&
        typeof ex === "object" &&
        !(ex instanceof Error) &&
        !msg &&
        Object.keys(ex).length === 0
      ) {
        return null;
      }
      // Drop events from browser extensions regardless of message content
      const frames = event.exception?.values?.[0]?.stacktrace?.frames ?? [];
      const fromExtension = frames.some((f) =>
        /chrome-extension:|moz-extension:|safari-extension:|safari-web-extension:/.test(f.filename ?? "")
      );
      if (fromExtension) return null;
      return event;
    },
  });
}

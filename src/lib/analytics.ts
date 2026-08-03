// Kept for backwards compatibility — the implementation now lives in
// analytics-events.ts and fans out to PostHog, HeyCatch and gtag.
export { Analytics, captureEvent, captureOnce, capturePageview } from "./analytics-events";

/**
 * Third-party tags that do not read Google Consent Mode. Each loads only once
 * canTrack(purpose) allows it, and again after a later grant.
 */
import { canTrack, onConsentChange, type Purpose } from "@/lib/consent";

type Loader = { purpose: Purpose; load: () => void; done?: boolean };

function addScript(src: string, key?: string) {
  const s = document.createElement("script");
  s.async = true;
  s.src = src;
  if (key) s.setAttribute("data-key", key);
  document.head.appendChild(s);
}

const loaders: Loader[] = [
  { purpose: "analytics", load: () => addScript("https://analytics.ahrefs.com/analytics.js", "PYS2Q4NavMQXMQS+pt9cjw") },
  { purpose: "analytics", load: () => addScript("https://static.opinly.ai/p.js", "pk-9WJRR3ew9rDnoatULpysxOEgy04ugQOR9dBuAf_") },
  { purpose: "analytics", load: () => void import("./posthog").then(({ initPostHog }) => initPostHog()) },
  { purpose: "analytics", load: () => void import("./fcm").then(({ initFirebaseWeb }) => initFirebaseWeb()) },
  { purpose: "advertising", load: () => void import("./heycatch").then(({ initHeycatch }) => initHeycatch()) },
  {
    purpose: "advertising",
    load: () => addScript("https://id.getleads.io/pixels/e47566e3-2407-4d64-a70d-fe32d029b64a/p.js", "e47566e3-2407-4d64-a70d-fe32d029b64a"),
  },
  {
    purpose: "advertising",
    load: () => {
      const w = window as Window & { reb2b?: unknown };
      if (w.reb2b) return;
      w.reb2b = { loaded: true };
      addScript("https://ddwl4m2hdecbv.cloudfront.net/b/4N210HXXW96Z/4N210HXXW96Z.js.gz");
    },
  },
];

async function run() {
  for (const l of loaders) {
    if (l.done) continue;
    if (await canTrack(l.purpose)) {
      l.done = true;
      try { l.load(); } catch { /* tracking must never break the page */ }
    }
  }
}

let started = false;
export function startConsentTrackers() {
  if (started) return;
  started = true;
  void run();
  onConsentChange(() => void run());
}

/**
 * First-hand visitor logging.
 *
 * PostHog buckets anything without utm params and without a referrer as
 * "Direct" — and mobile apps strip referrers, so most real social traffic lands
 * there. This module records what we *can* resolve for every arrival:
 *
 *  - first-touch + last-touch attribution (from @/lib/attribution)
 *  - the landing URL, referrer, language, timezone, screen width
 *  - a stable visitor id and a per-session id
 *
 * It writes the row into `public.site_visits` (anon insert allowed, admin-only
 * read) and mirrors the same fields onto the PostHog person so anonymous
 * visitors are never unlabelled. No identify() call: these people have no
 * account yet and merging them would fragment their history.
 */
import { getAttributionProps, getFirstTouch, initAttribution } from "@/lib/attribution";
import { captureEvent } from "@/lib/analytics-events";
import { posthog } from "@/lib/posthog";
import { supabase } from "@/integrations/supabase/client";

const VISITOR_KEY = "_or_visitor_id";
const SESSION_KEY = "_or_visit_session";

const randomId = () => {
  try {
    return crypto.randomUUID();
  } catch {
    return `v_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  }
};

const readOrCreate = (storage: Storage, key: string): { id: string; created: boolean } => {
  try {
    const existing = storage.getItem(key);
    if (existing) return { id: existing, created: false };
    const id = randomId();
    storage.setItem(key, id);
    return { id, created: true };
  } catch {
    return { id: randomId(), created: true };
  }
};

let logged = false;

/** Logs the current arrival exactly once per browser session. */
export async function logVisit(): Promise<void> {
  if (typeof window === "undefined" || logged) return;
  logged = true;

  // Make sure attribution has been resolved from the landing URL before an SPA
  // navigation can strip the query string.
  initAttribution();

  const attribution = getAttributionProps();
  const first = getFirstTouch();
  const visitor = readOrCreate(localStorage, VISITOR_KEY);
  const session = readOrCreate(sessionStorage, SESSION_KEY);
  if (!session.created) return; // already logged earlier in this session

  const timezone = (() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone ?? null;
    } catch {
      return null;
    }
  })();

  const row = {
    visitor_id: visitor.id,
    session_id: session.id,
    posthog_distinct_id: posthog.get_distinct_id() ?? null,
    utm_source: attribution.utm_source ?? null,
    utm_medium: attribution.utm_medium ?? null,
    utm_campaign: attribution.utm_campaign ?? null,
    utm_content: attribution.utm_content ?? null,
    utm_term: attribution.utm_term ?? null,
    referrer: document.referrer || null,
    landing_path: window.location.pathname,
    landing_url: window.location.href.slice(0, 900),
    first_touch_source: first?.utm_source ?? null,
    first_touch_medium: first?.utm_medium ?? null,
    first_touch_campaign: first?.utm_campaign ?? null,
    traffic_channel: attribution.traffic_channel ?? null,
    is_first_visit: visitor.created,
    user_agent: navigator.userAgent.slice(0, 400),
    language: navigator.language ?? null,
    screen_width: typeof window.innerWidth === "number" ? window.innerWidth : null,
    timezone,
  };

  // Label the anonymous PostHog person so every future event of theirs carries
  // the source, even once they navigate away from the tagged landing URL.
  try {
    posthog.setPersonProperties({
      visitor_id: visitor.id,
      first_touch_source: row.first_touch_source,
      first_touch_medium: row.first_touch_medium,
      first_touch_campaign: row.first_touch_campaign ?? null,
      latest_source: row.utm_source,
      latest_medium: row.utm_medium,
      initial_referrer: row.referrer,
      initial_landing_path: row.landing_path,
      timezone,
    });
  } catch { /* analytics must never break the page */ }

  captureEvent("visit_logged", {
    is_first_visit: row.is_first_visit,
    referrer_present: !!row.referrer,
    tagged_link: !!attribution.utm_campaign || attribution.utm_medium !== "none",
  });

  try {
    await supabase.from("site_visits").insert(row);
  } catch { /* logging is best-effort */ }
}

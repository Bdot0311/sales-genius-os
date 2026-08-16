/**
 * Automatic traffic attribution.
 *
 * Nothing to tag by hand: on the first page of a session we read any utm_*
 * params, and when they are missing we derive them from document.referrer
 * (x.com, LinkedIn, Reddit, Product Hunt, Google, ...). The result is stored
 * as first-touch (kept forever) and last-touch (per session) and attached to
 * every analytics event, so social visits stop landing in the "Direct" bucket.
 */

export type Attribution = {
  utm_source: string;
  utm_medium: string;
  utm_campaign?: string;
  utm_content?: string;
  utm_term?: string;
  referrer?: string;
  landing_path?: string;
};

const FIRST_KEY = "_or_attr_first";
const LAST_KEY = "_or_attr_last";

/** referrer hostname -> [source, medium] */
const REFERRER_MAP: Array<[RegExp, string, string]> = [
  [/(^|\.)x\.com$|(^|\.)twitter\.com$|(^|\.)t\.co$/, "x", "social"],
  [/(^|\.)linkedin\.com$|(^|\.)lnkd\.in$/, "linkedin", "social"],
  [/(^|\.)reddit\.com$|(^|\.)redd\.it$/, "reddit", "social"],
  [/(^|\.)producthunt\.com$/, "producthunt", "referral"],
  [/(^|\.)news\.ycombinator\.com$/, "hackernews", "referral"],
  [/(^|\.)facebook\.com$|(^|\.)fb\.me$/, "facebook", "social"],
  [/(^|\.)instagram\.com$/, "instagram", "social"],
  [/(^|\.)youtube\.com$|(^|\.)youtu\.be$/, "youtube", "social"],
  [/(^|\.)tiktok\.com$/, "tiktok", "social"],
  [/(^|\.)threads\.net$/, "threads", "social"],
  [/(^|\.)discord\.com$|(^|\.)discord\.gg$/, "discord", "social"],
  [/(^|\.)slack\.com$/, "slack", "social"],
  [/(^|\.)github\.com$/, "github", "referral"],
  [/(^|\.)medium\.com$|(^|\.)substack\.com$|(^|\.)dev\.to$/, "blog", "referral"],
  [/(^|\.)google\./, "google", "organic"],
  [/(^|\.)bing\.com$|(^|\.)duckduckgo\.com$|(^|\.)ecosia\.org$/, "search", "organic"],
  [/(^|\.)chatgpt\.com$|(^|\.)openai\.com$|(^|\.)perplexity\.ai$|(^|\.)claude\.ai$|(^|\.)gemini\.google\.com$/, "ai-assistant", "referral"],
  [/(^|\.)mail\.google\.com$|(^|\.)outlook\./, "email", "email"],
];

const read = (storage: Storage, key: string): Attribution | null => {
  try {
    const raw = storage.getItem(key);
    return raw ? (JSON.parse(raw) as Attribution) : null;
  } catch {
    return null;
  }
};

const write = (storage: Storage, key: string, value: Attribution) => {
  try {
    storage.setItem(key, JSON.stringify(value));
  } catch { /* private mode */ }
};

const fromReferrer = (referrer: string): { utm_source: string; utm_medium: string } => {
  if (!referrer) return { utm_source: "direct", utm_medium: "none" };
  try {
    const host = new URL(referrer).hostname.toLowerCase();
    if (typeof window !== "undefined" && host === window.location.hostname) {
      return { utm_source: "direct", utm_medium: "none" };
    }
    for (const [pattern, source, medium] of REFERRER_MAP) {
      if (pattern.test(host)) return { utm_source: source, utm_medium: medium };
    }
    return { utm_source: host.replace(/^www\./, ""), utm_medium: "referral" };
  } catch {
    return { utm_source: "direct", utm_medium: "none" };
  }
};

/** Resolves attribution for the current page load (utm params win over referrer). */
const detect = (): Attribution => {
  const params = new URLSearchParams(window.location.search);
  const get = (k: string) => params.get(k)?.slice(0, 120) || undefined;
  const referrer = document.referrer || undefined;
  const derived = fromReferrer(referrer || "");

  const source = get("utm_source") || get("ref") || (get("gclid") ? "google" : undefined) || derived.utm_source;
  const medium = get("utm_medium") || (get("gclid") ? "cpc" : undefined) || (get("utm_source") ? "unknown" : derived.utm_medium);

  return {
    utm_source: source.toLowerCase(),
    utm_medium: medium.toLowerCase(),
    utm_campaign: get("utm_campaign"),
    utm_content: get("utm_content"),
    utm_term: get("utm_term"),
    referrer,
    landing_path: window.location.pathname,
  };
};

let cached: { first: Attribution | null; last: Attribution | null } = { first: null, last: null };

/**
 * Captures attribution once per page load. Safe to call repeatedly.
 * Returns the flattened props to attach to analytics events.
 */
export function initAttribution(): Record<string, string> {
  if (typeof window === "undefined") return {};

  const existingLast = read(sessionStorage, LAST_KEY);
  const hasExplicitUtm = window.location.search.includes("utm_") || window.location.search.includes("ref=");
  const referrerIsExternal = fromReferrer(document.referrer || "").utm_source !== "direct";

  // Only (re)stamp last-touch on a genuinely new entry into the site: an
  // explicit tagged link, an external referrer, or a fresh session.
  const last = !existingLast || hasExplicitUtm || (referrerIsExternal && !existingLast)
    ? detect()
    : existingLast;
  if (last !== existingLast) write(sessionStorage, LAST_KEY, last);

  let first = read(localStorage, FIRST_KEY);
  if (!first) {
    first = last;
    write(localStorage, FIRST_KEY, first);
  }

  cached = { first, last };
  return getAttributionProps();
}

/** Flattened first/last touch props for analytics payloads. */
export function getAttributionProps(): Record<string, string> {
  const { first, last } = cached;
  const out: Record<string, string> = {};
  if (last) {
    out.utm_source = last.utm_source;
    out.utm_medium = last.utm_medium;
    if (last.utm_campaign) out.utm_campaign = last.utm_campaign;
    if (last.utm_content) out.utm_content = last.utm_content;
    if (last.utm_term) out.utm_term = last.utm_term;
    if (last.referrer) out.session_referrer = last.referrer;
    if (last.landing_path) out.landing_path = last.landing_path;
    out.traffic_channel = last.utm_medium === "none" ? "direct" : last.utm_medium;
  }
  if (first) {
    out.first_touch_source = first.utm_source;
    out.first_touch_medium = first.utm_medium;
    if (first.utm_campaign) out.first_touch_campaign = first.utm_campaign;
  }
  return out;
}

/** First-touch attribution, for stamping on signup/checkout records. */
export function getFirstTouch(): Attribution | null {
  if (!cached.first && typeof window !== "undefined") initAttribution();
  return cached.first;
}

/**
 * Appends our utm tags to a link that points at our own site, so links the app
 * generates (share buttons, emails, social bios) are tracked without manual work.
 */
export function tagUrl(
  url: string,
  source: string,
  medium = "social",
  campaign?: string,
): string {
  try {
    const parsed = new URL(url);
    if (!parsed.searchParams.has("utm_source")) parsed.searchParams.set("utm_source", source);
    if (!parsed.searchParams.has("utm_medium")) parsed.searchParams.set("utm_medium", medium);
    if (campaign && !parsed.searchParams.has("utm_campaign")) parsed.searchParams.set("utm_campaign", campaign);
    return parsed.toString();
  } catch {
    return url;
  }
}

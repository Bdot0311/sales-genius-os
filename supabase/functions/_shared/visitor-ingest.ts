// What the public collector accepts. The edge function does I/O; this decides.

import {
  hostAllowed,
  hostFromUrl,
  ipInList,
  isBotUserAgent,
  isPrivateOrLocal,
  networkPrefix,
  pageTypeFromPath,
  sanitizeTrackingUrl,
  trustedClientIp,
} from "./visitor-identity.ts";

export const INGEST_LIMITS = {
  perIpPerMinute: 120,
  perSitePerMinute: 2000,
  maxBodyBytes: 16_384,
  maxEvents: 20,
  maxPropKeys: 12,
  maxPropLength: 160,
} as const;

const EVENT_NAME = /^[a-z0-9_.:-]{1,40}$/i;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const PROP_BLOCK = /password|secret|token|authorization|cookie|email|ssn|card|cvv|otp|passwd/i;

export interface IngestSite {
  id: string;
  userId: string;
  allowedDomains: string[];
  consentMode: "required" | "not_required";
  excludedPaths: string[];
  excludedIps: string[];
  enabled: boolean;
}

export interface NormalizedEvent {
  eventId: string;
  eventName: string;
  path: string;
  pageType: string;
  referrerHost: string | null;
  utm: Record<string, string>;
  props: Record<string, string>;
  sessionId: string;
  visitorKey: string;
  returning: boolean;
  engagement: { visible_ms: number; max_scroll_pct: number } | null;
  test: boolean;
}

export type IngestPlan =
  | { ok: true; events: NormalizedEvent[]; ip: string | null; prefix: string | null }
  | { ok: false; status: number; error: string };

export function rateLimited(ipHits: number, siteHits: number): boolean {
  return ipHits >= INGEST_LIMITS.perIpPerMinute || siteHits >= INGEST_LIMITS.perSitePerMinute;
}

/** Per-prefix bucket. A spoofed address must not mint a fresh key. */
export function ingestIpRateKey(siteId: string, ip: string | null): string {
  const prefix = ip ? (networkPrefix(ip) ?? "private") : "none";
  return `visitor-ingest:${siteId}:${prefix}`;
}

export function planIngest(input: {
  body: unknown;
  bodyBytes: number;
  origin: string | null;
  referer: string | null;
  userAgent: string | null;
  dnt: string | null;
  gpc: string | null;
  forwardedFor: string | null;
  /** Gateway `X-Real-IP`. Absent on a direct call; never taken from the body. */
  realIp?: string | null;
  site: IngestSite | null;
  flagOn: boolean;
  grantOn: boolean;
  /** Signed-in owner of this site, sending a dashboard test event. */
  ownerTest: boolean;
  ipHits?: number;
  siteHits?: number;
}): IngestPlan {
  if (!input.flagOn || !input.grantOn) return { ok: false, status: 404, error: "Visitor Intelligence is off for this site." };
  if (!input.site || !input.site.enabled) return { ok: false, status: 404, error: "Unknown site." };
  if (input.bodyBytes > INGEST_LIMITS.maxBodyBytes) return { ok: false, status: 413, error: "Payload is too large." };
  if (input.dnt === "1" || input.gpc === "1") return { ok: false, status: 204, error: "Browser privacy signal is on." };
  if (isBotUserAgent(input.userAgent)) return { ok: false, status: 202, error: "Ignored automated client." };
  if (rateLimited(input.ipHits ?? 0, input.siteHits ?? 0)) return { ok: false, status: 429, error: "Rate limit exceeded." };

  const ip = trustedClientIp({ forwardedFor: input.forwardedFor, realIp: input.realIp });
  const body = isRecord(input.body) ? input.body : null;
  if (!body) return { ok: false, status: 400, error: "Expected a JSON object." };
  // The body is not a source of identity. A client-supplied address is ignored above.
  if (body.site_id !== input.site.id) return { ok: false, status: 400, error: "site_id does not match." };

  const consent = body.consent === true;
  if (input.site.consentMode === "required" && !consent && !input.ownerTest) {
    return { ok: false, status: 202, error: "Consent is required and was not granted." };
  }

  const host = hostFromUrl(input.origin) ?? hostFromUrl(input.referer);
  if (!input.ownerTest && !hostAllowed(host, input.site.allowedDomains)) {
    return { ok: false, status: 403, error: "Origin is not an allowed domain." };
  }

  if (ip && !isPrivateOrLocal(ip) && ipInList(ip, input.site.excludedIps)) {
    return { ok: false, status: 202, error: "Address is excluded." };
  }

  const rawEvents = Array.isArray(body.events) ? body.events.slice(0, INGEST_LIMITS.maxEvents + 1) : [];
  if (rawEvents.length === 0) return { ok: false, status: 400, error: "No events." };
  if (rawEvents.length > INGEST_LIMITS.maxEvents) return { ok: false, status: 400, error: "Too many events." };

  const events: NormalizedEvent[] = [];
  for (const raw of rawEvents) {
    const event = normalizeEvent(raw, input.ownerTest, input.site.excludedPaths);
    if (event === "skip") continue;
    if (typeof event === "string") return { ok: false, status: 400, error: event };
    events.push(event);
  }
  if (events.length === 0) return { ok: false, status: 202, error: "Every event was on an excluded path." };

  const publicIp = ip && !isPrivateOrLocal(ip) ? ip : null;
  return { ok: true, events, ip: publicIp, prefix: publicIp ? networkPrefix(publicIp) : null };
}

function normalizeEvent(raw: unknown, test: boolean, excludedPaths: string[]): NormalizedEvent | "skip" | string {
  if (!isRecord(raw)) return "Event was not an object.";
  const eventId = typeof raw.event_id === "string" ? raw.event_id : "";
  if (!UUID.test(eventId)) return "event_id must be a UUID.";
  const eventName = typeof raw.event_name === "string" ? raw.event_name : "";
  if (!EVENT_NAME.test(eventName)) return "event_name is not allowed.";
  const sessionId = typeof raw.session_id === "string" ? raw.session_id.slice(0, 80) : "";
  const visitorKey = typeof raw.visitor_key === "string" ? raw.visitor_key.slice(0, 80) : "";
  if (!sessionId || !visitorKey) return "session_id and visitor_key are required.";

  const page = typeof raw.path === "string" ? raw.path : typeof raw.url === "string" ? raw.url : "/";
  const clean = sanitizeTrackingUrl(page.startsWith("http") ? page : `https://visitor.invalid${page.startsWith("/") ? "" : "/"}${page}`);
  if (excludedPaths.some((prefix) => prefix && clean.path.startsWith(prefix))) return "skip";

  const referrer = hostFromUrl(typeof raw.referrer === "string" ? raw.referrer : null);
  const engagement = engagementOf(raw.engagement);
  return {
    eventId,
    eventName,
    path: clean.path,
    pageType: eventName === "page_view" || eventName === "engagement" ? pageTypeFromPath(clean.path) : "other",
    referrerHost: referrer,
    utm: clean.utm,
    props: eventName === "page_view" ? {} : sanitizeProps(raw.props),
    sessionId,
    visitorKey,
    returning: raw.returning === true,
    engagement,
    test,
  };
}

function engagementOf(value: unknown): { visible_ms: number; max_scroll_pct: number } | null {
  if (!isRecord(value)) return null;
  const visible = Number(value.visible_ms);
  const scroll = Number(value.max_scroll_pct);
  if (!Number.isFinite(visible) || !Number.isFinite(scroll)) return null;
  return {
    visible_ms: Math.max(0, Math.min(Math.round(visible), 3_600_000)),
    max_scroll_pct: Math.max(0, Math.min(Math.round(scroll), 100)),
  };
}

export function sanitizeProps(value: unknown): Record<string, string> {
  if (!isRecord(value)) return {};
  const out: Record<string, string> = {};
  for (const [key, raw] of Object.entries(value)) {
    if (Object.keys(out).length >= INGEST_LIMITS.maxPropKeys) break;
    if (!EVENT_NAME.test(key) || PROP_BLOCK.test(key)) continue;
    if (typeof raw !== "string" && typeof raw !== "number" && typeof raw !== "boolean") continue;
    out[key] = String(raw).slice(0, INGEST_LIMITS.maxPropLength);
  }
  return out;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

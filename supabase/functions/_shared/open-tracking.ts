/**
 * Decides whether a tracking-pixel hit is a human opening the email.
 *
 * It usually isn't. Gmail proxies every image through googleusercontent the
 * moment a message lands, Apple Mail Privacy Protection fetches every image in
 * every message whether or not the user ever looks at it, and security
 * appliances follow anything that looks like a URL. All three produce a pixel
 * hit that is indistinguishable from a real open unless you look at the user
 * agent and the clock.
 *
 * Live data from this product made the cost concrete: ten "opens" were recorded
 * inside fifteen minutes of send, in tight clusters minutes after each send
 * batch — 116s, 124s, 174s, then five inside one five-minute band. Nine of the
 * ten carried Gmail's image-proxy agent. None of them were people.
 *
 * Every hit is still written to email_open_events. This only decides which ones
 * are allowed to move opened_at on sent_emails, so the filtering is auditable
 * instead of invisible.
 */

/** Security appliances and link-checkers. Never a human, at any delay. */
export const SCANNER_UA =
  /(barracuda|proofpoint|mimecast|symantec|forcepoint|trendmicro|messagelabs|bitdefender|virustotal|slackbot|whatsapp|discordbot|facebookexternalhit|twitterbot|linkedinbot|bingpreview|python-requests|curl\/|wget|okhttp|axios|node-fetch|headlesschrome|monitoring|uptime)/i;

/**
 * Mailbox providers that proxy images on the recipient's behalf.
 *
 * These cannot be filtered outright — Gmail routes a real open through the same
 * agent as its delivery prefetch, so banning the agent would erase every Gmail
 * open there is. They get a longer prefetch window instead.
 */
export const PROXY_UA = /(googleimageproxy|ggpht\.com|googleusercontent|yahoomailproxy|yandexmail)/i;

/**
 * Apple Mail Privacy Protection.
 *
 * MPP fetches remote content for every message from Apple's own infrastructure,
 * with a user agent stripped down to a bare `Mozilla/5.0` and nothing else — no
 * platform, no browser token, no version. A hit like that proves the message
 * was delivered and rendered somewhere. It is not evidence anybody read it, at
 * any delay, so no grace period rescues it.
 */
export const APPLE_MPP_UA = /^mozilla\/5\.0\s*(\(\s*\))?$/i;

/** How long after send a hit is treated as the provider, not the person. */
export const PREFETCH_GRACE_SECONDS = 90;
/** Proxying providers prefetch on delivery, which trails the send by minutes. */
export const PROXY_PREFETCH_GRACE_SECONDS = 600;
/** Repeat fetches inside this window are one render, not a second open. */
export const DEDUPE_WINDOW_SECONDS = 30;

export type SkipReason =
  | "scanner_user_agent"
  | "apple_mpp"
  | "own_mailbox_warmup"
  | "provider_prefetch"
  | "duplicate_render";

export interface OpenSignal {
  userAgent: string;
  /** Null when the send has no timestamp — then no prefetch rule can apply. */
  secondsSinceSend: number | null;
  /** Seconds since the last *counted* open of this same email. */
  secondsSinceLastCounted: number | null;
  /** The recipient is one of the sender's own connected mailboxes. */
  ownMailbox: boolean;
}

export interface OpenVerdict {
  counted: boolean;
  skipReason: SkipReason | null;
}

export function isProxyAgent(userAgent: string): boolean {
  return PROXY_UA.test(userAgent);
}

export function isAppleMpp(userAgent: string): boolean {
  return APPLE_MPP_UA.test(userAgent.trim());
}

/** The window this agent has to clear before a hit can be a person. */
export function graceSecondsFor(userAgent: string): number {
  return isProxyAgent(userAgent) ? PROXY_PREFETCH_GRACE_SECONDS : PREFETCH_GRACE_SECONDS;
}

export function classifyOpen(signal: OpenSignal): OpenVerdict {
  const ua = signal.userAgent || "";

  let skipReason: SkipReason | null = null;
  if (SCANNER_UA.test(ua)) {
    skipReason = "scanner_user_agent";
  } else if (isAppleMpp(ua)) {
    skipReason = "apple_mpp";
  } else if (signal.ownMailbox) {
    skipReason = "own_mailbox_warmup";
  } else if (
    signal.secondsSinceSend !== null &&
    signal.secondsSinceSend < graceSecondsFor(ua)
  ) {
    skipReason = "provider_prefetch";
  } else if (
    signal.secondsSinceLastCounted !== null &&
    signal.secondsSinceLastCounted < DEDUPE_WINDOW_SECONDS
  ) {
    skipReason = "duplicate_render";
  }

  return { counted: skipReason === null, skipReason };
}

/**
 * Reasons that mean a machine fetched the message rather than a person reading
 * it — but which still prove the mail was delivered and rendered. The
 * performance tab reports these separately instead of hiding them, so the open
 * rate can be low and still be trusted.
 */
const ASSISTED: ReadonlySet<string> = new Set(["apple_mpp", "provider_prefetch"]);

export function isAssistedOpen(skipReason: string | null | undefined): boolean {
  return !!skipReason && ASSISTED.has(skipReason);
}

/**
 * Cookie choice for the public marketing site's visitor collector.
 *
 * v.js (visitor-sdk) only sends events once localStorage `outreigh_consent`
 * is "1". `OutReign.consent()` writes that flag and records the current
 * pageview. `OutReign.disable()` writes `outreigh_off`, which the script
 * treats as a privacy opt-out. The banner writes the same flags itself so a
 * script that loads after the click still sees the choice.
 */

export const VISITOR_CONSENT_KEY = "outreigh_consent";
export const VISITOR_OPT_OUT_KEY = "outreigh_off";
export const COOKIE_CHOICE_KEY = "outreigh_cookie_choice";

export type CookieChoice = "accept" | "decline";

export type ConsentStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};

/** The collector methods the banner calls. `consent()` also sends the current pageview. */
export type VisitorSdk = {
  consent?: () => void;
  disable?: () => void;
};

/**
 * Signed-in product routes. The banner is for the public marketing site.
 * `/onboarding-status` does not sit under `/onboarding/`, so it is listed.
 */
const APP_ROUTE_PREFIXES = [
  "/dashboard",
  "/auth",
  "/settings",
  "/admin",
  "/onboarding",
  "/integrations",
  "/checkout",
  "/client-portal",
  "/appsumo",
  "/.lovable",
] as const;

const APP_ROUTE_EXACT = ["/onboarding-status"] as const;

function normalizePath(pathname: string): string {
  const bare = (pathname.split("?")[0] ?? "").split("#")[0] || "/";
  if (bare.length > 1 && bare.endsWith("/")) return bare.slice(0, -1);
  return bare || "/";
}

export function isAppRoute(pathname: string): boolean {
  const path = normalizePath(pathname);
  if ((APP_ROUTE_EXACT as readonly string[]).includes(path)) return true;
  return APP_ROUTE_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}

/** Same signals v.js uses in `privacyOff()`. Those visitors are never collected. */
export function hasBrowserPrivacySignal(signals: {
  doNotTrack?: string | null;
  globalPrivacyControl?: boolean;
}): boolean {
  return signals.doNotTrack === "1" || signals.globalPrivacyControl === true;
}

function readItem(storage: ConsentStorage, key: string): string | null {
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

function writeItem(storage: ConsentStorage, key: string, value: string): void {
  try {
    storage.setItem(key, value);
  } catch {
    /* Locked storage must not break the page. The SDK call still runs. */
  }
}

export function readCookieChoice(storage: ConsentStorage): CookieChoice | null {
  const choice = readItem(storage, COOKIE_CHOICE_KEY);
  if (choice === "accept" || choice === "decline") return choice;
  if (readItem(storage, VISITOR_CONSENT_KEY) === "1") return "accept";
  if (readItem(storage, VISITOR_OPT_OUT_KEY) === "1") return "decline";
  return null;
}

export function shouldShowCookieBanner(input: {
  pathname: string;
  choice: CookieChoice | null;
  privacySignal: boolean;
}): boolean {
  if (input.privacySignal) return false;
  if (isAppRoute(input.pathname)) return false;
  if (input.choice) return false;
  return true;
}

export function visitorSdkFrom(root: { OutReign?: VisitorSdk } | null | undefined): VisitorSdk | null {
  const sdk = root?.OutReign;
  return sdk && typeof sdk === "object" ? sdk : null;
}

export function acceptVisitorCookies(input: {
  storage: ConsentStorage;
  sdk?: VisitorSdk | null;
}): void {
  writeItem(input.storage, VISITOR_CONSENT_KEY, "1");
  writeItem(input.storage, COOKIE_CHOICE_KEY, "accept");
  try {
    input.sdk?.consent?.();
  } catch {
    /* The flag is already stored, so a later v.js boot still records the page. */
  }
}

export function declineVisitorCookies(input: {
  storage: ConsentStorage;
  sdk?: VisitorSdk | null;
}): void {
  writeItem(input.storage, VISITOR_OPT_OUT_KEY, "1");
  writeItem(input.storage, COOKIE_CHOICE_KEY, "decline");
  try {
    input.sdk?.disable?.();
  } catch {
    /* The opt-out flag is already stored, so a later v.js boot stays off. */
  }
}

/**
 * Read the push service's own answer, rather than guessing from the status.
 *
 * Apple and Google both answer a refused send with 401 or 403 whether the fault
 * is the signature we made or the device we made it for. The status cannot tell
 * those apart, so advice picked from the status alone is a coin flip — and the
 * wrong side of it ("turn the switch off and on again") sends someone to
 * re-register a device that was never the problem.
 *
 * The reason is in the response body, as a short code. APNs, which is what
 * web.push.apple.com is, documents them, and they sort cleanly into whose
 * problem it is. A token complaint is ours: the JWT we signed was rejected for
 * its contents, its subject or its age, none of which a device can affect. A
 * device complaint is theirs, and re-registering is the fix. Anything about
 * rate is neither — it clears on its own.
 */

export type FaultOwner = "ours" | "device" | "transient" | "unknown";

const OURS = new Set([
  // The JWT itself: malformed, signed wrong, expired, or missing.
  "BadJwtToken",
  "ExpiredProviderToken",
  "InvalidProviderToken",
  "MissingProviderToken",
  // The subject or audience we put in it.
  "BadTopic",
  "TopicDisallowed",
  "Forbidden",
]);

const DEVICE = new Set([
  "BadDeviceToken",
  "DeviceTokenNotForTopic",
  "Unregistered",
  "ExpiredToken",
]);

const TRANSIENT = new Set(["TooManyRequests", "ServiceUnavailable", "InternalServerError"]);

/**
 * Pull the short code out of a provider's error body.
 *
 * Apple answers with `{"reason":"BadJwtToken"}`. Google's body is a longer JSON
 * document, or sometimes a bare line of text, so this falls back to the first
 * token-shaped word rather than insisting on a shape.
 */
export function providerReasonCode(body: string | undefined | null): string | null {
  if (!body) return null;
  const text = String(body).trim();
  if (!text) return null;
  try {
    const parsed = JSON.parse(text);
    const code = parsed?.reason ?? parsed?.error?.status ?? parsed?.error?.message ?? parsed?.error;
    if (typeof code === "string" && code.trim()) return code.trim();
  } catch {
    // Not JSON. Apple has been known to answer in plain text.
  }
  const word = text.match(/[A-Za-z][A-Za-z0-9_]{3,}/)?.[0];
  return word ?? null;
}

export function classifyProviderReason(code: string | null): FaultOwner {
  if (!code) return "unknown";
  if (OURS.has(code)) return "ours";
  if (DEVICE.has(code)) return "device";
  if (TRANSIENT.has(code)) return "transient";
  return "unknown";
}

/**
 * What to tell the person looking at the Settings screen.
 *
 * The provider's code goes in the sentence on purpose. It is the one thing that
 * makes the next report self-diagnosing instead of another round trip, and a
 * short code in parentheses costs a reader nothing.
 */
export function describePushFailure(status: number | null, code: string | null): string {
  const owner = classifyProviderReason(code);
  const suffix = code ? ` (${code})` : "";

  if (owner === "ours") {
    return `The push service rejected the credentials we sign notifications with${suffix}. Nothing is wrong with your device; this one is ours to fix.`;
  }
  if (owner === "device") {
    return `The push service no longer recognises this device${suffix}. Turn the switch off and on again to register it fresh.`;
  }
  if (owner === "transient") {
    return `The push service is rate-limiting or briefly unavailable${suffix}. Try the test again shortly.`;
  }
  if (status === 401 || status === 403) {
    // No code to go on. Say both possibilities rather than picking one and
    // sending someone to re-register a device that was never the problem.
    return "The push service refused this notification, and did not say whether the problem is this device's registration or our signing credentials. Turn the switch off and on again; if that does not help, it is ours to fix.";
  }
  return status
    ? `The push service could not deliver to this device (HTTP ${status})${suffix}.`
    : "The push service could not deliver to this device.";
}

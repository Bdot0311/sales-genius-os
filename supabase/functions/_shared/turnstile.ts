/**
 * Cloudflare Turnstile verification, server-side.
 *
 * `verify-turnstile` has done this inline since before there was a second
 * caller. It is left alone deliberately: it guards signup, and refactoring a
 * working control on the account-creation path to save a few lines is a bad
 * trade. New callers use this; that one should migrate when something else
 * takes it apart anyway.
 *
 * Fails OPEN when no secret is configured, matching the existing behaviour.
 * The reasoning there is worth repeating rather than rediscovering: a missing
 * secret is an operator mistake, and the cost of closing is that every real
 * person is locked out of a form while nobody notices, which is worse than
 * the spam it would stop.
 */

export interface TurnstileResult {
  /** Whether the submission may proceed. True when skipped. */
  ok: boolean;
  /** Why, for logs. Never shown to the submitter. */
  reason: "verified" | "no_secret" | "missing_token" | "rejected" | "unreachable";
}

const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

/*
 * `secret` is passed in rather than read from the environment here. A default
 * of `Deno.env.get(...)` reads well and is a trap: a caller passing undefined
 * explicitly re-evaluates the default, so the dependency cannot be stubbed
 * and the function cannot be exercised outside Deno at all. Explicit is also
 * honest about what this needs.
 */
export async function verifyTurnstile(
  token: unknown,
  remoteIp: string | null,
  secret: string | undefined,
  fetchImpl: typeof fetch = fetch,
): Promise<TurnstileResult> {
  if (!secret) return { ok: true, reason: "no_secret" };
  if (typeof token !== "string" || token.length === 0) {
    return { ok: false, reason: "missing_token" };
  }

  const form = new FormData();
  form.append("secret", secret);
  form.append("response", token);
  if (remoteIp) form.append("remoteip", remoteIp);

  try {
    const res = await fetchImpl(VERIFY_URL, { method: "POST", body: form });
    const body = await res.json().catch(() => null);
    return body && (body as { success?: boolean }).success === true
      ? { ok: true, reason: "verified" }
      : { ok: false, reason: "rejected" };
  } catch {
    /*
     * Cloudflare unreachable. Fail open for the same reason as a missing
     * secret: an outage at the verifier must not take the form down with it.
     */
    return { ok: true, reason: "unreachable" };
  }
}

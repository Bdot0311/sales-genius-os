/**
 * When an AI call is worth making again.
 *
 * Kept free of Deno-only and npm imports on purpose: ai-provider.ts pulls in
 * the Supabase client, which the node test runner cannot resolve, and logic
 * this load-bearing should be unit-tested rather than only asserted on as
 * source text.
 */

/**
 * Whether a response is worth asking again for.
 *
 * 429 and 5xx are the provider saying "not now", which is a different thing
 * from the request being wrong. 4xx other than 429 will say exactly the same
 * thing next time, so retrying one only spends time and quota.
 *
 * This matters more than it looks: every AI call in the product goes through
 * aiFetch, and nothing above it retried a transient blip. A single 429 on the
 * rubric became "the scorer didn't respond", which failed a draft, which spent
 * one of a bulk item's four attempts and put it to the back of a 30-second to
 * 30-minute backoff. A batch of 63 leads turned a handful of provider hiccups
 * into dozens of failed drafts that way.
 */
export function shouldRetryStatus(status: number): boolean {
  return status === 429 || (status >= 500 && status < 600);
}

/**
 * How long to wait before asking again.
 *
 * The provider's own Retry-After wins when it sends one, because it knows when
 * it will be ready and guessing shorter just earns another 429. Otherwise a
 * short exponential backoff: 400ms, then 1200ms.
 *
 * Capped hard. These run inside edge functions with their own deadlines, and a
 * retry that outlives the request it belongs to helps nobody.
 */
export const AI_MAX_ATTEMPTS = 3;
export const AI_RETRY_CAP_MS = 5_000;

export function retryDelayMs(attempt: number, retryAfter: string | null): number {
  const header = Number(retryAfter);
  // Retry-After may be seconds or a date; only the numeric form is useful here,
  // and a negative or absurd value is ignored rather than trusted.
  if (Number.isFinite(header) && header > 0) {
    return Math.min(header * 1000, AI_RETRY_CAP_MS);
  }
  return Math.min(400 * 3 ** Math.max(0, attempt - 1), AI_RETRY_CAP_MS);
}

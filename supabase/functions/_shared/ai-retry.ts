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

/**
 * Spread a herd off the same millisecond.
 *
 * Four drafts times a scorer times a rewrite all see 429 together, and a
 * retry that waits exactly 400ms asks again together. A quarter of the base
 * delay either side keeps Retry-After's meaning and the cap.
 */
export function jitteredRetryDelayMs(
  attempt: number,
  retryAfter: string | null,
  random: () => number = Math.random,
): number {
  const base = retryDelayMs(attempt, retryAfter);
  const spread = base * 0.25;
  const rolled = random();
  const unit = Number.isFinite(rolled) ? Math.min(1, Math.max(0, rolled)) : 0.5;
  return Math.max(0, Math.min(AI_RETRY_CAP_MS, Math.round(base - spread + unit * spread * 2)));
}

/** A dropped connection or a deadline, as opposed to a 400 the next try will repeat. */
export function isTransientTransportError(error: unknown): boolean {
  const msg = (error instanceof Error ? error.message : String(error ?? "")).toLowerCase();
  return /timeout|timed out|network|econn|fetch failed|socket|econnreset|reset by peer|unreachable/.test(msg);
}

export interface AiRetryHooks {
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
  signal?: { aborted: boolean };
}

/**
 * Ask again on 429, 5xx, and a transport failure. Stop on any other status.
 *
 * One shared loop, because the gateway path had it and the Bedrock path —
 * the one that writes and scores the email — returned the first 429.
 */
export async function runWithAiRetries(
  send: () => Promise<Response>,
  hooks: AiRetryHooks = {},
): Promise<Response> {
  const sleep = hooks.sleep ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
  const random = hooks.random ?? Math.random;
  let last: Response | null = null;
  let lastError: unknown = null;
  for (let attempt = 1; attempt <= AI_MAX_ATTEMPTS; attempt++) {
    try {
      const res = await send();
      last = res;
      lastError = null;
      if (!shouldRetryStatus(res.status) || attempt === AI_MAX_ATTEMPTS) return res;
      const wait = jitteredRetryDelayMs(attempt, res.headers.get("retry-after"), random);
      await res.body?.cancel().catch(() => {});
      await sleep(wait);
      if (hooks.signal?.aborted) return res;
    } catch (error) {
      lastError = error;
      if (!isTransientTransportError(error) || attempt === AI_MAX_ATTEMPTS || hooks.signal?.aborted) throw error;
      await sleep(jitteredRetryDelayMs(attempt, null, random));
    }
  }
  if (last) return last;
  throw lastError instanceof Error ? lastError : new Error("AI request failed");
}

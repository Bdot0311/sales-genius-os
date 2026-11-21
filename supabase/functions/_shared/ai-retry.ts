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
/** The whole call, including retries. Edge functions die past this. */
export const AI_CALL_DEADLINE_MS = 120_000;
/**
 * One attempt. Two of these fit inside the deadline, so a timeout is asked
 * again. An attempt that uses the whole deadline never is: the clock is
 * already gone when it fails.
 */
export const AI_ATTEMPT_TIMEOUT_MS = 45_000;

/** True when a timed-out attempt still leaves room to ask again. */
export function attemptTimeoutLeavesRoom(
  deadlineMs = AI_CALL_DEADLINE_MS,
  attemptMs = AI_ATTEMPT_TIMEOUT_MS,
): boolean {
  return attemptMs > 0 && attemptMs * 2 <= deadlineMs;
}

/**
 * How long this attempt may run.
 *
 * A short early attempt is how a stall gets cancelled. Once an attempt has
 * actually timed out, the next one is the last: it receives every millisecond
 * still left before the deadline, so a generation of about 70s can finish
 * inside 120s after a single 45s cutoff. Spending that remainder on another
 * 45s cutoff is what left the last try ~29s and billed the call three times.
 * A 429 comes back at once, so this bound does not change that retry.
 */
export function attemptBudgetMs(
  attempt: number,
  elapsedMs: number,
  opts?: { maxAttempts?: number; deadlineMs?: number; shortMs?: number; final?: boolean },
): number {
  const maxAttempts = opts?.maxAttempts ?? AI_MAX_ATTEMPTS;
  const deadlineMs = opts?.deadlineMs ?? AI_CALL_DEADLINE_MS;
  const shortMs = opts?.shortMs ?? AI_ATTEMPT_TIMEOUT_MS;
  const remaining = deadlineMs - Math.max(0, elapsedMs);
  if (opts?.final || attempt >= maxAttempts) return Math.max(0, remaining);
  return shortMs;
}

function isAttemptTimeout(error: unknown): boolean {
  return error instanceof Error && error.message === "Timeout";
}

/**
 * Bound one attempt and cancel it when the bound or the parent deadline hits.
 *
 * A timeout of the attempt, with the parent still open, is a retryable
 * Timeout. The parent aborting is the deadline: same error, and the caller
 * must not ask again.
 */
export interface AttemptClock {
  /** Schedule `fn` after `ms`. The returned function cancels it. */
  set: (fn: () => void, ms: number) => () => void;
}

const realClock: AttemptClock = {
  set(fn, ms) {
    const id = setTimeout(fn, ms);
    return () => clearTimeout(id);
  },
};

export function withAttemptTimeout(
  start: (signal: AbortSignal) => Promise<Response>,
  ms: number,
  parent?: AbortSignal,
  clock: AttemptClock = realClock,
): Promise<Response> {
  const attempt = new AbortController();
  let timedOut = false;
  let settled = false;
  return new Promise((resolve, reject) => {
    const finish = () => {
      cancelTimer();
      parent?.removeEventListener("abort", onParent);
    };
    const fail = (error: unknown) => {
      if (settled) return;
      settled = true;
      finish();
      if (timedOut || parent?.aborted) reject(new Error("Timeout"));
      else reject(error);
    };
    const cancelTimer = clock.set(() => {
      timedOut = true;
      attempt.abort();
      fail(new Error("Timeout"));
    }, ms);
    const onParent = () => {
      attempt.abort();
      fail(new Error("Timeout"));
    };
    if (parent) {
      if (parent.aborted) onParent();
      else parent.addEventListener("abort", onParent);
    }
    if (settled) return;
    start(attempt.signal).then(
      (res) => {
        if (settled) return;
        settled = true;
        finish();
        resolve(res);
      },
      fail,
    );
  });
}

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
  /** Defaults to Date.now. Tests advance this instead of waiting out the deadline. */
  now?: () => number;
  deadlineMs?: number;
  shortMs?: number;
}

/**
 * Ask again on 429, 5xx, and a transport failure. Stop on any other status.
 *
 * One shared loop, because the gateway path had it and the Bedrock path —
 * the one that writes and scores the email — returned the first 429.
 */
export async function runWithAiRetries(
  send: (attemptMs: number) => Promise<Response>,
  hooks: AiRetryHooks = {},
): Promise<Response> {
  const sleep = hooks.sleep ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
  const random = hooks.random ?? Math.random;
  const now = hooks.now ?? Date.now;
  const started = now();
  const budgetOpts = { deadlineMs: hooks.deadlineMs, shortMs: hooks.shortMs };
  let last: Response | null = null;
  let lastError: unknown = null;
  // A timeout spends the short bound. The following attempt is the last one
  // and receives whatever the deadline still allows, so a slow generation is
  // billed twice, not three times.
  let afterTimeout = false;
  for (let attempt = 1; attempt <= AI_MAX_ATTEMPTS; attempt++) {
    const budget = attemptBudgetMs(attempt, now() - started, { ...budgetOpts, final: afterTimeout });
    try {
      const res = await send(budget);
      last = res;
      lastError = null;
      if (!shouldRetryStatus(res.status) || afterTimeout || attempt === AI_MAX_ATTEMPTS) return res;
      const wait = jitteredRetryDelayMs(attempt, res.headers.get("retry-after"), random);
      await res.body?.cancel().catch(() => {});
      await sleep(wait);
      if (hooks.signal?.aborted) return res;
    } catch (error) {
      lastError = error;
      if (hooks.signal?.aborted || !isTransientTransportError(error)) throw error;
      if (isAttemptTimeout(error)) {
        if (afterTimeout) throw error;
        afterTimeout = true;
        await sleep(jitteredRetryDelayMs(attempt, null, random));
        continue;
      }
      if (attempt === AI_MAX_ATTEMPTS) throw error;
      await sleep(jitteredRetryDelayMs(attempt, null, random));
    }
  }
  if (last) return last;
  throw lastError instanceof Error ? lastError : new Error("AI request failed");
}

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  AI_ATTEMPT_TIMEOUT_MS,
  AI_CALL_DEADLINE_MS,
  AI_MAX_ATTEMPTS,
  AI_RETRY_CAP_MS,
  attemptBudgetMs,
  attemptTimeoutLeavesRoom,
  retryDelayMs,
  runWithAiRetries,
  shouldRetryStatus,
  withAttemptTimeout,
} from "../../supabase/functions/_shared/ai-retry";

const code = (s: string) => s.replace(/^\s*\/\/.*$/gm, "");
const PROVIDER = code(readFileSync("supabase/functions/_shared/ai-provider.ts", "utf8"));
const RETRY = code(readFileSync("supabase/functions/_shared/ai-retry.ts", "utf8"));
const RUBRIC = code(readFileSync("supabase/functions/check-email-rubric/index.ts", "utf8"));

describe("which AI failures are worth asking again for", () => {
  it("retries the provider saying not now", () => {
    expect(shouldRetryStatus(429)).toBe(true);
    for (const s of [500, 502, 503, 504, 529]) expect(shouldRetryStatus(s), String(s)).toBe(true);
  });

  it("does not retry a request that is simply wrong", () => {
    /*
     * A 400 or a 401 says the same thing next time. Retrying one spends the
     * caller's time and the account's quota to learn nothing.
     */
    for (const s of [200, 400, 401, 403, 404, 422]) expect(shouldRetryStatus(s), String(s)).toBe(false);
  });
});

describe("how long to wait", () => {
  it("prefers the provider's own Retry-After, which knows when it will be ready", () => {
    expect(retryDelayMs(1, "2")).toBe(2000);
  });

  it("backs off exponentially when it is not told", () => {
    expect(retryDelayMs(1, null)).toBe(400);
    expect(retryDelayMs(2, null)).toBe(1200);
  });

  it("caps the wait, because this runs inside an edge function's deadline", () => {
    expect(retryDelayMs(9, null)).toBe(AI_RETRY_CAP_MS);
    expect(retryDelayMs(1, "3600")).toBe(AI_RETRY_CAP_MS);
  });

  it("ignores a Retry-After that is not a usable number", () => {
    // It may be an HTTP date, or absent, or nonsense. Fall back rather than
    // produce NaN and wait forever or not at all.
    for (const header of [null, "", "Wed, 21 Oct 2026 07:28:00 GMT", "-5", "0"]) {
      expect(retryDelayMs(1, header), String(header)).toBe(400);
    }
  });

  it("gives up after a bounded number of attempts", () => {
    expect(AI_MAX_ATTEMPTS).toBeGreaterThan(1);
    expect(AI_MAX_ATTEMPTS).toBeLessThanOrEqual(4);
  });

  it("times an attempt out soon enough that the timeout itself is retried", () => {
    // An attempt that lasts as long as the whole call cannot be retried:
    // the deadline is already spent when it fails.
    expect(attemptTimeoutLeavesRoom()).toBe(true);
    expect(AI_ATTEMPT_TIMEOUT_MS).toBeLessThan(AI_CALL_DEADLINE_MS);
    expect(AI_ATTEMPT_TIMEOUT_MS * 2).toBeLessThanOrEqual(AI_CALL_DEADLINE_MS);
    const bedrockRetry = PROVIDER.slice(
      PROVIDER.indexOf("runWithAiRetries("),
      PROVIDER.indexOf("if (!res.ok) return res"),
    );
    expect(bedrockRetry).toContain("withAttemptTimeout");
    expect(bedrockRetry).toContain("(budget)");
    expect(bedrockRetry).not.toContain("AI_ATTEMPT_TIMEOUT_MS");
    expect(bedrockRetry).not.toContain("AI_CALL_DEADLINE_MS");
    expect(attemptBudgetMs(1, 0)).toBe(AI_ATTEMPT_TIMEOUT_MS);
    expect(attemptBudgetMs(AI_MAX_ATTEMPTS, 0)).toBeGreaterThanOrEqual(70_000);
  });
});

describe("the last attempt may run as long as the deadline allows", () => {
  it("a 70s response succeeds on the final attempt", async () => {
    let now = 0;
    const budgets: number[] = [];
    const res = await runWithAiRetries(
      async (budget) => {
        budgets.push(budget);
        // Early attempts are the short bound. A body that takes 70s cannot
        // finish, so those attempts time out and the clock moves on by that bound.
        // Early attempts failed fast (a blip, not a 45s burn). A body that
        // needs 70s only fits the last attempt, which is given the time left.
        if (budget < 70_000) throw new Error("Timeout");
        return new Response("ok", { status: 200 });
      },
      { now: () => now, sleep: async (ms) => { now += ms; }, random: () => 0.5 },
    );
    expect(res.status).toBe(200);
    expect(budgets.slice(0, -1)).toEqual([AI_ATTEMPT_TIMEOUT_MS, AI_ATTEMPT_TIMEOUT_MS]);
    expect(budgets.at(-1)).toBeGreaterThanOrEqual(70_000);
  });

  it("cancels a stalled first attempt and retries", async () => {
    let now = 0;
    const pending: { at: number; fn: () => void; cleared: boolean }[] = [];
    const clock = {
      set(fn: () => void, ms: number) {
        const item = { at: now + ms, fn, cleared: false };
        pending.push(item);
        return () => { item.cleared = true; };
      },
    };
    const flush = (until: number) => {
      now = until;
      for (const item of pending) {
        if (!item.cleared && item.at <= now) item.fn();
      }
    };
    let calls = 0;
    const done = runWithAiRetries(
      (budget) => withAttemptTimeout((signal) => new Promise((resolve, reject) => {
        calls += 1;
        if (calls === 1) {
          expect(budget).toBe(AI_ATTEMPT_TIMEOUT_MS);
          signal.addEventListener("abort", () => reject(new Error("aborted")));
          return;
        }
        resolve(new Response("ok", { status: 200 }));
      }), budget, undefined, clock),
      { now: () => now, sleep: async () => {}, random: () => 0 },
    );
    await Promise.resolve();
    flush(AI_ATTEMPT_TIMEOUT_MS);
    const res = await done;
    expect(res.status).toBe(200);
    expect(calls).toBe(2);
  });

  it("the deadline still ends the call", async () => {
    const parent = new AbortController();
    let calls = 0;
    const pending = runWithAiRetries(
      (budget) => {
        calls += 1;
        expect(budget).toBeGreaterThanOrEqual(AI_ATTEMPT_TIMEOUT_MS);
        return withAttemptTimeout((signal) => new Promise((_resolve, reject) => {
          signal.addEventListener("abort", () => reject(new Error("aborted")));
        }), budget, parent.signal);
      },
      { signal: parent.signal, sleep: async () => {} },
    );
    parent.abort();
    await expect(pending).rejects.toThrow("Timeout");
    expect(calls).toBe(1);
  });

  it("a 429 is still retried once and then accepted, independent of the attempt bound", async () => {
    const throttled = new Response("no", { status: 429 });
    const ok = new Response("ok", { status: 200 });
    let calls = 0;
    const slept: number[] = [];
    const res = await runWithAiRetries(
      () => Promise.resolve(calls++ === 0 ? throttled : ok),
      { sleep: async (ms) => { slept.push(ms); }, random: () => 0.5 },
    );
    expect(res.status).toBe(200);
    expect(calls).toBe(2);
    expect(slept).toEqual([400]);
  });
});

describe("an attempt timeout is asked again, and the deadline is not", () => {
  it("retries when the attempt aborts and the deadline is still open", async () => {
    let calls = 0;
    const ok = await runWithAiRetries(
      () => withAttemptTimeout((signal) => new Promise((resolve, reject) => {
        calls += 1;
        if (calls === 1) signal.addEventListener("abort", () => reject(new Error("aborted")));
        else resolve(new Response("ok", { status: 200 }));
      }), 20),
      { sleep: async () => {}, random: () => 0 },
    );
    expect(ok.status).toBe(200);
    expect(calls).toBe(2);
  });

  it("does not ask again after the overall deadline has aborted", async () => {
    const parent = new AbortController();
    parent.abort();
    let calls = 0;
    await expect(runWithAiRetries(
      () => {
        calls += 1;
        return withAttemptTimeout(
          () => Promise.reject(new Error("aborted")),
          AI_CALL_DEADLINE_MS,
          parent.signal,
        );
      },
      { signal: parent.signal, sleep: async () => {} },
    )).rejects.toThrow("Timeout");
    expect(calls).toBe(1);
  });
});

describe("the retry is wired into the one helper every AI call uses", () => {
  it("loops on a retryable status", () => {
    expect(RETRY).toContain("shouldRetryStatus(res.status)");
    expect(RETRY).toContain("attempt === AI_MAX_ATTEMPTS");
  });

  it("stops when the caller has given up or the budget expired", () => {
    // Without this a retry outlives the request it belongs to.
    expect(RETRY).toContain("hooks.signal?.aborted");
  });

  it("releases the body of a response it is discarding", () => {
    expect(RETRY).toContain("await res.body?.cancel()");
  });

  it("sends a streamed request once, and retries Bedrock as well as the gateway", () => {
    expect(PROVIDER).toContain("body.stream === true");
    expect(PROVIDER).toContain("? await sendOnce(AI_CALL_DEADLINE_MS)");
    const bedrock = PROVIDER.slice(
      PROVIDER.indexOf('route.provider === "bedrock"'),
      PROVIDER.indexOf("const headers"),
    );
    expect(bedrock).toContain("runWithAiRetries");
    expect(PROVIDER).toContain("runWithAiRetries(sendOnce");
  });
});

describe("why this matters to the scorer", () => {
  it("the rubric fails closed on any non-OK response, with no retry of its own", () => {
    /*
     * This is the largest single cause of failed drafts in a batch: a 429 or a
     * 503 here becomes "the scorer didn't respond", which fails the draft,
     * which spends one of a bulk item's four attempts. The rubric is right to
     * fail closed rather than invent a score -- so the retry belongs below it,
     * in aiFetch, which is where it now is.
     */
    expect(RUBRIC).toContain('error_code: "rate_limit"');
    expect(RUBRIC).toContain('error_code: "ai_failed"');
    expect(RUBRIC).toContain("aiFetch(");
    /*
     * Anchored on code, not on a comment: this slice first ended at "Parse
     * strictly", which code() strips, so indexOf returned -1 and slice(start,
     * -1) ran to the end of the file and swallowed an unrelated for-loop.
     */
    const from = RUBRIC.indexOf("const res = await aiFetch");
    const to = RUBRIC.indexOf("const dimensions:");
    expect(from, "the rubric should call aiFetch").toBeGreaterThan(-1);
    expect(to, "the rubric should build its dimensions").toBeGreaterThan(from);
    expect(RUBRIC.slice(from, to)).not.toMatch(/for\s*\(|while\s*\(|retry/i);
  });
});

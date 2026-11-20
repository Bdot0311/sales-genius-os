import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  AI_MAX_ATTEMPTS,
  AI_RETRY_CAP_MS,
  retryDelayMs,
  shouldRetryStatus,
} from "../../supabase/functions/_shared/ai-retry";

const code = (s: string) => s.replace(/^\s*\/\/.*$/gm, "");
const PROVIDER = code(readFileSync("supabase/functions/_shared/ai-provider.ts", "utf8"));
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
});

describe("the retry is wired into the one helper every AI call uses", () => {
  it("loops on a retryable status", () => {
    expect(PROVIDER).toContain("shouldRetryStatus(res.status)");
    expect(PROVIDER).toContain("attempt < AI_MAX_ATTEMPTS");
  });

  it("stops when the caller has given up or the budget expired", () => {
    // Without this a retry outlives the request it belongs to.
    expect(PROVIDER).toContain("if (signal.aborted) break;");
  });

  it("releases the body of a response it is discarding", () => {
    expect(PROVIDER).toContain("await res.body?.cancel()");
  });

  it("sends a streamed request once", () => {
    expect(PROVIDER).toContain("if (body.stream !== true) {");
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

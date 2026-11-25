import { describe, expect, it } from "vitest";
import { classifyFailure as shellClass } from "./draft-failures";
import { agentJobRetry, classifyFailure as workerKind } from "../../supabase/functions/_shared/bulk-run-logic";

/**
 * Two components decide independently whether the same failure is worth
 * running again.
 *
 *   src/lib/draft-failures.ts        -> the label the owner reads
 *   _shared/bulk-run-logic.ts        -> whether the worker actually retries
 *
 * #373 was that bug in one direction: the shell told the owner a rate-limited
 * research call was not retryable while the worker was already retrying it,
 * and a lead about to be picked up again got written off by hand. The other
 * direction is worse -- a label that says "worth retrying" over a lead
 * nothing will ever touch again.
 *
 * Nothing in the app reads the `retryable` flag, so a mismatch there is
 * latent. What the owner actually sees is the LABEL, and two of them promise
 * a retry in words. This holds those promises to the worker.
 */
const MESSAGES = [
  "The draft printed its own outline instead of an email (Word count: 118).",
  "The draft kept inventing figures it cannot back (40%), so it was not saved.",
  "Research cannot date this claim.",
  "Research for this lead is already running in another pass.",
  "Research already ran recently and did not produce an approved sentence.",
  "The draft said something the research does not support.",
  "Research gave only a copied line from their site.",
  "Research failed (Parallel failed (rate_limit)).",
  "There is no company website on this lead.",
  "The company site could not be read.",
  "Parallel is not configured (PARALLEL_API_KEY, LOVABLE_API_KEY).",
  "Research did not produce an approved sentence.",
  "The reply rubric did not return a score.",
  "The draft failed the quality checker.",
  "The draft left an unfilled placeholder.",
  "AI is rate limited right now. Wait a moment and try again.",
  "AI credits are exhausted.",
  "There is no sender name set.",
  "Lead not found.",
  "Unauthorized.",
  "Its job is gone.",
  "",
  "Something nobody has seen before happened.",
];

/** A label that tells the owner, in words, that the lead will be tried again. */
const promisesRetry = (label: string) => /\bretry|\bretrying\b/i.test(label);

describe("a label that promises a retry gets one", () => {
  it("names at least one promise, or this test is checking nothing", () => {
    // A guard that passes because its premise vanished is worse than no guard.
    const promises = MESSAGES.map((m) => shellClass(m).label).filter(promisesRetry);
    expect(promises.length).toBeGreaterThan(0);
  });

  for (const message of MESSAGES) {
    const label = shellClass(message).label;
    if (!promisesRetry(label)) continue;
    it(`"${label}" is a kind the worker retries`, () => {
      expect(["rate_limit", "transient"], message).toContain(workerKind(message));
      expect(agentJobRetry(message, 0).retry, message).toBe(true);
    });
  }

  it("does not promise a retry for a refusal the model would repeat", () => {
    /*
     * A draft refused for inventing a figure, or for a claim the research
     * cannot support, is a judgement the same prompt reaches again. Promising
     * a retry on those would be the opposite error: an owner waiting for a
     * draft that is never coming.
     */
    for (const permanent of [
      "The draft kept inventing figures it cannot back (40%), so it was not saved.",
      "Research cannot date this claim.",
      "There is no company website on this lead.",
      "AI credits are exhausted.",
    ]) {
      expect(promisesRetry(shellClass(permanent).label), permanent).toBe(false);
      expect(agentJobRetry(permanent, 0).retry, permanent).toBe(false);
    }
  });

  it("stops retrying at the attempt cap, however transient the failure", () => {
    // Otherwise one lead with a permanently flaky site holds a run open.
    const flaky = "The company site could not be read.";
    expect(agentJobRetry(flaky, 0).retry).toBe(true);
    expect(agentJobRetry(flaky, 99).retry).toBe(false);
  });
});

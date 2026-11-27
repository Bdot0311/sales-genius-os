import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const code = (path: string) =>
  readFileSync(path, "utf8").split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");

const DISPATCH = code("supabase/functions/process-sequence-step/index.ts");

/**
 * Step two of three. The sender now passes what step one taught the writer to
 * read, so a sequence touch is written as the touch it is.
 */
describe("the sequence sender says which touch it is sending", () => {
  it("passes the step number as the touch, not as an A/B variant", () => {
    expect(DISPATCH).toContain("touchNumber: nextStepNumber");
    /*
     * variantNum is removed rather than zeroed. These touches are a cadence;
     * none of them is an A/B variant of another, and generate-email's
     * variantNum prompt tells the writer to differ "in a way worth
     * measuring" -- the wrong instruction for a day-7 proof email.
     */
    // Asserted as an argument rather than as a word: the block comment above
    // the call explains why it was removed and names it to do so.
    expect(DISPATCH).not.toContain("variantNum: nextStepNumber");
    expect(DISPATCH).not.toMatch(/variantNum\s*:/);
  });

  it("tells it how many touches there are", () => {
    expect(DISPATCH).toContain("touchCount: totalSteps");
    expect(DISPATCH).toContain('.eq("sequence_id", enrollment.sequence_id)');
  });

  it("loads the owner's approved proof points and passes them", () => {
    expect(DISPATCH).toContain('.from("payoff_bank")');
    expect(DISPATCH).toContain('.eq("user_id", enrollment.user_id)');
    expect(DISPATCH).toContain("payoffBank,");
  });

  it("scopes the bank to the enrolment's owner, never the lead or the caller", () => {
    // A proof point is the sender's claim about themselves; reading anyone
    // else's would put one account's evidence in another account's email.
    const bankRead = DISPATCH.slice(DISPATCH.indexOf('.from("payoff_bank")'));
    const scoped = bankRead.slice(0, bankRead.indexOf("]"));
    expect(scoped).toContain("enrollment.user_id");
    expect(scoped).not.toContain("lead.user_id");
  });

  it("falls back to the current step when the step count cannot be read", () => {
    // A count of zero would tell the writer "touch 3 of 0".
    expect(DISPATCH).toContain("Number(stepCount ?? 0) || nextStepNumber");
  });

  it("still regenerates per recipient rather than sending the stored step body", () => {
    /*
     * The property the whole design rests on: the cadence is shared, the copy
     * never is. If this ever passed the step's body, one lead's personalised
     * email would go to everyone enrolled.
     */
    expect(DISPATCH).toContain("lead: { id: lead.id }");
    expect(DISPATCH).toContain("generate-email");
    expect(DISPATCH).not.toMatch(/body:\s*step\.(body|content)/);
  });

  it("reads the three in one round trip, not three", () => {
    // This runs per enrolment per touch; three sequential reads is three
    // round trips on every send in the account.
    expect(DISPATCH).toContain("await Promise.all([");
  });
});

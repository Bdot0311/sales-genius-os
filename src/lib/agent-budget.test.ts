import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  DEFAULT_TURN_TOKEN_BUDGET,
  budgetExhausted,
  budgetNote,
  carriedTokens,
  tokensIn,
  turnTokenBudget,
} from "../../supabase/functions/_shared/agent-budget";

/**
 * The only ceiling on a turn was wall-clock.
 *
 * outOfTime() stops the loop when the invocation is about to be killed, and
 * nothing looked at tokens. A turn that drags a hundred-lead list and six
 * research briefs through eight model steps costs real money and stays inside
 * the time budget the whole way — and a turn that resumes after a restart
 * starts its clock again while its spend carries on from where it was, so the
 * same work could be paid for twice with nothing to stop it.
 */

describe("the ceiling", () => {
  it("has a default when nothing is configured", () => {
    expect(turnTokenBudget(undefined)).toBe(DEFAULT_TURN_TOKEN_BUDGET);
    expect(turnTokenBudget(null)).toBe(DEFAULT_TURN_TOKEN_BUDGET);
  });

  it("takes a configured one", () => {
    expect(turnTokenBudget("120000")).toBe(120_000);
  });

  it("ignores a value that is not a budget", () => {
    expect(turnTokenBudget("lots")).toBe(DEFAULT_TURN_TOKEN_BUDGET);
    expect(turnTokenBudget("-5")).toBe(DEFAULT_TURN_TOKEN_BUDGET);
    expect(turnTokenBudget("0")).toBe(DEFAULT_TURN_TOKEN_BUDGET);
  });

  it("will not accept one too small to do anything with", () => {
    // A budget under a single large context is a turn that stops before it
    // starts, which reads to the user as the agent being broken.
    expect(turnTokenBudget("500")).toBe(50_000);
  });
});

describe("counting what a step cost", () => {
  it("prefers the total when the provider sends one", () => {
    expect(tokensIn({ total_tokens: 900, prompt_tokens: 1, completion_tokens: 1 })).toBe(900);
  });

  it("adds the halves when it does not", () => {
    expect(tokensIn({ prompt_tokens: 700, completion_tokens: 200 })).toBe(900);
  });

  /*
   * An invented number spent against a budget stops real work, so anything
   * unusable counts as nothing rather than as a guess.
   */
  it("counts nothing it cannot read", () => {
    expect(tokensIn(undefined)).toBe(0);
    expect(tokensIn(null)).toBe(0);
    expect(tokensIn("900")).toBe(0);
    expect(tokensIn({})).toBe(0);
    expect(tokensIn({ total_tokens: "lots" })).toBe(0);
  });
});

describe("spend carried across a resume", () => {
  it("picks up the running total the dead turn left behind", () => {
    expect(carriedTokens({ cumulative_tokens: 120_000 })).toBe(120_000);
  });

  it("starts from zero when there is nothing to carry", () => {
    expect(carriedTokens(undefined)).toBe(0);
    expect(carriedTokens({ prompt_tokens: 50 })).toBe(0);
    expect(carriedTokens({ cumulative_tokens: -1 })).toBe(0);
  });
});

describe("when it stops", () => {
  it("stops at the ceiling, not past it", () => {
    expect(budgetExhausted(399_999, 400_000)).toBe(false);
    expect(budgetExhausted(400_000, 400_000)).toBe(true);
    expect(budgetExhausted(400_001, 400_000)).toBe(true);
  });

  it("tells the user the numbers", () => {
    const note = budgetNote(400_000, 400_000);
    expect(note).toContain("400,000");
  });

  /*
   * A turn that stops here has done real work. Reporting it as a failure sends
   * someone hunting a fault that is not there; reading as completion is the
   * mistake this product keeps making.
   */
  it("says the work is kept and the request is not finished", () => {
    const note = budgetNote(400_000, 400_000);
    expect(note).toContain("saved");
    expect(note).toContain("keep going");
    expect(note).not.toMatch(/\bdone\b|\bcomplete\b|\bfinished\b/i);
  });
});

describe("the loop respects it", () => {
  const AGENT = readFileSync("supabase/functions/agent-chat/index.ts", "utf8");
  const bare = AGENT.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

  it("checks before paying, not after", () => {
    // Knowing the budget is gone once the money is spent is a report, not a
    // limit, so the check is the first thing in the step.
    const loop = bare.indexOf("for (let step = resumeAt; step < MAX_TURN_STEPS; step++)");
    const check = bare.indexOf("if (budgetExhausted(tokensUsed, tokenBudget))", loop);
    const call = bare.indexOf("await aiFetch(\"agent-chat\"", loop);
    expect(check).toBeGreaterThan(loop);
    expect(check).toBeLessThan(call);
  });

  it("counts the step where the cost is incurred", () => {
    expect(bare).toContain("tokensUsed += tokensIn(data?.usage);");
  });

  it("carries the running total into the trace, so a resume continues it", () => {
    expect(bare).toContain("cumulative_tokens: tokensUsed");
    expect(bare).toContain("tokensUsed = carriedTokens(resumed.usage);");
  });

  it("never stops silently", () => {
    // A turn that quietly stops short having claimed nothing is the failure
    // this product already has the most of.
    expect(bare).toContain("if (stoppedOnBudget) {");
    expect(bare).toContain("budgetNote(tokensUsed, tokenBudget)");
  });

  it("does not auto-continue a turn that ran out of money", () => {
    // willContinue is driven by ranOutOfTime; a budget stop must not set it,
    // or the next pass spends again on exactly the work that was too big.
    expect(bare).not.toContain("stoppedOnBudget = true;\n      ranOutOfTime");
    expect(bare).toContain("const willContinue =");
  });
});

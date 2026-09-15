import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  AGENT_MAX_ATTEMPTS,
  AGENT_TARGET_SCORE,
  attemptFeedback,
  better,
  isPerfect,
  overallScore,
  WEAK_SCORE,
  type Attempt,
  type RubricResult,
} from "../../supabase/functions/_shared/email-quality";

const RUN = readFileSync("supabase/functions/agent-run/index.ts", "utf8");
const CHAT = readFileSync("supabase/functions/agent-chat/index.ts", "utf8");

const dims = (r: number, e: number, p: number, l: number, y: number) => ({
  relevance: { score: r, justification: "j" },
  empathy: { score: e, justification: "j" },
  payoff: { score: p, justification: "j" },
  low_friction_ask: { score: l, justification: "j" },
  you_focused: { score: y, justification: "j" },
});
const rubric = (...s: [number, number, number, number, number]): RubricResult => ({
  dimensions: dims(...s),
  suggestions: [],
  weakest: null,
  overall: overallScore(dims(...s)),
});
const attempt = (r: RubricResult | null, blocking: Attempt["blocking"] = []): Attempt =>
  ({ subject: "s", body: "b", rubric: r, blocking });

/**
 * Outreach Studio shows a person their score and lets them edit until it is
 * green. The agent has nobody to show it to: it writes, it sends, and the first
 * human to read the copy is the prospect. So the loop a person performs by hand
 * has to happen inside the agent, and a draft that never gets there is held
 * rather than sent.
 */
describe("the bar the agent writes to", () => {
  it("is the top of the scale, not a comfortable pass", () => {
    expect(AGENT_TARGET_SCORE).toBe(100);
    expect(AGENT_TARGET_SCORE).toBeGreaterThan(WEAK_SCORE);
  });

  it("100 means five out of five on every dimension", () => {
    expect(overallScore(dims(5, 5, 5, 5, 5))).toBe(100);
    expect(overallScore(dims(5, 5, 5, 5, 4))).toBeLessThan(AGENT_TARGET_SCORE);
  });

  it("is reached only when the rule audit is clean too", () => {
    // A perfect rubric score does not forgive a banned phrase or a company
    // name that does not match the lead row.
    expect(isPerfect(attempt(rubric(5, 5, 5, 5, 5)))).toBe(true);
    expect(isPerfect(attempt(rubric(5, 5, 5, 5, 5), [
      { rule: "banned_phrase", severity: "blocker", why: "w", fix: "f" },
    ]))).toBe(false);
  });

  it("treats a warning as worth another attempt, not just a blocker", () => {
    expect(isPerfect(attempt(rubric(5, 5, 5, 5, 5), [
      { rule: "too_long", severity: "warning", why: "w", fix: "f" },
    ]))).toBe(false);
  });

  it("an unscored draft is never called perfect", () => {
    expect(isPerfect(attempt(null))).toBe(false);
  });
});

describe("choosing between attempts", () => {
  it("keeps the better score, because a rewrite is not automatically an improvement", () => {
    expect(better(attempt(rubric(5, 5, 5, 5, 5)), attempt(rubric(3, 3, 3, 3, 3)))).toBe(true);
    expect(better(attempt(rubric(3, 3, 3, 3, 3)), attempt(rubric(5, 5, 5, 5, 5)))).toBe(false);
  });

  it("breaks a tie on fewer rule findings", () => {
    const one = [{ rule: "x", severity: "warning", why: "w", fix: "f" }];
    expect(better(attempt(rubric(4, 4, 4, 4, 4), []), attempt(rubric(4, 4, 4, 4, 4), one))).toBe(true);
    expect(better(attempt(rubric(4, 4, 4, 4, 4), one), attempt(rubric(4, 4, 4, 4, 4), []))).toBe(false);
  });

  it("takes the first attempt when there is nothing to compare against", () => {
    expect(better(attempt(rubric(1, 1, 1, 1, 1)), null)).toBe(true);
  });
});

describe("what the next attempt is told", () => {
  const fb = attemptFeedback(attempt(rubric(5, 3, 5, 2, 5), [
    { rule: "banned_phrase", severity: "blocker", why: "It reads as a template.", fix: "Cut it." },
  ]));

  it("names the score and the target", () => {
    expect(fb).toContain("80/100");
    expect(fb).toContain("reach 100");
  });

  it("names only the dimensions that fell short", () => {
    expect(fb).toContain("empathy (3/5)");
    expect(fb).toContain("low_friction_ask (2/5)");
    expect(fb).not.toContain("relevance (5/5)");
  });

  it("carries the rule findings, which a score alone would hide", () => {
    // Told only about the rubric, the writer rewrites good sentences around a
    // banned phrase it was never shown.
    expect(fb).toContain("banned_phrase");
    expect(fb).toContain("Cut it.");
  });

  it("asks for a different email rather than a reword", () => {
    expect(fb).toContain("Do not simply reword");
  });
});

describe("the autonomous run", () => {
  it("loops rather than retrying once", () => {
    expect(RUN).toContain("while (!isPerfect(best) && attempts < AGENT_MAX_ATTEMPTS)");
  });

  it("scores every attempt on both checks", () => {
    expect(RUN).toContain("const assess = async");
    expect(RUN).toContain("auditEmail({");
    expect(RUN).toContain('.filter((f) => f.severity !== "note")');
  });

  it("holds anything short of the bar instead of sending it", () => {
    expect(RUN).toContain("const qualityHold = scored ? !isPerfect(best)");
  });

  it("still sends for an account the rubric cannot score", () => {
    // It is plan-gated to growth and above. Holding every email on a starter
    // plan would stop the agent working rather than improve it.
    expect(RUN).toContain("const scored = rubric !== null;");
    expect(RUN).toContain("isWeak(rubric) || best.blocking.length > 0");
  });

  it("records the score where the user can see it", () => {
    // It was computed and thrown away, so the only evidence was a server log.
    expect(RUN).toContain("const quality = {");
    expect(RUN).toContain("quality,");
    expect(RUN).toContain("held_for_quality: qualityHold");
  });

  it("says why a held draft was held", () => {
    expect(RUN).toContain("so it needs an edit before it goes");
  });
});

describe("the chat path holds the same bar", () => {
  it("counts rewrite rounds instead of allowing exactly one", () => {
    // A Set only ever allowed one, so the second attempt shipped however it scored.
    expect(CHAT).not.toContain("const rewriteAsked = new Set<string>()");
    expect(CHAT).toContain("const rewriteRounds = new Map<string, number>()");
    expect(CHAT).toContain("round < AGENT_MAX_ATTEMPTS - 1");
  });

  it("measures against the same two checks", () => {
    expect(CHAT).toContain("isPerfect(attempt)");
    expect(CHAT).toContain("auditEmail({ subject, body, position: 1");
  });

  it("checks the copy against the lead row, not only against itself", () => {
    expect(CHAT).toContain("lead: { company: companyName, contactName }");
  });

  it("hands a draft it cannot perfect to the user rather than sending it", () => {
    expect(CHAT).toContain("forceApproval = true");
  });
});

describe("the attempt ceiling is a cost ceiling", () => {
  it("is bounded", () => {
    // Every attempt is a generation plus a scoring call.
    expect(AGENT_MAX_ATTEMPTS).toBeGreaterThan(1);
    expect(AGENT_MAX_ATTEMPTS).toBeLessThanOrEqual(5);
  });
});

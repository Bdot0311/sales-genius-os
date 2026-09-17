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

/**
 * Source with comments removed.
 *
 * An assertion that a region does not touch a column has to read the code, not
 * the prose around it: the comment explaining why the lead is left alone names
 * the very columns it leaves alone.
 */
const code = (text: string) =>
  text.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");

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
    // Pinned on the shape rather than on which predicate names the bar. The
    // score the agent rewrites toward and the score a draft has to clear to go
    // out are two separate decisions, and they have already diverged once:
    // naming one of them here turned a deliberate change into a red suite.
    expect(RUN).toMatch(
      /const qualityHold = scored \? !is\w+\(best\) : isWeak\(rubric\) \|\| best\.blocking\.length > 0;/,
    );
  });

  it("keeps the rewrite target and the send bar as two separate numbers", () => {
    // AGENT_TARGET_SCORE is what the loop writes toward; AGENT_SEND_SCORE is
    // what a draft has to clear to leave. Holding every send to a perfect card
    // meant the agent could spend a day's quota rewriting and reach nobody.
    const QUALITY = readFileSync("supabase/functions/_shared/email-quality.ts", "utf8");
    expect(QUALITY).toContain("export const AGENT_TARGET_SCORE = 100;");
    expect(QUALITY).toContain("export const AGENT_SEND_SCORE = 80;");
    expect(QUALITY).toContain("scored >= AGENT_SEND_SCORE");
    // Only real blockers stop a send; soft warnings never do.
    expect(QUALITY).toContain('a.blocking.filter((f) => f.severity === "blocker")');
  });

  it("throws a failed draft away rather than filing it", () => {
    // Saving it put copy the agent had already judged unsendable into the same
    // Drafts tab as work waiting on approval, so the tab stopped meaning
    // "ready to go" and became a queue of things to triage.
    expect(RUN).not.toContain("if (approvalMode || qualityHold)");
    expect(RUN).toContain("if (qualityHold) {");
    expect(RUN).toContain("if (approvalMode) {");
    expect(RUN.indexOf("if (qualityHold) {")).toBeLessThan(RUN.indexOf("if (approvalMode) {"));
  });

  it("writes no draft row on the quality path", () => {
    // The upsert has to sit inside the approval branch, where the copy passed.
    const qualityBranch = code(
      RUN.slice(RUN.indexOf("if (qualityHold) {"), RUN.indexOf("if (approvalMode) {")),
    );
    expect(qualityBranch).not.toContain("email_drafts");
    expect(RUN.indexOf('from("email_drafts").upsert')).toBeGreaterThan(RUN.indexOf("if (approvalMode) {"));
  });

  it("says a skipped lead was neither sent nor saved", () => {
    expect(RUN).toContain("nothing was sent or saved");
    expect(RUN).toContain('reason: "quality"');
  });

  it("still sends for an account the rubric cannot score", () => {
    // It is plan-gated to growth and above. Holding every email on a starter
    // plan would stop the agent working rather than improve it.
    expect(RUN).toContain("const scored = rubric !== null;");
    expect(RUN).toContain("isWeak(rubric) || best.blocking.length > 0");
  });

  it("records the score where the user can see it", () => {
    // It was computed and thrown away, so the only evidence was a server log.
    // Carried on all three outcomes now: sent, saved for approval, and skipped.
    expect(RUN).toContain("const quality = {");
    expect(RUN).toContain("quality,");
    expect(RUN.match(/^\s*quality,$/gm) ?? []).toHaveLength(3);
  });

  it("puts the score on a draft it does save", () => {
    expect(RUN).toContain("saved to your drafts");
    expect(RUN).toContain("scoring ${quality.score ?? \"unscored\"}/100");
  });
});

/**
 * Nothing marks a lead as attempted unless an email actually sends, and the
 * candidate query takes the highest ICP scores first. So a lead the agent
 * cannot reach the bar for is picked again every run — burning four
 * generations and four scoring calls each time, and holding a slot at the top
 * of the order that keeps every lead behind it from ever being tried.
 */
describe("a lead the agent cannot write well for does not block the queue", () => {
  it("reads back its own recent quality skips", () => {
    expect(RUN).toContain("COOLDOWN_DAYS = 7");
    expect(RUN).toContain('.eq("action_type", "skipped")');
    expect(RUN).toContain('m?.reason === "quality"');
  });

  it("excludes those leads from the next run's candidates", () => {
    expect(RUN).toContain('.not("id", "in", `(${coolingOff.join(",")})`)');
  });

  it("applies the exclusion before the ordering that causes the starvation", () => {
    expect(RUN.indexOf("coolingOff")).toBeLessThan(RUN.indexOf('.order("icp_score"'));
  });

  it("never sends PostgREST an empty IN group, which it rejects", () => {
    expect(RUN).toContain("if (coolingOff.length > 0)");
  });

  it("leaves the lead itself untouched, so enriching it brings it back", () => {
    // No status change and no archive, so the lead stays uncontacted and the
    // agent writes a fresh email once the cooldown passes.
    const qualityBranch = code(
      RUN.slice(RUN.indexOf("if (qualityHold) {"), RUN.indexOf("if (approvalMode) {")),
    );
    expect(qualityBranch).not.toContain("lead_status");
    expect(qualityBranch).not.toContain("last_contacted_at");
    expect(qualityBranch).not.toContain(".update(");
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

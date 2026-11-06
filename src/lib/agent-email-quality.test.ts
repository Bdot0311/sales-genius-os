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

  it("sends nothing autonomously below the score it writes toward", () => {
    // The product is sold on replies, not volume: an email that scores 84 and
    // gets ignored spends the one first impression that address will ever give
    // us. So the bar the loop rewrites toward and the bar a send has to clear
    // are the same bar. Read as a pair rather than by predicate name, so a
    // rename stays free and a lowered bar does not.
    const loop = RUN.match(/while \(!(\w+)\(best\) && attempts < AGENT_MAX_ATTEMPTS\)/);
    const gate = RUN.match(/const qualityHold = scored \? !(\w+)\(best\)/);
    expect(loop?.[1], "the rewrite loop's predicate").toBeTruthy();
    expect(gate?.[1], "the send gate's predicate").toBe(loop?.[1]);
  });

  it("keeps the lower chat floor out of the autonomous path", () => {
    // Two different questions. AGENT_TARGET_SCORE is what may go out with
    // nobody looking; AGENT_SEND_SCORE is the floor below which a chat draft
    // has to wait on the person who is looking at it and can edit it.
    const QUALITY = readFileSync("supabase/functions/_shared/email-quality.ts", "utf8");
    expect(QUALITY).toContain("export const AGENT_TARGET_SCORE = 100;");
    expect(QUALITY).toContain("export const AGENT_SEND_SCORE = 80;");
    // Only real blockers force approval; soft warnings never do.
    expect(QUALITY).toContain('a.blocking.filter((f) => f.severity === "blocker")');
    expect(CHAT).toContain("isSendable(attempt)");
    // Read past the comments: the one explaining why agent-run no longer sends
    // at the lower bar has to be free to name it.
    expect(code(RUN)).not.toContain("isSendable");
    expect(code(RUN)).not.toContain("AGENT_SEND_SCORE");
  });

  it("throws a failed draft away rather than filing it", () => {
    // Saving it put copy the agent had already judged unsendable into the same
    // Drafts tab as work waiting on approval, so the tab stopped meaning
    // "ready to go" and became a queue of things to triage.
    expect(RUN).not.toContain("if (approvalMode || qualityHold)");
    expect(RUN).toContain("if (qualityHold) {");
    // Unresearched copy is held with the approval drafts. It is not folded
    // into the quality hold, which throws the draft away.
    expect(RUN).toContain("if (approvalMode || heldForResearch) {");
    expect(RUN.indexOf("if (qualityHold) {")).toBeLessThan(RUN.indexOf("if (approvalMode || heldForResearch) {"));
  });

  it("writes no draft row on the quality path", () => {
    // The upsert has to sit inside the approval branch, where the copy passed.
    const approvalAt = RUN.indexOf("if (approvalMode || heldForResearch) {");
    const qualityBranch = code(RUN.slice(RUN.indexOf("if (qualityHold) {"), approvalAt));
    expect(qualityBranch).not.toContain("email_drafts");
    expect(RUN.indexOf('from("email_drafts").upsert')).toBeGreaterThan(approvalAt);
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
    // Pinned as the guarantee, not as one spelling of it. This was an `if`
    // statement until reassigning a PostgREST filter builder drove TypeScript
    // past its instantiation depth limit and it became a conditional
    // expression; both are correct, and an assertion on the keyword failed on
    // a change that kept the behaviour exactly. What must hold is that the
    // filter is only ever built with something in the list.
    const filter = '.not("id", "in", `(${coolingOff.join(",")})`)';
    const at = RUN.indexOf(filter);
    expect(at).toBeGreaterThan(-1);
    // One place builds it, so one guard is enough to cover it.
    expect(RUN.indexOf(filter, at + 1)).toBe(-1);
    const guardAt = RUN.lastIndexOf("coolingOff.length > 0", at);
    expect(guardAt).toBeGreaterThan(-1);
    // And the guard governs this filter rather than sitting somewhere above it.
    expect(at - guardAt).toBeLessThan(600);
  });

  it("leaves the lead itself untouched, so enriching it brings it back", () => {
    // No status change and no archive, so the lead stays uncontacted and the
    // agent writes a fresh email once the cooldown passes.
    const qualityBranch = code(
      RUN.slice(RUN.indexOf("if (qualityHold) {"), RUN.indexOf("if (approvalMode || heldForResearch) {")),
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

/**
 * "It's always a bad score on both rubrics."
 *
 * A follow-up reached the composer carrying three phrases off the house banned
 * list — "without adding headcount", "worth exploring", "worth comparing" —
 * with the turn's own event admitting "rewrite attempted and did not clear
 * them", and it was saved anyway.
 *
 * Two separate reasons, and neither was the model.
 *
 * generate-email scored every draft with scoreEmail, logged the number, hung
 * it on the response as `quality_weak`, and stopped. The comment said the
 * caller decides what to do about a weak score; no caller ever did. The first
 * person to learn a draft was weak was the user opening it in the Studio,
 * where a second checker says so again. rubricFeedback was written for exactly
 * this and only generate-followup-suggestion used it.
 *
 * And the banned-phrase and recency rewrites called the Lovable gateway
 * directly rather than going through aiFetch. routeFor sends every model call
 * to Bedrock when Bedrock is configured, returning key "bedrock" and no url —
 * so on this account those two requests carried an empty LOVABLE_API_KEY,
 * came back not-ok, and silently kept the original. The rewrite the event
 * reported as attempted had not run.
 */
const GENERATE = readFileSync("supabase/functions/generate-email/index.ts", "utf8");
const stripComments = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

describe("every model call in the drafter goes through the router", () => {
  it("has no hand-rolled gateway request left", () => {
    // aiFetch is what picks Bedrock over the gateway, maps the model id, and
    // meters the spend. A raw fetch does none of the three.
    expect(stripComments(GENERATE)).not.toContain("fetch(\"https://ai.gateway.lovable.dev");
  });

  it("routes the two that used to bypass it", () => {
    const gen = stripComments(GENERATE);
    expect(gen).toContain('const recencyRetry = await aiFetch("generate-email"');
    expect(gen).toContain('const bannedRetry = await aiFetch("generate-email"');
  });
});

describe("a weak draft is rewritten, not just labelled weak", () => {
  const gen = stripComments(GENERATE);

  it("acts on the score it already paid to compute", () => {
    expect(gen).toContain("if (rubric && (isWeak(rubric) || bannedHits.length > 0)) {");
    expect(gen).toContain("rubricFeedback(rubric)");
  });

  it("tells the model what the scorer objected to, and what it must not reuse", () => {
    // Both notes, not one: a draft can be weak and full of filler at once, and
    // two sequential rewrites would be two chances to undo each other.
    expect(gen).toMatch(/isWeak\(rubric\) \? rubricFeedback\(rubric\) : '',\s*\n\s*bannedHits\.length \? bannedPhraseRetry\(bannedHits\) : '',/);
  });

  it("keeps the rewrite only when the number actually went up", () => {
    expect(gen).toContain("secondRubric.overall > rubric.overall");
  });

  it("and only when it is no worse on every guard above it", () => {
    expect(gen).toContain("!hasPlaceholder(second)");
    expect(gen).toContain("!hasScaffolding(second)");
    expect(gen).toContain("!findUnverifiedClaims(second, proofForClaims).length");
    expect(gen).toContain("findTouchOnePitch(second).length === 0");
    expect(gen).toContain("secondHits.length <= bannedHits.length");
  });

  it("does not pay to rescore a rewrite it has already disqualified", () => {
    expect(gen).toContain("const secondRubric = cleanEnough ? await scoreNow(second) : null;");
  });

  it("reports the score of the draft it kept, not of the one it discarded", () => {
    // `rubric` rides out on the response and drives quality_weak, so a stale
    // one would tell the user the email they have is the email that failed.
    expect(gen).toContain("rubric = secondRubric;");
    expect(gen).toContain("bannedHits = secondHits;");
    expect(gen).toContain("quality_weak: isWeak(rubric)");
  });
});

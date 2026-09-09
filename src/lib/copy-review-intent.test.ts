import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { wantsCopyAudit, looksLikePastedEmail } from "../../supabase/functions/_shared/copy-review-intent.ts";

/**
 * The agent had audit_email in scope and this in its prompt:
 *
 *   "call audit_email FIRST and answer from what it returns. Do not give
 *    copywriting opinions in place of it."
 *
 * Asked twice to audit the same email it returned six bullets, then seven. A
 * deterministic checker cannot do that. The extra bullet cited a "75-word
 * ceiling (90 absolute max)" — numbers that appear in the skill files and
 * nowhere in the rules, whose thresholds are 50, 100 and 140. It was reading
 * the playbook out of its own prompt and calling the result an audit.
 */
const THE_MESSAGE = `audit this email: Hi Aryan,
Noticed you're building toward multi-platform ad deployment on Kogenie. Teams at that stage usually hit the same wall.
Most founders we work with solve it by automating the repetitive parts.
Worth a quick look?
Brandon`;

describe("the request that kept being answered from memory", () => {
  it("is recognised as a copy review", () => {
    expect(wantsCopyAudit(THE_MESSAGE)).toBe(true);
  });
});

describe("fires on a real paste", () => {
  it.each([
    ["inline after a colon", "review this: Hi Sam,\n\nWe shipped X.\n\nWorth a chat?\n\nBrandon"],
    ["with a subject line", "what's wrong with this email?\nSubject: quick one\nHi Dana,\nbody\nThanks"],
    ["casual ask", "is this any good? Hey Priya,\n\nsome copy\n\nCheers"],
  ])("%s", (_l, msg) => expect(wantsCopyAudit(msg)).toBe(true));
});

describe("stays quiet otherwise", () => {
  // Forcing a tool call on a general question would be worse than the problem,
  // so it needs BOTH an explicit ask to review AND something email-shaped.
  it.each([
    ["a general craft question", "how do I write better subject lines?"],
    ["a review of something else", "review my deliverability settings"],
    ["sequences, not one email", "audit my sequence spacing please"],
    ["a support question", "what's wrong with my mailbox connection?"],
    ["an instruction to draft", "draft emails for the 6 leads I just saved"],
    ["a lead-list request", "check this lead list for duplicates"],
    ["nothing at all", ""],
    ["an email with no ask to review", "Hi Aryan,\n\nsome copy\n\nThanks"],
  ])("%s", (_l, msg) => expect(wantsCopyAudit(msg)).toBe(false));

  it("requires a capitalised name, so 'say hi sam' is not a greeting", () => {
    expect(wantsCopyAudit("review this: say hi sam, ok?")).toBe(false);
  });
});

describe("looksLikePastedEmail", () => {
  it("accepts a bare body with no greeting when it is substantial", () => {
    expect(looksLikePastedEmail(`${"word ".repeat(45)}\n\nmore\n\nlines`)).toBe(true);
  });
  it("rejects a short conversational sentence", () => {
    expect(looksLikePastedEmail("can you take a look at this")).toBe(false);
  });
});

describe("the model is required to call it, not asked", () => {
  const AGENT = readFileSync("supabase/functions/agent-chat/index.ts", "utf8");

  it("pins audit_email with tool_choice", () => {
    expect(AGENT).toContain('tool_choice: { type: "function", function: { name: "audit_email" } }');
  });

  it("only on the first step, so the turn can still redraft or send afterwards", () => {
    expect(AGENT).toContain("step === 0 && forceAudit");
  });

  it("never forces a tool the build does not have", () => {
    expect(AGENT).toContain('allowedTools.includes("audit_email") && wantsCopyAudit(userMessage)');
  });
});

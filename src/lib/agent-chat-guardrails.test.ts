import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const AGENT_CHAT = readFileSync(
  new URL("../../supabase/functions/agent-chat/index.ts", import.meta.url),
  "utf8",
);

/**
 * agent-chat has two ways to put an email in front of a prospect. draft_outreach
 * calls generate-email, which scores what it writes. send_outreach lets the model
 * compose a subject and body inline in the chat turn and hand them straight to
 * send-email — that copy passed nothing until the gate below existed.
 */
describe("agent-chat quality gate", () => {
  it("imports the shared scorer and placeholder check", () => {
    expect(AGENT_CHAT).toContain("_shared/email-quality.ts");
    expect(AGENT_CHAT).toContain("_shared/email-rules.ts");
  });

  it("scores model-authored copy before sending it", () => {
    expect(AGENT_CHAT).toContain("scoreEmail");
    expect(AGENT_CHAT).toContain("isWeak");
    expect(AGENT_CHAT).toContain("needs_rewrite");
  });

  it("only pays for a rubric call on copy the model wrote", () => {
    // Re-scoring a bulk send of stored drafts would add one LLM round-trip per
    // recipient for a verdict already bought at generation time.
    expect(AGENT_CHAT).toContain("modelAuthored");
    expect(AGENT_CHAT).toMatch(/modelAuthored\s*\n?\s*\?\s*await scoreEmail/);
    expect(AGENT_CHAT).toContain("modelAuthored: false");
    expect(AGENT_CHAT).toContain("modelAuthored: true");
  });

  it("blocks unfilled placeholders in both approval and autonomous mode", () => {
    // The check sits above the autonomous branch, so neither path can skip it.
    const gateAt = AGENT_CHAT.indexOf("hasPlaceholder(subject)");
    const branchAt = AGENT_CHAT.indexOf("if (!autonomous || forceApproval)");
    expect(gateAt).toBeGreaterThan(-1);
    expect(branchAt).toBeGreaterThan(gateAt);
  });

  it("bounds the rewrite loop instead of retrying forever", () => {
    // A model that cannot lift the score would otherwise be told to try again
    // every turn, never sending and never stopping.
    expect(AGENT_CHAT).toContain("rewriteAsked");
    expect(AGENT_CHAT).toContain("forceApproval = true");
  });

  it("holds a twice-failed draft for a human rather than sending it", () => {
    expect(AGENT_CHAT).toMatch(/if \(!autonomous \|\| forceApproval\)/);
  });

  it("tells the operator why a held draft is waiting", () => {
    // "Waiting for your approval" on a draft held for quality would hide the
    // reason it stopped.
    expect(AGENT_CHAT).toContain("Held for review");
  });

  it("tells the model what to do with a rewrite request", () => {
    expect(AGENT_CHAT).toContain("QUALITY: send_outreach");
    expect(AGENT_CHAT).toContain("do not work around the check");
  });
});

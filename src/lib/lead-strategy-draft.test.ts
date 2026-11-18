import { describe, expect, it } from "vitest";
import { canDraftFromStrategy, strategyDraftRequest } from "./lead-strategy-draft";
import { decisionFromRow } from "./lead-intelligence";
import { decisionFromRow as serverDecision, decisionPromptBlock } from "../../supabase/functions/_shared/lead-intelligence";

describe("implement a lead email strategy", () => {
  it("requests a saved first email draft using the evaluated strategy, not a send", () => {
    const request = strategyDraftRequest({ id: "lead-123" }, "We build customer support software.");
    expect(request.lead.id).toBe("lead-123");
    expect(request.useLeadStrategy).toBe(true);
    expect(request.saveDraft).toBe(true);
    expect(request.goal).toBe("introduction");
    expect(request.businessDescription).toBe("We build customer support software.");
    expect(request).not.toHaveProperty("send");
  });

  it("requires a usable email-writing recommendation rather than only a sequence recommendation", () => {
    const decision = decisionFromRow({ lead_id: "lead-123", status: "ok", sequence_length: "standard", sequence_length_confidence: 0.9 });
    expect(canDraftFromStrategy(decision)).toBe(false);
    expect(canDraftFromStrategy(decisionFromRow({ ...decision, subject_strategy: "curiosity", subject_strategy_confidence: 0.55 }))).toBe(true);
    expect(canDraftFromStrategy(decisionFromRow({ ...decision, subject_strategy: "curiosity", subject_strategy_confidence: 0.54 }))).toBe(false);
    expect(canDraftFromStrategy(undefined)).toBe(false);
  });

  it("implements the evaluated subject and closing ask without replacing evidence rules", () => {
    const block = decisionPromptBlock(serverDecision({ lead_id: "lead-123", status: "ok", subject_strategy: "direct_ask", subject_strategy_confidence: 0.9, cta_strategy: "soft_question", cta_strategy_confidence: 0.9 }));
    expect(block).toContain("say plainly why you are writing");
    expect(block).toContain("Do not ask for a meeting");
    expect(block).not.toContain("Asking directly for a short call");
  });
});
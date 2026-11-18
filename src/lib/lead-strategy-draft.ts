import type { DecisionKey, LeadDecision } from "./lead-intelligence";

const DRAFT_STRATEGY_KEYS: DecisionKey[] = ["personalization_depth", "subject_strategy", "cta_strategy"];

export function canDraftFromStrategy(decision?: LeadDecision): boolean {
  return decision?.status === "ok" &&
    DRAFT_STRATEGY_KEYS.some((key) => {
      const field = decision.fields[key];
      return Boolean(field && field.confidence >= 0.55);
    });
}

/** The recommendation is read server-side, never supplied as prospect facts. */
export function strategyDraftRequest(lead: { id: string }, businessDescription: string) {
  return {
    lead,
    businessDescription,
    tone: "professional",
    goal: "introduction",
    useLeadStrategy: true,
    saveDraft: true,
  };
}
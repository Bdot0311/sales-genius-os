/**
 * The same release decision for Studio, the agent, and a scheduled send.
 *
 * Research must have produced an approved sentence. The checker must be clear.
 * A missing rubric holds. A starter plan that is not entitled to the rubric
 * is plan_gated and is still held when a rule fires. The autonomous bar stays
 * 5/5 when a score exists. None of those thresholds are changed here.
 */

import { outboundGateFindings } from "./quality-gate.ts";
import { autonomousSendAllowed, type RubricAvailability, type RubricResult } from "./email-quality.ts";
import { bodyViolations, type ApprovedFact } from "./evidence-contract.ts";

export function releaseAllows(input: {
  subject: string;
  body: string;
  facts: ApprovedFact[];
  availability: RubricAvailability;
  rubric: RubricResult | null;
  mode: "studio" | "autonomous";
  senderName?: string;
}): { allow: boolean; code: string; reason: string } {
  const decision = {
    status: input.facts.length ? "ready" as const : "absent" as const,
    reason: "",
    evidenceId: "",
    facts: input.facts,
    conflicts: [] as string[],
  };
  const claims = bodyViolations(input.body, decision, input.senderName ?? "", input.subject);
  if (claims.length) {
    return { allow: false, code: input.facts.length ? "unsupported_prospect_claim" : "research_required", reason: claims[0] };
  }
  const findings = outboundGateFindings(input.subject, input.body, input.facts.map((fact) => fact.span).join("\n"), input.mode === "autonomous" ? 1 : 0);
  if (findings.length) {
    return { allow: false, code: "quality_checker", reason: findings.slice(0, 4).map((finding) => finding.rule).join(", ") };
  }
  if (input.availability === "unavailable") {
    return { allow: false, code: "rubric_unavailable", reason: "The reply rubric did not return a score, so this draft was not released." };
  }
  if (input.mode === "autonomous" && !autonomousSendAllowed(
    { subject: input.subject, body: input.body, rubric: input.rubric, availability: input.availability, blocking: [] },
    input.availability,
  )) {
    return { allow: false, code: "rubric_below_bar", reason: "The reply rubric is not 5/5 on every dimension, so it was not sent." };
  }
  return { allow: true, code: "released", reason: "" };
}

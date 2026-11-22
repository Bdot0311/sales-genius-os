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
import { bodyViolations, type ApprovedFact, type DraftShape } from "./evidence-contract.ts";
import { FALLBACK_ASK, fallbackSubjectFrom, usableFallbackFact, voiceSafeObservation } from "./first-touch-fallback.ts";

/** The lead row's company. A name on the request is not an actor the draft may shift. */
export function ownedLeadCompany(row: { company_name?: string | null } | null | undefined): string {
  return String(row?.company_name ?? "").replace(/\s+/g, " ").trim();
}

export function ownedDraftViolations(input: {
  lead: { company_name?: string | null } | null;
  body: string;
  subject: string;
  facts: ApprovedFact[];
  senderName?: string;
  shape?: DraftShape;
  senderCorpus?: string;
}): { company: string; violations: string[] } {
  const company = ownedLeadCompany(input.lead);
  const decision = {
    status: input.facts.length ? "ready" as const : "absent" as const,
    reason: "",
    evidenceId: "",
    facts: input.facts,
    conflicts: [] as string[],
  };
  return {
    company,
    violations: bodyViolations(input.body, decision, input.senderName ?? "", input.subject, company, input.shape ?? "first_touch", input.senderCorpus ?? ""),
  };
}

export function releaseAllows(input: {
  subject: string;
  body: string;
  facts: ApprovedFact[];
  availability: RubricAvailability;
  rubric: RubricResult | null;
  mode: "studio" | "autonomous";
  senderName?: string;
  company?: string;
  /** The sender's own description and proof. Offer lines may use only this. */
  senderCorpus?: string;
}): { allow: boolean; code: string; reason: string } {
  const decision = {
    status: input.facts.length ? "ready" as const : "absent" as const,
    reason: "",
    evidenceId: "",
    facts: input.facts,
    conflicts: [] as string[],
  };
  const claims = bodyViolations(input.body, decision, input.senderName ?? "", input.subject, input.company ?? "", "first_touch", input.senderCorpus ?? "");
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

/**
 * The draft we can still send when the model cannot: one approved sentence,
 * attributed when it is the prospect speaking as "I", and one question that
 * states nothing. No new fact is introduced. Returns null when even that
 * shape fails the same release check.
 *
 * The score is for this email. The draft it replaced had its own score, and
 * reusing that would let an autonomous send through on a different body.
 */
export async function safeObservationRelease(input: {
  firstName: string;
  senderName: string;
  company: string;
  facts: ApprovedFact[];
  availability: RubricAvailability;
  mode?: "studio" | "autonomous";
  senderCorpus?: string;
  score: (email: string) => Promise<{ rubric: RubricResult | null; availability: RubricAvailability }>;
}): Promise<{ subject: string; body: string; rubric: RubricResult | null; availability: RubricAvailability } | null> {
  const sender = input.senderName.trim();
  if (!sender || !input.facts.length) return null;
  const first = input.firstName.trim() || "there";
  const mode = input.mode ?? "studio";
  for (const fact of input.facts) {
    if (fact.role === "sender_proof" || !usableFallbackFact(fact.span)) continue;
    const line = voiceSafeObservation(fact, input.company);
    const body = `Hi ${first},\n\n${line}\n\n${FALLBACK_ASK}\n\n${sender}`;
    const subject = fallbackSubjectFrom(fact.span);
    const email = `Subject: ${subject}\n\n${body}`;
    const scored = await input.score(email);
    if (mode !== "studio" && scored.availability !== "scored") return null;
    const decision = releaseAllows({
      subject,
      body,
      facts: input.facts,
      availability: scored.availability,
      rubric: scored.rubric,
      mode,
      senderName: sender,
      company: input.company,
      senderCorpus: input.senderCorpus ?? "",
    });
    if (decision.allow) return { subject, body, rubric: scored.rubric, availability: scored.availability };
  }
  return null;
}

/**
 * A saved sequence template is checked again at the moment it would be queued
 * or handed to Gmail. The draft-time check does not run for a template written
 * earlier, and a template can outlive the research it was written from.
 */

import { auditEmail } from "./email-audit.ts";
import { firstTouchBlockers, unsupportedProspectAssertions } from "./factual-send.ts";
import { claimSupportedByCorpus } from "./research-citation.ts";

export function proofFromLead(lead: {
  research_brief?: unknown;
  job_title?: string | null;
  industry?: string | null;
  company_name?: string | null;
  contact_name?: string | null;
} | null | undefined): string {
  if (!lead) return "";
  const parts: string[] = [];
  const brief = lead.research_brief as {
    what_they_do?: string;
    who_they_sell_to?: string;
    observations?: { fact?: string }[];
    hooks?: string[];
  } | null;
  if (brief && typeof brief === "object") {
    if (brief.what_they_do) parts.push(brief.what_they_do);
    if (brief.who_they_sell_to) parts.push(brief.who_they_sell_to);
    for (const observation of brief.observations ?? []) {
      if (observation?.fact) parts.push(observation.fact);
    }
    for (const hook of brief.hooks ?? []) parts.push(hook);
  }
  for (const field of [lead.job_title, lead.industry, lead.company_name, lead.contact_name]) {
    if (field) parts.push(field);
  }
  return parts.filter(Boolean).join("\n");
}

export function queuedCopyBlockers(subject: string, body: string, proof: string): string[] {
  const text = `${subject ?? ""}\n${body ?? ""}`;
  if (!text.trim()) return ["empty: nothing to send"];
  const audited = auditEmail({
    subject,
    body,
    verifiedProof: proof,
  }).filter((finding) => finding.severity === "blocker");
  const grounded = firstTouchBlockers({
    researchBlock: proof,
    subject,
    body,
    allowedProof: proof,
  });
  const assertions = unsupportedProspectAssertions(text);
  const unsupported = assertions.length > 0 && !claimSupportedByCorpus(text, proof)
    ? assertions
    : [];
  return [
    ...audited.map((finding) => `${finding.rule}: ${finding.evidence}`),
    ...grounded.map((finding) => `${finding.rule}: ${finding.evidence}`),
    ...unsupported.map((hit) => `ungrounded_prospect_claim: ${hit}`),
  ];
}

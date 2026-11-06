/**
 * Checks that run after a model writes, before anything is sent.
 *
 * Prompts already say not to invent a company fact, a price, or a metric.
 * Those instructions are how the drafts that invented them were produced:
 * the model was told, and nothing afterwards looked. The functions here are
 * the look. They do not make invention impossible — a sentence can be false
 * without matching a pattern — and a caller that skips them is back to a
 * prompt.
 */

import { unsupportedClaims } from "./evidence.ts";
import { findUnverifiedClaims } from "./email-rules.ts";

export interface SendFinding {
  rule: string;
  severity: "blocker";
  evidence: string;
  why: string;
  fix: string;
}

/**
 * A claim that the email saw something specific about this company.
 *
 * Only consulted when the research block is empty. With research, the brief
 * is allowed to support a specific observation and a different check owns
 * the figures. With nothing, "you just raised" has nowhere to have come from.
 */
const PROSPECT_ASSERTION_SOURCE =
  "\\b(?:i (?:noticed|saw|read|came across)|congrats(?:ulations)? on|you(?:'ve| have)?(?: just)? (?:launched|raised|hired|shipped|announced|expanded)|your (?:recent|latest|new|upcoming) (?:launch|round|hire|product|funding|office|announcement))\\b";

export function unsupportedProspectAssertions(text: string): string[] {
  const hits: string[] = [];
  // A fresh expression every call. A shared /g pattern keeps lastIndex, and
  // the second email in a batch would then be checked from the middle.
  for (const match of String(text ?? "").matchAll(new RegExp(PROSPECT_ASSERTION_SOURCE, "gi"))) {
    const hit = match[0].trim();
    if (hit && !hits.some((existing) => existing.toLowerCase() === hit.toLowerCase())) hits.push(hit);
  }
  return hits;
}

const COMMITMENTS: { id: string; pattern: RegExp }[] = [
  {
    id: "discount",
    pattern: /\b(?:\d+\s*%\s*off|discount|free month|waived fee|custom package|custom pricing|extended trial)\b/gi,
  },
  {
    id: "roadmap",
    pattern: /\b(?:on the roadmap|we(?:'ll| will) build|can be built for (?:you|them)|coming soon)\b/gi,
  },
  {
    id: "guarantee",
    pattern: /\b(?:guarantee[ds]?|\bsla\b|\buptime\b)\b/gi,
  },
  {
    id: "compliance",
    pattern: /\b(?:soc\s*2|iso\s*27001|hipaa|gdpr[- ]compliant|data residency)\b/gi,
  },
];

export interface CommitmentHit {
  id: string;
  evidence: string;
}

/**
 * A price, roadmap, guarantee, or compliance claim the account did not supply.
 *
 * A phrase that already appears in the allowed proof is the account's own
 * wording and is left alone. Matching is on the phrase that fired, not on a
 * nearby "do not say" instruction — callers must pass proof the account
 * actually stands behind, not the prohibition text.
 */
export function unauthorizedCommitments(text: string, allowedProof = ""): CommitmentHit[] {
  const proof = String(allowedProof ?? "").toLowerCase();
  const hits: CommitmentHit[] = [];
  for (const rule of COMMITMENTS) {
    for (const match of String(text ?? "").matchAll(new RegExp(rule.pattern.source, rule.pattern.flags))) {
      const evidence = match[0].trim();
      if (!evidence) continue;
      if (proof.includes(evidence.toLowerCase())) continue;
      if (hits.some((hit) => hit.evidence.toLowerCase() === evidence.toLowerCase())) continue;
      hits.push({ id: rule.id, evidence });
    }
  }
  return hits;
}

/**
 * Why an autonomous reply must not be sent. Empty when it may.
 *
 * `prospectCorpus` is what the prospect wrote and what research supplied.
 * The account's offer is `allowedProof`. A number in the offer does not make
 * a claim about the prospect true.
 */
export function replySendBlockers(body: string, allowedProof = "", prospectCorpus = ""): string[] {
  return [
    ...findUnverifiedClaims(body, allowedProof).map((claim) => `unverified: ${claim}`),
    ...unauthorizedCommitments(body, allowedProof).map((hit) => `${hit.id}: ${hit.evidence}`),
    ...unsupportedClaims(body, prospectCorpus).map((hit) => `ungrounded: ${hit.evidence}`),
  ];
}

/**
 * Blockers for one outbound touch, beyond the generic audit.
 *
 * Figures are intentionally not repeated here. The caller passes the same
 * proof into `auditEmail`, which already blocks a number the proof does not
 * contain. This adds the two failures that audit does not see: a specific
 * company observation when no research was available, and an offer the
 * account never authorised.
 */
export function firstTouchBlockers(input: {
  researchBlock: string;
  subject: string;
  body: string;
  allowedProof: string;
}): SendFinding[] {
  const text = `${input.subject ?? ""}\n${input.body ?? ""}`;
  const proof = `${input.allowedProof ?? ""}\n${input.researchBlock ?? ""}`;
  const findings: SendFinding[] = [];

  // Research being non-empty used to skip this. A page about the product
  // then cleared "you just raised", because the other nouns overlapped.
  // The corpus is the research and the lead record, not the sender's offer.
  for (const hit of unsupportedClaims(text, input.researchBlock ?? "")) {
    findings.push({
      rule: hit.rule,
      severity: "blocker",
      evidence: hit.evidence,
      why: hit.why,
      fix: "Remove the claim. If research did not say it, write from the role and industry, or ask.",
    });
  }

  for (const hit of unauthorizedCommitments(text, proof)) {
    findings.push({
      rule: "unauthorized_commitment",
      severity: "blocker",
      evidence: hit.evidence,
      why: "This commits the account to a price, roadmap, guarantee, or compliance claim nobody authorised.",
      fix: "Remove it. If they asked, say it will be passed to the account owner.",
    });
  }

  return findings;
}

/** Remove figures the proof does not contain, and say that they were removed. */
export function adviceWithoutInventedFigures(advice: string, proof: string): { text: string; removed: string[] } {
  const removed = findUnverifiedClaims(advice, proof);
  let text = String(advice ?? "");
  for (const claim of removed) {
    text = text.split(claim).join("");
  }
  text = text.replace(/[ \t]{2,}/g, " ").replace(/ +([.,;:])/g, "$1").replace(/\(\s*\)/g, "").trim();
  if (!text) {
    return {
      text: "I don't have enough of your account data to answer that without guessing.",
      removed,
    };
  }
  if (removed.length > 0) {
    text += "\n\nI removed a figure that is not in your account data. I will not estimate it.";
  }
  return { text, removed };
}

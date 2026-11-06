/**
 * The same failures the Outreach quality card paints red.
 *
 * The card maps a blocker or a warning to a red row and a note to yellow.
 * This is that set, from the same audit and deliverability modules, so a
 * rewrite and a send are looking at one list.
 */

import { auditEmail, type Finding } from "./email-audit.ts";
import { deliverabilityReport } from "./email-deliverability.ts";
import { unsupportedClaims } from "./evidence.ts";

export function failingCheckerFindings(
  subject: string,
  body: string,
  position = 1,
): Finding[] {
  const writing = auditEmail({ subject, body, position });
  const { findings } = deliverabilityReport({
    subject,
    body,
    isFirstTouch: position === 1,
  });
  return [...writing, ...findings].filter(
    (finding) => finding.severity === "blocker" || finding.severity === "warning",
  );
}

/**
 * Red-row checker findings plus unsupported prospect claims.
 *
 * The card's warnings are included because the card paints them red. A
 * caller-supplied "passed" flag is not an input. `corpus` is evidence the
 * server loaded, not a score.
 */
export function outboundGateFindings(
  subject: string,
  body: string,
  corpus: string,
  position = 1,
): Finding[] {
  const checker = failingCheckerFindings(subject, body, position);
  const claims: Finding[] = unsupportedClaims(`${subject}\n${body}`, corpus).map((hit) => ({
    rule: hit.rule,
    severity: "blocker",
    evidence: hit.evidence,
    why: hit.why,
    fix: "Remove the claim, or ask a question that does not state it. A hypothesis has to be labeled as one.",
  }));
  return [...checker, ...claims];
}

export interface RevisionResult {
  subject: string;
  body: string;
  findings: Finding[];
  /** clear: nothing failing. needs_review: warnings remain. refused: a blocker remains. */
  status: "clear" | "needs_review" | "refused";
  attempts: number;
}

/**
 * Check, ask for one rewrite per remaining attempt, recheck the new text.
 *
 * The rewrite function is the model. Tests pass a fake one. A null rewrite
 * or a throw does not count as a pass. The body that is returned is the last
 * text that was actually checked.
 */
export async function reviseUntilClear(input: {
  subject: string;
  body: string;
  corpus: string;
  position?: number;
  maxRewrites: number;
  rewrite: (body: string, note: string) => Promise<string | null>;
}): Promise<RevisionResult> {
  const position = input.position ?? 1;
  let body = input.body;
  let findings = outboundGateFindings(input.subject, body, input.corpus, position);
  let attempts = 1;
  const statusOf = (list: Finding[]): RevisionResult["status"] => {
    if (list.length === 0) return "clear";
    if (list.some((finding) => finding.severity === "blocker")) return "refused";
    return "needs_review";
  };

  while (findings.length > 0 && attempts <= input.maxRewrites) {
    let next: string | null = null;
    try {
      next = await input.rewrite(body, checkerRewriteNote(findings));
    } catch {
      next = null;
    }
    attempts += 1;
    if (!next || !next.trim()) break;
    const nextFindings = outboundGateFindings(input.subject, next, input.corpus, position);
    // A rewrite that adds a blocker or does not reduce the list is not kept.
    const nextBlockers = nextFindings.filter((f) => f.severity === "blocker").length;
    const prevBlockers = findings.filter((f) => f.severity === "blocker").length;
    if (nextFindings.length < findings.length && nextBlockers <= prevBlockers) {
      body = next;
      findings = nextFindings;
    } else {
      break;
    }
  }

  return { subject: input.subject, body, findings, status: statusOf(findings), attempts };
}

/** The instruction for one bounded rewrite. Quotes the checker's own words. */
export function checkerRewriteNote(findings: Finding[]): string {
  const lines = findings.slice(0, 8).map(
    (finding) => `- ${finding.rule}: ${finding.evidence || finding.why} Fix: ${finding.fix}`,
  );
  return [
    "REWRITE REQUIRED. The quality checker marked this draft failing.",
    "These are its findings. Fix them. Do not add a fact, a number, or an event that was not supplied.",
    ...lines,
  ].join("\n");
}

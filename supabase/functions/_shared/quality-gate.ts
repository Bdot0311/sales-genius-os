/**
 * The same failures the Outreach quality card paints red.
 *
 * The card maps a blocker or a warning to a red row and a note to yellow.
 * This is that set, from the same audit and deliverability modules, so a
 * rewrite and a send are looking at one list.
 */

import { auditEmail, type Finding } from "./email-audit.ts";
import { deliverabilityReport } from "./email-deliverability.ts";

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

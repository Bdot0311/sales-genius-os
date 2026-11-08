/**
 * One mechanical audit for the tool and for the Opus server prelude.
 *
 * The tool receives a subject and body the model already separated. The
 * prelude has to separate them itself, then call this same function. A
 * second copy of the rule calls is how the wrapper question was scored.
 */

import { auditDeliverability } from "./email-deliverability.ts";
import { auditEmail, auditSummary, type AuditInput, type Finding } from "./email-audit.ts";
import { extractPastedEmail } from "./pasted-email.ts";

export const AUDIT_RESULT_NOTE =
  "Report every finding to the user in your own words, quoting the evidence. " +
  "Do not soften a blocker into a suggestion, and do not claim the email is fine when findings exist.";

export const AUDIT_DECLINE_NOTE =
  "No audit was run. Ask the user to paste the subject and the email. " +
  "Do not invent findings, do not treat the surrounding question as the email, and do not describe this as a clean audit.";

export interface CopyAuditEvent {
  name: "audit_email";
  label: string;
  status: "ok" | "error" | "queued";
  detail: string;
}

export function auditEvent(findings: Finding[]): CopyAuditEvent {
  const blockers = findings.filter((finding) => finding.severity === "blocker").length;
  return {
    name: "audit_email",
    label: findings.length === 0 ? "Audited — clean" : `Audited — ${findings.length} finding(s)`,
    status: blockers > 0 ? "error" : findings.length ? "queued" : "ok",
    detail: findings.length ? findings.map((finding) => finding.rule).join(", ") : "no rule violations",
  };
}

export function runMechanicalAudit(input: AuditInput): {
  findings: Finding[];
  blockers: number;
  summary: string;
  note: string;
  event: CopyAuditEvent;
} {
  const subject = String(input.subject ?? "");
  const body = String(input.body ?? "");
  const findings = [
    ...auditEmail({
      subject,
      body,
      position: input.position,
      verifiedProof: input.verifiedProof ?? "",
      lead: input.lead,
    }),
    ...auditDeliverability({
      subject,
      body,
      isFirstTouch: input.position === undefined || input.position === 1,
    }),
  ];
  const blockers = findings.filter((finding) => finding.severity === "blocker").length;
  return {
    findings,
    blockers,
    summary: auditSummary(findings),
    note: AUDIT_RESULT_NOTE,
    event: auditEvent(findings),
  };
}

export function prepareServerCopyAudit(message: string): {
  event: CopyAuditEvent;
  arguments: string;
  payload: Record<string, unknown>;
} {
  const extracted = extractPastedEmail(message);
  if (extracted.status !== "ready") {
    const summary = `No audit was run. ${extracted.reason}`;
    return {
      arguments: "{}",
      event: {
        name: "audit_email",
        label: "Audit needs the email",
        status: "error",
        detail: extracted.reason,
      },
      payload: {
        status: "needs_content",
        findings: [],
        blockers: 0,
        summary,
        note: AUDIT_DECLINE_NOTE,
        reason: extracted.reason,
      },
    };
  }
  const result = runMechanicalAudit({
    subject: extracted.subject,
    body: extracted.body,
    verifiedProof: "",
  });
  return {
    arguments: JSON.stringify({ subject: extracted.subject, body: extracted.body }),
    event: result.event,
    payload: {
      status: "audited",
      findings: result.findings,
      blockers: result.blockers,
      summary: result.summary,
      note: result.note,
      audited: { subject: extracted.subject, body: extracted.body },
    },
  };
}

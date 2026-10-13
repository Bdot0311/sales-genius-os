// The mechanical half of Email Quality Checker v2 — now a view over the shared
// rules rather than its own implementation of them.
//
// It used to carry its own spam list (which had "100%" where the panel's did
// not), its own syllable counter and reading-grade formula (character for
// character identical to the panel's, then bucketed differently), its own
// token regex and its own word ceiling at 90/130 where the server's is
// 50/90/140. Three deterministic engines, three sets of thresholds, one user
// trying to work out which panel to believe.
//
// The checks, keys, labels and severities below are unchanged, so the panel
// that renders them did not have to move. What changed is where the answers
// come from: _shared/email-audit.ts for the writing rules and
// _shared/email-deliverability.ts for the deliverability ones, the same two
// modules the server and the live quality card run.
//
// The R.E.P.L.Y. rubric (Growth+) is still scored separately by the
// check-email-rubric edge function. A model's opinion and a rule are different
// kinds of answer and stay apart on purpose.

import { auditEmail } from "../../supabase/functions/_shared/email-audit";
import { deliverabilityReport } from "../../supabase/functions/_shared/email-deliverability";
import { findPlaceholders } from "../../supabase/functions/_shared/email-rules";
import type { Finding, Severity as RuleSeverity } from "../../supabase/functions/_shared/email-audit";

export type Severity = "ok" | "warn" | "bad";

export interface MechanicalCheck {
  key: string;
  label: string;
  severity: Severity;
  detail: string;
}

export interface MechanicalResult {
  wordCount: number;
  readingGrade: number;
  checks: MechanicalCheck[];
  unresolvedTokens: string[];
}

/** A rule's severity in this panel's vocabulary. Notes are warnings here. */
const SEVERITY: Record<RuleSeverity, Severity> = { blocker: "bad", warning: "bad", note: "warn" };

const severityOf = (findings: Finding[], rules: string[]): Severity => {
  const hits = findings.filter((f) => rules.includes(f.rule));
  if (!hits.length) return "ok";
  if (hits.some((f) => f.severity === "blocker")) return "bad";
  if (hits.some((f) => f.severity === "warning")) return SEVERITY.warning;
  return SEVERITY.note;
};

export function computeMechanicalChecks(subject: string, rawBody: string): MechanicalResult {
  // isFirstTouch is false here deliberately: this panel does not know the
  // position, and holding an unknown touch to the first-touch image rule would
  // report a warm follow-up as broken.
  const { findings: deliverability, metrics } = deliverabilityReport({ subject, body: rawBody, isFirstTouch: false });
  const writing = auditEmail({ subject, body: rawBody });
  const findings = [...writing, ...deliverability];
  const evidence = (rule: string) => findings.find((f) => f.rule === rule)?.evidence ?? "";

  const checks: MechanicalCheck[] = [];
  const add = (key: string, label: string, severity: Severity, detail: string) =>
    checks.push({ key, label, severity, detail });

  add("word_count", "word count",
    metrics.words === 0 ? "bad" : severityOf(findings, ["too_long", "over_length", "under_length"]),
    metrics.words === 0 ? "no body yet" : `${metrics.words} words`);

  add("reading_grade", "reading grade", severityOf(findings, ["reading_grade"]), `grade ${metrics.readingGrade}`);

  add("links", "links", severityOf(findings, ["link_count"]),
    `${metrics.links} link${metrics.links === 1 ? "" : "s"}`);

  add("images", "images", severityOf(findings, ["image_in_email"]),
    `${metrics.images} image${metrics.images === 1 ? "" : "s"}`);

  add("attachment", "attachment", severityOf(findings, ["attachment_mention"]),
    metrics.mentionsAttachment
      ? "mentions an attachment, which hurts cold deliverability"
      : "no attachment mentioned");

  add("spam", "spam triggers", severityOf(findings, ["spam_trigger"]),
    metrics.spamHits.length ? `contains ${metrics.spamHits.join(", ")}` : "none");

  add("all_caps", "all caps", severityOf(findings, ["all_caps"]),
    metrics.capsRuns ? `${metrics.capsRuns} all-caps run${metrics.capsRuns === 1 ? "" : "s"}` : "none");

  add("punctuation", "punctuation", severityOf(findings, ["heavy_punctuation"]),
    metrics.punctuation ? "heavy or repeated punctuation" : "clean");

  const unresolved = findPlaceholders(`${subject}\n${rawBody}`);
  add("tokens", "personalization tokens", unresolved.length ? "bad" : "ok",
    unresolved.length ? `${unresolved.length} unresolved: ${unresolved.join(", ")}` : "no unresolved tokens");

  add("subject_length", "subject length",
    metrics.subjectWords === 0 ? "warn" : severityOf(findings, ["long_subject"]),
    metrics.subjectWords === 0 ? "no subject yet" : `${metrics.subjectWords} words`);

  add("subject_style", "subject style", severityOf(findings, ["headline_subject"]),
    evidence("headline_subject")
      ? "reads like a headline, aim for an internal-note tone"
      : "reads like a personal subject");

  return { wordCount: metrics.words, readingGrade: metrics.readingGrade, checks, unresolvedTokens: unresolved };
}

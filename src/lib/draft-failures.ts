/**
 * Why a queued draft did not become a draft.
 *
 * The worker records a real reason on every failed item — generate-email hands
 * back a sentence saying what it refused and why, and process-agent-jobs
 * stores it on the row. Nothing read it. The shell said "3 failed" and the
 * agent said "3 failed", so a deliberate refusal was indistinguishable from a
 * crash, and the only visible outcome was a lead that quietly had no draft.
 *
 * Most of these are not faults. generate-email refuses to save a draft that
 * dates something the research cannot date, that invents a figure it cannot
 * back, or that leaves a placeholder unfilled. That is the product working:
 * the alternative is mail going out under the user's name making things up.
 * But a refusal the user cannot see is one they cannot act on, and the action
 * differs — a thin research brief is fixed by enriching the lead, a rate limit
 * is fixed by waiting.
 */

export interface FailureClass {
  /** Short enough for one line in the shell. */
  label: string;
  /** True when running it again, unchanged, could succeed. */
  retryable: boolean;
}

/**
 * The reasons worth naming, longest-specific first.
 *
 * Matched on the part of the message that does not move. The sentences carry
 * the offending values in parentheses and advice after a comma, both of which
 * vary per lead and neither of which belongs in a count.
 */
const CLASSES: Array<[RegExp, FailureClass]> = [
  [/inventing figures/i, { label: "invented a figure it can't back", retryable: false }],
  [/cannot date/i, { label: "dated something the research can't support", retryable: false }],
  [/unfilled placeholder/i, { label: "left a placeholder unfilled", retryable: true }],
  [/rate limit/i, { label: "AI rate limited", retryable: true }],
  [/credit/i, { label: "AI credits exhausted", retryable: false }],
  [/no sender name/i, { label: "no sender name set", retryable: false }],
  [/lead not found/i, { label: "lead not found", retryable: false }],
  [/unauthorized/i, { label: "not authorised", retryable: false }],
  [/its job is gone/i, { label: "its job was removed", retryable: false }],
];

export const classifyFailure = (error: string | null | undefined): FailureClass => {
  const text = String(error ?? "").trim();
  if (!text) return { label: "no reason recorded", retryable: true };
  for (const [pattern, cls] of CLASSES) {
    if (pattern.test(text)) return cls;
  }
  // An unrecognised reason is shown rather than bucketed as "other": the whole
  // failure of the old line was that it told you a number and nothing else.
  const firstSentence = text.split(/(?<=[.!?])\s/)[0] ?? text;
  return { label: firstSentence.slice(0, 80), retryable: true };
};

export interface FailureSummary {
  label: string;
  count: number;
  retryable: boolean;
}

/** Group raw errors into counted reasons, commonest first. */
export const summariseFailures = (errors: Array<string | null | undefined>): FailureSummary[] => {
  const byLabel = new Map<string, FailureSummary>();
  for (const raw of errors) {
    const cls = classifyFailure(raw);
    const existing = byLabel.get(cls.label);
    if (existing) existing.count += 1;
    else byLabel.set(cls.label, { label: cls.label, count: 1, retryable: cls.retryable });
  }
  return [...byLabel.values()].sort((a, b) => b.count - a.count);
};

/** One line for the shell: "2 invented a figure it can't back, 1 AI rate limited". */
export const describeFailures = (summaries: FailureSummary[]): string =>
  summaries.map((s) => `${s.count} ${s.label}`).join(", ");

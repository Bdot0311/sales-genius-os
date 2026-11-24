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
  // The sentence carries the leaked fragment in parentheses, so two drafts
  // that made the same mistake read as two different reasons without this:
  // the shell showed "1 ... (**Word count: 118**) ... twi, 1 ... (**Word
  // count: 107**) ... twi" where it meant "2 printed its outline".
  [/printed its own outline/i, { label: "printed its outline instead of an email", retryable: true }],
  [/inventing figures/i, { label: "invented a figure it can't back", retryable: false }],
  [/cannot date/i, { label: "dated something the research can't support", retryable: false }],
  // Not a research failure: a second pass arrived while the first was still
  // working the same lead. It settles itself on the next attempt.
  [/already running in another pass/i, { label: "waiting on research already in progress", retryable: true }],
  // Retrying inside the ten-minute window returns this same answer, so it is
  // not retryable -- and it had no label at all, so it reached the shell as a
  // raw sentence among counted reasons.
  [/already ran recently and did not produce/i, { label: "research already ran and found nothing new", retryable: false }],
  [/research does not (?:support|say)/i, { label: "said something the research doesn't support", retryable: true }],
  [/copied line from their site/i, { label: "research gave only a copied line, no grounded reason", retryable: false }],
  /*
   * One sentence carried five different outcomes.
   *
   * holdReason reports why research came back empty, and every one of them --
   * a provider rate limit, a site that timed out, a lead with no website at
   * all, a provider that is not configured, pages that simply had nothing
   * quotable -- arrived as "research found nothing usable to quote", not
   * retryable. The owner saw eleven identical failures with no way to tell
   * which were worth running again and which needed a website adding.
   *
   * Longest-specific first, so the detail in the sentence decides.
   */
  // A provider rate limit inside a research report. The worker already retries
  // this one, and the shell was telling the owner it would not -- the two
  // disagreeing about the same failure is how a lead that was about to be
  // picked up again got written off by hand.
  [/failed \([^)]*rate.?limit/i, { label: "research provider rate limited, retrying", retryable: true }],
  [/no company website on this lead/i, { label: "lead has no website to research — enrich it first", retryable: false }],
  [/site could not be read|could not be stored as evidence/i, { label: "couldn't reach their site, worth retrying", retryable: true }],
  [/is not configured \(|is not configured$/i, { label: "a research provider is not configured", retryable: false }],
  [/did not produce an approved sentence/i, { label: "research found nothing usable to quote", retryable: false }],
  [/rubric did not return a score/i, { label: "scorer didn't respond", retryable: true }],
  [/quality checker/i, { label: "failed the quality checker", retryable: true }],
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

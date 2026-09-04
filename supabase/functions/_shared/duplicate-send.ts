/**
 * Refusing to mail the same person the same email twice — and saying so in a
 * way the caller can act on.
 *
 * The guard itself was right: a prospect who gets the identical subject line
 * again inside a fortnight marks it as spam, and that costs the sending domain.
 * What was wrong was everything around it.
 *
 * The refusal said "this was already sent, sending it again would hurt your
 * deliverability" and stopped. The agent read that as "these drafts are
 * duplicates", offered the only remedy it could think of — delete them and
 * draft again — and the user said yes. But the block lives in `sent_emails`,
 * not in `email_drafts`: deleting every draft and regenerating them cannot
 * clear it, and the regenerated draft came back with the same deterministic
 * subject, so it was refused again. Round and round, nothing sent.
 *
 * A refusal that names a remedy which cannot work is worse than no refusal.
 * So the message here states three things the previous one did not: that the
 * draft is fine, that redrafting is not the fix, and what the two real options
 * are (write a different subject, or resend deliberately).
 */

/** How far back a send counts as a repeat. */
export const DUPLICATE_WINDOW_DAYS = 14;

/** Statuses that mean the message actually reached the recipient's provider. */
export const DELIVERED_STATUSES = ["sent", "delivered", "opened", "clicked", "replied"];

/**
 * The single spelling of a recipient address.
 *
 * The lookup lowercased and trimmed the address it was searching for; the
 * insert stored whatever the caller typed. "Sam@Acme.io " therefore wrote one
 * row and matched none, so the guard silently stopped protecting anyone whose
 * address arrived with different capitalisation — while still firing on
 * everyone whose did not. Both sides call this now.
 */
export function normalizeRecipient(email: string): string {
  return String(email ?? "").trim().toLowerCase();
}

/** ISO timestamp marking the start of the look-back window. */
export function duplicateWindowStart(now: Date = new Date()): string {
  return new Date(now.getTime() - DUPLICATE_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();
}

export interface DuplicateRefusal {
  error: string;
  code: "duplicate_send";
  /** What actually clears this, in order of what a sender usually wants. */
  remedy: string[];
  /** Stated explicitly because the agent kept proposing it. */
  redraft_will_not_help: true;
  previously_sent_at: string | null;
}

/**
 * The body returned to a caller whose send was refused as a repeat.
 *
 * `remedy` is a list rather than a sentence so a model has to pick one rather
 * than paraphrase the whole thing into "I'll delete and redraft".
 */
export function duplicateRefusal(opts: {
  to: string;
  subject: string;
  previouslySentAt?: string | null;
}): DuplicateRefusal {
  const to = normalizeRecipient(opts.to);
  const when = opts.previouslySentAt
    ? new Date(opts.previouslySentAt).toISOString().slice(0, 10)
    : null;

  return {
    error:
      `${to} was already sent an email with the subject "${opts.subject}"` +
      `${when ? ` on ${when}` : ` in the last ${DUPLICATE_WINDOW_DAYS} days`}. ` +
      `Sending the same subject to the same person again is what gets a domain filtered, so it was blocked. ` +
      `The draft is not the problem and there is nothing wrong with it.`,
    code: "duplicate_send",
    remedy: [
      `Write a genuinely different email with a different subject line — a follow-up that references the first one, not a rewrite of it.`,
      `If this is meant to be a second attempt at the same message, resend it deliberately by confirming the resend.`,
    ],
    redraft_will_not_help: true,
    previously_sent_at: opts.previouslySentAt ?? null,
  };
}

/**
 * What the agent must be told when a batch is refused this way.
 *
 * Written as an instruction because the failure was not the agent lacking the
 * facts — it had the refusal text — but the agent choosing a remedy the facts
 * ruled out. This names the wrong move so it can be recognised.
 */
export function duplicateGuidanceFor(count: number, subjects: string[]): string {
  const shown = subjects.slice(0, 3).map((s) => `"${s}"`).join(", ");
  return (
    `${count} send(s) were refused because that exact subject already went to that exact person within ` +
    `${DUPLICATE_WINDOW_DAYS} days${shown ? ` (${shown})` : ""}. ` +
    `Do NOT offer to delete and redraft: the block is on what was already sent, not on the drafts, ` +
    `so deleting drafts and generating new ones cannot clear it and will be refused again. ` +
    `Tell the user plainly that these people already received this email, name when, and offer exactly two choices: ` +
    `write a follow-up on a new angle with a new subject, or resend the same message deliberately.`
  );
}

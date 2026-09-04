/**
 * How much can actually go out today.
 *
 * A user asked for 32 follow-ups. Eleven sent, twenty-one were refused, and
 * every refusal parked an approval that nobody could clear — the queue reached
 * 103 that way, one doomed batch at a time. Nothing in the flow ever asked the
 * obvious question first: is there room to send this?
 *
 * There are two ceilings and they are easy to confuse. The account has a plan
 * cap on total sends per day. Each mailbox has its own daily limit, which is
 * what warmup ramps and what protects a domain. The real ceiling is the lower
 * of the two, and a request bigger than it should be said out loud before any
 * work is queued rather than discovered one failed send at a time.
 */

export interface MailboxCapacity {
  id: string;
  email: string;
  dailyLimit: number;
  sentToday: number;
  status: string;
}

export interface CapacityReport {
  /** Sends still available across every healthy mailbox. */
  mailboxHeadroom: number;
  /** Sends still available under the account's plan cap. */
  accountHeadroom: number;
  /** The real ceiling: whichever runs out first. */
  available: number;
  /** Which limit is doing the constraining, when one is. */
  boundBy: "mailboxes" | "account" | "none";
  /** Mailboxes that have nothing left today. */
  exhausted: string[];
  /** Mailboxes that cannot send at all right now. */
  unavailable: string[];
}

export function capacityFor(
  mailboxes: MailboxCapacity[],
  accountLimit: number,
  accountSentToday: number,
): CapacityReport {
  const active = mailboxes.filter((m) => m.status === "active");
  const unavailable = mailboxes.filter((m) => m.status !== "active").map((m) => m.email);

  const headroomOf = (m: MailboxCapacity) => Math.max(0, m.dailyLimit - m.sentToday);
  const mailboxHeadroom = active.reduce((sum, m) => sum + headroomOf(m), 0);
  const exhausted = active.filter((m) => headroomOf(m) === 0).map((m) => m.email);

  // A missing or zero plan limit means unmetered rather than blocked: the send
  // path enforces the real cap, and guessing "0" here would stop every send on
  // an account whose subscription row has not been written yet.
  const accountHeadroom = accountLimit > 0
    ? Math.max(0, accountLimit - accountSentToday)
    : Number.POSITIVE_INFINITY;

  const available = Math.min(mailboxHeadroom, accountHeadroom);
  const boundBy = available === 0
    ? (mailboxHeadroom <= accountHeadroom ? "mailboxes" : "account")
    : accountHeadroom < mailboxHeadroom
      ? "account"
      : mailboxHeadroom < accountHeadroom
        ? "mailboxes"
        : "none";

  return {
    mailboxHeadroom,
    accountHeadroom: Number.isFinite(accountHeadroom) ? accountHeadroom : mailboxHeadroom,
    available: Number.isFinite(available) ? available : mailboxHeadroom,
    boundBy,
    exhausted,
    unavailable,
  };
}

/**
 * What to say when a request is bigger than the day allows.
 *
 * Names the ceiling and which limit set it, because "some sends failed" sends a
 * user hunting and "your mailboxes have 12 left today" tells them what to
 * change. Empty when the whole request fits.
 */
export function shortfallWarning(requested: number, report: CapacityReport): string {
  if (requested <= report.available) return "";

  const where = report.boundBy === "account"
    ? "your plan's daily send limit"
    : "the daily limits on your mailboxes";

  const detail: string[] = [];
  if (report.exhausted.length > 0) {
    detail.push(`${report.exhausted.join(", ")} ${report.exhausted.length === 1 ? "has" : "have"} nothing left today`);
  }
  if (report.unavailable.length > 0) {
    detail.push(`${report.unavailable.join(", ")} cannot send at all`);
  }

  return (
    `Only ${report.available} of the ${requested} can go out today — ${where} ${
      report.available === 0 ? "leaves no room" : `allows ${report.available} more`
    }.` +
    (detail.length ? ` ${detail.join("; ")}.` : "") +
    ` Send ${report.available === 0 ? "nothing now and retry tomorrow" : `the ${report.available} now and the rest tomorrow`}, or raise the limits on the Deliverability page first.`
  );
}

/**
 * Whether an email row counts as a send.
 *
 * Both metric surfaces used to ask this question themselves, and both asked it
 * as `status === "sent" || !!sent_at`. The `sent_at` half was there to catch
 * rows whose status had moved on — delivered, opened, clicked, replied — but it
 * also caught failures, because the immediate-send path stamped `sent_at` on a
 * row it was marking `failed`. A message Gmail refused then counted as sent and
 * as failed at the same time, inflating the send total and diluting every rate
 * measured against it.
 *
 * The write side no longer stamps `sent_at` on a failure, but rows written
 * before that fix still carry one, so the read side rules failures out by
 * status rather than trusting the timestamp.
 *
 * `bounced` deliberately still counts: a bounce is a message that left.
 */
export const countsAsSent = (email: { status?: string | null; sent_at?: string | null }) =>
  email.status !== "failed" && (email.status === "sent" || !!email.sent_at);

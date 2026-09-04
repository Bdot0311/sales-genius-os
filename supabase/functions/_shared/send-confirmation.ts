/**
 * Confirming a send in the conversation, instead of in a queue.
 *
 * The approval queue was a second place where intent lived. A send in approval
 * mode wrote a row holding a frozen copy of the subject and body, and that row
 * outlived the conversation that made it — so "yes, send it" three turns later
 * resolved against a snapshot, approvals from old threads were still pending
 * weeks on, and a queue that could not drain grew every time a batch was
 * refused. It reached 103.
 *
 * There is no queue now. A draft is the pending state; it already persists, it
 * is already visible in the Drafts tab, and it is already what the send tools
 * read. Confirmation is a turn in the conversation: the agent describes what it
 * is about to send and sends nothing, and the next message either confirms or
 * does not.
 *
 * The safety property is unchanged — nothing goes out in approval mode until a
 * person says so. What changed is that saying so is a message rather than a row.
 */

export type SendMode = "approval" | "autonomous";

export interface ConfirmationDecision {
  /** Whether this call may actually send. */
  send: boolean;
  /** Why not, phrased for the model to pass on, when it may not. */
  reason?: string;
}

/**
 * Whether a send tool call is allowed to deliver.
 *
 * `confirmed` is set by the model only when the user's newest message agreed to
 * this specific send. It is deliberately a per-call argument rather than
 * conversation state: a flag that persisted would make the second batch inherit
 * the first batch's permission, which is the failure the queue had.
 */
export function decideSend(mode: SendMode, confirmed: boolean): ConfirmationDecision {
  if (mode === "autonomous") return { send: true };
  if (confirmed) return { send: true };
  return {
    send: false,
    reason:
      "Nothing was sent. Show the user exactly what is about to go out — how many, to whom, from which mailbox — and ask them to confirm. " +
      "When their next message agrees, call this tool again with confirmed: true. Nothing is queued or stored in the meantime; the drafts stay where they are.",
  };
}

export interface PreviewRecipient {
  name: string | null;
  email: string;
  company: string | null;
}

/**
 * The plain-language description of a send that has not happened.
 *
 * Everything the user needs to decide, and nothing that implies it already
 * went: no ticks, no past tense, no counts of "sent".
 */
export function previewText(
  recipients: PreviewRecipient[],
  mailboxes: string[],
  whenLocal?: string | null,
): string {
  if (recipients.length === 0) return "There is nothing to send.";

  const named = recipients
    .slice(0, 5)
    .map((r) => `${r.name ?? r.email}${r.company ? ` (${r.company})` : ""}`);
  const rest = recipients.length - named.length;

  const who = named.join(", ") + (rest > 0 ? `, and ${rest} more` : "");
  const from = mailboxes.length > 1
    ? `rotating across ${mailboxes.join(", ")}`
    : `from ${mailboxes[0] ?? "your connected mailbox"}`;

  return (
    `Ready to ${whenLocal ? "schedule" : "send"} ${recipients.length} email${recipients.length === 1 ? "" : "s"} ` +
    `${from}${whenLocal ? ` for ${whenLocal}` : ""}: ${who}. Nothing has gone out yet — confirm and I'll ${whenLocal ? "queue" : "send"} them.`
  );
}

/**
 * A Gmail accept and a database row are different events.
 *
 * Sending first and inserting after means a failed insert returns success
 * while the only record of the send is gone, so the next attempt sends again.
 * Reserving a pending row, marking the attempt, then sending, then updating
 * that same row keeps a second attempt from reaching Gmail. If the final
 * update fails, the result says the provider accepted the message and the
 * caller must not retry.
 */

export interface GmailAccept {
  messageId: string;
  threadId: string | null;
}

export interface OutboundStore {
  findAttempted(userId: string, to: string, subject: string): Promise<{ id: string } | null>;
  insertPending(row: {
    userId: string;
    to: string;
    subject: string;
    bodyHtml: string;
    bodyText: string;
    leadId: string | null;
    templateId: string | null;
    threadId: string | null;
    trackingPixelId: string | null;
    sendingAccountId: string | null;
  }): Promise<{ id: string } | { conflict: true } | { error: string }>;
  markAttempted(id: string): Promise<boolean>;
  markSent(id: string, gmail: GmailAccept): Promise<boolean>;
  markFailed(id: string, reason: string): Promise<void>;
}

export interface Mailbox {
  send(): Promise<{ ok: true; messageId: string; threadId: string | null } | { ok: false; status: number; body: string }>;
}

export type DeliveryResult =
  | { kind: "sent"; id: string; messageId: string; threadId: string | null }
  | { kind: "provider_rejected"; status: number; body: string }
  | { kind: "duplicate" }
  | { kind: "reserve_failed"; message: string }
  | {
      kind: "accepted_unpersisted";
      retryable: false;
      messageId: string;
      threadId: string | null;
    };

export function acceptedUnpersistedBody(messageId: string, threadId: string | null) {
  return {
    success: false,
    accepted: true,
    retryable: false as const,
    code: "accepted_unpersisted",
    provider: "gmail",
    messageId,
    threadId,
    error: "Gmail accepted this message, and the send record could not be saved. Do not send it again.",
  };
}

export async function deliverReserved(
  store: OutboundStore,
  mailbox: Mailbox,
  draft: {
    userId: string;
    to: string;
    subject: string;
    bodyHtml: string;
    bodyText: string;
    leadId: string | null;
    templateId: string | null;
    threadId: string | null;
    trackingPixelId: string | null;
    sendingAccountId: string | null;
    allowDuplicate: boolean;
  },
): Promise<DeliveryResult> {
  const isThread = typeof draft.threadId === "string" && draft.threadId.length > 0;
  if (!draft.allowDuplicate && !isThread) {
    const open = await store.findAttempted(draft.userId, draft.to, draft.subject);
    if (open) return { kind: "duplicate" };
  }

  const reserved = await store.insertPending({
    userId: draft.userId,
    to: draft.to,
    subject: draft.subject,
    bodyHtml: draft.bodyHtml,
    bodyText: draft.bodyText,
    leadId: draft.leadId,
    templateId: draft.templateId,
    threadId: isThread ? draft.threadId : null,
    trackingPixelId: draft.trackingPixelId,
    sendingAccountId: draft.sendingAccountId,
  });
  if ("error" in reserved) return { kind: "reserve_failed", message: reserved.error };
  if ("conflict" in reserved) return { kind: "duplicate" };

  const attempted = await store.markAttempted(reserved.id);
  if (!attempted) return { kind: "duplicate" };

  const sent = await mailbox.send();
  if (sent.ok === false) {
    await store.markFailed(reserved.id, `Gmail rejected the message (HTTP ${sent.status}).`);
    return { kind: "provider_rejected", status: sent.status, body: sent.body };
  }

  let stored = false;
  for (let attempt = 0; attempt < 3 && !stored; attempt++) {
    stored = await store.markSent(reserved.id, { messageId: sent.messageId, threadId: sent.threadId });
  }
  if (!stored) {
    return {
      kind: "accepted_unpersisted",
      retryable: false,
      messageId: sent.messageId,
      threadId: sent.threadId,
    };
  }
  return { kind: "sent", id: reserved.id, messageId: sent.messageId, threadId: sent.threadId };
}

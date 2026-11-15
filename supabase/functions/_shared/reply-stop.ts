/**
 * A queued message must not go out after the person already wrote back.
 *
 * `queuedAt` is when this outbound row was created, or when the enrollment
 * last moved. `repliedAt` is the latest human reply on the same lead.
 * A reply that landed after that moment means the message was prepared
 * before they answered.
 *
 * A follow-up created after a deliberate resume is newer than the old reply,
 * so it is allowed. A missing or unreadable timestamp blocks: we cannot
 * prove the message is still wanted.
 */
export function replySupersedesQueuedMail(
  queuedAt: string | null | undefined,
  repliedAt: string | null | undefined,
): boolean {
  if (!repliedAt) return false;
  const replyMs = Date.parse(repliedAt);
  if (!Number.isFinite(replyMs)) return true;
  if (!queuedAt) return true;
  const queuedMs = Date.parse(queuedAt);
  if (!Number.isFinite(queuedMs)) return true;
  return replyMs > queuedMs;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Only a real uuid may be interpolated into a PostgREST `or` filter. */
export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value);
}

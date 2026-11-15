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

/**
 * The agent speaks interested / objection / …. reply_analysis.intent_classification
 * only accepts high_intent, low_intent, and neutral. Writing the agent's word
 * straight through fails the check, and the update that would also clear the
 * placeholder never lands.
 */
export function intentFromAgentClassification(
  classification: string,
): "high_intent" | "low_intent" | "neutral" {
  if (classification === "interested" || classification === "meeting_request") return "high_intent";
  if (
    classification === "not_interested" ||
    classification === "unsubscribe" ||
    classification === "out_of_office" ||
    classification === "auto_reply"
  ) return "low_intent";
  return "neutral";
}

/** Confidence from the agent is 0–1. The performance page reads a 0–100 score. */
export function intentScoreFromConfidence(confidence: number): number {
  if (!Number.isFinite(confidence)) return 0;
  const score = confidence <= 1 ? confidence * 100 : confidence;
  return Math.max(0, Math.min(100, Math.round(score)));
}

/** Drop the sweep's placeholder flag without losing the rest of the signals. */
export function withoutUnclassifiedFlag(
  signals: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  const next = { ...(signals ?? {}) };
  delete next.unclassified;
  return next;
}

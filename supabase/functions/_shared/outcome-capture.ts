/**
 * Copy features for one outbound send, plus the call that snapshots it.
 *
 * These are computed from the body the send path already holds in memory, so
 * nothing re-reads or re-derives the message later. The snapshot itself is
 * taken in SQL (capture_send_snapshot) because lead_decisions is upserted per
 * lead and leads is mutable: reading them in the same statement that writes the
 * copy is the only way to be sure the snapshot matches the instant of the send.
 *
 * Capture runs AFTER the provider accepted the message, mirroring
 * attach_verdict_to_send. A capture failure must never stop a send or trigger a
 * resend, so every path here swallows its own errors and reports instead.
 */

export type PersonalizationType = "signal" | "company" | "role" | "none";
export type SentBy = "agent_auto" | "agent_approved" | "manual";

export interface CopyFeatures {
  subject_word_count: number;
  body_word_count: number;
  has_question_cta: boolean;
  has_link: boolean;
  personalization_type: PersonalizationType;
  sent_by: SentBy;
  ai_generated: boolean;
  user_edited: boolean;
  edit_ratio: number | null;
  agent_tier?: string | null;
  variant_id?: string | null;
  quality_checker_score?: number | null;
}

/** Visible words. HTML tags are markup, not words, so they are stripped. */
export function wordCount(text: string | null | undefined): number {
  if (!text) return 0;
  const plain = text
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&[a-z]+;|&#\d+;/gi, " ");
  const words = plain.trim().split(/\s+/).filter(Boolean);
  return words.length;
}

/**
 * A question mark in the last fifth of the body, which is where a CTA sits. A
 * question in the opening line is a hook, not an ask, and counting it would
 * label almost every email as having a question CTA.
 */
export function hasQuestionCta(body: string | null | undefined): boolean {
  if (!body) return false;
  const plain = body.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  if (!plain) return false;
  const tail = plain.slice(Math.floor(plain.length * 0.8));
  return tail.includes("?");
}

export function hasLink(body: string | null | undefined): boolean {
  if (!body) return false;
  return /<a\s[^>]*href\s*=|https?:\/\//i.test(body);
}

/**
 * What the opening is grounded in, strongest first. A signal reference is more
 * specific than a company reference, which is more specific than a role one, so
 * an email that mentions all three counts as the most specific it achieved.
 */
export function personalizationType(input: {
  body: string | null | undefined;
  signalTypes?: readonly (string | null | undefined)[] | null;
  companyName?: string | null;
  jobTitle?: string | null;
}): PersonalizationType {
  const body = (input.body ?? "").replace(/<[^>]*>/g, " ");
  if (!body.trim()) return "none";
  const haystack = body.toLowerCase();

  for (const raw of input.signalTypes ?? []) {
    const signal = (raw ?? "").replace(/[_-]+/g, " ").trim().toLowerCase();
    // Single-word signal names ("hiring") are matched whole so "hire" in
    // "we hired" does not count, and multi-word ones are matched as phrases.
    if (signal.length >= 4 && new RegExp(`\\b${escapeRegExp(signal)}\\b`).test(haystack)) {
      return "signal";
    }
  }

  const company = (input.companyName ?? "").trim().toLowerCase();
  if (company.length >= 3 && haystack.includes(company)) return "company";

  const title = (input.jobTitle ?? "").trim().toLowerCase();
  if (title.length >= 3 && haystack.includes(title)) return "role";

  return "none";
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Share of characters the user changed before sending, 0 to 1. Levenshtein
 * would be exact and is not worth its cost per send; the length-normalised
 * difference answers the question we actually ask of it, which is "did a human
 * rewrite this or wave it through".
 */
export function editRatio(original: string | null | undefined, finalText: string | null | undefined): number | null {
  if (original == null || finalText == null) return null;
  const a = original.trim();
  const b = finalText.trim();
  if (!a && !b) return 0;
  if (!a) return 1;
  if (a === b) return 0;

  let prefix = 0;
  while (prefix < a.length && prefix < b.length && a[prefix] === b[prefix]) prefix++;
  let suffix = 0;
  while (
    suffix < a.length - prefix &&
    suffix < b.length - prefix &&
    a[a.length - 1 - suffix] === b[b.length - 1 - suffix]
  ) suffix++;

  const changed = Math.max(a.length, b.length) - prefix - suffix;
  const ratio = changed / Math.max(a.length, b.length);
  return Math.min(1, Math.max(0, Number(ratio.toFixed(4))));
}

export function buildCopyFeatures(input: {
  subject: string | null | undefined;
  body: string | null | undefined;
  originalBody?: string | null;
  sentBy: SentBy;
  aiGenerated: boolean;
  signalTypes?: readonly (string | null | undefined)[] | null;
  companyName?: string | null;
  jobTitle?: string | null;
  agentTier?: string | null;
  variantId?: string | null;
  qualityCheckerScore?: number | null;
}): CopyFeatures {
  const ratio = editRatio(input.originalBody, input.body);
  return {
    subject_word_count: wordCount(input.subject),
    body_word_count: wordCount(input.body),
    has_question_cta: hasQuestionCta(input.body),
    has_link: hasLink(input.body),
    personalization_type: personalizationType({
      body: input.body,
      signalTypes: input.signalTypes,
      companyName: input.companyName,
      jobTitle: input.jobTitle,
    }),
    sent_by: input.sentBy,
    ai_generated: input.aiGenerated,
    // Unknown provenance is not the same as an untouched draft, so a null
    // ratio does not claim the user left it alone.
    user_edited: ratio == null ? false : ratio > 0,
    edit_ratio: ratio,
    agent_tier: input.agentTier ?? null,
    variant_id: input.variantId ?? null,
    quality_checker_score: input.qualityCheckerScore ?? null,
  };
}

interface RpcClient {
  rpc(fn: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }>;
}

/**
 * Snapshot one send. Never throws: the message is already delivered by the time
 * this runs, so the only thing a raised error could achieve is a false failure
 * upstream or a duplicate send.
 */
export async function captureSendSnapshot(
  client: RpcClient,
  sentEmailId: string,
  userId: string,
  copy: CopyFeatures | Record<string, unknown>,
): Promise<{ captured: boolean; snapshotId?: string; reason?: string }> {
  try {
    const { data, error } = await client.rpc("capture_send_snapshot", {
      p_sent_email_id: sentEmailId,
      p_user_id: userId,
      p_copy: copy,
    });
    if (error) {
      const message = typeof error === "object" && error && "message" in error
        ? String((error as { message: unknown }).message)
        : String(error);
      console.error(`[outcome-capture] rpc_failed ${sentEmailId}: ${message}`);
      return { captured: false, reason: message };
    }
    if (!data) {
      // The send has no lead (a reply to a stranger, a one-off), so there is
      // nothing to snapshot. Not an error.
      return { captured: false, reason: "no_lead" };
    }
    return { captured: true, snapshotId: String(data) };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error(`[outcome-capture] threw ${sentEmailId}: ${message}`);
    return { captured: false, reason: message };
  }
}

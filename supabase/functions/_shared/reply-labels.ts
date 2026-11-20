/**
 * The outcome label for a reply, and the rule for which label wins.
 *
 * Kept apart from triage_category, which the agent reads to decide whether to
 * draft a reply. Those six values are not a subset of these eleven -- soft_no
 * covers both "interested later" and "objection" -- so widening triage_category
 * in place would change agent behaviour. This label exists only to train on.
 */

export const OUTCOME_LABELS = [
  "positive",
  "interested_later",
  "referral",
  "meeting_booked",
  "objection",
  "not_interested",
  "wrong_person",
  "out_of_office",
  "auto_reply",
  "unsubscribe_request",
  "other",
] as const;

export type OutcomeLabel = (typeof OUTCOME_LABELS)[number];

/**
 * The labels that count as a win when rolling a whole sequence up to one
 * outcome. A referral is a win: it is a different person, but the email worked.
 */
export const POSITIVE_LABELS: readonly OutcomeLabel[] = [
  "positive",
  "interested_later",
  "referral",
  "meeting_booked",
];

/**
 * Replies that are not a human answering. They are neither a positive nor a
 * negative reply and must not be counted as either: an out-of-office is the
 * absence of a response, and treating it as a negative would teach the model
 * that a good email caused it.
 */
export const NON_HUMAN_LABELS: readonly OutcomeLabel[] = [
  "out_of_office",
  "auto_reply",
];

/** Below this the inbox asks a person to confirm the label. */
export const LOW_CONFIDENCE = 0.7;

export function isOutcomeLabel(value: unknown): value is OutcomeLabel {
  return typeof value === "string" && (OUTCOME_LABELS as readonly string[]).includes(value);
}

export function isPositiveLabel(label: unknown): boolean {
  return isOutcomeLabel(label) && POSITIVE_LABELS.includes(label);
}

export function isHumanReply(label: unknown): boolean {
  return isOutcomeLabel(label) && !NON_HUMAN_LABELS.includes(label);
}

export function needsConfirmation(input: { label: unknown; confidence: number | null | undefined; labeledBy?: string | null }): boolean {
  // A person already decided, so there is nothing left to confirm however
  // unsure the classifier had been.
  if (input.labeledBy === "user" || input.labeledBy === "agent") return false;
  if (!isOutcomeLabel(input.label)) return false;
  if (input.confidence == null) return true;
  return input.confidence < LOW_CONFIDENCE;
}

/**
 * Map the legacy triage_category onto an outcome label, for backfilling replies
 * classified before this build.
 *
 * soft_no is deliberately `other`, not a guess between interested_later and
 * objection. It genuinely covers both, and a wrong label is worse for training
 * than an honest "unknown" that a human can correct.
 */
export function labelFromTriage(triage: string | null | undefined): OutcomeLabel {
  switch ((triage ?? "").trim().toLowerCase()) {
    case "positive": return "positive";
    case "hard_no": return "not_interested";
    case "ooo": return "out_of_office";
    case "wrong_person": return "wrong_person";
    case "info_request": return "positive";
    case "soft_no": return "other";
    default: return "other";
  }
}

export interface ResolvedLabel {
  label: OutcomeLabel | null;
  objectionType: string | null;
  labeledBy: "claude" | "user" | "agent";
  confidence: number | null;
}

/**
 * Which label applies. The newest human correction wins over the classifier,
 * always, however confident the classifier was. Mirrors the
 * reply_labels_resolved view so the app and the database cannot disagree about
 * what a reply is labelled.
 */
export function resolveLabel(input: {
  classifier: { label: unknown; objectionType?: string | null; confidence?: number | null };
  overrides?: readonly { label: unknown; objectionType?: string | null; source?: string | null; createdAt: string }[] | null;
}): ResolvedLabel {
  const valid = (input.overrides ?? [])
    .filter((o) => isOutcomeLabel(o.label))
    .slice()
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));

  const newest = valid[0];
  if (newest) {
    return {
      label: newest.label as OutcomeLabel,
      objectionType: newest.objectionType ?? null,
      labeledBy: newest.source === "agent" ? "agent" : "user",
      // A person's label is not a probability.
      confidence: 1,
    };
  }

  return {
    label: isOutcomeLabel(input.classifier.label) ? input.classifier.label : null,
    objectionType: input.classifier.objectionType ?? null,
    labeledBy: "claude",
    confidence: input.classifier.confidence ?? null,
  };
}

/**
 * The static instructions the classifier is given for the outcome label. Kept
 * as one constant so classifierVersion() can hash it: the version then changes
 * by itself when the wording changes, instead of relying on somebody
 * remembering to bump a number. Training rows that disagree can then be traced
 * to the prompt that produced them.
 */
export const LABEL_INSTRUCTIONS = `Also classify this reply into exactly one outcome label:
  positive            - genuine interest, wants to know more
  interested_later    - interested but asks to be contacted at a later date
  referral            - points to a different person who is the right one
  meeting_booked      - accepts a meeting or confirms a time
  objection           - pushback: price, timing, already has a tool, no need
  not_interested      - a clear no
  wrong_person        - not their remit and no referral offered
  out_of_office       - an away message
  auto_reply          - any other automated response
  unsubscribe_request - asks to be removed
  other               - a human reply that fits none of the above

When the label is objection, name the objection_type: timing, budget, has_tool,
no_need, no_authority, bad_timing_hiring, or other. Otherwise null.

label_confidence is your own certainty in the label, 0 to 1. Be honest: a low
number sends this reply to a person to confirm, which is cheap. A confident
wrong label is not.`;

/** djb2. Short, stable across runtimes, and not a security boundary. */
export function promptHash(text: string): string {
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) >>> 0;
  return h.toString(16).padStart(8, "0");
}

export function classifierVersion(model: string): string {
  return `${model}:${promptHash(LABEL_INSTRUCTIONS)}`;
}

/**
 * The label implied by hard evidence, which beats whatever the model felt about
 * the body. Mail headers proving an automated send are not something a model
 * reading prose can improve on. out_of_office is kept when the model named it,
 * because it is a more specific true statement than auto_reply.
 */
export function labelFromEvidence(input: {
  isAutoReply: boolean;
  modelLabel: unknown;
}): OutcomeLabel | null {
  if (!input.isAutoReply) return null;
  return input.modelLabel === "out_of_office" ? "out_of_office" : "auto_reply";
}

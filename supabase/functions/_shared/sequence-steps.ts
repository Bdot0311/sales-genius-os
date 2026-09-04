/**
 * The values a sequence step may actually hold.
 *
 * `sequence_steps` has two CHECK constraints — one on step_type, one on
 * trigger_condition — and until now nothing in TypeScript knew they existed.
 * The generated Supabase types declare both columns as plain `string`, so
 * every writer invented its own vocabulary and the compiler agreed with all of
 * them. Three of them were wrong:
 *
 *   - SequenceBuilder wrote step_type "email", describing the CHANNEL. The
 *     constraint is about the step's ROLE in the sequence, so every step added
 *     through the sequence builder was rejected. Adding a step to a sequence
 *     has never worked.
 *   - cold-email-playbook's scheduleFollowUps wrote the same "email". It
 *     inserts the sequence first and the steps second, so each attempt left an
 *     empty sequence behind and returned a bare `false` — the AI SDR's
 *     follow-up scheduling never once persisted a step.
 *   - SequenceBuilder offers "Custom trigger" (on_custom) to Custom-tier
 *     users, and the trigger_condition constraint has never allowed it.
 *
 * So the vocabulary lives here, in one module both sides import, and a test
 * scans the repository for any literal written to these columns that is not in
 * these lists. The constraint is no longer something you have to remember.
 */

/**
 * What a step IS, not how it is delivered.
 *
 * This is an email-only product, so a channel discriminator would carry no
 * information — which is exactly why "email" looked plausible and said
 * nothing. The role does the work: it is what tells a reader, and the
 * scheduler, whether this is the first touch or one of the ones chasing it.
 */
export const STEP_TYPES = ["initial", "follow_up", "pattern_interrupt", "re_engagement"] as const;
export type StepType = (typeof STEP_TYPES)[number];

/**
 * What makes a step fire.
 *
 * on_custom is included because the product sells it: the sequence builder
 * offers it to Custom-tier accounts. The constraint is widened to match in
 * the accompanying migration rather than the option being taken away.
 */
export const TRIGGER_CONDITIONS = [
  "on_enroll",
  "on_delay",
  "on_open",
  "on_click",
  "on_no_response",
  "on_silence",
  "on_custom",
] as const;
export type TriggerCondition = (typeof TRIGGER_CONDITIONS)[number];

export function isStepType(value: unknown): value is StepType {
  return typeof value === "string" && (STEP_TYPES as readonly string[]).includes(value);
}

export function isTriggerCondition(value: unknown): value is TriggerCondition {
  return typeof value === "string" && (TRIGGER_CONDITIONS as readonly string[]).includes(value);
}

/**
 * The role of the step at a given position in a sequence.
 *
 * Position 1 is the first thing the prospect receives from this sequence, so
 * it is the initial touch; everything after it is chasing that one.
 *
 * This is about position WITHIN THE SEQUENCE, which is not always the same as
 * position within the conversation. scheduleFollowUps persists touches 2-4 of
 * a playbook whose touch 1 was already sent directly — its step 1 is a
 * follow-up, and it says so rather than calling this helper.
 */
export function stepTypeFor(stepNumber: number): StepType {
  return stepNumber <= 1 ? "initial" : "follow_up";
}

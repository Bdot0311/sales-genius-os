/**
 * Turning generated touches into a sequence the dispatcher can walk.
 *
 * The AI builder produced touches and let you copy them. Nothing persisted
 * them and nothing enrolled anyone, so "build a sequence for these leads" ended
 * at the clipboard.
 *
 * Two details in the engine decide whether a saved sequence actually sends on
 * the cadence it was written for, and both are easy to get wrong by reading the
 * column names alone.
 */

/** One generated touch. `day` is its offset from the start of the sequence. */
export interface Touch {
  day: number;
  subject: string;
  body: string;
  purpose?: string;
}

export interface SequenceStepRow {
  step_number: number;
  delay_days: number;
  delay_hours: number;
  subject_template: string;
  body_template: string;
  step_type: "initial" | "follow_up";
  trigger_condition: "on_enroll" | "on_delay";
}

/**
 * The enrolment's starting current_step.
 *
 * process-sequence-step reads `enrollment.current_step + 1` and fetches the
 * step with that number, so an enrolment starting at 1 begins at step 2 and
 * the first email is never sent. The column's own default is 1, which is the
 * trap: taking it skips the opener silently.
 */
export const ENROLMENT_START_STEP = 0;

/**
 * A step's delay is the wait AFTER it, not before it.
 *
 * After sending step N the dispatcher sets next_action_at to now plus that
 * same step's delay_days, so the number on a step governs the gap to the one
 * that follows. Touches carry absolute day offsets instead — day 0, 3, 8, 14 —
 * so each step takes the distance to the next touch, and the last takes zero
 * because nothing follows it.
 *
 * Reading delay_days as "wait this long before sending me" would compress the
 * whole sequence by one touch: a 0/3/8/14 cadence would go out on days 3, 5, 6
 * and 6.
 */
export function stepsFromTouches(touches: Touch[]): SequenceStepRow[] {
  return touches.map((touch, i) => {
    const next = touches[i + 1];
    const gap = next ? Math.max(0, Math.round(next.day - touch.day)) : 0;
    return {
      step_number: i + 1,
      delay_days: gap,
      delay_hours: 0,
      subject_template: touch.subject ?? "",
      body_template: touch.body ?? "",
      step_type: i === 0 ? "initial" : "follow_up",
      // The first step fires on enrolment; the rest wait out the step before.
      trigger_condition: i === 0 ? "on_enroll" : "on_delay",
    };
  });
}

/**
 * When the first email should go out, as an ISO timestamp.
 *
 * Almost always now: a sequence whose first touch is day 0 starts immediately.
 * A generator that opens on a later day is honoured rather than flattened.
 */
export function firstActionAt(touches: Touch[], from: Date = new Date()): string {
  const openingDay = Math.max(0, Math.round(touches[0]?.day ?? 0));
  const at = new Date(from);
  at.setDate(at.getDate() + openingDay);
  return at.toISOString();
}

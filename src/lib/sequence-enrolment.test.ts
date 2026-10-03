import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { ENROLMENT_START_STEP, firstActionAt, stepsFromTouches } from "./sequence-from-touches";

const BUILDER = readFileSync("src/components/sequences/AiSequenceBuilder.tsx", "utf8");
const DISPATCH = readFileSync("supabase/functions/process-sequence-step/index.ts", "utf8");

/** Source with comments removed, so an assertion cannot match its own explanation. */
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

/** A four-touch cadence over a fortnight — the shape the generator produces. */
const CADENCE = [
  { day: 0, subject: "outbound stack at acme", body: "one" },
  { day: 3, subject: "re: outbound stack", body: "two" },
  { day: 8, subject: "timing", body: "three" },
  { day: 14, subject: "closing the loop", body: "four" },
];

/**
 * The builder generated touches and offered to copy them. Nothing persisted
 * them and nothing enrolled anyone, so "build a sequence for these prospects"
 * ended at the clipboard.
 *
 * Two details in the dispatcher decide whether a saved sequence sends on the
 * cadence it was written for, and both read the wrong way round from the
 * column names alone.
 */
describe("a step's delay is the wait after it", () => {
  it("takes the distance to the next touch, not its own offset", () => {
    /*
     * process-sequence-step sends step N and then sets next_action_at to now
     * plus that same step's delay_days. So the number on a step is the gap to
     * the one that follows.
     *
     * Read as "wait this long before sending me", a 0/3/8/14 cadence would go
     * out on days 3, 5, 6 and 6 — compressed into a week and arriving twice on
     * the last day.
     */
    expect(stepsFromTouches(CADENCE).map((s) => s.delay_days)).toEqual([3, 5, 6, 0]);
  });

  it("gives the last step no delay, because nothing follows it", () => {
    const steps = stepsFromTouches(CADENCE);
    expect(steps[steps.length - 1].delay_days).toBe(0);
  });

  it("is the reading the dispatcher actually implements", () => {
    // Pinned to the engine rather than to my memory of it: it schedules from
    // the step it just sent.
    const d = code(DISPATCH);
    expect(d).toContain("const nextStepNumber = enrollment.current_step + 1");
    expect(d).toContain("nextActionAt.setDate(nextActionAt.getDate() + (nextStep.delay_days || 0))");
  });

  it("never emits a negative gap from touches out of order", () => {
    const jumbled = [{ day: 8, subject: "a", body: "" }, { day: 3, subject: "b", body: "" }];
    expect(stepsFromTouches(jumbled).every((s) => s.delay_days >= 0)).toBe(true);
  });
});

describe("an enrolment starts before step one, not on it", () => {
  it("starts at zero", () => {
    // The dispatcher sends current_step + 1. Starting at 1 sends step 2 first
    // and the opener is never sent at all.
    expect(ENROLMENT_START_STEP).toBe(0);
  });

  it("does not take the column's own default", () => {
    // sequence_enrollments.current_step defaults to 1, which is the trap: it
    // looks like "we are on step one" and means "step one is done".
    expect(code(BUILDER)).toContain("current_step: ENROLMENT_START_STEP");
    expect(code(BUILDER)).not.toMatch(/current_step:\s*1\b/);
  });
});

describe("the first touch goes out when it says it does", () => {
  it("sends immediately when the sequence opens on day zero", () => {
    const from = new Date("2026-10-03T09:00:00Z");
    expect(firstActionAt(CADENCE, from)).toBe(from.toISOString());
  });

  it("honours a generator that opens later", () => {
    const from = new Date("2026-10-03T09:00:00Z");
    const later = firstActionAt([{ day: 2, subject: "a", body: "" }], from);
    expect(new Date(later).getUTCDate()).toBe(5);
  });

  it("does not schedule into the past", () => {
    const from = new Date("2026-10-03T09:00:00Z");
    expect(firstActionAt([{ day: -5, subject: "a", body: "" }], from)).toBe(from.toISOString());
  });
});

describe("one sequence, every prospect walking through it", () => {
  const builder = code(BUILDER);

  it("writes one sequence rather than one per lead", () => {
    expect(builder).toContain('.from("email_sequences")');
    // The enrolments are the per-lead part.
    expect(builder).toContain("leadIds.map((leadId) => ({");
    expect(builder).toContain('.from("sequence_enrollments")');
  });

  it("marks the first step as firing on enrolment", () => {
    const steps = stepsFromTouches(CADENCE);
    expect(steps[0].trigger_condition).toBe("on_enroll");
    expect(steps[0].step_type).toBe("initial");
    expect(steps.slice(1).every((s) => s.trigger_condition === "on_delay")).toBe(true);
  });

  it("numbers the steps from one, which is what the dispatcher looks up", () => {
    expect(stepsFromTouches(CADENCE).map((s) => s.step_number)).toEqual([1, 2, 3, 4]);
  });

  it("saves the sequence active, not as a draft", () => {
    // The dispatcher only walks active sequences, so enrolling into a draft
    // would look like it had silently failed.
    expect(builder).toContain('status: "active"');
  });

  it("does not leave a sequence with no steps behind", () => {
    // It would enrol people into nothing and never send.
    expect(builder).toContain('await supabase.from("email_sequences").delete().eq("id", sequence.id)');
  });

  it("will not enrol nobody", () => {
    expect(builder).toContain("if (touches.length === 0 || leadIds.length === 0) return;");
    expect(builder).toContain("disabled={enrolling || leadIds.length === 0}");
  });
});

import { describe, expect, it } from "vitest";
import {
  CANONICAL_DAYS,
  auditSequence,
  overlapRatio,
  sequenceSummary,
} from "../../supabase/functions/_shared/sequence-audit.ts";

const rules = (f: { rule: string }[]) => f.map((x) => x.rule);

/**
 * The two failures that kill a sequence are properties of the SET, not of any
 * email in it. Every message can pass its own audit and the sequence still not
 * work — which is why auditing one email at a time never caught them.
 */

describe("does each touch carry something new", () => {
  it("scores a reworded repeat as overlapping", () => {
    const a = "Teams hiring four SDRs hit ramp time eating the quarter because managers coach four starters at once.";
    const b = "Ramp time eats the quarter for teams hiring four SDRs, because managers end up coaching four new starters at once.";
    expect(overlapRatio(a, b)).toBeGreaterThan(0.72);
  });

  it("scores a genuinely new angle as low overlap", () => {
    const a = "Teams hiring four SDRs hit ramp time eating the quarter.";
    const b = "Northfield changed one thing in onboarding and cut ramp from five months to three.";
    expect(overlapRatio(a, b)).toBeLessThan(0.5);
  });

  it("flags the fifth email that restates the first", () => {
    const repeated = "Ramp time eats your quarter when you hire four SDRs at once. Worth fifteen minutes?";
    const found = auditSequence([
      { step_number: 1, body_template: "Noticed four SDR roles. Ramp time eats your quarter when you hire four SDRs at once, because managers coach four starters. Worth fifteen minutes?" },
      { step_number: 2, body_template: repeated },
    ]);
    expect(rules(found)).toContain("repeats_earlier_touch");
  });

  it("stays quiet when every touch does a different job", () => {
    const found = auditSequence([
      { step_number: 1, body_template: "Noticed four open SDR roles, which usually means ramp eats the quarter because managers coach four starters at once. Worth fifteen minutes?" },
      { step_number: 2, body_template: "One more thing on this. What catches most heads of sales out is that by the time it shows in the numbers it is two quarters old. Covered, or not on the radar?" },
      { step_number: 3, body_template: "Northfield had the same shape of problem. They changed one thing in onboarding and cut ramp from five months to three. Want the one-page breakdown?" },
    ]);
    expect(rules(found)).not.toContain("repeats_earlier_touch");
  });
});

describe("spacing", () => {
  const withDays = (days: number[]) =>
    days.map((d, i) => ({
      step_number: i + 1,
      day: d,
      body_template: `Distinct point number ${i} about onboarding ramp and coaching load. Worth fifteen minutes?`,
    }));

  it("accepts the shape that works", () => {
    const found = auditSequence(withDays(CANONICAL_DAYS));
    expect(rules(found)).not.toContain("touches_bunched");
    expect(rules(found)).not.toContain("touches_too_far_apart");
    expect(rules(found)).not.toContain("steps_out_of_order");
  });

  it("blocks two touches on the same day", () => {
    expect(rules(auditSequence(withDays([1, 1, 7])))).toContain("steps_out_of_order");
  });

  it("flags a month-long gap, which starts from cold again", () => {
    expect(rules(auditSequence(withDays([1, 3, 40])))).toContain("touches_too_far_apart");
  });

  it("flags bunching later in the sequence", () => {
    expect(rules(auditSequence(withDays([1, 3, 4])))).toContain("touches_bunched");
  });

  it("says nothing about spacing when no days are set", () => {
    const found = auditSequence([
      { step_number: 1, body_template: "Noticed four SDR roles, which usually means ramp eats the quarter. Worth fifteen minutes?" },
    ]);
    expect(rules(found)).not.toContain("touches_bunched");
  });
});

describe("one touch that asks for nothing", () => {
  const asking = (n: number) => ({
    step_number: n,
    body_template: `Distinct angle number ${n} on onboarding, ramp, coaching, hiring and quota attainment. Worth fifteen minutes?`,
  });

  it("flags a sequence where every email asks", () => {
    const found = auditSequence([asking(1), asking(2), asking(3), asking(4)]);
    expect(rules(found)).toContain("every_touch_asks");
  });

  it("is satisfied by one pure-value touch", () => {
    const found = auditSequence([
      asking(1),
      asking(2),
      { step_number: 3, body_template: "Came across this and it is the clearest thing I have read on ramp time in a growing sales team. The useful part is a third of the way in. No reply needed." },
      asking(4),
    ]);
    expect(rules(found)).not.toContain("every_touch_asks");
  });

  it("does not fire on a short sequence, where there is no room for one", () => {
    expect(rules(auditSequence([asking(1), asking(2)]))).not.toContain("every_touch_asks");
  });
});

describe("per-email rules still run, with the position", () => {
  it("holds step 4 to the pure-value standard", () => {
    const found = auditSequence([
      { step_number: 4, body_template: "Came across this on ramp time and thought it was useful for your team right now. Want the breakdown?" },
    ]);
    expect(rules(found)).toContain("value_touch_has_ask");
  });

  it("attaches every finding to its step number", () => {
    const found = auditSequence([
      { step_number: 2, body_template: "Hi [FIRST_NAME], worth a look?" },
    ]);
    expect(found.every((f) => f.step === 2)).toBe(true);
  });
});

describe("the summary", () => {
  it("says so plainly when the sequence is clean", () => {
    expect(sequenceSummary([], 6)).toMatch(/all 6 steps pass/i);
  });

  it("counts steps rather than findings, and demands step numbers", () => {
    const found = auditSequence([{ step_number: 3, body_template: "Hi [FIRST_NAME], worth a look?" }]);
    expect(sequenceSummary(found, 6)).toMatch(/of 6 steps/);
    expect(sequenceSummary(found, 6)).toMatch(/name the step number/i);
  });

  it("survives an empty sequence", () => {
    expect(auditSequence([])).toEqual([]);
  });
});

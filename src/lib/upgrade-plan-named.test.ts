import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { PLAN_FEATURES, cheapestPlanRaising, type PlanType } from "./plan-features";

const code = (path: string) =>
  readFileSync(path, "utf8").split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");

/**
 * A user wrote in: 25 leads sourced, then "the platform failed to set up the
 * campaign, preventing me from moving forward."
 *
 * The free plan has activeSequences: 0 and stepsPerSequence: 0, so there was
 * no campaign to set up. That part is deliberate. What was not deliberate is
 * what the product told him to do about it: both sequence prompts hardcoded
 * requiredPlan="pro", and UpgradePrompt's own type was 'growth' | 'pro', so
 * Starter -- the plan that actually unlocks sequences -- could not be named.
 */
describe("an upgrade prompt names the plan that would actually help", () => {
  it("sends a free account to Starter for sequences, not Pro", () => {
    expect(PLAN_FEATURES.free.activeSequences).toBe(0);
    expect(cheapestPlanRaising("free", "activeSequences")).toBe("starter");
    expect(cheapestPlanRaising("free", "stepsPerSequence")).toBe("starter");
  });

  it("walks up from wherever the account already is", () => {
    expect(cheapestPlanRaising("starter", "activeSequences")).toBe("growth");
    expect(cheapestPlanRaising("growth", "activeSequences")).toBe("pro");
  });

  it("names nothing when the limit is already unlimited", () => {
    expect(PLAN_FEATURES.pro.activeSequences).toBe(-1);
    expect(cheapestPlanRaising("pro", "activeSequences")).toBeNull();
  });

  it("skips a plan that shares the current cap", () => {
    /*
     * Starter and Growth both carrying 1 active sequence: the honest answer
     * is Pro, because Growth would cost money and change nothing. Asserted
     * against a table rather than the real one, since today every adjacent
     * pair happens to raise both limits -- so a plain one-step walk passes
     * every assertion made against the real numbers.
     */
    const shared = {
      free: { activeSequences: 0 },
      starter: { activeSequences: 1 },
      growth: { activeSequences: 1 },
      pro: { activeSequences: -1 },
      agency: { activeSequences: -1 },
    };
    expect(cheapestPlanRaising("starter", "activeSequences", shared)).toBe("pro");
    expect(cheapestPlanRaising("free", "activeSequences", shared)).toBe("starter");
  });

  it("names nothing when no plan above offers more", () => {
    const flat = {
      free: { activeSequences: 2 }, starter: { activeSequences: 2 },
      growth: { activeSequences: 2 }, pro: { activeSequences: 2 },
      agency: { activeSequences: 1 },
    };
    expect(cheapestPlanRaising("free", "activeSequences", flat)).toBeNull();
  });

  it("holds on the real table too", () => {
    /*
     * It asks whether the number changes rather than walking one step, so a
     * plan sharing the current cap is never named. Both assertions hold on
     * today's numbers and the rule is what keeps it true if they change.
     */
    for (const plan of ["free", "starter", "growth"] as PlanType[]) {
      for (const limit of ["activeSequences", "stepsPerSequence"] as const) {
        const next = cheapestPlanRaising(plan, limit);
        expect(next, `${plan}/${limit}`).not.toBeNull();
        const before = Number(PLAN_FEATURES[plan][limit]);
        const after = Number(PLAN_FEATURES[next as PlanType][limit]);
        expect(after === -1 || after > before, `${plan} -> ${next} on ${limit}`).toBe(true);
      }
    }
  });

  it("no longer hardcodes the dearest plan at either call site", () => {
    const list = code("src/components/sequences/SequencesList.tsx");
    const builder = code("src/components/sequences/SequenceBuilder.tsx");
    expect(list).not.toContain('requiredPlan="pro"');
    expect(builder).not.toContain('requiredPlan="pro"');
    expect(list).toContain('cheapestPlanRaising(currentPlan, "activeSequences")');
    expect(builder).toContain('cheapestPlanRaising(currentPlan, "stepsPerSequence")');
  });

  it("asks to unlock the feature, not for 'more' of nothing", () => {
    // "Unlock More Active Sequences" when you have zero reads as a bug.
    const list = code("src/components/sequences/SequencesList.tsx");
    expect(list).toContain('maxSequences === 0 ? "Email Sequences"');
  });

  it("stops claiming the current plan includes things it may not", () => {
    /*
     * "Current plan includes: Lead Intelligence, AI Outreach, Smart Pipeline,
     * and Calendar Integration" was shown to every plan, free included --
     * which has calendarConnections: 0 and activeSequences: 0.
     */
    const prompt = code("src/components/dashboard/UpgradePrompt.tsx");
    expect(prompt).not.toContain("Current plan includes:");
    expect(PLAN_FEATURES.free.calendarConnections).toBe(0);
  });
});

describe("the enrichment refusal quotes a plan that exists, at no price", () => {
  const ENRICH = code("supabase/functions/enrich-lead/index.ts");

  it("names Starter, which is what the block actually requires", () => {
    // The refusal fires on the free plan only, so any paid plan lifts it.
    expect(ENRICH).toContain("Starter unlocks it.");
    expect(ENRICH).toContain("upgrade_plan: 'starter'");
  });

  it("no longer quotes a price for Growth that Growth does not cost", () => {
    /*
     * The message said "Upgrade to Growth ($49/mo)". Growth is $89/mo. The
     * price is not restated here at all -- a number copied into an error
     * message is how it went stale in the first place.
     */
    expect(ENRICH).not.toContain("$49/mo");
    expect(ENRICH).not.toMatch(/Upgrade to Growth/);
    const pricing = readFileSync("src/components/Pricing.tsx", "utf8");
    expect(pricing, "Growth's real price moved; this test is the record of it")
      .toContain("monthlyPrice: 89");
  });
});

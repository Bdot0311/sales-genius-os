import { describe, expect, it } from "vitest";
import {
  composeSkillContext,
  skillsForGoal,
} from "../../supabase/functions/_shared/email-skills.ts";
import { EMAIL_SKILLS } from "../../supabase/functions/_shared/skills.generated.ts";

describe("skills bundle", () => {
  it("carries every email skill with real content", () => {
    // A skill that compiled to an empty string would silently stop shaping any
    // email routed to it, and nothing downstream would notice.
    for (const [name, body] of Object.entries(EMAIL_SKILLS)) {
      expect(body.length, name).toBeGreaterThan(500);
    }
  });

  it("excludes skills that are not about writing outbound", () => {
    // impeccable is a code-quality skill and company-context is product fact
    // sourced per user from the database; neither belongs in a copy prompt.
    expect(EMAIL_SKILLS).not.toHaveProperty("impeccable");
    expect(EMAIL_SKILLS).not.toHaveProperty("company-context");
  });
});

describe("skillsForGoal", () => {
  it("always includes the core copywriting skill", () => {
    for (const goal of ["4ts", "follow-up", "meeting", "anything-unknown"]) {
      expect(skillsForGoal({ goal }), goal).toContain("b2b-cold-email-copywriting");
    }
  });

  it("puts the core skill last so a budget cut drops it before the framework", () => {
    const picked = skillsForGoal({ goal: "4ts" });

    expect(picked[picked.length - 1]).toBe("b2b-cold-email-copywriting");
    expect(picked[0]).toBe("email-writing-frameworks");
  });

  it("routes trigger-led first touches to the framework skill", () => {
    for (const goal of ["4ts", "elusive", "proximity"]) {
      expect(skillsForGoal({ goal }), goal).toContain("email-writing-frameworks");
    }
  });

  it("routes anything later in a sequence to the sequence skill", () => {
    // A follow-up needs its position in the sequence, not just a shape — what
    // email 3 does that email 1 did not, and how a break-up is written.
    for (const goal of ["follow-up", "4ps_followup", "4ps_elusive_followup"]) {
      expect(skillsForGoal({ goal }), goal).toContain("cold-email-4-sequence");
    }
  });

  it("adds the template library only when a template is in play", () => {
    expect(skillsForGoal({ goal: "4ts" })).not.toContain("cold-email-templates-34");
    expect(skillsForGoal({ goal: "4ts", usesTemplate: true }))
      .toContain("cold-email-templates-34");
  });

  it("falls back to the orchestrator when the goal is unrecognised", () => {
    // Better the model picks a shape deliberately than reaches for whatever it
    // defaults to.
    expect(skillsForGoal({ goal: "not-a-goal" })).toContain("cold-email-strategist");
    expect(skillsForGoal({})).toContain("cold-email-strategist");
  });

  it("does not hand the orchestrator to a goal that already routed", () => {
    expect(skillsForGoal({ goal: "4ts" })).not.toContain("cold-email-strategist");
  });

  it("is case-insensitive about the goal", () => {
    expect(skillsForGoal({ goal: "4TS" })).toContain("email-writing-frameworks");
  });

  it("never repeats a skill", () => {
    const picked = skillsForGoal({ goal: "introduction", usesTemplate: true });

    expect(new Set(picked).size).toBe(picked.length);
  });
});

describe("composeSkillContext", () => {
  it("labels each skill so the model reads it as reference, not instruction", () => {
    const text = composeSkillContext({ goal: "4ts" });

    expect(text).toContain("--- SKILL: email-writing-frameworks ---");
    expect(text).toContain("REFERENCE MATERIAL");
  });

  it("states that the house rules outrank the reference material", () => {
    // The rules above it are product policy the quality checker enforces; a
    // skill must not be able to relax them.
    expect(composeSkillContext({ goal: "4ts" })).toContain("the rules above win");
  });

  it("keeps the requested framework when the budget forces a cut", () => {
    // Tight budget: the framework the caller asked for must survive and the
    // general principles are what get dropped.
    const text = composeSkillContext({ goal: "4ts", maxTokens: 1200 });

    expect(text).toContain("--- SKILL: email-writing-frameworks ---");
    expect(text).not.toContain("--- SKILL: b2b-cold-email-copywriting ---");
  });

  it("returns nothing rather than a bare header when nothing fits", () => {
    expect(composeSkillContext({ goal: "4ts", maxTokens: 1 })).toBe("");
  });

  it("includes the full framework text, not just its name", () => {
    const text = composeSkillContext({ goal: "follow-up" });

    // Break-Up is a sequence position generate-email never implemented; it now
    // reaches the model from the skill.
    expect(text).toContain("Break-Up");
  });
});

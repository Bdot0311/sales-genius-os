import { describe, expect, it } from "vitest";
import {
  composeSkillContext,
  skillNamesUsed,
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

  it("ranks the core skill above the material no goal asked for", () => {
    const picked = skillsForGoal({ goal: "4ts" });

    expect(picked[0]).toBe("email-writing-frameworks");
    // The core sits after the goal's own material and ahead of the rest.
    const core = picked.indexOf("b2b-cold-email-copywriting");
    expect(core).toBeGreaterThan(picked.indexOf("email-writing-frameworks"));
    expect(core).toBeLessThan(picked.indexOf("cold-email-strategist"));
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

  it("promotes the template library when a template is in play", () => {
    // Every skill ships on every path now, so a template request cannot add one
    // that was missing. What it changes is rank: the library moves ahead of the
    // material that was not asked for.
    const without = skillsForGoal({ goal: "4ts" });
    const with_ = skillsForGoal({ goal: "4ts", usesTemplate: true });

    expect(without).toContain("cold-email-templates-34");
    expect(with_).toContain("cold-email-templates-34");
    expect(with_.indexOf("cold-email-templates-34"))
      .toBeLessThan(without.indexOf("cold-email-templates-34"));
  });

  it("falls back to the orchestrator when the goal is unrecognised", () => {
    // Better the model picks a shape deliberately than reaches for whatever it
    // defaults to.
    expect(skillsForGoal({ goal: "not-a-goal" })).toContain("cold-email-strategist");
    expect(skillsForGoal({})).toContain("cold-email-strategist");
  });

  it("hands every path the whole bundle, routed goal or not", () => {
    // The old behaviour filtered by goal, so a "meeting" email never saw the
    // frameworks and a "4ts" email never saw the strategist — each path getting
    // a partial copy of how this company writes. Nothing opts out now.
    const all = Object.keys(EMAIL_SKILLS).filter((n) => n !== "anti-ai-slop-writing");
    for (const goal of ["4ts", "meeting", "demo", "proposal", "sequence", "not-a-goal", ""]) {
      expect([...skillsForGoal({ goal })].sort(), goal).toEqual([...all].sort());
    }
  });

  it("still ranks the goal's own material first", () => {
    // Order is emphasis: what is closest to the email being written leads, and
    // would be the last thing dropped if a budget ever did bite.
    expect(skillsForGoal({ goal: "4ts" })[0]).toBe("email-writing-frameworks");
    expect(skillsForGoal({ goal: "meeting" })[0]).toBe("outreach-messaging");
    expect(skillsForGoal({ goal: "follow-up" })[0]).toBe("cold-email-4-sequence");
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
    // Examples inside a skill are shapes to imitate, never copy sourced wording.
    expect(text).toContain("is an illustration of a shape");
  });

  it("states that the house rules outrank the reference material", () => {
    // The rules above it are product policy the quality checker enforces; a
    // skill must not be able to relax them.
    expect(composeSkillContext({ goal: "4ts" })).toContain("A framework can never relax those");
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

describe("the anti-slop style floor", () => {
  const GOALS = [
    "4ts", "elusive", "proximity", "introduction", "follow-up",
    "4ps_followup", "meeting", "demo", "proposal", "sequence", "not-a-goal", "",
  ];

  it("is injected for every goal, including unrecognised ones", () => {
    for (const goal of GOALS) {
      expect(composeSkillContext({ goal }), goal).toContain(
        "--- SKILL: anti-ai-slop-writing ---",
      );
    }
  });

  it("is framed as a floor rather than one framework among several", () => {
    const text = composeSkillContext({ goal: "introduction" });
    expect(text).toContain("STYLE FLOOR");
    // The frameworks block tells the model to pick exactly one. If the floor
    // sat inside it, it would be discarded whenever something else was picked.
    const floorAt = text.indexOf("STYLE FLOOR");
    const pickOneAt = text.indexOf("pick the ONE framework");
    expect(pickOneAt).toBeGreaterThanOrEqual(0);
    expect(floorAt).toBeGreaterThan(pickOneAt);
  });

  it("carries the actual passes, not just the skill's name", () => {
    const text = composeSkillContext({ goal: "follow-up" });
    expect(text).toContain("Negative parallelism");
    expect(text).toContain("Invented specificity");
  });

  it("is reported among the skills that shaped a draft", () => {
    expect(skillNamesUsed({ goal: "introduction" })).toContain("anti-ai-slop-writing");
    expect(skillNamesUsed({ goal: "not-a-goal" })).toContain("anti-ai-slop-writing");
  });

  it("never displaces the framework the caller asked for", () => {
    // A floor that pushes out the shape produces a clean email of the wrong kind.
    const text = composeSkillContext({ goal: "4ts", maxTokens: 1200 });
    expect(text).toContain("--- SKILL: email-writing-frameworks ---");
    expect(text).not.toContain("--- SKILL: anti-ai-slop-writing ---");
  });

  it("outranks the general principles when the budget is tight", () => {
    const text = composeSkillContext({ goal: "4ts", maxTokens: 4200 });
    expect(text).toContain("--- SKILL: email-writing-frameworks ---");
    expect(text).toContain("--- SKILL: anti-ai-slop-writing ---");
    expect(text).not.toContain("--- SKILL: b2b-cold-email-copywriting ---");
  });

  it("still returns nothing when even the framework cannot fit", () => {
    expect(composeSkillContext({ goal: "4ts", maxTokens: 1 })).toBe("");
  });
});

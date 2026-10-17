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

  it("ranks the goal's own material above the core", () => {
    /*
     * This used to end by checking the core outranked cold-email-strategist.
     * It could only assert that because every goal carried every skill — the
     * behaviour three tests here were pinning and the thing that made a draft
     * list ten playbooks and follow none. There is no unrequested material to
     * outrank now; what is left to hold is that the goal's own shapes lead.
     */
    const picked = skillsForGoal({ goal: "4ts" });
    expect(picked[0]).toBe("email-writing-frameworks");
    expect(picked.indexOf("b2b-cold-email-copywriting"))
      .toBeGreaterThan(picked.indexOf("email-writing-frameworks"));
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
    /*
     * The old version asserted the library was present WITHOUT a template too,
     * which is the opposite of what its own name says. It passed because every
     * path carried everything; a draft that named no template still got 34
     * templates to choose between.
     */
    const without = skillsForGoal({ goal: "4ts" });
    const with_ = skillsForGoal({ goal: "4ts", usesTemplate: true });

    expect(without).not.toContain("cold-email-templates-34");
    expect(with_).toContain("cold-email-templates-34");
  });

  it("falls back to the orchestrator when the goal is unrecognised", () => {
    // Better the model picks a shape deliberately than reaches for whatever it
    // defaults to.
    expect(skillsForGoal({ goal: "not-a-goal" })).toContain("cold-email-strategist");
    expect(skillsForGoal({})).toContain("cold-email-strategist");
  });

  it("gives no path the whole bundle", () => {
    /*
     * This test used to assert the exact opposite — that every goal received
     * every skill — on the reasoning that a routed path would otherwise get "a
     * partial copy of how this company writes".
     *
     * The gap it was fixing was real: "meeting" saw no frameworks at all. But
     * giving everything to everyone fixed it by making the routing meaningless,
     * and the symptom reached the product. A first touch arrived carrying the
     * shapes it needed, plus how to answer an objection nobody had raised, plus
     * what touch five of a sequence does that touch one did not, plus a second
     * generalist restating the core: ten playbooks named in the run log and
     * none of them visible in the email.
     *
     * So the gap is closed where it actually was — BY_GOAL gives the
     * conversation-advancing goals their shapes, and an unmapped goal falls
     * back to the generalist — and this holds the line that made it a bug.
     */
    const all = Object.keys(EMAIL_SKILLS).length;
    for (const goal of ["4ts", "meeting", "demo", "proposal", "sequence", "objection", "not-a-goal", ""]) {
      const picked = skillsForGoal({ goal });
      expect(picked.length, `${goal} carries ${picked.join(", ")}`).toBeLessThan(all - 2);
    }
  });

  it("keeps material for a different job out of a first touch", () => {
    // The three that made the dump obvious in the run log.
    for (const goal of ["4ts", "elusive", "proximity", "introduction"]) {
      const picked = skillsForGoal({ goal });
      expect(picked, goal).not.toContain("objection-replies");
      expect(picked, goal).not.toContain("six-email-sequence");
      expect(picked, goal).not.toContain("cold-email-4-sequence");
    }
  });

  it("gives the conversation-advancing goals a shape as well as a framing", () => {
    /*
     * This is the gap the catch-all loop was papering over: "meeting" routed
     * to outreach-messaging alone, so it got R.E.P.L.Y. and no structure to
     * hang it on. Closing it here is what made removing the loop safe, so it
     * is held here rather than left implied.
     */
    for (const goal of ["meeting", "demo", "proposal"]) {
      const picked = skillsForGoal({ goal });
      expect(picked, goal).toContain("outreach-messaging");
      expect(picked, goal).toContain("email-writing-frameworks");
    }
  });

  it("still gives the objection path the objection material", () => {
    // agent-run classifies the objection and asks for this goal. It is the one
    // place the skill belongs, and the reason it is routed nowhere else.
    expect(skillsForGoal({ goal: "objection" })).toContain("objection-replies");
  });

  it("still ranks the goal's own material first", () => {
    // Order is emphasis: what is closest to the email being written leads, and
    // would be the last thing dropped if a budget ever did bite.
    expect(skillsForGoal({ goal: "4ts" })[0]).toBe("email-writing-frameworks");
    expect(skillsForGoal({ goal: "meeting" })[0]).toBe("outreach-messaging");
    // six-email-sequence leads the follow-up goals on purpose: it is the only
    // skill that states the JOB of each touch, which is the thing a follow-up
    // has to differ on. cold-email-4-sequence follows it, not the reverse.
    expect(skillsForGoal({ goal: "follow-up" })[0]).toBe("six-email-sequence");
    expect(skillsForGoal({ goal: "follow-up" })[1]).toBe("cold-email-4-sequence");
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

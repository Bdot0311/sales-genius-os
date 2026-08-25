// Unit tests for GTM skill routing into email prompts.
// Run: deno test supabase/functions/_tests/email-skills.test.ts
//
// These exist because the failure they guard against is invisible from the
// outside: if the skills stop reaching a prompt, nothing errors and no log
// changes — the model simply falls back on its own instincts and every email
// starts coming out the same shape. That is exactly what happened before, on
// the agent path, which loaded no skills at all for months.
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { composeSkillContext, skillsForGoal } from "../_shared/email-skills.ts";
import { PLAYBOOK_SYSTEM_RULES, playbookSystemRules } from "../_shared/cold-email-playbook.ts";

const GOALS = ["introduction", "follow-up", "meeting", "demo", "proposal", "4ts", "elusive", "proximity", "sequence"];

Deno.test("every routed goal actually receives skill text", () => {
  for (const goal of GOALS) {
    const text = composeSkillContext({ goal });
    assert(text.length > 1000, `${goal} got ${text.length} chars of skill context`);
    assert(text.includes("--- SKILL:"), `${goal} context carries no skill body`);
  }
});

Deno.test("the core copywriting skill is always present", () => {
  for (const goal of [...GOALS, "totally-unknown-goal", undefined]) {
    assert(
      skillsForGoal({ goal }).includes("b2b-cold-email-copywriting"),
      `${goal} lost the core skill`,
    );
  }
});

Deno.test("an unrecognised goal still gets a framework to choose from", () => {
  // Falling through to nothing is how a prompt ends up with no shape guidance
  // and defaults to the same four beats every time.
  const picked = skillsForGoal({ goal: "custom" });
  assert(picked.includes("cold-email-strategist"), `got ${picked.join(", ")}`);
});

Deno.test("the agent's sequence goal pulls the multi-touch skill", () => {
  const picked = skillsForGoal({ goal: "sequence" });
  assert(picked.includes("cold-email-4-sequence"), `got ${picked.join(", ")}`);
});

Deno.test("naming a template pulls the template library", () => {
  assert(skillsForGoal({ goal: "meeting", usesTemplate: true }).includes("cold-email-templates-34"));
});

Deno.test("skills tell the model they own shape, and examples are not wording", () => {
  // The header is hard-wrapped for readability, so match on normalized
  // whitespace rather than tying the assertion to where the lines break.
  const text = composeSkillContext({ goal: "introduction" }).replace(/\s+/g, " ");
  assert(/own SHAPE/i.test(text), "shape authority is not stated");
  assert(/never wording to reuse/i.test(text), "example-reuse warning is missing");
});

Deno.test("the agent playbook carries the frameworks, not just the rules", () => {
  const withSkills = playbookSystemRules();
  assert(
    withSkills.length > PLAYBOOK_SYSTEM_RULES.length + 5000,
    `playbook grew only ${withSkills.length - PLAYBOOK_SYSTEM_RULES.length} chars — skills are not reaching the agent`,
  );
  assert(withSkills.includes("SKILL: cold-email-4-sequence"));
  assert(withSkills.startsWith(PLAYBOOK_SYSTEM_RULES), "constraints must still lead the prompt");
});

Deno.test("ordering ranks the goal's own material above the general principles", () => {
  // Every skill ships on every path, so ordering is emphasis rather than a
  // filter — but if a budget ever does bite, what the caller asked for has to
  // outlive what it did not.
  const names = skillsForGoal({ goal: "sequence" });
  assertEquals(names[0], "cold-email-4-sequence");
  assert(
    names.indexOf("b2b-cold-email-copywriting") > names.indexOf("cold-email-4-sequence"),
    `core outranks the routed skill: ${names.join(", ")}`,
  );
});

Deno.test("a tiny budget yields no skills rather than a truncated fragment", () => {
  assertEquals(composeSkillContext({ goal: "introduction", maxTokens: 1 }), "");
});

// --- A/B variants ----------------------------------------------------------
// A variant only earns its cost if it differs structurally. The Frontal
// templates are six alternative first-touch shapes, so variants pull them
// regardless of goal — otherwise the test compares two phrasings of one shape
// and tells the sender nothing about which shape works.

Deno.test("a variant pulls the Frontal templates whatever the goal", () => {
  for (const goal of ["introduction", "meeting", "follow-up", "custom"]) {
    assert(
      skillsForGoal({ goal, variantNum: 2 }).includes("frontal-messaging-templates"),
      `variant of ${goal} got ${skillsForGoal({ goal, variantNum: 2 }).join(", ")}`,
    );
  }
});

Deno.test("the original does not LEAD with the Frontal templates", () => {
  // They are present for every goal — nothing opts out of the house rules — but
  // leading with them is what makes a variant structurally different, so the
  // original must not start there.
  for (const goal of ["meeting", "follow-up"]) {
    const names = skillsForGoal({ goal, variantNum: 0 });
    assert(
      names.includes("frontal-messaging-templates"),
      `${goal} should still carry the templates`,
    );
    assert(
      names[0] !== "frontal-messaging-templates",
      `${goal} must not lead with them at variantNum 0`,
    );
  }
});

Deno.test("first-touch goals carry the Frontal templates on the original too", () => {
  for (const goal of ["introduction", "4ts", "elusive", "proximity"]) {
    assert(
      skillsForGoal({ goal }).includes("frontal-messaging-templates"),
      `${goal} should offer the first-touch shapes`,
    );
  }
});

Deno.test("a variant leads with the shape skill so a tight budget keeps it", () => {
  assertEquals(skillsForGoal({ goal: "meeting", variantNum: 1 })[0], "frontal-messaging-templates");
});

Deno.test("the Frontal templates reach the composed prompt text", () => {
  const text = composeSkillContext({ goal: "introduction", variantNum: 1 });
  assert(text.includes("SKILL: frontal-messaging-templates"), "skill body missing");
  assert(/Ask Before Pitch/i.test(text), "the templates themselves are not in the prompt");
});

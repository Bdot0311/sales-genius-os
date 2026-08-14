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

Deno.test("the truncation budget drops the core skill before the routed one", () => {
  // Ordering matters: when the budget bites, the framework the caller asked for
  // has to survive and the general principles are what get cut.
  const names = skillsForGoal({ goal: "sequence" });
  assertEquals(names[names.length - 1], "b2b-cold-email-copywriting");
});

Deno.test("a tiny budget yields no skills rather than a truncated fragment", () => {
  assertEquals(composeSkillContext({ goal: "introduction", maxTokens: 1 }), "");
});

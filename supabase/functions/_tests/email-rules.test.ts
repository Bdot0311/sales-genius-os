// Unit tests for the consolidated writing rules.
// Run: deno test supabase/functions/_tests/email-rules.test.ts
//
// These rules previously existed in three copies — generate-email's prompt
// constants, cold-email-playbook's banned list, and a block the browser built
// and posted back to the server. Copies drift silently: a phrase banned in one
// and absent from another produces email that breaks a rule the codebase looks
// like it enforces. The list below is the union of what all three banned, and
// the first test is what stops a future edit from quietly dropping one.
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  BANNED_PHRASES,
  IMMUTABLE_EDIT_RULES,
  bannedPhrasesBlock,
  bannedPhrasesLine,
} from "../_shared/email-rules.ts";
import { PLAYBOOK_SYSTEM_RULES } from "../_shared/cold-email-playbook.ts";

/** Sampled from each of the three original copies, including entries unique to one. */
const HISTORICALLY_BANNED = [
  // common to all three
  "I noticed", "touching base", "circling back", "quick question",
  // generate-email only
  "I've been analyzing", "any update", "per my last email", "did you see my last email",
  // cold-email-playbook only
  "streamline", "optimize", "seamless", "supercharge",
  "in today's fast-paced world", "big fan", "best-in-class", "next-gen", "game-changing",
  // the browser copy
  "I hope this finds you", "I wanted to reach out", "as a leader in",
];

Deno.test("no phrase was dropped when the three copies were merged", () => {
  const missing = HISTORICALLY_BANNED.filter((p) => !BANNED_PHRASES.includes(p));
  assertEquals(missing, [], `these stopped being banned: ${missing.join(", ")}`);
});

Deno.test("the list has no duplicates", () => {
  const seen = new Set(BANNED_PHRASES.map((p) => p.toLowerCase()));
  assertEquals(seen.size, BANNED_PHRASES.length);
});

Deno.test("every phrase reaches both prompt renderings", () => {
  const block = bannedPhrasesBlock();
  const line = bannedPhrasesLine();
  for (const p of BANNED_PHRASES) {
    assert(block.includes(p), `"${p}" missing from the block form`);
    assert(line.includes(p), `"${p}" missing from the line form`);
  }
});

Deno.test("the agent playbook renders the shared list, not its own", () => {
  assert(PLAYBOOK_SYSTEM_RULES.includes("BANNED PHRASES:"));
  // An entry that only ever lived in generate-email proves the playbook is
  // reading the shared list rather than a private copy that happens to overlap.
  assert(PLAYBOOK_SYSTEM_RULES.includes("I've been analyzing"), "playbook is not on the shared list");
});

Deno.test("a precision edit cannot reintroduce a banned phrase", () => {
  // The edit path rewrites part of an existing draft, so it has to restate the
  // ban: otherwise fixing a readability complaint can put back wording the
  // original draft correctly avoided.
  assert(IMMUTABLE_EDIT_RULES.includes("BANNED PHRASES:"), "edit rules do not restate the ban");
  assert(/Do NOT introduce any banned phrase/i.test(IMMUTABLE_EDIT_RULES));
});

Deno.test("the edit rules keep the constraints that survived from the old client copy", () => {
  for (const rule of ["75 words", "Hi [FirstName],", "no subject line"]) {
    assert(IMMUTABLE_EDIT_RULES.includes(rule), `"${rule}" was lost`);
  }
});

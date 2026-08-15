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
  NO_PLACEHOLDER_RETRY,
  bannedPhrasesBlock,
  bannedPhrasesLine,
  findPlaceholders,
  hasPlaceholder,
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

// --- unfilled placeholders -------------------------------------------------
// The previous scrubber matched an allowlist of four words, so "[client name]"
// and "[Sender Name]" both reached real prospects. These are the exact strings
// that shipped.

Deno.test("catches the placeholders that actually shipped", () => {
  assert(hasPlaceholder("given hellogrowth's recent work with [client name] on ai outbound"));
  assert(hasPlaceholder("Want to see an example?\n\n[Sender Name]"));
});

Deno.test("catches brace and mustache forms too", () => {
  for (const t of ["Hi {{first_name}},", "at {company} you", "Hi {FirstName},"]) {
    assert(hasPlaceholder(t), `missed ${t}`);
  }
});

Deno.test("a clean email is not flagged", () => {
  for (const t of [
    "Hi Josiah,\n\nSaw your work on AI outbound. Worth a look?\n\nBrandon",
    "",
    "No brackets here at all.",
  ]) {
    assertEquals(hasPlaceholder(t), false, `false positive on: ${t.slice(0, 40)}`);
  }
});

Deno.test("an HTML body is left alone", () => {
  // Some send paths carry HTML. Eating a real tag would be a worse bug than the
  // one this fixes, so angle brackets are deliberately not matched.
  assertEquals(hasPlaceholder("<div><p>Hi Josiah,</p></div>"), false);
});

Deno.test("the offending tokens are reported, for logs and for the retry", () => {
  assertEquals(findPlaceholders("work with [client name] for {company}"), ["[client name]", "{company}"]);
});

Deno.test("the retry instruction says what to do instead of leaving a blank", () => {
  assert(/never write a bracketed/i.test(NO_PLACEHOLDER_RETRY));
  assert(/write around it/i.test(NO_PLACEHOLDER_RETRY));
});

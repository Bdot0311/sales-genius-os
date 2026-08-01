// Unit tests for the Phase 4 style-lint pass.
// Run: deno test supabase/functions/_tests/style-lint.test.ts
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { lintTouch } from "../_shared/style-lint.ts";

Deno.test("a clean touch passes", () => {
  const r = lintTouch("saw your q3 hiring", "you opened three sales roles last week. teams at that stage usually feel the ramp gap first. want the one-page playbook we use?");
  assertEquals(r.ok, true, r.violations.join("; "));
});

Deno.test("catches a seeded em-dash", () => {
  const r = lintTouch("quick note", "this is a clean line — with an em dash in it.");
  assert(r.violations.some((x) => x.includes("em-dash")));
});

Deno.test("catches a seeded 'just following up'", () => {
  const r = lintTouch("note", "just following up on my last note. worth a look?");
  assert(r.violations.some((x) => x.includes("just following up")));
});

Deno.test("catches exclamation points", () => {
  const r = lintTouch("hi", "this looks great! want to see more?");
  assert(r.violations.some((x) => x.includes("exclamation")));
});

Deno.test("catches more than one question", () => {
  const r = lintTouch("hi", "is this a fit? or should i send more? ");
  assert(r.violations.some((x) => x.includes("one question")));
});

Deno.test("catches 'not X but Y'", () => {
  const r = lintTouch("hi", "this is not about pricing but about time to value for your team.");
  assert(r.violations.some((x) => x.includes("not 'X' but Y") || x.includes("not X but Y")));
});

Deno.test("catches a triadic list", () => {
  const r = lintTouch("hi", "we help with sourcing, enrichment, and outreach for your team.");
  assert(r.violations.some((x) => x.includes("triadic")));
});

Deno.test("catches an over-length body", () => {
  const long = Array.from({ length: 95 }, (_, i) => `word${i}`).join(" ");
  const r = lintTouch("hi", long);
  assert(r.violations.some((x) => x.includes("under 90 words")));
});

Deno.test("catches a headline-length subject", () => {
  const r = lintTouch("this subject clearly has too many words", "short body here.");
  assert(r.violations.some((x) => x.includes("subject under")));
});

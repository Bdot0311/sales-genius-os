import { describe, expect, it } from "vitest";
import { signOffStartIndex } from "../../supabase/functions/_shared/email-rules.ts";

/**
 * The HTML formatter grouped a sign-off tightly only when it matched
 * "Best," / "Regards," / "Thanks," — the exact sign-offs the writing rules
 * forbid. The rule is sender-first-name-only, so nothing ever matched, and
 * "Brandon" / "Founder, BDØT Industries LLC" each rendered as their own
 * paragraph with a full gap. In Gmail that reads as floating fragments.
 */
const REAL_EMAIL = [
  "Hi Deepak,",
  "",
  "SaaSArmour's focus on enterprise LLM security is clear, especially with 10+ security teams in validation.",
  "",
  "Building predictable pipeline for specific enterprise buyers can be done without adding more headcount.",
  "",
  "Worth exploring how?",
  "",
  "Brandon",
  "",
  "Founder, BDØT Industries LLC",
  "",
  'PS: If this is completely off base, just reply "wrong armor" and I\'ll know.',
];

describe("the email that shipped", () => {
  it("finds the sign-off at the sender's name", () => {
    expect(REAL_EMAIL[signOffStartIndex(REAL_EMAIL)]).toBe("Brandon");
  });

  it("does not swallow the CTA into the signature", () => {
    // "Worth exploring how?" is the ask, not part of the sign-off.
    const i = signOffStartIndex(REAL_EMAIL);
    expect(REAL_EMAIL.slice(i).join(" ")).not.toContain("Worth exploring");
  });

  it("leaves the PS outside the block", () => {
    // A PS belongs after the signature, separated — that is how people write one.
    const i = signOffStartIndex(REAL_EMAIL);
    expect(i).toBeLessThan(REAL_EMAIL.length - 1);
    expect(REAL_EMAIL[i]).toBe("Brandon");
  });
});

describe("what counts as a sign-off", () => {
  it("handles a bare first name alone", () => {
    const lines = ["Hi Jane,", "", "Short body here.", "", "Brandon"];
    expect(signOffStartIndex(lines)).toBe(4);
  });

  it("handles name plus title", () => {
    const lines = ["Body.", "", "Brandon", "Founder, BDØT Industries LLC"];
    expect(signOffStartIndex(lines)).toBe(2);
  });

  it("still handles the classic sign-off words", () => {
    const lines = ["Body sentence here.", "", "Thanks", "Brandon"];
    expect(signOffStartIndex(lines)).toBe(2);
  });

  it("does not treat a closing sentence as a signature", () => {
    // Otherwise the last line of the body gets glued to nothing and the
    // paragraph spacing collapses where it should not.
    const lines = ["Hi Jane,", "", "I think this could genuinely help your team this quarter."];
    expect(signOffStartIndex(lines)).toBe(-1);
  });

  it("does not treat a question as a signature", () => {
    const lines = ["Hi Jane,", "", "Worth a quick look at how you do this today?"];
    expect(signOffStartIndex(lines)).toBe(-1);
  });

  it("copes with an empty body", () => {
    expect(signOffStartIndex([])).toBe(-1);
    expect(signOffStartIndex(["", "  "])).toBe(-1);
  });
});

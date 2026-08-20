import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { BANNED_PHRASES } from "../../supabase/functions/_shared/email-rules.ts";
import { skillsForGoal } from "../../supabase/functions/_shared/email-skills.ts";

const FOLLOWUP_FN = readFileSync(
  new URL("../../supabase/functions/generate-followup-suggestion/index.ts", import.meta.url),
  "utf8",
);

/**
 * The draft this file exists because of — produced by the follow-up path while
 * it carried its own private rules, no GTM skills, and no quality scoring.
 *
 * It breaks none of the constraints the product enforced at the time: under 60
 * words, three sentences, one question CTA, first-name sign-off, "you"
 * outnumbering "we". It is still unsendable, because every clause asserts a
 * benefit without naming the thing that produces it. That gap between "passes
 * the rules" and "worth sending" is the whole point of these tests.
 */
const REAL_SLOP_DRAFT = `Hi Justin,

Sent you a note last week about scaling customer activation without adding headcount. Your team's focus on verified outcomes for customers like Customer.io suggests you value clear ROI.

Outreign builds predictable pipeline without manual sales work, helping teams like yours drive efficiency. Worth comparing to your current process?

Brandon`;

const bannedHitsIn = (text: string): string[] => {
  const haystack = text.toLowerCase();
  return BANNED_PHRASES.filter((p) => haystack.includes(p.toLowerCase()));
};

describe("the filler class the old rules could not see", () => {
  it("now flags the draft that passed every structural rule", () => {
    const hits = bannedHitsIn(REAL_SLOP_DRAFT);
    expect(hits.length).toBeGreaterThan(0);
  });

  it("names each benefit-without-mechanism phrase in it", () => {
    const hits = bannedHitsIn(REAL_SLOP_DRAFT).map((h) => h.toLowerCase());
    for (const phrase of [
      "without adding headcount",
      "clear roi",
      "predictable pipeline",
      "without manual sales work",
      "teams like yours",
      "drive efficiency",
      "worth comparing",
    ]) {
      expect(hits, phrase).toContain(phrase);
    }
  });

  it("leaves ordinary specific copy alone", () => {
    // The point is to ban assertions with no mechanism, not to ban plain
    // English. A rule that trips on concrete sentences would push the model
    // toward vaguer copy, which is the opposite of the goal.
    const concrete = `Hi Justin,

You moved billing onto Stripe in March and still run dunning by hand.

The teams we see doing both end up rewriting the same retry logic twice. Want the two-page teardown of how they collapsed it?

Brandon`;
    expect(bannedHitsIn(concrete)).toEqual([]);
  });
});

describe("the follow-up function is wired to the shared rules", () => {
  it("imports the shared banned list rather than retyping a subset", () => {
    // It previously hand-typed nine of the fifty-three, so a phrase banned
    // everywhere else shipped freely from this one path.
    expect(FOLLOWUP_FN).toContain("_shared/email-rules.ts");
    expect(FOLLOWUP_FN).toContain("bannedPhrasesBlock");
  });

  it("injects the GTM skills", () => {
    expect(FOLLOWUP_FN).toContain("_shared/email-skills.ts");
    expect(FOLLOWUP_FN).toContain("composeSkillContext");
  });

  it("scores the draft and can rewrite it, like the agent does before sending", () => {
    expect(FOLLOWUP_FN).toContain("scoreEmail");
    expect(FOLLOWUP_FN).toContain("isWeak");
    expect(FOLLOWUP_FN).toContain("rubricFeedback");
  });

  it("blocks unfilled placeholders reaching a prospect", () => {
    expect(FOLLOWUP_FN).toContain("hasPlaceholder");
  });

  it("hands the model no finished sentences to copy", () => {
    // The old prompt supplied the opener verbatim ("Sent you a note last week
    // about X") and a menu of three literal CTAs, so every follow-up it wrote
    // opened and closed with those exact words. A prompt that contains the
    // sentence is a prompt that writes the email.
    expect(FOLLOWUP_FN).not.toContain("Sent you a note last week");
    expect(FOLLOWUP_FN).not.toContain("Still open to a quick look?");
    expect(FOLLOWUP_FN).not.toContain("Worth another look?");
  });

  it("never signs off with the lead's name", () => {
    // Both old fallback drafts signed `leadName.split(' ')[0]`, so a follow-up
    // to Justin was signed "Justin".
    expect(FOLLOWUP_FN).not.toMatch(/leadName\.split\([^)]*\)\[0\]}\s*`?\s*,?\s*$/m);
    expect(FOLLOWUP_FN).toContain("senderFirstName");
  });
});

describe("skill routing for this goal", () => {
  it("routes follow-ups to sequence-position material, not first-touch shapes", () => {
    const picked = skillsForGoal({ goal: "follow-up" });
    expect(picked).toContain("cold-email-4-sequence");
    expect(picked).toContain("b2b-cold-email-copywriting");
  });
});

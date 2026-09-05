import { describe, expect, it } from "vitest";
import { findUnverifiedClaims } from "../../supabase/functions/_shared/email-rules.ts";

/**
 * A published cold-email teardown used this as its example of a bad email:
 *
 *   "Our clients typically see significant audience growth and stronger
 *    founder branding within a few months."
 *
 * Running it through our own checkers found the banned openers ("I came
 * across", "leverage") and reported NO unverified claims — while the sentence
 * asserts a customer result with no number and no named customer, which is
 * exactly what findUnverifiedClaims exists to stop.
 *
 * The pattern required the magnitude word and the outcome noun to be adjacent
 * ("significant growth"). One modifier between them — "significant AUDIENCE
 * growth" — was enough to walk straight past it.
 */
describe("a magnitude claim survives a word in the middle", () => {
  const claims = (t: string) => findUnverifiedClaims(t, "");

  it("catches the sentence that slipped through", () => {
    expect(claims("Our clients typically see significant audience growth."))
      .toContain("significant audience growth");
  });

  it("catches the same shape with other nouns between", () => {
    expect(claims("a substantial pipeline improvement")).not.toEqual([]);
    expect(claims("dramatic reply-rate lift")).not.toEqual([]);
    expect(claims("considerable inbound revenue increase")).not.toEqual([]);
  });

  it("still catches the adjacent form it always caught", () => {
    expect(claims("a significant increase in meetings")).not.toEqual([]);
    expect(claims("a meaningful boost")).not.toEqual([]);
  });

  it("catches a bare unbacked result, which reads as proof and is not", () => {
    expect(claims("clients see significant results")).not.toEqual([]);
    expect(claims("substantial ROI")).not.toEqual([]);
  });

  it("does not fire across a sentence break", () => {
    // Punctuation ends the run of intervening words, so a magnitude word in
    // one clause cannot bind to an outcome noun in the next.
    expect(claims("The change was significant, and growth followed later.")).toEqual([]);
  });

  it("does not fire on a magnitude word with no outcome noun near it", () => {
    expect(claims("a significant amount of time on manual research")).toEqual([]);
    expect(claims("significant experience in this space")).toEqual([]);
  });

  it("leaves a claim the sender can actually back", () => {
    // A figure the verified proof supports is not a fabrication.
    expect(findUnverifiedClaims("a 47% increase in replies", "47% increase in replies")).toEqual([]);
  });

  it("still catches the comparative form", () => {
    expect(claims("significantly more relevant replies")).not.toEqual([]);
  });
});

/**
 * The rest of that same example, as a record of what the product already did
 * catch before this change — so a regression in the banned list shows up here
 * rather than in someone's inbox.
 */
describe("the rest of the teardown's example email", () => {
  const BAD = [
    "I came across your company and was really impressed by the momentum your team is building.",
    "We help startups leverage AI-powered LinkedIn content strategies.",
    "Our clients typically see significant audience growth within a few months.",
  ].join("\n");

  it("flags the generic opener and the filler verb", async () => {
    const { BANNED_PHRASES } = await import("../../supabase/functions/_shared/email-rules.ts");
    const lower = BAD.toLowerCase();
    const hit = BANNED_PHRASES.filter((p) => lower.includes(p.toLowerCase()));
    expect(hit).toContain("I came across");
    expect(hit).toContain("leverage");
  });

  it("and now flags the unbacked result too", () => {
    expect(findUnverifiedClaims(BAD, "")).not.toEqual([]);
  });
});

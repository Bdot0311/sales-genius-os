import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { findMirrorAnalogies, groundingTerms, isGroundedIn } from "../../supabase/functions/_shared/email-rules.ts";

/**
 * Both of these went to real prospects. The research step had already returned
 * "5 findings, 98/100 strong, high confidence" — and the drafts used none of it.
 */
const REAL_FACTS = [
  "Raisi automates personalized investor outreach for early-stage founders",
  "They are hiring a Head of Growth in New York",
  "Their pricing page lists a Series A tier at $499/month",
];
const EXCLUDE = ["Raisi", "Bryan Yankton"];

describe("the drafts that got no replies", () => {
  const terms = groundingTerms(REAL_FACTS, EXCLUDE);

  it("rejects the Customer.io draft as ungrounded", () => {
    const body =
      "Sent you a note last week about scaling customer activation without adding headcount. " +
      "Your team's focus on verified outcomes suggests you value clear ROI. " +
      "Outreign builds predictable pipeline without manual sales work, helping teams like yours drive efficiency. " +
      "Worth comparing to your current process?";
    expect(isGroundedIn(body, terms)).toBe(false);
  });

  it("catches the mirror analogy, which grounding alone does not", () => {
    // "like Raisi scales investor outreach" DOES cite a researched fact, so it
    // passes grounding. It still carries no insight — the reader learns nothing
    // about their own company. Grounding is a floor; this sits above it.
    const body =
      "Sent you a note last week about scaling your sales outreach like Raisi scales investor outreach. " +
      "We help sales teams turn cold leads into booked calls faster. Worth comparing to your current process?";
    expect(isGroundedIn(body, terms)).toBe(true);
    expect(findMirrorAnalogies(body)).not.toHaveLength(0);
  });

  it("leaves a real observation alone", () => {
    const body = "You are hiring a Head of Growth in New York. Worth a look at how that hand-off usually goes?";
    expect(findMirrorAnalogies(body)).toHaveLength(0);
  });

  it("accepts a draft that opens on something only true of this prospect", () => {
    const body =
      "You are hiring a Head of Growth in New York, which usually means the founder is still " +
      "running outbound personally. Worth a look at how that hand-off normally goes?";
    expect(isGroundedIn(body, terms)).toBe(true);
  });

  it("accepts a draft that cites a concrete detail", () => {
    const body = "Saw the Series A tier on your pricing page. Curious how you handle that segment today?";
    expect(isGroundedIn(body, terms)).toBe(true);
  });
});

describe("what counts as evidence", () => {
  it("does not treat the company or contact name as grounding", () => {
    // Otherwise an email that only says the company name back would pass.
    const terms = groundingTerms(["Acme builds warehouse robots"], ["Acme", "Jane Doe"]);
    expect(terms).not.toContain("acme");
    expect(isGroundedIn("Hi Jane, quick one about Acme.", terms)).toBe(false);
  });

  it("does not treat generic B2B vocabulary as grounding", () => {
    const terms = groundingTerms(["They help sales teams improve pipeline and revenue growth"]);
    // Every one of those words appears in copy aimed at anyone.
    expect(terms).toHaveLength(0);
  });

  it("keeps proper nouns, products and figures", () => {
    const terms = groundingTerms(["Migrated to Snowflake and posted a $2.5M seed round"]);
    expect(terms).toContain("snowflake");
    expect(terms.some((t) => t.includes("2.5"))).toBe(true);
  });

  it("passes anything when the research found nothing, rather than blocking", () => {
    // Thin research is already handled upstream; this must not double-punish it.
    expect(isGroundedIn("any body at all", [])).toBe(true);
  });

  it("matches on whole words only", () => {
    const terms = groundingTerms(["They use Retool internally"]);
    expect(isGroundedIn("we retooled our process", terms)).toBe(false);
    expect(isGroundedIn("saw you run Retool internally", terms)).toBe(true);
  });
});

describe("the generator acts on it", () => {
  const GEN = readFileSync(
    new URL("../../supabase/functions/generate-email/index.ts", import.meta.url),
    "utf8",
  );

  it("checks the draft against the research it was handed", () => {
    expect(GEN).toContain("isGroundedIn(email, groundTerms)");
    expect(GEN).toContain("findMirrorAnalogies(email)");
  });

  it("only enforces it when the research was worth using", () => {
    // Thin research is handled upstream; punishing it twice pushes copy vaguer.
    expect(GEN).toContain("safe_to_personalize !== false");
    expect(GEN).toContain("groundTerms.length > 0 &&");
  });

  it("excludes the company and contact name from what counts as evidence", () => {
    expect(GEN).toContain("[lead?.company_name ?? '', lead?.contact_name ?? '']");
  });

  it("only accepts a rewrite that is better on every axis already guarded", () => {
    // A sharper email carrying a new placeholder or invented metric is not
    // an improvement.
    expect(GEN).toContain("const secondOk =");
    expect(GEN).toContain("!hasPlaceholder(second)");
    expect(GEN).toContain("!findUnverifiedClaims(second, proofForClaims).length");
    expect(GEN).toContain("!findMirrorAnalogies(second).length");
  });

  it("keeps the original when the rewrite is worse, rather than shipping it", () => {
    expect(GEN).toContain("specificity rewrite rejected, keeping original");
  });
});

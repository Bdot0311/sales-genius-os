import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

/**
 * A user received auto-generated drafts signed "Founder, OutReign" because the
 * generator defaulted sender_company to the platform's own brand when their
 * profile carried no company. Every account writes as its own business — the
 * platform name must never appear in a user's draft.
 */
const RULES = readFileSync("supabase/functions/_shared/email-rules.ts", "utf8");
const GEN = readFileSync("supabase/functions/generate-email/index.ts", "utf8");

describe("platform brand containment", () => {
  it("never falls back to the platform name for sender_company", () => {
    expect(GEN).not.toContain("businessDescription.split(/[\\s\\n]/)[0] : 'OutReign'");
    expect(GEN).toContain("resolvedSenderCompany");
  });

  it("resolves the signature company from the sender's own profile", () => {
    expect(GEN).toContain(".from('profiles').select('company_name')");
  });

  it("scrubs platform brand from the finished draft", () => {
    expect(GEN).toContain("findPlatformBrandLeaks(email, resolvedSenderCompany)");
    expect(GEN).toContain("stripPlatformBrand(email, resolvedSenderCompany)");
  });

  it("tells the model never to name the software it runs inside", () => {
    expect(RULES).toContain("NO_PLATFORM_BRAND_RULE");
    expect(GEN).toContain("systemPrompt + NO_PLATFORM_BRAND_RULE");
  });

  it("does not name the platform inside the generation prompt", () => {
    const promptRegion = GEN.slice(0, GEN.indexOf("serve("));
    expect(promptRegion.toLowerCase()).not.toContain("outreign outreach studio");
  });
});

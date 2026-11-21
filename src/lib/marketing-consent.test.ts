import { describe, expect, it } from "vitest";
import { hasMarketingConsent, marketingConsentRecord } from "./marketing-consent";

describe("optional onboarding marketing consent", () => {
  it("does not opt existing users in without an explicit preference", () => {
    expect(hasMarketingConsent(undefined)).toBe(false);
    expect(hasMarketingConsent({})).toBe(false);
    expect(hasMarketingConsent({ marketing_email_consent: { opted_in: "true" } })).toBe(false);
  });
  it("keeps an unchecked choice opted out", () => {
    expect(hasMarketingConsent({ marketing_email_consent: marketingConsentRecord(false, "2026-11-21T04:20:00Z") })).toBe(false);
  });
  it("records an explicit opt-in with its source, date and scope", () => {
    const record = marketingConsentRecord(true, "2026-11-21T04:20:00Z");
    expect(hasMarketingConsent({ marketing_email_consent: record })).toBe(true);
    expect(record).toEqual({ opted_in: true, recorded_at: "2026-11-21T04:20:00Z", source: "onboarding", version: "2026-11-21", scope: ["promotions", "product_updates", "blog_newsletters"] });
  });
});
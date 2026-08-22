import { describe, expect, it } from "vitest";
import { findPlatformBrandLeaks, stripPlatformBrand } from "../../supabase/functions/_shared/email-rules.ts";

describe("stripPlatformBrand", () => {
  it("drops a platform signature line", () => {
    const out = stripPlatformBrand("Hi Sam,\n\nbody\n\nBrandon\nFounder, OutReign\n", "");
    expect(out).not.toMatch(/outreign/i);
    expect(out).toContain("Brandon");
  });
  it("rewrites to the sender's company", () => {
    expect(stripPlatformBrand("Brandon\nFounder, OutReign", "Acme Labs")).toContain("Founder, Acme Labs");
  });
  it("leaves our own staff alone", () => {
    expect(findPlatformBrandLeaks("Founder, OutReign", "OutReign")).toEqual([]);
  });
  it("replaces inline mentions", () => {
    expect(stripPlatformBrand("SalesOS already runs this.", "Acme")).toBe("Acme already runs this.");
  });
});

import { describe, expect, it } from "vitest";
import { releasableFirstTouch } from "../../supabase/functions/_shared/first-touch-fallback";

describe("releasable first-touch fallback", () => {
  it("copies the approved sentence verbatim between greeting, one ask and sender", () => {
    expect(releasableFirstTouch({ firstName: "Brandon", fact: "BDOT builds outbound tools.", senderName: "Sam" }))
      .toBe("Hi Brandon,\n\nBDOT builds outbound tools.\n\nWorth a look?\n\nSam");
  });
  it("terminates an unpunctuated fact instead of rewriting it", () => {
    expect(releasableFirstTouch({ firstName: "Ana", fact: "Acme ships weekly", senderName: "Sam" }))
      .toContain("\n\nAcme ships weekly.\n\n");
  });
});

import { usableFallbackFact } from "../../supabase/functions/_shared/first-touch-fallback";
describe("usable fallback fact", () => {
  it("rejects markdown links and headings scraped from a site", () => {
    expect(usableFallbackFact("[Outreign](https://outreign.io/) Enterprise GTM infrastructure")).toBe(false);
    expect(usableFallbackFact("# 404 Oops! Page not found")).toBe(false);
  });
  it("accepts a plain sentence from the prospect's own site", () => {
    expect(usableFallbackFact("BDOT Industries builds the systems that find B2B buyers and start the conversation.")).toBe(true);
  });
});

import { fallbackSubjectFrom } from "../../supabase/functions/_shared/first-touch-fallback";
describe("fallback subject", () => {
  it("uses the first six words of the approved sentence", () => {
    expect(fallbackSubjectFrom("Acme builds the systems that find B2B buyers fast.")).toBe("Acme builds the systems that find");
  });
});

import { dropRepeatedLead } from "../../supabase/functions/_shared/evidence-contract";
describe("scraped sentence cleanup", () => {
  it("drops a logo name that runs into the same heading", () => {
    expect(dropRepeatedLead("BDØT Industries BDØT Industries builds and operates the systems."))
      .toBe("BDØT Industries builds and operates the systems.");
  });
  it("leaves a normal sentence alone", () => {
    expect(dropRepeatedLead("Acme builds payroll tools for small teams.")).toBe("Acme builds payroll tools for small teams.");
  });
});

import { bodyViolations } from "../../supabase/functions/_shared/evidence-contract";
describe("sign-off line", () => {
  const decision = {
    status: "ready" as const, reason: "", evidenceId: "e", conflicts: [],
    facts: [{ id: "f1", role: "prospect_page", span: "Acme builds payroll tools for small teams." }],
  } as unknown as Parameters<typeof bodyViolations>[1];
  const body = (signoff: string) => `Hi Ana,\n\nAcme builds payroll tools for small teams.\n\nWorth a look?\n\n${signoff}`;
  it("accepts the sender's first name as the sign-off", () => {
    expect(bodyViolations(body("Brandon"), decision, "Brandon Yakubov")).toEqual([]);
  });
  it("still rejects a sign-off that is someone else", () => {
    expect(bodyViolations(body("Maria"), decision, "Brandon Yakubov")).toContain("Maria");
  });
});

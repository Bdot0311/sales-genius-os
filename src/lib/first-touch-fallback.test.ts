import { describe, expect, it } from "vitest";
import { alignGreeting, releasableFirstTouch, repairDraftVoice } from "../../supabase/functions/_shared/first-touch-fallback";

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

describe("greeting and first-person prospect copy", () => {
  const fact = "In fact I was invited to speak on the AI in Proxy Voting panel at the Vanguard conference.";

  it("greets the lead when the draft greeted the sender", () => {
    expect(alignGreeting("Hi Brandon,\n\nHello there.\n\nBrandon", "Nicolaas", "Brandon Yakubov"))
      .toBe("Hi Nicolaas,\n\nHello there.\n\nBrandon");
  });

  it("leaves a greeting that already names the lead", () => {
    const body = `Hi Nicolaas,\n\n${fact}\n\nHow are you handling follow-up?\n\nBrandon Yakubov`;
    expect(alignGreeting(body, "Nicolaas", "Brandon Yakubov")).toBe(body);
  });

  it("attributes the prospect's invitation instead of leaving it as the sender's", () => {
    const body = `Hi Nicolaas,\n\n${fact}\n\nHow are you handling follow-up?\n\nBrandon Yakubov`;
    const repaired = repairDraftVoice(body, [{ span: fact, role: "prospect_page" }], "Proxywise AI", "Nicolaas", "Brandon Yakubov");
    expect(repaired).toContain("Hi Nicolaas,");
    expect(repaired).toContain('Saw this on Proxywise AI\'s site: "In fact I was invited to speak');
    expect(repaired).toContain("Brandon Yakubov");
    expect(repaired).not.toMatch(/^In fact I was invited/m);
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

import { observationLine } from "../../supabase/functions/_shared/first-touch-fallback";
import { unattributed } from "../../supabase/functions/_shared/evidence-contract";
describe("attributed observation", () => {
  it("quotes a prospect's own site copy instead of presenting it as the sender's line", () => {
    const line = observationLine({ span: "AI agents, MVPs, and custom platforms, shipped on the timeline we actually quoted you.", role: "prospect_page" }, "Kodexo Labs");
    expect(line).toBe('Saw this on Kodexo Labs\'s site: "AI agents, MVPs, and custom platforms, shipped on the timeline we actually quoted you."');
    expect(unattributed(line, "Kodexo Labs")).toBe("AI agents, MVPs, and custom platforms, shipped on the timeline we actually quoted you.");
  });
});

import { lineGrounding } from "../../supabase/functions/_shared/evidence-contract";
describe("skill-shaped lines", () => {
  const facts = ["Kodexo builds AI agents and MVPs for startups."];
  it("allows a role-based question", () => {
    expect(lineGrounding("How are you keeping delivery dates realistic as new projects come in?", facts, "We help agencies find buyers.", "Kodexo")).not.toBeNull();
  });
  it("allows a segment-level pattern", () => {
    expect(lineGrounding("Dev shops at this stage usually rely on referrals for new work.", facts, "We help agencies find buyers.", "Kodexo")).not.toBeNull();
  });
  it("still blocks an invented result", () => {
    expect(lineGrounding("We helped a client book 40 meetings in 30 days.", facts, "We help agencies find buyers.", "Kodexo")).toBeNull();
  });
});

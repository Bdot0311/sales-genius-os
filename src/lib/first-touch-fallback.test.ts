import { describe, expect, it } from "vitest";
import { alignGreeting, releasableFirstTouch, repairDraftVoice, thinLeadDraft, voiceSafeObservation } from "../../supabase/functions/_shared/first-touch-fallback";

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

describe("thin research uses only the lead record", () => {
  it("states the role, company, and industry, and one question", () => {
    const draft = thinLeadDraft({
      firstName: "Nicolaas",
      senderName: "Brandon Yakubov",
      company: "Proxywise AI",
      role: "Head of Sales",
      industry: "proxy voting",
    });
    expect(draft.body).toContain("Hi Nicolaas,");
    expect(draft.body).toContain("Proxywise AI");
    expect(draft.body).toContain("Head of Sales");
    expect(draft.body).toContain("proxy voting");
    expect(draft.body.match(/\?/g)).toHaveLength(1);
    expect(draft.body).not.toMatch(/IPO|Vanguard|NYSE|panel|conference|invited to speak/i);
    expect(draft.body.trim().endsWith("Brandon Yakubov")).toBe(true);
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

  it("attributes a first-person line from their own site, and not from Parallel", () => {
    const fact = "In fact I was invited to speak on the AI in Proxy Voting panel at the Vanguard conference.";
    const own = voiceSafeObservation({ span: fact, role: "prospect_page", provider: "firecrawl" }, "Proxywise AI");
    expect(own).toContain("Saw this on Proxywise AI's site:");
    const outside = voiceSafeObservation({ span: fact, role: "external", provider: "parallel" }, "Proxywise AI");
    expect(outside).toContain("A published account said:");
    expect(outside).not.toMatch(/site:/i);
    const repaired = repairDraftVoice(
      `Hi Nicolaas,\n\n${fact}\n\nHow are you handling follow-up?\n\nBrandon Yakubov`,
      [{ span: fact, role: "external", provider: "context_dev" }],
      "Proxywise AI",
      "Nicolaas",
      "Brandon Yakubov",
    );
    expect(repaired).toContain("A published account said:");
    expect(repaired).not.toMatch(/on Proxywise AI's site/i);
  });

  /**
   * Attribution used to depend on the sentence sounding stolen.
   *
   * It fired only on an "I"/"we" beside "was invited" or "spoke", so every
   * other outside sentence was quoted bare under the sender's name: a
   * magazine's editorial voice, a founder's post about anything else, a
   * write-up in the first person plural. The rule is not which outside
   * sentences sound stolen -- it is that an outside sentence is not the
   * sender's to say.
   */
  it("attributes every outside sentence, not only the ones that sound stolen", () => {
    for (const span of [
      "Proxywise AI raised a Series A to automate proxy voting research for institutional investors.",
      "The company was named to the Fintech 50 list for its proxy voting automation.",
      "We sat down with the founders to hear where the product is going next.",
    ]) {
      for (const provider of ["parallel", "context_dev"] as const) {
        const line = voiceSafeObservation({ span, role: "external", provider }, "Proxywise AI");
        expect(line, `${provider}: ${span}`).toContain("A published account said:");
        expect(line, span).toContain(span);
      }
    }
  });

  it("still lets the company describe itself on its own site", () => {
    const span = "Proxywise AI automates proxy voting research for institutional investors.";
    for (const provider of ["firecrawl", "site"] as const) {
      const line = voiceSafeObservation({ span, role: "prospect_page", provider }, "Proxywise AI");
      expect(line, provider).toContain("Saw this on Proxywise AI's site:");
      expect(line, provider).not.toContain("A published account said:");
    }
  });

  it("does not invent a site it cannot name", () => {
    // No company to attribute to: the sentence is still theirs, so claiming
    // "their site" would be the invention this is here to prevent.
    const span = "Proxywise AI automates proxy voting research for institutional investors.";
    const line = voiceSafeObservation({ span, role: "prospect_page", provider: "firecrawl" }, "");
    expect(line).not.toMatch(/site:/i);
    expect(line).not.toContain("A published account said:");
  });

  it("keeps the attribution one the claim checker can strip", () => {
    /*
     * The prefix is not decoration. unattributed() strips exactly this form,
     * which is how the quote still matches the approved fact and still counts
     * as the one sourced observation. A reworded prefix would release as an
     * unsourced line instead.
     */
    const span = "Proxywise AI raised a Series A to automate proxy voting research.";
    const line = voiceSafeObservation({ span, role: "external", provider: "parallel" }, "Proxywise AI");
    expect(unattributed(line, "Proxywise AI").replace(/\.$/, "")).toBe(span.replace(/\.$/, ""));
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

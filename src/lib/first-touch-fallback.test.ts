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
  /*
   * This test used to require the body to CONTAIN the company, the role and
   * the industry, which is how "You're on file at Siftly (YCW22), as Founder
   * & CEO, in Software Development." came to be the shipped copy -- the test
   * was holding it in place. Reciting a reader's own record at them carries
   * no information and reads as a merge, so those three assertions are gone
   * on purpose. See src/lib/thin-lead-draft.test.ts for the replacement.
   *
   * What still matters is here: it uses nothing but the record, asks exactly
   * one question, and signs off as the sender.
   */
  it("invents nothing, asks one question, and signs off", () => {
    const draft = thinLeadDraft({
      firstName: "Nicolaas",
      senderName: "Brandon Yakubov",
      company: "Proxywise AI",
      role: "Head of Sales",
      industry: "proxy voting",
    });
    expect(draft.body).toContain("Hi Nicolaas,");
    expect(draft.body.match(/\?/g)).toHaveLength(1);
    expect(draft.body).not.toMatch(/IPO|Vanguard|NYSE|panel|conference|invited to speak/i);
    expect(draft.body.trim().endsWith("Brandon Yakubov")).toBe(true);
    // The company still has to reach the reader somewhere, or the email could
    // have been addressed to anybody.
    expect(`${draft.subject} ${draft.body}`).toContain("Proxywise AI");
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
    // An outside sentence names where it was read, so the reader can place it.
    const outside = voiceSafeObservation(
      { span: fact, role: "external", provider: "parallel", sourceUrl: "https://www.institutionalinvestor.com/x" },
      "Proxywise AI",
    );
    expect(outside).toContain('Saw this on institutionalinvestor.com: "');
    expect(outside).not.toMatch(/Proxywise AI's site/i);
    const repaired = repairDraftVoice(
      `Hi Nicolaas,\n\n${fact}\n\nHow are you handling follow-up?\n\nBrandon Yakubov`,
      [{ span: fact, role: "external", provider: "context_dev", sourceUrl: "https://news.example.com/a" }],
      "Proxywise AI",
      "Nicolaas",
      "Brandon Yakubov",
    );
    expect(repaired).toContain('Saw this on news.example.com: "');
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
        const line = voiceSafeObservation(
          { span, role: "external", provider, sourceUrl: "https://www.techcrunch.com/post" },
          "Proxywise AI",
        );
        expect(line, `${provider}: ${span}`).toContain('Saw this on techcrunch.com: "');
        expect(line, span).toContain(span);
      }
    }
  });

  it("still lets the company describe itself on its own site", () => {
    const span = "Proxywise AI automates proxy voting research for institutional investors.";
    for (const provider of ["firecrawl", "site"] as const) {
      const line = voiceSafeObservation({ span, role: "prospect_page", provider }, "Proxywise AI");
      expect(line, provider).toContain("Saw this on Proxywise AI's site:");
      expect(line, provider).not.toMatch(/write-up/i);
    }
  });

  it("does not invent a site it cannot name", () => {
    // No company to attribute to: the sentence is still theirs, so claiming
    // "their site" would be the invention this is here to prevent.
    const span = "Proxywise AI automates proxy voting research for institutional investors.";
    const line = voiceSafeObservation({ span, role: "prospect_page", provider: "firecrawl" }, "");
    expect(line).not.toMatch(/site:/i);
    expect(line).not.toMatch(/write-up/i);
  });

  it("keeps the attribution one the claim checker can strip", () => {
    /*
     * The prefix is not decoration. unattributed() strips exactly this form,
     * which is how the quote still matches the approved fact and still counts
     * as the one sourced observation. A reworded prefix would release as an
     * unsourced line instead.
     */
    const span = "Proxywise AI raised a Series A to automate proxy voting research.";
    for (const sourceUrl of ["https://www.techcrunch.com/post", null]) {
      const line = voiceSafeObservation({ span, role: "external", provider: "parallel", sourceUrl }, "Proxywise AI");
      expect(unattributed(line, "Proxywise AI").replace(/\.$/, ""), line).toBe(span.replace(/\.$/, ""));
    }
    // The wording that shipped before the source was named is still stripped,
    // because drafts written then are still in the database.
    expect(unattributed(`A published account said: "${span}"`, "Proxywise AI")).toBe(span);
  });

  it("the attributed quote is still the one sourced observation", () => {
    /*
     * The attribution is not decoration, and it is not free either: the line
     * goes through specificsGrounded before anything strips it, and then has
     * to match an approved fact exactly to count as the observation. If the
     * prefix were a wording nobody taught the checkers, the draft would be
     * refused as an unsourced line with no observation at all -- which is
     * worse than the bug it replaced, because it fails every draft instead of
     * mis-attributing some.
     */
    const span = "Proxywise AI raised a Series A to automate proxy voting research for institutional investors.";
    const facts = [{
      id: "f1", snapshotId: "s1", span, sourceUrl: "https://www.techcrunch.com/x",
      retrievedAt: new Date().toISOString(), publishedAt: null, role: "external", provider: "parallel",
    }] as unknown as Parameters<typeof bodyViolations>[1]["facts"];
    const line = voiceSafeObservation(facts[0], "Proxywise AI");
    expect(line).toBe(`Saw this on techcrunch.com: "${span}"`);
    const body = `Hi Nicolaas,\n\n${line}\n\nHow are you finding decision makers worth reaching out to?\n\nBrandon`;
    const sender = "OutReign finds decision makers, verifies their email, researches each company and writes cold outreach that cites a real fact from their site.";
    expect(bodyViolations(
      body,
      { status: "ready", reason: "", evidenceId: "e", facts, conflicts: [] } as never,
      "Brandon", "Proxywise AI raised a Series", "Proxywise AI", "first_touch", sender,
    )).toEqual([]);
    // And the rule that wants a mechanism after a noticed line knows the
    // attribution names a source rather than an unbacked trigger.
    expect(outboundGateFindings("Proxywise AI raised a Series", body, span, 0).map((f) => f.rule)).toEqual([]);
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

import { fallbackSubjectFrom, usableSubject } from "../../supabase/functions/_shared/first-touch-fallback";
import { subjectGrounded } from "../../supabase/functions/_shared/evidence-contract";
describe("fallback subject", () => {
  it("uses a complete topic instead of chopping a sentence at six words", () => {
    /*
     * Was asserting "systems at Acme" on "Acme builds the systems that find
     * B2B buyers fast." -- complete, but "systems" names a category and not a
     * topic, so the subject said less than the company name alone. That case
     * moved to "a category word is not a topic" below; what this test is for
     * is the chop, so the span now carries a real object.
     */
    expect(fallbackSubjectFrom("Acme builds payroll reconciliation that finds B2B buyers fast.", "Acme"))
      .toBe("payroll reconciliation at Acme");
  });
  it("does not copy an unrelated congratulation into Navwise's subject", () => {
    expect(fallbackSubjectFrom("Congratulations to Athlete , ButFor on the launch.", "Navwise")).toBe("Navwise");
  });
  it("does not end Skyvern's subject in the middle of a clause", () => {
    expect(fallbackSubjectFrom("Skyvern automates these workflows natively in the browser.", "Skyvern")).toBe("Skyvern");
    expect(usableSubject("Skyvern automates these workflows natively in")).toBe(false);
  });
  it("rejects incomplete scraped subjects and false reply prefixes", () => {
    for (const subject of ["Congratulations to Athlete , ButFor", "Acme builds the systems that find", "Re: outbound", "payroll for"]) {
      expect(usableSubject(subject), subject).toBe(false);
    }
    expect(usableSubject("browser workflows at Skyvern")).toBe(true);
  });
  /*
   * Two subject lines that reached prospects:
   *
   *   "software at Unstack"
   *   "way at monar"
   *
   * Both are the object noun phrase, extracted correctly, from a sentence
   * that was quoted accurately. Grounding was never the problem.
   */
  it("falls back to the company when a category word is all the object says", () => {
    /*
     * Every company in the inbox builds software. "software at Unstack" tells
     * the reader strictly less than "Unstack" does, so the company wins.
     */
    const contentless: [string, string][] = [
      ["Unstack builds software for marketing teams.", "Unstack"],
      ["Unstack provides software to teams.", "Unstack"],
      ["Siftly offers a platform for data teams.", "Siftly"],
      ["Lumen delivers solutions to enterprises.", "Lumen"],
      ["Orbital creates tools for warehouse robotics.", "Orbital"],
      ["Mosaic sells powerful tools to agencies.", "Mosaic"],
    ];
    for (const [span, company] of contentless) {
      expect(fallbackSubjectFrom(span, company), span).toBe(company);
    }
  });

  it("keeps a category word that a real topic is built on", () => {
    // The head noun may be generic as long as something names the subject.
    expect(fallbackSubjectFrom("Siftly offers a data platform for finance teams.", "Siftly"))
      .toBe("data platform at Siftly");
    expect(fallbackSubjectFrom("Proxywise builds proxy voting infrastructure for asset managers.", "Proxywise"))
      .toBe("proxy voting infrastructure at Proxywise");
    expect(fallbackSubjectFrom("Orbital creates warehouse robotics for grocers.", "Orbital"))
      .toBe("warehouse robotics at Orbital");
    expect(fallbackSubjectFrom("Keasy automates payroll for restaurants.", "Keasy")).toBe("payroll at Keasy");
  });

  it("never reads a manner clause as the thing being built", () => {
    /*
     * "monar builds the way teams close deals" -- what follows "the way" is
     * how, not what, so the object comes out a fragment. There is nothing to
     * repair: the sentence names no topic.
     */
    expect(fallbackSubjectFrom("monar builds the way teams close deals.", "monar")).toBe("monar");
    expect(fallbackSubjectFrom("monar builds a better way to manage payroll.", "monar")).toBe("monar");
    expect(fallbackSubjectFrom("Acme develops a new approach that wins deals.", "Acme")).toBe("Acme");
  });

  it("asks a question when there is no company and nothing short to quote", () => {
    // Was "your work", which read as the tail of an unfinished sentence.
    expect(fallbackSubjectFrom("We build the way modern finance teams work.", "")).toBe("Quick question");
  });

  it("keeps complete noun topics within the unchanged grounding rule", () => {
    const span = "Skyvern automates browser workflows for teams.";
    const subject = fallbackSubjectFrom(span, "Skyvern");
    expect(subject).toBe("browser workflows at Skyvern");
    expect(subjectGrounded(subject, [span], "", "Skyvern")).toBe(true);
    expect(subjectGrounded("$500 million funding", [span], "", "Skyvern")).toBe(false);
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
import { outboundGateFindings } from "../../supabase/functions/_shared/quality-gate";
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

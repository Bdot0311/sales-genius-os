import { afterEach, describe, expect, it } from "vitest";
import { composeSkillContext } from "../../supabase/functions/_shared/email-skills";
import { outboundGateFindings } from "../../supabase/functions/_shared/quality-gate";
import { scoreEmailReport } from "../../supabase/functions/_shared/email-quality";
import { releaseAllows } from "../../supabase/functions/_shared/draft-release";
import {
  bindClaim,
  bodyViolations,
  evaluateStoredSnapshots,
  matchesClaim,
  releaseBinding,
  sealSnapshot,
  youForm,
  POLICY_VERSION,
} from "../../supabase/functions/_shared/evidence-contract";

const NOW = "2026-11-07T12:00:00.000Z";
const USER = "11111111-1111-4111-8111-111111111111";
const LEAD = "22222222-2222-4222-8222-222222222222";

function ready(excerpt: string) {
  const snap = sealSnapshot({
    userId: USER,
    leadId: LEAD,
    provider: "site",
    role: "prospect_page",
    requestedUrl: "https://tf.example/",
    finalUrl: "https://tf.example/",
    pageStatus: 200,
    excerpt,
    retrievedAt: NOW,
    publishedAt: null,
    providerOk: true,
    partial: false,
    fromCache: false,
  });
  return evaluateStoredSnapshots({
    userId: USER,
    leadId: LEAD,
    company: "TF Business Solutions",
    websiteHost: "tf.example",
    now: NOW,
    stored: [snap],
  });
}

const HIRE = "TF Business Solutions hires freight brokers for shippers across the region.";
const BUILD = "We build MVPs for VC-backed startups in 8 to 12 weeks.";

function email(lines: string[]): string {
  return lines.join("\n");
}

describe("a claim keeps its actor, verb, and complement", () => {
  const decision = ready(HIRE);

  it("rejects a reversed actor and object, a negation, and a swapped quantity", () => {
    const claim = bindClaim(HIRE);
    expect(claim?.actor).toBe("TF Business Solutions");
    expect(claim?.verb.toLowerCase()).toBe("hires");
    expect(claim?.complement).toBe("freight brokers for shippers across the region");
    const reversed = "Shippers hire TF Business Solutions for freight brokers across the region.";
    const negated = "TF Business Solutions does not hire freight brokers for shippers across the region.";
    expect(matchesClaim(reversed, claim!)).toBe(false);
    expect(matchesClaim(negated, claim!)).toBe(false);
    for (const line of [reversed, negated, reversed.replace(".", "?"), negated.replace(".", "!")]) {
      expect(bodyViolations(line, decision, "Brandon Yakubov").length, line).toBeGreaterThan(0);
    }
    const weeks = ready("TF Business Solutions has run 500 campaigns since 2012. TF Business Solutions delivers work in 8 to 12 weeks.");
    expect(bodyViolations("TF Business Solutions has run 8 campaigns since 12.", weeks, "Brandon Yakubov").length).toBeGreaterThan(0);
    expect(bodyViolations("TF Business Solutions delivers work in 500 weeks.", weeks, "Brandon Yakubov").length).toBeGreaterThan(0);
  });

  it("rejects the same unsupported question with different punctuation", () => {
    const forms = [
      "Are you short on new projects?",
      "Are you short on new projects!",
      "Are you short\non new projects?",
      "How are you handling the meetings your customers booked?",
      "Worth a look if the founders still do the outreach?",
    ];
    for (const line of forms) {
      expect(bodyViolations(line, decision, "Brandon Yakubov").length, line).toBeGreaterThan(0);
    }
  });
});

describe("source voice and the real checker and rubric", () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("keeps a copied company sentence and a closed you-shift, and refuses the unsafe ones", async () => {
    const decision = ready(BUILD);
    const skills = composeSkillContext({ goal: "introduction" });
    expect(skills.length).toBeGreaterThan(200);
    expect(skills).toContain("STYLE FLOOR");
    expect(youForm("does")).toBe("do");
    expect(youForm("has")).toBe("have");
    expect(youForm("hires")).toBe("hire");
    expect(youForm("addresses")).toBeNull();
    const company = "TF Business Solutions";
    const youBuild = email([
      "Hi Talha,",
      "",
      "You build MVPs for VC-backed startups in 8 to 12 weeks.",
      "",
      "Worth a look?",
      "",
      "Brandon Yakubov",
    ]);
    expect(bodyViolations(youBuild, decision, "Brandon Yakubov", "8 to 12 weeks", company)).toEqual([]);
    expect(outboundGateFindings("8 to 12 weeks", youBuild, BUILD).some((finding) => finding.severity !== "note")).toBe(false);
    const youHire = email([
      "Hi Talha,",
      "",
      "You hire freight brokers for shippers across the region.",
      "",
      "Worth a look?",
      "",
      "Brandon Yakubov",
    ]);
    const hired = ready(HIRE);
    expect(bodyViolations(youHire, hired, "Brandon Yakubov", "freight brokers", company)).toEqual([]);
    expect(outboundGateFindings("freight brokers", youHire, HIRE).some((finding) => finding.severity !== "note")).toBe(false);
    const onlyAsk = email([
      "Hi Talha,",
      "",
      "Do you still hire freight brokers for shippers across the region?",
      "",
      "Brandon Yakubov",
    ]);
    expect(bodyViolations(onlyAsk, hired, "Brandon Yakubov", "freight brokers", company)).toEqual([]);
    const ran = ready("TF Business Solutions has run 500 campaigns since 2012.");
    const youRan = email([
      "Hi Talha,",
      "",
      "You have run 500 campaigns since 2012.",
      "",
      "Worth a look?",
      "",
      "Brandon Yakubov",
    ]);
    expect(bodyViolations(youRan, ran, "Brandon Yakubov", "500 campaigns", company)).toEqual([]);
    expect(outboundGateFindings("500 campaigns", youRan, ran.facts.map((fact) => fact.span).join("\n")).some((finding) => finding.severity !== "note")).toBe(false);
    const twoAsks = email([
      "Hi Talha,",
      "",
      "Do you still hire freight brokers for shippers across the region?",
      "",
      "Worth a look?",
      "",
      "Brandon Yakubov",
    ]);
    expect(bodyViolations(twoAsks, hired, "Brandon Yakubov", "freight brokers", company).join(" ")).toContain("exactly one ask");
    expect(bodyViolations("You hire TF Business Solutions for freight brokerage across the region.", ready("Customers hire TF Business Solutions for freight brokerage across the region."), "Brandon Yakubov", "", company).length).toBeGreaterThan(0);
    expect(bodyViolations("You ship 12 loads for our customers every month across the region.", ready("We ship 12 loads for our customers every month across the region."), "Brandon Yakubov", "", company).length).toBeGreaterThan(0);
    expect(bodyViolations("You have been building MVPs for VC-backed startups in 8 to 12 weeks.", ready("TF Business Solutions has been building MVPs for VC-backed startups in 8 to 12 weeks."), "Brandon Yakubov", "", company).length).toBeGreaterThan(0);
    expect(bodyViolations("You doe not hire freight brokers for shippers across the region.", ready("TF Business Solutions does not hire freight brokers for shippers across the region."), "Brandon Yakubov", "", company).length).toBeGreaterThan(0);
    expect(matchesClaim("You doe not hire freight brokers for shippers across the region.", bindClaim("TF Business Solutions does not hire freight brokers for shippers across the region.")!, company)).toBe(false);
    expect(bodyViolations(youBuild, { ...decision, facts: decision.facts.map((fact) => ({ ...fact, role: "external" as const })) }, "Brandon Yakubov", "8 to 12 weeks", company).length).toBeGreaterThan(0);
    expect(bodyViolations(youBuild + "\nFounder, BDØT Industries LLC", decision, "Brandon Yakubov", "8 to 12 weeks", company).length).toBeGreaterThan(0);
    expect(bodyViolations("You build MVPs for VC-backed startups in 8 to 12 weeks.", decision, "Brandon Yakubov", "", company, "continuation")).toEqual([]);
    expect(bodyViolations("You build MVPs for VC-backed startups in 8 to 12 weeks.", decision, "Brandon Yakubov", "", company, "first_touch").join(" ")).toContain("exactly one ask");
    const usable = email([
      "Hi Talha,",
      "",
      "TF Business Solutions hires freight brokers for shippers across the region.",
      "",
      "Worth a look?",
      "",
      "Brandon Yakubov",
    ]);
    expect(bodyViolations(usable, hired, "Brandon Yakubov", "freight brokers", company)).toEqual([]);
    expect(bodyViolations(usable, hired, "Brandon Yakubov", "8", company).length).toBeGreaterThan(0);
    expect(outboundGateFindings("freight brokers", usable, HIRE).some((finding) => finding.severity !== "note")).toBe(false);
    expect(releaseBinding("freight brokers", usable, hired.evidenceId)).toContain(POLICY_VERSION);
    expect(releaseBinding("freight brokers", usable, hired.evidenceId)).toContain(hired.evidenceId);
    const pitched = email([
      "Hi Talha,",
      "",
      BUILD,
      "",
      "Worth a look?",
      "",
      "Brandon Yakubov",
    ]);
    expect(outboundGateFindings("8 to 12 weeks", pitched, BUILD).map((finding) => finding.rule)).toContain("touch_one_pitch");

    globalThis.fetch = (async () => new Response(JSON.stringify({
      dimensions: {
        relevance: { score: 4, justification: "uses the sourced build window" },
        empathy: { score: 4, justification: "one question" },
        payoff: { score: 3, justification: "no extra promise" },
        low_friction_ask: { score: 4, justification: "one ask" },
        you_focused: { score: 4, justification: "addressed to them" },
      },
      suggestions: [],
      weakest: "payoff",
    }), { status: 200, headers: { "Content-Type": "application/json" } })) as typeof fetch;
    const report = await scoreEmailReport("https://example.test", "Bearer t", "anon", {
      subject: "freight brokers",
      body: usable,
    });
    expect(report.availability).toBe("scored");
    expect(report.rubric?.overall).toBeLessThan(100);
    expect(releaseAllows({
      subject: "freight brokers",
      body: usable,
      facts: hired.facts,
      availability: report.availability,
      rubric: report.rubric,
      mode: "studio",
      senderName: "Brandon Yakubov",
    }).allow).toBe(true);
    expect(releaseAllows({
      subject: "freight brokers",
      body: usable,
      facts: hired.facts,
      availability: report.availability,
      rubric: report.rubric,
      mode: "autonomous",
      senderName: "Brandon Yakubov",
    }).allow).toBe(false);
    const shifted = await scoreEmailReport("https://example.test", "Bearer t", "anon", {
      subject: "8 to 12 weeks",
      body: youBuild,
    });
    expect(shifted.availability).toBe("scored");
    expect(shifted.rubric?.overall).toBeLessThan(100);
    expect(releaseAllows({
      subject: "8 to 12 weeks",
      body: youBuild,
      facts: decision.facts,
      availability: shifted.availability,
      rubric: shifted.rubric,
      mode: "studio",
      senderName: "Brandon Yakubov",
      company,
    }).allow).toBe(true);
    expect(releaseAllows({
      subject: "8 to 12 weeks",
      body: youBuild,
      facts: decision.facts,
      availability: shifted.availability,
      rubric: shifted.rubric,
      mode: "autonomous",
      senderName: "Brandon Yakubov",
      company,
    }).allow).toBe(false);
    const numeric = await scoreEmailReport("https://example.test", "Bearer t", "anon", {
      subject: "500 campaigns",
      body: youRan,
    });
    expect(releaseAllows({
      subject: "500 campaigns",
      body: youRan,
      facts: ran.facts,
      availability: numeric.availability,
      rubric: numeric.rubric,
      mode: "studio",
      senderName: "Brandon Yakubov",
      company,
    }).allow).toBe(true);
  });
});

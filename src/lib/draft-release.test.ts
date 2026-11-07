import { describe, expect, it } from "vitest";
import { outboundGateFindings } from "../../supabase/functions/_shared/quality-gate";
import { evaluateStoredSnapshots, sealSnapshot, bodyViolations } from "../../supabase/functions/_shared/evidence-contract";
import { releaseAllows } from "../../supabase/functions/_shared/draft-release";
import type { RubricResult } from "../../supabase/functions/_shared/email-quality";

const NOW = "2026-11-07T12:00:00.000Z";
const USER = "11111111-1111-4111-8111-111111111111";
const LEAD = "22222222-2222-4222-8222-222222222222";

const TALHA = `Hi Talha,

Building MVPs for VC-backed startups in 8 to 12 weeks means you've solved the delivery side. The harder part is keeping qualified projects flowing in.

One agency went from founder-only outreach to 18 qualified conversations a month without hiring a sales team.

Worth a look for TF Business Solutions?`;

function snap(excerpt: string) {
  return sealSnapshot({
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
}

function decide(excerpt: string) {
  return evaluateStoredSnapshots({
    userId: USER,
    leadId: LEAD,
    company: "TF Business Solutions",
    websiteHost: "tf.example",
    now: NOW,
    stored: [snap(excerpt)],
  });
}

const perfect = {
  dimensions: Object.fromEntries(["relevance", "empathy", "payoff", "low_friction_ask", "you_focused"].map((name) => [name, { score: 5, justification: "grounded" }])),
  suggestions: [],
  weakest: null,
  overall: 100,
} as RubricResult;

describe("research-backed drafts, numeric and not", () => {
  it("approves a sentence with no number and a sentence with a duration", () => {
    const hired = decide("TF Business Solutions hires freight brokers for shippers across the region.");
    expect(hired.status).toBe("ready");
    expect(hired.facts[0].span.toLowerCase()).toContain("hires freight brokers");
    const weeks = decide("TF Business Solutions has been building MVPs for VC-backed startups in 8 to 12 weeks.");
    expect(weeks.status).toBe("ready");
    expect(weeks.facts[0].span).toContain("8 to 12 weeks");
  });

  it("lets a grounded question through the checker and the release, and rejects the Talha fixture", () => {
    const decision = decide("TF Business Solutions hires freight brokers for shippers across the region.");
    const body = `Hi Talha,

TF Business Solutions hires freight brokers for shippers across the region. How is that desk staffed this quarter?

Brandon Yakubov`;
    expect(bodyViolations(body, decision, "Brandon Yakubov", "staffing")).toEqual([]);
    expect(outboundGateFindings("staffing", body, decision.facts.map((fact) => fact.span).join("\n")).map((finding) => finding.rule)).not.toContain("ungrounded_prospect_claim");
    expect(releaseAllows({
      subject: "staffing",
      body,
      facts: decision.facts,
      availability: "scored",
      rubric: perfect,
      mode: "studio",
      senderName: "Brandon Yakubov",
    }).allow).toBe(true);
    expect(bodyViolations("The harder part is keeping qualified projects flowing in", decision, "Brandon Yakubov")).not.toEqual([]);
    expect(bodyViolations("http://localhost/about", decision, "Brandon Yakubov")).not.toEqual([]);
    expect(bodyViolations("Hi Talha,\n\nThe harder part is keeping qualified projects flowing in", {
      status: "absent", reason: "", evidenceId: "", facts: [], conflicts: [],
    })).not.toEqual([]);
    expect(bodyViolations(TALHA, decision).length).toBeGreaterThan(0);
    expect(releaseAllows({
      subject: "staffing",
      body,
      facts: decision.facts,
      availability: "unavailable",
      rubric: null,
      mode: "studio",
      senderName: "Brandon Yakubov",
    })).toMatchObject({ allow: false, code: "rubric_unavailable" });
  });

  it("holds an autonomous send that is clean on the rules but not 5/5", () => {
    const decision = decide("TF Business Solutions hires freight brokers for shippers across the region.");
    const body = "Hi Talha,\n\nTF Business Solutions hires freight brokers for shippers across the region. How is that desk staffed this quarter?\n\nBrandon Yakubov";
    const weak = { ...perfect, overall: 80, dimensions: { ...perfect.dimensions, relevance: { score: 4, justification: "close" } } };
    expect(releaseAllows({
      subject: "staffing",
      body,
      facts: decision.facts,
      availability: "scored",
      rubric: weak,
      mode: "autonomous",
      senderName: "Brandon Yakubov",
    }).allow).toBe(false);
  });
});

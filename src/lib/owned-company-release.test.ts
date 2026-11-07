import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ownedDraftViolations, ownedLeadCompany, releaseAllows } from "../../supabase/functions/_shared/draft-release";
import { evaluateStoredSnapshots, sealSnapshot } from "../../supabase/functions/_shared/evidence-contract";

const GEN = readFileSync("supabase/functions/generate-email/index.ts", "utf8");
const SEND = readFileSync("supabase/functions/send-email/index.ts", "utf8");

const NOW = "2026-11-07T12:00:00.000Z";
const USER = "11111111-1111-4111-8111-111111111111";
const LEAD = "22222222-2222-4222-8222-222222222222";
const OWNED = "TF Business Solutions";
const REQUEST = "Customers";
const EXCERPT = [
  "Customers hire TF Business Solutions for freight brokerage across the region.",
  "TF Business Solutions hires freight brokers for shippers across the region.",
].join(" ");

function decision() {
  const snap = sealSnapshot({
    userId: USER,
    leadId: LEAD,
    provider: "site",
    role: "prospect_page",
    requestedUrl: "https://tf.example/",
    finalUrl: "https://tf.example/",
    pageStatus: 200,
    excerpt: EXCERPT,
    retrievedAt: NOW,
    publishedAt: null,
    providerOk: true,
    partial: false,
    fromCache: false,
  });
  return evaluateStoredSnapshots({
    userId: USER,
    leadId: LEAD,
    company: ownedLeadCompany({ company_name: OWNED }),
    websiteHost: "tf.example",
    now: NOW,
    stored: [snap],
  });
}

function email(line: string): string {
  return ["Hi Talha,", "", line, "", "Worth a look?", "", "Brandon Yakubov"].join("\n");
}

const row = { company_name: OWNED };
const wrongShift = email("You hire TF Business Solutions for freight brokerage across the region.");
const ownedShift = email("You hire freight brokers for shippers across the region.");

describe("generation and send use the owned lead company", () => {
  const facts = decision();

  it("a request company would approve the wrong actor and refuse the real one", () => {
    expect(facts.status).toBe("ready");
    const forged = { subject: "freight brokerage", body: wrongShift, facts: facts.facts, availability: "scored" as const, rubric: null, mode: "studio" as const, senderName: "Brandon Yakubov", company: REQUEST };
    expect(releaseAllows(forged).allow).toBe(true);
    expect(releaseAllows({ ...forged, subject: "freight brokers", body: ownedShift, company: REQUEST }).allow).toBe(false);
  });

  it("the owned row refuses that shift and releases the real one, on both gates", () => {
    const company = ownedLeadCompany(row);
    expect(company).toBe(OWNED);
    expect(company).not.toBe(REQUEST);
    const wrong = releaseAllows({
      subject: "freight brokerage",
      body: wrongShift,
      facts: facts.facts,
      availability: "scored",
      rubric: null,
      mode: "studio",
      senderName: "Brandon Yakubov",
      company,
    });
    const sentWrong = ownedDraftViolations({
      lead: row,
      subject: "freight brokerage",
      body: wrongShift,
      facts: facts.facts,
      senderName: "Brandon Yakubov",
    });
    expect(wrong.allow).toBe(false);
    expect(sentWrong.company).toBe(OWNED);
    expect(sentWrong.violations.length).toBeGreaterThan(0);

    const right = releaseAllows({
      subject: "freight brokers",
      body: ownedShift,
      facts: facts.facts,
      availability: "scored",
      rubric: null,
      mode: "studio",
      senderName: "Brandon Yakubov",
      company,
    });
    const sentRight = ownedDraftViolations({
      lead: row,
      subject: "freight brokers",
      body: ownedShift,
      facts: facts.facts,
      senderName: "Brandon Yakubov",
    });
    expect(right.allow).toBe(true);
    expect(sentRight.violations).toEqual([]);
  });

  it("the handlers pass the owned row, not the request name", () => {
    expect(GEN).toContain("select('id, user_id, company_name')");
    expect(GEN).toContain("company: ownedLeadCompany(leadData)");
    expect(GEN).not.toContain("company: sanitizedCompanyName");
    expect(GEN).not.toContain("leadRow?.company_name ?? sanitizedCompanyName");
    expect(SEND).toContain("ownedLeadCompany(leadRow)");
    expect(SEND).toContain("ownedDraftViolations");
  });
});

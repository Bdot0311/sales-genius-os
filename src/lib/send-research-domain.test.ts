import { describe, expect, it, vi } from "vitest";
import { evaluateStoredSnapshots, sealSnapshot } from "../../supabase/functions/_shared/evidence-contract";
import { resolveLeadDomain } from "../../supabase/functions/_shared/lead-research";
import { researchBlockForLead } from "../../supabase/functions/_shared/lead-research-block";

const userId = "11111111-1111-4111-8111-111111111111";
const leadId = "22222222-2222-4222-8222-222222222222";
const now = "2026-11-23T02:04:00.000Z";
const stored = [sealSnapshot({
  userId, leadId, provider: "site", role: "prospect_page",
  requestedUrl: "https://getoliver.com/campaigns", finalUrl: "https://getoliver.com/campaigns",
  pageStatus: 200, providerOk: true, partial: false, fromCache: false,
  retrievedAt: now, publishedAt: null,
  excerpt: "Oliver texts them, and the AI books the visit right in the conversation.",
})];

describe("send-time research uses the same company domain as drafting", () => {
  it("reuses trusted agent research instead of holding on the LinkedIn website mismatch", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(now));
    try {
      const lead = { company_name: "Oliver", company_website: "https://linkedin.com/in/stephen", contact_email: "stephen@getoliver.com", researched_at: now, research_brief: { what_they_do: "Oliver texts them, and the AI books the visit right in the conversation." } };
      const admin = {
        from(table: string) {
          const chain = {
            select() { return chain; }, eq() { return chain; }, order() { return chain; }, limit() { return chain; },
            async maybeSingle() { return { data: table === "leads" ? lead : { attempted_at: now, receipt: { attemptedAt: now } } }; },
            then(resolve: (result: { data: { payload: typeof stored[number] }[] }) => unknown) { return Promise.resolve(resolve({ data: stored.map(payload => ({ payload })) })); },
          };
          return chain;
        },
      };
      const fetchImpl = vi.fn<typeof fetch>();
      const result = await researchBlockForLead(admin, "https://example.test", "Bearer test", "test", leadId, fetchImpl, userId);
      expect(result.outcome).toBe("cached");
      expect(result.block).toContain("Oliver texts them");
      expect(fetchImpl).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not reject Oliver's stored company research because the website is a LinkedIn profile", () => {
    const lead = { company_website: "https://www.linkedin.com/in/stephen-lytle-21497730", contact_email: "stephen@getoliver.com" };
    const input = { userId, leadId, company: "Oliver", now, stored };
    expect(evaluateStoredSnapshots({ ...input, websiteHost: "linkedin.com" }).status).toBe("wrong_entity");
    expect(resolveLeadDomain(lead)).toBe("getoliver.com");
    const result = evaluateStoredSnapshots({ ...input, websiteHost: resolveLeadDomain(lead) });
    expect(result.status).toBe("ready");
    expect(result.facts.map(fact => fact.span)).toContain("Oliver texts them, and the AI books the visit right in the conversation.");
  });

  it("still rejects company research belonging to a different owned work-email domain", () => {
    const lead = { company_website: "https://linkedin.com/in/someone", contact_email: "owner@unrelated.example" };
    expect(evaluateStoredSnapshots({ userId, leadId, company: "Oliver", now, stored, websiteHost: resolveLeadDomain(lead) }).facts).toEqual([]);
  });

  it("does not treat a personal email provider as a company website", () => {
    expect(resolveLeadDomain({ company_website: "https://linkedin.com/in/someone", contact_email: "owner@gmail.com" })).toBeNull();
  });
});
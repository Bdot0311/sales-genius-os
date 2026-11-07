import { describe, expect, it } from "vitest";
import { researchBlockForLead } from "../../supabase/functions/_shared/lead-research-block";
import { holdReason, researchAction, researchStep, RETRY_WINDOW_MS } from "../../supabase/functions/_shared/research-orchestration";
import { externalResearchSearch } from "../../supabase/functions/_shared/external-research";

describe("research is fetched before a draft and not repeated inside the window", () => {
  it("asks research-lead once when nothing trusted is stored", async () => {
    const calls: string[] = [];
    const fetchImpl = (async (url: string) => {
      calls.push(String(url));
      return new Response(JSON.stringify({
        brief: { what_they_do: "builds MVPs", retrieval: { attemptedAt: new Date().toISOString() } },
        sources: ["https://tf.example"],
      }), { status: 200 });
    }) as unknown as typeof fetch;
    const admin = {
      from: () => ({
        select: () => ({
          eq: () => ({ maybeSingle: async () => ({ data: null }) }),
        }),
      }),
    };
    const first = await researchBlockForLead(admin, "https://x.test", "Bearer t", "anon", "lead-1", fetchImpl, "user-1");
    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain("/functions/v1/research-lead");
    expect(first.outcome).toBe("researched");
  });

  it("holds a recent empty retrieval instead of calling the providers again", () => {
    const step = researchStep({
      hasTrustedFacts: false,
      receipt: {
        attemptedAt: new Date().toISOString(),
        site: { configured: true, called: true, error: "no_page", count: 0, statuses: [404], finalHosts: [] },
        parallel: { configured: false, called: false, error: "not_configured", count: 0 },
        context_dev: { configured: true, called: true, error: null, count: 0 },
        firecrawl: { configured: false, called: false, reason: "no adapter in this repository" },
        snapshotWrite: "none",
      },
      now: new Date(Date.now() + 1000).toISOString(),
    });
    expect(step).toBe("hold");
    expect(RETRY_WINDOW_MS).toBe(10 * 60 * 1000);
    expect(holdReason({
      attemptedAt: new Date().toISOString(),
      site: { configured: true, called: true, error: "no_page", count: 0, statuses: [], finalHosts: [] },
      parallel: { configured: false, called: false, error: "not_configured", count: 0 },
      context_dev: { configured: false, called: false, error: "not_configured", count: 0 },
      firecrawl: { configured: false, called: false, reason: "no adapter in this repository" },
      snapshotWrite: "none",
    })).toContain("Firecrawl has no adapter");
  });
});

describe("a failed run stays on cooldown even when the lead is not fresh", () => {
  it("holds instead of fetching", () => {
    expect(researchAction({ step: "hold", force: false, fresh: false })).toBe("hold");
    expect(researchAction({ step: "fetch", force: false, fresh: false })).toBe("fetch");
    expect(researchAction({ step: "use", force: false, fresh: true })).toBe("cache");
  });
});

describe("external research calls the configured adapters and not a third vendor", () => {
  it("does not reference Firecrawl", () => {
    expect(String(externalResearchSearch)).not.toContain("firecrawl");
  });
});

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { researchBlockForLead } from "../../supabase/functions/_shared/lead-research-block";
import { holdReason, researchAction, researchReservation, researchStep, RETRY_WINDOW_MS } from "../../supabase/functions/_shared/research-orchestration";
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
        firecrawl: { configured: false, called: false, error: "not_configured", count: 0 },
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
      firecrawl: { configured: false, called: false, error: "not_configured", count: 0 },
      snapshotWrite: "none",
    })).toContain("Firecrawl is not configured");
  });
});

describe("a failed run stays on cooldown even when the lead is not fresh", () => {
  it("holds instead of fetching", () => {
    expect(researchAction({ step: "hold", force: false, fresh: false })).toBe("hold");
    expect(researchAction({ step: "fetch", force: false, fresh: false })).toBe("fetch");
    expect(researchAction({ step: "use", force: false, fresh: true })).toBe("cache");
  });
});

describe("a missing research claim is not treated as a recent run", () => {
  it("continues when the reservation function errors", () => {
    expect(researchReservation(null, "function begin_research_run does not exist", false)).toEqual({
      runId: null,
      hold: false,
    });
  });

  it("holds only when the function succeeds and returns no run", () => {
    expect(researchReservation(null, null, false)).toEqual({ runId: null, hold: true });
    expect(researchReservation("run-1", null, false)).toEqual({ runId: "run-1", hold: false });
    expect(researchReservation(null, null, true)).toEqual({ runId: null, hold: false });
  });

  it("does not stop research-lead before outside search when the lead has a company and no website", () => {
    const src = readFileSync("supabase/functions/research-lead/index.ts", "utf8");
    const gate = src.indexOf("if (!host && !companyName)");
    const gather = src.indexOf("gatherLeadResearch(");
    expect(gate).toBeGreaterThan(-1);
    expect(gather).toBeGreaterThan(gate);
    expect(src).toContain("websiteUrls: host ? [origin, ...extraUrls] : []");
    expect(src).toContain("researchReservation(");
  });
});

describe("external research calls the configured adapters and not a third vendor", () => {
  it("does not reference Firecrawl", () => {
    expect(String(externalResearchSearch)).not.toContain("firecrawl");
  });
});

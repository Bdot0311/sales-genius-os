import { describe, expect, it } from "vitest";
import { researchBlockForLead } from "../../supabase/functions/_shared/lead-research-block.ts";

/**
 * Five paths through this function produce an empty research block, and they
 * used to be indistinguishable from each other and from success.
 *
 * That is why "how often does the agent write with no facts about the company"
 * had no answer. A lapsed key, an empty wallet, a trailing space and a genuinely
 * thin prospect all looked identical, and all looked like a working run.
 *
 * Each outcome below is one of those paths. The distinction is the whole point:
 * "skipped" is a provider to go fix, "empty_brief" is a prospect with nothing
 * public to find, and only the second of those is normal.
 */

/** A lead row stub. `fresh` controls whether cached research is used. */
const adminWith = (row: unknown) => ({
  from: () => ({
    select: () => ({
      eq: () => ({ maybeSingle: async () => ({ data: row }) }),
    }),
  }),
});

const FRESH_INPUTS = { company_website: "acme.com" };
const freshRow = (brief: unknown) => ({
  research_brief: brief,
  research_sources: ["https://acme.com"],
  researched_at: new Date().toISOString(),
  research_inputs: FRESH_INPUTS,
  company_website: "acme.com",
  contact_email: null,
  company_name: "Acme",
  linkedin_url: null,
  company_linkedin: null,
  enriched_at: null,
});

const USABLE_BRIEF = { what_they_do: "route planning for freight brokers", confidence: "high" };

const jsonFetch = (body: unknown, ok = true) =>
  (async () => new Response(JSON.stringify(body), { status: ok ? 200 : 500 })) as unknown as typeof fetch;

const never = (async () => {
  throw new Error("fetch should not have been called");
}) as unknown as typeof fetch;

const call = (admin: unknown, f: typeof fetch) =>
  researchBlockForLead(admin, "https://x.test", "Bearer t", "anon", "lead-1", f);

describe("researchBlockForLead reports why it has nothing", () => {
  it("calls research-lead when a fresh model brief has no retrieval receipt", async () => {
    let calls = 0;
    const fetchImpl = (async () => {
      calls += 1;
      return new Response(JSON.stringify({ brief: USABLE_BRIEF, sources: ["https://acme.com"] }), { status: 200 });
    }) as unknown as typeof fetch;
    const r = await call(adminWith(freshRow(USABLE_BRIEF)), fetchImpl);
    expect(calls).toBe(1);
    expect(r.outcome).toBe("researched");
  });

  it("does not treat a timestamp on the owner-writable brief as a cooldown", async () => {
    let calls = 0;
    const fetchImpl = (async () => {
      calls += 1;
      return new Response(JSON.stringify({ brief: USABLE_BRIEF, sources: [] }), { status: 200 });
    }) as unknown as typeof fetch;
    const brief = { ...USABLE_BRIEF, retrieval: { attemptedAt: new Date().toISOString() } };
    const r = await call(adminWith(freshRow(brief)), fetchImpl);
    expect(calls).toBe(1);
    expect(r.outcome).toBe("researched");
  });

  /*
   * The case that hid inside "cached". A brief can exist, be fresh, and yield
   * no usable line — briefToPromptBlock returns "" when nothing populates. A
   * run that reported this as cached research was reporting a success.
   */
  it("separates a fresh but empty brief from a useful one", async () => {
    const r = await call(adminWith(freshRow({})), jsonFetch({ brief: {}, sources: [] }));
    expect(r.outcome).toBe("empty_brief");
    expect(r.block).toBe("");
  });

  it("researches when nothing is cached", async () => {
    const r = await call(adminWith(null), jsonFetch({ brief: USABLE_BRIEF, sources: ["https://acme.com"] }));
    expect(r.outcome).toBe("researched");
    expect(r.block).toContain("route planning for freight brokers");
  });

  it("reports a provider that declined, with its reason", async () => {
    const r = await call(adminWith(null), jsonFetch({ error: "no provider configured", error_code: "no_provider" }));
    expect(r.outcome).toBe("skipped");
    expect(r.detail).toBe("no_provider");
    expect(r.block).toBe("");
  });

  it("reports an answer that carried neither a brief nor a reason", async () => {
    const r = await call(adminWith(null), jsonFetch({}));
    expect(r.outcome).toBe("no_brief");
    expect(r.block).toBe("");
  });

  it("reports a freshly researched brief that came back empty", async () => {
    const r = await call(adminWith(null), jsonFetch({ brief: {}, sources: [] }));
    expect(r.outcome).toBe("empty_brief");
    expect(r.block).toBe("");
  });

  it("reports a throw rather than letting it look like thin research", async () => {
    const r = await call(adminWith(null), (async () => {
      throw new Error("timed out");
    }) as unknown as typeof fetch);
    expect(r.outcome).toBe("failed");
    expect(r.detail).toContain("timed out");
    expect(r.block).toBe("");
  });

  it("reports a throw from the database the same way", async () => {
    const broken = {
      from: () => ({
        select: () => ({
          eq: () => ({ maybeSingle: async () => { throw new Error("connection reset"); } }),
        }),
      }),
    };
    const r = await call(broken, never);
    expect(r.outcome).toBe("failed");
    expect(r.detail).toContain("connection reset");
  });

  /*
   * The floor. Every empty outcome must be distinguishable from every working
   * one, because the counter that reads them is the only measure of how often
   * the agent writes blind.
   */
  it("never reports an empty block as a working outcome", async () => {
    const cases: Array<[unknown, typeof fetch]> = [
      [adminWith(freshRow({ retrieval: { attemptedAt: new Date().toISOString() } })), never],
      [adminWith(null), jsonFetch({})],
      [adminWith(null), jsonFetch({ brief: {} })],
      [adminWith(null), jsonFetch({ error: "x" })],
    ];
    for (const [admin, f] of cases) {
      const r = await call(admin, f);
      expect(r.block).toBe("");
      expect(["cached", "researched"]).not.toContain(r.outcome);
    }
  });
});

/*
 * The gap the tests above found in the first fix.
 *
 * briefToPromptBlock emits "Sources read", a TIMING instruction and a
 * confidence score even for a brief with nothing in it, so an empty brief
 * produced a non-empty string. A check for emptiness therefore passed it
 * through, and the model was handed "Research confidence: low" plus a rule
 * demanding one specific detail — told research happened, given none of it.
 */
describe("a brief with no facts is treated as no research", () => {
  const sources = ["https://acme.com"];
  const factless = [
    {},
    { confidence: "low" },
    { observations: [] },
    { hooks: [] },
    { observations: [{ fact: "   " }] },
    { what_they_do: "  ", who_they_sell_to: "" },
    { avoid: ["do not claim they use Salesforce"] },
  ];

  for (const [i, brief] of factless.entries()) {
    it(`case ${i} yields no block even though briefToPromptBlock would`, async () => {
      const r = await call(adminWith(freshRow(brief)), jsonFetch({ brief: {}, sources: [] }));
      expect(r.outcome).toBe("empty_brief");
      expect(r.block).toBe("");
    });
  }

  it("a model observation does not skip the research call", async () => {
    let calls = 0;
    const fetchImpl = (async () => {
      calls += 1;
      return new Response(JSON.stringify({ brief: { observations: [{ fact: "hiring 3 AEs" }] }, sources: [] }), { status: 200 });
    }) as unknown as typeof fetch;
    const r = await call(adminWith(freshRow({ observations: [{ fact: "hiring 3 AEs" }] })), fetchImpl);
    expect(calls).toBe(1);
    expect(r.outcome).toBe("researched");
    expect(r.block).toContain("hiring 3 AEs");
  });

  it("a hook alone does not count as retrieved evidence", async () => {
    const r = await call(adminWith(freshRow({
      hooks: ["expanding into freight"],
      retrieval: { attemptedAt: new Date().toISOString() },
    })), jsonFetch({ brief: {}, sources: [] }));
    expect(r.outcome).toBe("empty_brief");
  });
});

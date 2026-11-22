import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { unsupportedClaims } from "../../supabase/functions/_shared/evidence";
import { bodyViolations, lineGrounding, type ApprovedFact } from "../../supabase/functions/_shared/evidence-contract";
import { agentJobRetry, classifyFailure } from "../../supabase/functions/_shared/bulk-run-logic";
import { runWithAiRetries } from "../../supabase/functions/_shared/ai-retry";
import { retryGroundedDraft, settleGrounding } from "../../supabase/functions/_shared/grounding-retry";

/**
 * The batch the user watched: 63 leads, 51 research jobs and 63 draft jobs,
 * 40 of 43 finished steps failed. These are the checks that produced that
 * count, run on the copy a grounded draft actually contains.
 */
const FACT = "Vendr helps companies buy and manage SaaS with negotiated pricing and a single renewal calendar.";
const SENDER = "OutReign finds decision makers, verifies their email, researches each company and writes cold outreach that cites a real fact from their site.";

const code = (path: string) =>
  readFileSync(path, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

describe("grounding rejects a real first touch", () => {
  it("does not treat a two-minute ask as a quantity the research failed to prove", () => {
    expect(unsupportedClaims("Do you have two minutes?", FACT)).toEqual([]);
  });

  it("does not treat the required 'one idea' frame as an invented headcount", () => {
    expect(unsupportedClaims(
      "One idea: your renewals could move faster once each company has a verified email.",
      FACT,
    )).toEqual([]);
  });

  it("allows noticing a sentence the research actually stored", () => {
    expect(unsupportedClaims(`I noticed ${FACT}`, FACT)).toEqual([]);
  });

  it("refuses a noticed claim stitched from words in different sentences", () => {
    const corpus = [
      "Acme will cut costs on infrastructure next quarter.",
      "The sales motion is inbound and partner led.",
      "Their team meets buyers on Mondays.",
    ].join(" ");
    expect(unsupportedClaims("I noticed Acme cut its sales team.", corpus).length).toBeGreaterThan(0);
    expect(unsupportedClaims(
      "I noticed Acme will cut costs on infrastructure next quarter.",
      corpus,
    )).toEqual([]);
  });

  it("still blocks an event and a headcount the research does not state", () => {
    expect(unsupportedClaims("I noticed you just raised a series B.", FACT).length).toBeGreaterThan(0);
    expect(unsupportedClaims("Your team has 40 engineers.", FACT).length).toBeGreaterThan(0);
    expect(unsupportedClaims("Most teams lose the renewal.", FACT).length).toBeGreaterThan(0);
  });

  it("allows a question about the pattern, and still blocks the same words stated as fact", () => {
    expect(unsupportedClaims("How do most teams handle a renewal?", FACT)).toEqual([]);
  });

  it("accepts a hedged idea that uses the sender's own verbs", () => {
    expect(lineGrounding(
      "Verifying each email could cut the time spent researching a company.",
      [FACT],
      SENDER,
      "Vendr",
    )).toBe("idea");
  });

  it("still refuses an unhedged result with a number the sender never stated", () => {
    expect(lineGrounding(
      "We helped three SaaS companies cut renewal spend by 30%.",
      [FACT],
      SENDER,
      "Vendr",
    )).toBeNull();
  });

  it("releases a first touch built from the approved sentence plus that idea", () => {
    const fact: ApprovedFact = {
      id: "f1",
      snapshotId: "s1",
      span: FACT,
      sourceUrl: "https://vendr.com",
      retrievedAt: "2026-11-21T00:00:00.000Z",
      publishedAt: null,
      role: "prospect_page",
      provider: "site",
    };
    const body = [
      "Hi Alex,",
      "",
      FACT,
      "",
      "Verifying each email could cut the time spent researching a company.",
      "",
      "How are you finding the people who own renewals?",
      "",
      "Brandon",
    ].join("\n");
    expect(bodyViolations(body, {
      status: "ready",
      reason: "",
      evidenceId: "e1",
      facts: [fact],
      conflicts: [],
    }, "Brandon", "Vendr renewal calendar", "Vendr", "first_touch", SENDER)).toEqual([]);
  });
});

describe("why the queued research never ran", () => {
  const worker = code("supabase/functions/process-agent-jobs/index.ts");

  it("loads the job kind, which is what chooses research-lead over generate-email", () => {
    const select = worker.slice(worker.indexOf('.from("agent_jobs")'), worker.indexOf('.in("id", jobIds)'));
    expect(select).toContain("kind");
  });

  it("does not start a draft while that lead's research item is still open", () => {
    expect(worker).toContain('eq("kind", "research")');
  });
});

describe("rate limits were retried immediately, and only on the gateway that production does not use", () => {
  const provider = readFileSync("supabase/functions/_shared/ai-provider.ts", "utf8");
  const draftOne = code("supabase/functions/_shared/draft-one.ts");

  it("retries Bedrock, which is the provider that writes the email", () => {
    const bedrock = provider.slice(
      provider.indexOf('if (route.provider === "bedrock")'),
      provider.indexOf("Lovable gateway fallback"),
    );
    expect(bedrock).toContain("runWithAiRetries");
  });

  it("does not fire a second full generation 2.5s later when the first was throttled", () => {
    const first = draftOne.indexOf('invokeFn("generate-email"');
    expect(draftOne.indexOf('invokeFn("generate-email"', first + 1)).toBe(-1);
  });

  it("a throttled provider and a scorer timeout are not permanent", () => {
    expect(classifyFailure("ThrottlingException: Too many tokens")).toBe("rate_limit");
    expect(classifyFailure("The reply rubric did not return a score, so this draft was not saved.")).toBe("transient");
    expect(classifyFailure("The research supported only a copied line from their site, with no grounded reason to reach out.")).toBe("permanent");
  });

  it("parks a rate limit and a scorer timeout, and gives up after the third try", () => {
    expect(agentJobRetry("AI is rate limited right now. Wait a moment and try again.", 1, () => 0.5)).toEqual({
      retry: true,
      delaySeconds: 30,
    });
    expect(agentJobRetry("The reply rubric did not return a score, so this draft was not saved.", 2, () => 0.5).retry).toBe(true);
    expect(agentJobRetry("AI is rate limited right now.", 3, () => 0.5)).toEqual({ retry: false, delaySeconds: 0 });
    expect(agentJobRetry("The research supported only a copied line from their site.", 1, () => 0.5).retry).toBe(false);
  });

  it("asks Bedrock again on 429 and 503, and not on a 400", async () => {
    const throttled = new Response("no", { status: 429, headers: { "retry-after": "1" } });
    const down = new Response("down", { status: 503 });
    const ok = new Response("ok", { status: 200 });
    const bad = new Response("bad", { status: 400 });
    let calls = 0;
    const slept: number[] = [];
    const recovered = await runWithAiRetries(
      () => Promise.resolve(calls++ === 0 ? throttled : ok),
      { sleep: async (ms) => { slept.push(ms); }, random: () => 0.5 },
    );
    expect(recovered.status).toBe(200);
    expect(calls).toBe(2);
    expect(slept).toEqual([1000]);

    calls = 0;
    const afterOutage = await runWithAiRetries(
      () => Promise.resolve(calls++ === 0 ? down : ok),
      { sleep: async () => {}, random: () => 0.5 },
    );
    expect(afterOutage.status).toBe(200);

    calls = 0;
    const rejected = await runWithAiRetries(
      () => Promise.resolve(bad),
      { sleep: async () => { calls += 10; } },
    );
    expect(rejected.status).toBe(400);
    expect(calls).toBe(0);
  });

  it("retries a timeout once, then stops", async () => {
    // A timeout spends the short bound. The next attempt is the last one,
    // so a timed-out call is billed twice, not three times.
    let calls = 0;
    await expect(runWithAiRetries(
      () => {
        calls += 1;
        throw new Error("Timeout");
      },
      { sleep: async () => {}, random: () => 0 },
    )).rejects.toThrow("Timeout");
    expect(calls).toBe(2);
  });
});

describe("a grounding failure is rewritten with the reason, and a 429 is not called a grounding failure", () => {
  it("stops when the provider did not answer, instead of asking again immediately", async () => {
    const seen: string[][] = [];
    const result = await retryGroundedDraft(["SaaS is not a sourced word"], async (notes) => {
      seen.push([...notes]);
      return { status: "unavailable", reason: "provider 429" };
    });
    expect(result).toMatchObject({ status: "unavailable", attempts: 1 });
    expect(seen).toEqual([["SaaS is not a sourced word"]]);
  });

  it("feeds the refused sentence into a second attempt, and not a third", async () => {
    const seen: string[][] = [];
    const result = await retryGroundedDraft(["thin idea"], async (notes) => {
      seen.push([...notes]);
      if (seen.length === 1) return { status: "refused", reason: "Verifying email could cut the time." };
      return { status: "released", reason: "" };
    });
    expect(result.status).toBe("released");
    expect(seen[1]).toContain("Verifying email could cut the time.");
    expect(seen).toHaveLength(2);
  });

  it("records a provider miss as a rate limit, which the worker will retry", () => {
    const missed = settleGrounding({ status: "unavailable", viaFallback: true, reason: "provider 429" });
    expect(missed.ok).toBe(false);
    if (missed.ok === false) {
      expect(missed.error.toLowerCase()).not.toContain("copied line");
      expect(classifyFailure(missed.error)).toBe("rate_limit");
    }
    const refused = settleGrounding({ status: "refused", viaFallback: true, reason: "" });
    if (refused.ok === false) expect(classifyFailure(refused.error)).toBe("permanent");
    const outside = settleGrounding({ status: "refused", viaFallback: true, reason: "the idea was refused", outsideSource: true });
    if (outside.ok === false) {
      expect(outside.error.toLowerCase()).not.toContain("copied line");
      expect(outside.error_code).toBe("unsupported_prospect_claim");
    }
  });

  it("the worker parks that rate limit instead of failing the row", () => {
    const migration = readFileSync("drizzle/migrations/0078_agent_job_retry_backoff.sql", "utf8");
    expect(migration).toContain("not_before IS NULL OR c.not_before <= now()");
    expect(migration).toContain("LEAST(GREATEST(CEIL(pending_ct / 8.0)::integer, 1), 2)");
    const worker = code("supabase/functions/process-agent-jobs/index.ts");
    expect(worker).toContain("not_before");
    expect(worker).toContain("agentJobRetry");
  });
});

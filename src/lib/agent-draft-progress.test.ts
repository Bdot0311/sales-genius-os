import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { leadsWithDrafts } from "../../supabase/functions/_shared/draft-one";

const AGENT = readFileSync("supabase/functions/agent-chat/index.ts", "utf8");
const SHARED = readFileSync("supabase/functions/_shared/draft-one.ts", "utf8");
const WORKER = readFileSync("supabase/functions/process-agent-jobs/index.ts", "utf8");

/** Source with comments stripped, so an assertion cannot match its own explanation. */
const code = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

const CODE = code(AGENT);

/**
 * Eighty-two no-response leads, four passes, twenty drafts.
 *
 * "Did so much work and only 20 was drafted as you can see in drafts folder."
 * The agent reported 28 drafted, then 43, then "39 remaining". The Outreach
 * Studio drafts tab read 20 throughout, and the six names visible in the chat
 * at 3:58 were the same six sitting in the folder at 3:59.
 *
 * Three things had to be true at once for that to happen, and all three were:
 *
 *  1. list_leads ordered by created_at and knew nothing about drafts, so every
 *     pass was handed the same head of the same eighty-two rows.
 *  2. saveDraft deletes a lead's draft before inserting, so redrafting the same
 *     twelve leads is a write that leaves the count exactly where it was.
 *  3. Nothing ever told the model a total, so it added tool results to its own
 *     earlier sentences and reported the sum.
 *
 * Everything in this file is one of those three.
 */

describe("drafting knows what it has already written", () => {
  const client = (rows: { lead_id: string }[]) => {
    const calls: { table: string; ids: string[] }[] = [];
    return {
      calls,
      from(table: string) {
        const q = {
          select: () => q,
          eq: () => q,
          in(_col: string, ids: string[]) {
            calls.push({ table, ids });
            return Promise.resolve({
              data: rows.filter((r) => ids.includes(r.lead_id)),
            });
          },
        };
        return q;
      },
    };
  };

  it("reports exactly the leads that hold a draft", async () => {
    const admin = client([{ lead_id: "b" }, { lead_id: "d" }]);
    const have = await leadsWithDrafts(admin, "u1", ["a", "b", "c", "d"]);
    expect([...have].sort()).toEqual(["b", "d"]);
  });

  it("asks nothing when there is nothing to ask about", async () => {
    const admin = client([]);
    expect((await leadsWithDrafts(admin, "u1", [])).size).toBe(0);
    expect(admin.calls).toHaveLength(0);
  });

  it("reads a whole account in chunks rather than one giant URL", async () => {
    // A batch here is every lead the user has. A PostgREST `in` list goes into
    // the query string, and the failing run listed eighty-two at a time.
    const ids = Array.from({ length: 250 }, (_, i) => `lead-${i}`);
    const admin = client([{ lead_id: "lead-7" }, { lead_id: "lead-240" }]);
    const have = await leadsWithDrafts(admin, "u1", ids);
    expect([...have].sort()).toEqual(["lead-240", "lead-7"]);
    expect(admin.calls).toHaveLength(3);
    expect(admin.calls.every((c) => c.ids.length <= 100)).toBe(true);
    // Every id is asked about exactly once — a chunker that drops the tail is
    // indistinguishable from "this lead has no draft".
    expect(admin.calls.flatMap((c) => c.ids).sort()).toEqual([...ids].sort());
  });

  it("looks in the drafts table, not at anything the model said", async () => {
    expect(code(SHARED)).toMatch(/leadsWithDrafts[\s\S]{0,400}from\("email_drafts"\)/);
  });
});

describe("a lead that has a draft is not drafted again", () => {
  it("draft_outreach filters the requested ids before splitting them", () => {
    const filtered = CODE.indexOf("const have = await leadsWithDrafts(admin, userId, requested);");
    const split = CODE.indexOf("const ids = pending.slice(0, inlineLimit);");
    expect(filtered).toBeGreaterThan(-1);
    expect(split).toBeGreaterThan(-1);
    // The inline slots have to go to leads that need drafts. Filtering after
    // the split spends all twelve on leads that already have one.
    expect(filtered).toBeLessThan(split);
    expect(CODE).toContain("const overflow = pending.slice(inlineLimit);");
    expect(CODE).not.toContain("const ids = requested.slice(0, INLINE_DRAFT_LIMIT);");
  });

  it("still redrafts when the user asked for a rewrite", () => {
    // Replacing the draft is the entire point of a redraft. The skip must not
    // turn "make this one less salesy" into "you already have one of those".
    expect(CODE).toContain("const isRedraft = feedback.length > 0 || args.redraft === true;");
    expect(CODE).toMatch(/if \(!isRedraft\) \{/);
  });

  it("says so, rather than silently doing nothing", () => {
    expect(AGENT).toContain('label: "Already drafted"');
    expect(AGENT).toContain("every_lead_already_drafted");
    expect(AGENT).toContain("without_draft: true");
  });

  it("does not queue a lead that is already waiting in the queue", () => {
    expect(CODE).toContain('.eq("status", "pending")');
    expect(CODE).toContain("const toQueue = overflow.filter((id) => !alreadyQueued.has(id));");
    // The job's total and its items must come from the deduplicated list, or
    // the progress card counts work no worker will ever do.
    expect(CODE).toContain("total: toQueue.length,");
    expect(CODE).toContain("toQueue.map((leadId) => ({");
  });
});

describe("list_leads can say what is left", () => {
  it("carries has_draft on every row and filters by it", () => {
    expect(CODE).toContain("const wantsUndrafted = args.without_draft === true;");
    expect(CODE).toContain("has_draft: drafted.has(String(r.id))");
    expect(CODE).toContain("wantsUndrafted ? annotated.filter((r) => !r.has_draft) : annotated");
  });

  it("scans past a page of already-drafted leads", () => {
    // The first page of an account mid-run is all drafted. Filtering one page
    // of twenty-five returns nothing and reads as "there is nothing left".
    expect(CODE).toContain("const scanLimit = wantsUndrafted ? 500 : limit;");
    expect(CODE).toContain(".limit(scanLimit)");
  });

  it("returns the outstanding count as a number, not a thing to work out", () => {
    expect(CODE).toContain("remaining_without_draft: outstanding,");
    expect(CODE).toContain("const outstanding = annotated.filter((r) => !r.has_draft).length;");
  });
});

describe("a turn that cannot finish twelve drafts does not start twelve", () => {
  it("sizes the inline batch against the clock", () => {
    // Twelve drafts were started on the eighth tool call of a 110s turn. Each
    // generate-email fetch is given whatever is left of the budget as its abort
    // timeout, so all twelve were cut off: "0/12 drafted", nothing saved.
    expect(CODE).toContain("const affordableWaves = Math.floor((timeLeft() - RESERVE_MS) / PER_WAVE_MS);");
    expect(CODE).toContain("Math.min(INLINE_DRAFT_LIMIT, affordableWaves * DRAFT_CONCURRENCY)");
    // Never negative, or slice() counts from the end of the list.
    expect(CODE).toMatch(/const inlineLimit = Math\.max\(\s*0,/);
  });

  it("queues the batch instead of burning it when there is no time", () => {
    expect(AGENT).toContain('label: "Queued instead of drafting here"');
    expect(CODE).toContain("if (inlineLimit === 0 && overflow.length > 0)");
  });

  it("the concurrency it budgets for is the concurrency it runs", () => {
    // Two literals drift, and the one that drifts is the one nobody reads.
    expect(CODE).toContain("const DRAFT_CONCURRENCY = 3;");
    expect(CODE).toContain("await mapLimit(ids, DRAFT_CONCURRENCY, genOne)");
  });
});

describe("a drafting failure says why, and stops", () => {
  it("surfaces the reason the generator gave", () => {
    // draftForLead has carried `error` all along; the event threw it away and
    // printed "0/12 drafted". Two calls, twenty-four generations, no reason.
    expect(CODE).toContain("const failureReasons = [");
    expect(CODE).toMatch(/failureReasons\.slice\(0, 2\)\.join\("; "\)/);
    expect(CODE).toContain("String(d.error ?? \"Draft failed\")");
  });

  it("refuses a second attempt in the same turn", () => {
    expect(CODE).toContain("if (okCount === 0 && ids.length > 0) draftingProducedNothing = true;");
    expect(CODE).toContain("drafting_already_failed_this_turn");
    const flagged = CODE.indexOf("if (draftingProducedNothing) {");
    const drafting = CODE.indexOf("const affordableWaves");
    expect(flagged).toBeGreaterThan(-1);
    // Checked before any work is done, not after another twelve generations.
    expect(flagged).toBeLessThan(drafting);
  });

  it("returns an error rather than a result that reads as partial progress", () => {
    expect(CODE).toContain('error: "nothing_was_drafted"');
    expect(AGENT).toContain("Nothing is saved for these leads.");
    expect(AGENT).toContain("queued means a background worker has not");
  });
});

describe("the drafts total comes from the drafts table", () => {
  it("counts what is really there when a turn drafts at all", () => {
    expect(CODE).toContain("const draftTouched =");
    // One block: the condition, the count of the real table, and the sentence
    // the user reads. A count taken anywhere else is a different number.
    expect(CODE).toMatch(
      /draftTouched > 0[\s\S]{0,600}\.from\("email_drafts"\)[\s\S]{0,200}count: "exact", head: true/,
    );
  });

  it("puts it above the reply, not under it", () => {
    // The user was shown "43 Follow-Ups Drafted" and had 20. A contradiction
    // below the thing it contradicts arrives after it has been believed.
    expect(AGENT).toMatch(/finalText =\s*`📝 Your drafts folder holds \$\{draftsNow \?\? 0\}[\s\S]{0,200}\$\{finalText\}`/);
  });

  it("counts the tally where the work happens, not where the reply is written", () => {
    expect(CODE).toContain("draftTally.written += okCount;");
    expect(CODE).toContain("draftTally.queued += toQueue.length;");
    expect(CODE).toContain("draftTally.skippedAlreadyDrafted += already.length;");
    expect(CODE).toContain("draftTally.failed += drafts.length - okCount;");
  });

  it("tells the model not to do the arithmetic itself", () => {
    expect(AGENT).toContain("NEVER COUNT DRAFTS YOURSELF");
    expect(AGENT).toContain("drafted_this_call");
    expect(AGENT).toContain("remaining_without_draft");
  });
});

describe("the deploy probe can see this build", () => {
  it("lists a marker for each behaviour this change adds", () => {
    expect(AGENT).toContain('"skips-leads-that-have-drafts"');
    expect(AGENT).toContain('"sizes-inline-batch-to-budget"');
    expect(AGENT).toContain('"reports-real-draft-totals"');
  });
});

describe("the queue worker does not redo drafts either", () => {
  const WCODE = code(WORKER);

  it("checks the drafts table before paying for a generation", () => {
    const check = WCODE.indexOf("leadsWithDrafts(admin, job.user_id, [String(item.lead_id)])");
    const draft = WCODE.indexOf("const result = await draftForLead(");
    expect(check).toBeGreaterThan(-1);
    expect(draft).toBeGreaterThan(-1);
    expect(check).toBeLessThan(draft);
  });

  it("settles the item instead of failing it", () => {
    // The work was done, just not by this item. A failed row gets retried
    // three times and then reported to the user as a failure.
    expect(WCODE).toMatch(/status: "skipped", error: "already drafted"/);
    expect(WCODE).toContain("skipped++;");
    expect(WCODE).toContain("return json({ processed, failed, skipped, claimed: items.length });");
  });

  it("still rewrites when the job is a redraft", () => {
    expect(WCODE).toContain("if (!job.feedback) {");
  });

  it("uses a status the table allows", () => {
    const MIGRATION = readFileSync(
      "supabase/migrations/20260922190000_agent_job_queue.sql",
      "utf8",
    );
    expect(MIGRATION).toContain("'pending', 'claimed', 'done', 'failed', 'skipped'");
  });
});

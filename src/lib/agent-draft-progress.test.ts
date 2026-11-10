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
    // The dedupe lives in queueWork now, so the sweep gets it too —
    // it runs over the whole outstanding set and most of it is already queued.
    expect(CODE).toContain('.eq("status", "pending")');
    expect(CODE).toContain("const toQueue = fresh.filter((id) => !alreadyQueued.has(id));");
    // The items written and the total reported both come from the deduplicated
    // list, or the card counts work no worker will ever do.
    expect(CODE).toContain("toQueue.map((leadId) => ({");
    expect(CODE).toContain("draftTally.queued += toQueue.length;");
  });
});

describe("list_leads can say what is left", () => {
  it("carries has_draft on every row and filters by it", () => {
    expect(CODE).toContain("const wantsUndrafted = filters.without_draft === true;");
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
    expect(CODE).toContain("const undraftedIds = rowIds.filter((id) => !drafted.has(id));");
    // The count covers the whole account, not the page that was fetched: on a
    // bigger account a figure taken from a 500-row scan under-reports the
    // backlog and reads as nearly done.
    expect(CODE).toContain("const allUndrafted = allIds.length > 0");
    expect(CODE).toContain("const outstanding = Math.max(undraftedIds.length, allUndrafted.length);");
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
    expect(AGENT).toContain("backgroundDraftCopy(overflow.length)");
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
    expect(AGENT).toContain("formatDraftTurnSummary({");
    expect(AGENT).toContain("folder: draftsNow ?? 0");
    expect(AGENT).toContain("finalText = `${summary}\\n\\n${finalText}`");
  });

  it("counts the tally where the work happens, not where the reply is written", () => {
    expect(CODE).toContain("draftTally.written += okCount;");
    expect(CODE).toContain("draftTally.queued += toQueue.length;");
    expect(CODE).toContain("draftTally.skippedAlreadyDrafted += already.length;");
    // Too soon to follow up leaves no draft and is not a failure, so it comes
    // off the failed count as well as off okCount — otherwise a batch that
    // correctly declined to email people contacted that morning reports every
    // one of them as broken.
    expect(CODE).toContain("draftTally.failed += drafts.length - okCount - tooSoon.length;");
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

  it("still rewrites when the job is a redraft, and only guards drafting", () => {
    // Narrowed when the queue gained other kinds: the question "does this lead
    // already have a draft" is irrelevant to an enrich, and skipping on it
    // would silently drop that work.
    expect(WCODE).toContain('if (job.kind === "draft" && !job.feedback) {');
  });

  it("uses a status the table allows", () => {
    const MIGRATION = readFileSync(
      "supabase/migrations/20260922190000_agent_job_queue.sql",
      "utf8",
    );
    expect(MIGRATION).toContain("'pending', 'claimed', 'done', 'failed', 'skipped'");
  });
});

/**
 * Eighty-two asked for, fifty-four attempted, and "ready to send when you say go".
 *
 * The run after the first fix deployed. draft_outreach behaved correctly on
 * every call it got — the leads it was handed had no drafts, the batch went to
 * the queue when the turn had no time. What it was handed was the problem: the
 * model split the eighty-two into twelve, twelve, ten, ten, ten, stopped at
 * fifty-four, and reported the batch complete. Twenty-eight people were never
 * drafted for and nothing in the system noticed.
 *
 * The instruction to pass every id in one call was already there. This is what
 * happens instead of writing it again.
 */
describe("the turn finishes the set it was given", () => {
  it("remembers which leads the model said still need drafting", () => {
    // list_leads with without_draft is the model declaring the set it is about
    // to work through, so that is the set the turn is held to.
    // From the rows, not from the annotated copy: spreading a
    // Record<string, unknown> drops the index signature, so the spread's type
    // is `{ has_draft: boolean }` and reading .id off it does not compile.
    // Deno's full typecheck caught that; the offline one structurally cannot.
    expect(CODE).toContain("const rowIds = rows.map((r) => String(r.id));");
    /*
     * The undrafted set the request asked for — not the page, and not the
     * account.
     *
     * This asserted `outstandingPool = allUndrafted`, every matching lead on
     * the account, which is what turned "draft for these 49 new leads" into
     * 162 drafts: the sweep queued the other 140 under a line reading "the
     * whole set is accounted for". Wider than the page so the sweep can still
     * finish what the model started, bounded by the limit the model passed so
     * it cannot finish something nobody asked to start.
     */
    expect(CODE).toContain("outstandingPool = allUndrafted.slice(0, limit);");
    expect(CODE).not.toContain("outstandingPool = pool.map(");
  });

  it("queues whatever the model left out, after it has finished", () => {
    expect(CODE).toContain("const missed = outstandingPool.filter((id) => !handledLeadIds.has(id));");
    expect(CODE).toContain('await queueWork("draft", sweeping, outstandingGoal, outstandingFeedback)');
    expect(AGENT).toContain("sweepCopy(");
  });

  it("bounds what one sentence can commit someone to, and says so", () => {
    // The pool is the whole matching account now. Twenty thousand undrafted
    // leads must not become twenty thousand generations off one turn — and a
    // quiet truncation is what produced the twenty-draft ceiling to begin with.
    expect(CODE).toContain("const SWEEP_LIMIT = 500;");
    expect(CODE).toContain("const sweeping = missed.slice(0, SWEEP_LIMIT);");
    expect(CODE).toContain("const beyondLimit = missed.length - sweeping.length;");
    expect(AGENT).toContain("stillWaiting: sweptBeyondLimit");
    expect(readFileSync("supabase/functions/_shared/agent-step-present.ts", "utf8")).toContain("are still waiting");
  });

  it("only sweeps a set this turn actually drafted from", () => {
    // Otherwise asking "how many leads still need drafts?" queues all of them.
    expect(CODE).toContain("const drewFromPool = outstandingPool.some((id) => handledLeadIds.has(id));");
    expect(CODE).toMatch(/if \(outstandingPool\.length > 0 && drewFromPool\)/);
  });

  it("counts a lead as handled when it was really drafted", () => {
    // draft_id, not the attempt: a generation that failed leaves the lead
    // outstanding, which is what the sweep is for.
    expect(CODE).toContain("for (const d of drafts) if (d.draft_id) handledLeadIds.add(String(d.lead_id));");
  });

  it("sweeps before the total is reported, so the number includes it", () => {
    const sweep = CODE.indexOf("const drewFromPool =");
    const total = CODE.indexOf("const draftTouched =");
    expect(sweep).toBeGreaterThan(-1);
    expect(total).toBeGreaterThan(-1);
    expect(sweep).toBeLessThan(total);
  });
});

describe("one batch job for the turn, not one per call", () => {
  it("opens the job once and appends to it", () => {
    expect(CODE).toContain("const batchJobIds = new Map<string, string>();");
    expect(CODE).toContain("if (!batchJobId) {");
    // Five calls used to mean five jobs, and the card counted one of them.
    expect(CODE).not.toMatch(/let queuedJobId: string \| null = null;/);
  });

  it("keeps the job's total equal to the rows behind it", () => {
    // The card renders total. A number that only counted the latest call is
    // how "0 of 6" appeared on a batch of eighty-two.
    expect(CODE).toMatch(
      /count: itemCount[\s\S]{0,200}\.from\("agent_jobs"\)\.update\(\{ total: itemCount \?\? 0 \}\)/,
    );
    expect(CODE).toContain("total: 0,");
  });

  it("never queues a lead this turn already handled", () => {
    expect(CODE).toContain("const fresh = leadIds.filter((id) => !handled.has(id));");
    expect(CODE).toContain("const toQueue = fresh.filter((id) => !alreadyQueued.has(id));");
    expect(CODE).toContain("for (const id of toQueue) handled.add(id);");
  });

  it("only deletes the job when the failure left it empty", () => {
    // It is shared now. Dropping it on one failed insert would throw away
    // every batch queued earlier in the same turn.
    expect(CODE).toMatch(/if \(!count\) \{\s*await admin\.from\("agent_jobs"\)\.delete\(\)/);
  });

  it("says nothing about drafting when nothing was meant to draft here", () => {
    // Four "0/0 drafted" warnings in a row, on a turn where the queueing did
    // exactly what it should.
    expect(CODE).toContain('if (ids.length > 0) toolEvents.push({');
  });
});

describe("the progress card counts every open batch", () => {
  const HOOK = readFileSync("src/hooks/use-agent-job.tsx", "utf8");

  it("sums the thread's open jobs instead of taking the newest", () => {
    expect(code(HOOK)).not.toContain(".limit(1)");
    expect(code(HOOK)).toContain('total: rows.reduce((n, r) => n + (r.total ?? 0), 0),');
    expect(code(HOOK)).toContain('done: rows.reduce((n, r) => n + (r.done ?? 0), 0),');
  });

  it("cancel stops all of them, not just the one it named", () => {
    expect(code(HOOK)).toContain('.in("id", job.ids ?? [job.id]);');
  });

  it("reads as running while any of them is", () => {
    expect(code(HOOK)).toContain('rows.some((r) => r.status === "running") ? "running" : rows[0].status');
  });
});

/**
 * "2 drafts failed (Cosmic Labs, monar) — will regenerate in next batch."
 *
 * Nothing regenerates them. claim_agent_job_items takes rows where status is
 * 'pending'; a failed item is terminal and is never claimed again. The model
 * said it because the tool result on a partly successful call returned the
 * successes and said nothing whatsoever about the two that did not make it, so
 * the only honest number it had was "7 written" and it invented a future for
 * the other two. Two leads ended the run with no draft and nobody looking.
 */
describe("a failed draft is not quietly promised a retry", () => {
  const QUEUE_SQL = readFileSync(
    "supabase/migrations/20260922190000_agent_job_queue.sql",
    "utf8",
  );

  it("hands the model the failures on a call that mostly worked", () => {
    expect(CODE).toContain("drafts.length > okCount");
    expect(CODE).toContain("reasons: failureReasons,");
  });

  it("tells it in words that nothing picks them up later", () => {
    expect(CODE).toContain("there is no next batch for a failed lead");
    expect(CODE).toContain("never say one will regenerate");
  });

  it("and that is the truth: the queue only ever claims pending work", () => {
    // If this ever grows a retry, the note above becomes the lie instead.
    const from = QUEUE_SQL.indexOf("claim_agent_job_items(p_limit");
    const claim = QUEUE_SQL.slice(from, QUEUE_SQL.indexOf("$$;", from));
    expect(claim).toContain("c.status = 'pending'");
    expect(claim).not.toContain("'failed'");
  });
});

/**
 * "It keeps stopping half way through."
 *
 * It had not stopped. The turn's own prefix said so: "queued 101 to be written
 * in the background... nothing from that set is still waiting." Immediately
 * below it the model wrote "📋 91 remaining to draft after queue completes"
 * and "Reply when you want to continue drafting the remaining 91 leads, or I
 * can wait for the queue to finish first."
 *
 * So the user waited for a batch that was already running, and read the silence
 * as a stall. Twice the queue was investigated for a fault it did not have.
 *
 * The model got that from wording the product handed it. The tool result said
 * the queued leads were "NOT yet drafted", and the system rule said "Queued is
 * not drafted" — both true, and both read naturally as "queued means still to
 * do". Nothing anywhere said the opposite thing that matters: those leads need
 * nothing from anyone, so there is no continuing to offer.
 */
describe("queued work is never described as outstanding", () => {
  it("says the worker is already on them, not that they are undrafted", () => {
    expect(AGENT).toContain("ALREADY BEING DRAFTED by a background worker");
    expect(AGENT).toContain("not outstanding work");
  });

  it("names the words the model actually reached for", () => {
    // Banning the concept did not work; these are the exact phrasings that
    // shipped, so they are the ones spelled out.
    for (const phrase of ["remaining", "left to do", "still to draft", "not yet started"]) {
      expect(AGENT).toContain(phrase);
    }
  });

  it("forbids the offer, not just the count", () => {
    // The count alone was survivable. The offer to continue is what made the
    // user wait, because it implied something was paused.
    expect(AGENT).toContain("never offer to continue them, draft the rest, or pick them up later");
    expect(AGENT).toContain("the user who waits for that offer waits forever");
  });

  it("closes the same hole in the system rule that taught it", () => {
    // "Queued is not drafted." was true and read as "queued = still to do".
    expect(AGENT).toContain("Queued is not drafted YET, but it is not outstanding either");
    expect(AGENT).toContain("never close a turn by offering to continue, resume or pick up leads that are already queued");
  });
});

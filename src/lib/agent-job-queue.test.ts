import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  fallbackSubject,
  splitSubject,
} from "../../supabase/functions/_shared/draft-one";

const MIGRATION = readFileSync("supabase/migrations/20260922190000_agent_job_queue.sql", "utf8");
const WORKER = readFileSync("supabase/functions/process-agent-jobs/index.ts", "utf8");
const AGENT = readFileSync("supabase/functions/agent-chat/index.ts", "utf8");
const SHARED = readFileSync("supabase/functions/_shared/draft-one.ts", "utf8");
const HOOK = readFileSync("src/hooks/use-agent-job.tsx", "utf8");
const CARD = readFileSync("src/components/agent/AgentJobCard.tsx", "utf8");

/** Source with comments stripped, so an assertion cannot match its own explanation. */
const code = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

/**
 * Phase 2 of docs/AGENT_BATCH_QUEUE.md.
 *
 * A request may chain six agent-chat passes, about eleven minutes, before it
 * stops. A 79-lead batch needs more than that. The turn now decides and
 * enqueues; a worker does one lead per item.
 */
describe("claiming work", () => {
  it("claims atomically, which is the one place the rescore queue must not be copied", () => {
    // process-rescore-queue selects pending and processes with no compare-and-
    // set, so two overlapping drains can take the same row. For a rescore that
    // wastes a recompute; here it would write a lead's draft twice.
    expect(MIGRATION).toContain("FOR UPDATE OF c SKIP LOCKED");
    expect(MIGRATION).toContain("SET status = 'claimed'");
    expect(WORKER).toContain('rpc("claim_agent_job_items"');
  });

  it("never claims for a job that is finished or cancelled", () => {
    const claim = MIGRATION.slice(MIGRATION.indexOf("claim_agent_job_items"));
    expect(claim).toContain("j.status IN ('queued', 'running')");
  });

  it("counts the attempt as part of the claim", () => {
    // Otherwise a row that kills the worker every time is retried forever.
    const claim = MIGRATION.slice(MIGRATION.indexOf("claim_agent_job_items"));
    expect(claim).toContain("attempts = i.attempts + 1");
  });

  it("gives a claim back when the worker dies holding it", () => {
    expect(MIGRATION).toContain("release_stale_agent_job_items");
    expect(MIGRATION).toContain("claimed_at < now() - interval '10 minutes'");
    // And gives up rather than retrying a lead that cannot be drafted for.
    expect(MIGRATION).toContain("attempts < 3");
    expect(MIGRATION).toContain("Gave up after three attempts");
  });

  it("the drain releases stale claims before asking whether there is work", () => {
    const drain = MIGRATION.slice(MIGRATION.indexOf("trigger_agent_jobs"));
    expect(drain.indexOf("release_stale_agent_job_items")).toBeLessThan(
      drain.indexOf("SELECT count(*) INTO pending_ct"),
    );
  });

  it("costs nothing when the queue is empty", () => {
    expect(MIGRATION).toContain("IF pending_ct = 0 THEN RETURN; END IF;");
  });
});

describe("what a browser may write", () => {
  it("lets a user cancel their own batch and nothing else", () => {
    expect(MIGRATION).toContain(`CREATE POLICY "agent_jobs_cancel_own"`);
    // The WITH CHECK is the whole guard: a client cannot mark work done.
    expect(MIGRATION).toMatch(/WITH CHECK \(auth\.uid\(\) = user_id AND status = 'cancelled'\)/);
    expect(HOOK).toContain('update({ status: "cancelled" })');
  });

  it("does not give the client an insert policy", () => {
    expect(MIGRATION).not.toMatch(/CREATE POLICY[^;]*agent_job[^;]*FOR INSERT/);
  });

  it("scopes every read to the owner", () => {
    expect(MIGRATION).toContain(`CREATE POLICY "agent_jobs_select_own"`);
    expect(MIGRATION).toContain(`CREATE POLICY "agent_job_items_select_own"`);
    expect((MIGRATION.match(/USING \(auth\.uid\(\) = user_id\)/g) ?? []).length).toBeGreaterThanOrEqual(3);
  });

  it("cannot enqueue the same lead twice in one job", () => {
    expect(MIGRATION).toContain("uq_agent_job_items_job_lead");
    expect(MIGRATION).toContain("ON public.agent_job_items(job_id, lead_id)");
  });
});

describe("the worker", () => {
  it("never sends, it schedules", () => {
    // send-email authenticates from a user's JWT and this worker holds the
    // service role; the cron sender drives Gmail directly through four hundred
    // lines of token refresh, bounce handling and cap checks. A third send path
    // for the highest-stakes code in the product is what this avoids.
    expect(code(WORKER)).not.toContain("send-email");
    expect(code(WORKER)).not.toContain("send_drafts");
    expect(code(WORKER)).not.toContain("gmail.googleapis.com");
    expect(code(WORKER)).toContain('status: "scheduled"');
  });

  it("schedules only for a job the user marked autonomous", () => {
    // Approval mode stops at the draft, which is the finished behaviour:
    // agent-run does the same, because pending work belongs in the Drafts tab.
    expect(code(WORKER)).toMatch(/job\.autonomy === "autonomous"\s*\n?\s*\?\s*await scheduleDraft/);
  });

  it("writes the same outbox row the chat scheduler writes", () => {
    const fn = code(WORKER).slice(code(WORKER).indexOf("async function scheduleDraft"));
    for (const field of ["user_id", "lead_id", "to_email", "subject", "body_html", "body_text", "scheduled_at", "sending_account_id"]) {
      expect(fn, field).toContain(`${field}:`);
    }
    // A row that has not been sent must not be stamped with a send time: it
    // reads everywhere — the sent list, the monthly usage count — as delivered.
    expect(fn).toContain("sent_at: null");
  });

  it("refuses to schedule rather than guessing", () => {
    const fn = code(WORKER).slice(code(WORKER).indexOf("async function scheduleDraft"));
    // No address, no subject, no body, no active mailbox: the draft is already
    // saved, so the worst case is one the user sends themselves.
    expect(fn).toContain("if (!to || !draft.subject || !draft.body) return null;");
    expect(fn).toContain('.eq("status", "active")');
    expect(fn).toContain("if (!mailbox?.integration_id || !mailbox?.email) return null;");
  });

  it("cannot put more in the outbox than the batch it was given", () => {
    const fn = code(WORKER).slice(code(WORKER).indexOf("async function scheduleDraft"));
    expect(fn).toContain("const cap = Number(job.total ?? 0);");
    expect(fn).toContain("alreadyScheduled >= cap");
    // Counted from the rows, because several passes contribute to one job.
    expect(fn).toContain('.not("scheduled_email_id", "is", null)');
  });

  it("never queues a second outbox row for the same lead", () => {
    const fn = code(WORKER).slice(code(WORKER).indexOf("async function scheduleDraft"));
    const guard = fn.slice(0, fn.indexOf(".insert("));
    expect(guard).toContain('.from("sent_emails")');
    expect(guard).toContain('.eq("status", "scheduled")');
    expect(guard).toContain("if (already) return null;");
  });

  it("staggers the batch instead of releasing it as a burst", () => {
    const fn = code(WORKER).slice(code(WORKER).indexOf("async function scheduleDraft"));
    expect(fn).toMatch(/Date\.now\(\) \+ 60_000 \+ alreadyScheduled \* 120_000/);
  });

  it("leaves every daily cap where it already lives", () => {
    // process-scheduled-emails refuses on the user's daily cap, the user's
    // monthly cap, a paused mailbox and the mailbox's own daily cap, and leaves
    // the row scheduled when it does. Re-checking them here would be a second
    // copy of four ceilings.
    const SENDER = readFileSync("supabase/functions/process-scheduled-emails/index.ts", "utf8");
    /*
     * Pinned to the four refusals themselves rather than to how the sender
     * finds its rows. This used to assert `.eq("status", "scheduled")`, which
     * was only ever a proxy for "the sender is the one reading the queue" —
     * and it broke the day that read became an atomic claim, which had nothing
     * to do with where the caps live.
     */
    expect(SENDER).toContain("daily send limit is reached");
    expect(SENDER).toContain("monthly send cap is reached");
    expect(SENDER).toMatch(/mailbox/i);
    expect(code(WORKER)).not.toContain("daily_email_limit");
    expect(code(WORKER)).not.toContain("capacityFor");
  });

  it("checks for a cancel before every item, not once per pass", () => {
    // The per-item work is a function now rather than a loop body, so the rule
    // is pinned to where that function begins, not to the loop that is gone.
    const item = code(WORKER).slice(code(WORKER).indexOf("const processItem = async (item"));
    const cancelAt = item.indexOf('=== "cancelled"');
    const draftAt = item.indexOf("draftForLead(");
    expect(cancelAt).toBeGreaterThan(-1);
    expect(draftAt).toBeGreaterThan(-1);
    expect(cancelAt).toBeLessThan(draftAt);
  });

  it("hands an item back rather than half-doing it when time runs out", () => {
    // The check moved out of the per-item work and into the pool's own loop:
    // a row the budget stopped should never be opened at all, which is also
    // what lets its attempt be given back.
    const drain = code(WORKER).slice(code(WORKER).indexOf("const drain = async ()"));
    expect(drain).toContain("outOfTime()");
    expect(drain).toContain("deferred.push(String(item.id));");
    expect(code(WORKER)).toMatch(/status: "pending", claimed_at: null/);
  });

  it("stops before the next minute's drain overlaps it", () => {
    expect(code(WORKER)).toContain("const BUDGET_MS = 100_000;");
    expect(MIGRATION).toContain("'process-agent-jobs', '* * * * *'");
  });

  it("counts from the rows, not from its own pass", () => {
    // Several passes and several workers contribute to one job.
    const tally = code(WORKER).slice(code(WORKER).indexOf("for (const jobId of touchedJobs)"));
    expect(tally).toContain('.from("agent_job_items")');
    expect(tally).toContain('r.status === "done"');
    expect(tally).toContain("settled === rows.length");
  });

  it("does not resurrect a cancelled job by finishing it", () => {
    const tally = code(WORKER).slice(code(WORKER).indexOf("for (const jobId of touchedJobs)"));
    expect(tally).toContain("wasCancelled");
    expect(tally).toMatch(/finished && !wasCancelled/);
  });

  it("is service-role only", () => {
    expect(WORKER).toContain("requireServiceRole(req)");
  });
});

/**
 * Two paths for the same work is how the batch run and the inline run drift,
 * and it was the main design risk named in the scope. There is one draft path.
 */
describe("one draft path, not two", () => {
  it("both callers use the shared helper", () => {
    expect(AGENT).toContain('from "../_shared/draft-one.ts"');
    expect(WORKER).toContain('from "../_shared/draft-one.ts"');
    expect(AGENT).toContain("draftForLead(");
    expect(WORKER).toContain("draftForLead(");
  });

  it("the helper builds no client and reads no environment of its own", () => {
    // So it behaves the same under a user's JWT and under the service role.
    expect(code(SHARED)).not.toContain("Deno.env");
    expect(code(SHARED)).not.toContain("createClient");
  });

  it("splits the subject the generator writes", () => {
    expect(splitSubject("Subject: Quick one\n\nHello there")).toEqual({
      subject: "Quick one",
      body: "Hello there",
    });
    expect(splitSubject("No subject line here")).toEqual({
      subject: "",
      body: "No subject line here",
    });
  });

  it("does not put a provider's 'Unknown' in the subject line", () => {
    // Real prospects were queued under a subject naming "Unknown" as their
    // company. The rule is that a stand-in value never reaches the subject,
    // not that the subject reads any particular way.
    for (const junk of ["Unknown", "N/A"]) {
      expect(fallbackSubject(junk, []).toLowerCase()).not.toContain(junk.toLowerCase());
    }
    expect(fallbackSubject("Acme", [])).toContain("Acme");
  });

  it("never falls back to a phrase the prompts ban", () => {
    // It returned "Quick question — <company>", which both the Outreach Studio
    // prompt and the subject prompt list as banned, and which was the only
    // subject most drafts ever got.
    for (const company of ["Acme", "Unknown", ""]) {
      expect(fallbackSubject(company, []).toLowerCase()).not.toContain("quick question");
    }
  });

  it("does not reuse a subject this person already had", () => {
    // The fallback is deterministic per lead, so a redraft produced the same
    // subject, which the send path refuses as a repeat — a draft that could
    // never be sent, generated over and over.
    const first = fallbackSubject("Acme", []);
    const again = fallbackSubject("Acme", [first]);
    expect(again).not.toBe(first);
    expect(again.toLowerCase()).toContain("acme");
  });

  it("replaces a lead's pending draft rather than adding a second one", () => {
    const save = code(SHARED).slice(code(SHARED).indexOf("export async function saveDraft"));
    expect(save.indexOf(".delete()")).toBeLessThan(save.indexOf(".insert("));
  });
});

describe("handing a batch over", () => {
  it("does the first few inline and queues the rest", () => {
    expect(code(AGENT)).toContain("const INLINE_DRAFT_LIMIT = 12;");
    // The inline count is capped by that limit and clipped again by the time
    // the turn has left; whatever is over the line is queued, not dropped.
    expect(code(AGENT)).toContain("Math.min(INLINE_DRAFT_LIMIT, affordableWaves * DRAFT_CONCURRENCY)");
    expect(code(AGENT)).toContain("const overflow = pending.slice(inlineLimit);");
  });

  it("stopped silently truncating the request", () => {
    // `.slice(0, 20)` with no word to the user turned a 79-lead ask into 20.
    expect(code(AGENT)).not.toContain(".slice(0, 20)");
  });

  it("queues before drafting inline, so a dying turn keeps the batch", () => {
    const tool = code(AGENT).slice(code(AGENT).indexOf('case "draft_outreach"'));
    // Matched on shape, not on the concurrency literal: the invariant is the
    // order of the two blocks, and pinning the number broke this test the day
    // the number became a named constant.
    const drafting = tool.search(/await mapLimit\(ids, \w+, genOne\)/);
    expect(drafting).toBeGreaterThan(-1);
    expect(tool.indexOf('.from("agent_jobs")')).toBeLessThan(drafting);
  });

  it("never leaves a job with no items behind", () => {
    // The enqueue moved to queueForDrafting, shared by every draft_outreach
    // call in the turn and by the sweep that finishes what they missed.
    const helper = code(AGENT).slice(code(AGENT).indexOf("const queueForDrafting = async ("));
    expect(helper).toContain("itemsError");
    expect(helper).toMatch(/from\("agent_jobs"\)\.delete\(\)\.eq\("id", batchJobId\)/);
    // And only when the failure left it empty: it is shared, so dropping it on
    // one failed insert would throw away every batch queued before it.
    expect(helper).toMatch(/if \(!count\) \{/);
  });

  it("tells the model the queue already has those leads", () => {
    // Otherwise it reports twelve as the whole job, or drafts them a second time.
    const tool = AGENT.slice(AGENT.indexOf('case "draft_outreach"'));
    expect(tool).toContain("drafting them here would write each draft twice");
    expect(tool).toContain("job_id: queuedJobId");
  });

  it("carries the autonomy in force when the user asked", () => {
    // The work runs later; the answer to "was this allowed to send" must be the
    // one from when they asked, not from whatever the toggle says at 11pm.
    const helper = code(AGENT).slice(code(AGENT).indexOf("const queueForDrafting = async ("));
    expect(helper).toMatch(/autonomy: \(thread as any\)\.autonomy/);
    expect(MIGRATION).toContain("autonomy           text NOT NULL DEFAULT 'approval'");
  });
});

describe("what the user sees while it runs", () => {
  it("shows counts rather than the agent narrating progress", () => {
    expect(CARD).toContain("{settled} of {job.total}");
    expect(CARD).toContain("Cancel");
  });

  it("polls, because this table is not on the realtime publication", () => {
    expect(HOOK).toContain("setInterval");
    expect(HOOK).toContain("document.hidden");
    expect(HOOK).toContain('.in("status", ["queued", "running"])');
  });

  it("is mounted in the conversation", () => {
    const PAGE = readFileSync("src/pages/AgentChat.tsx", "utf8");
    expect(PAGE).toContain("<AgentJobCard");
    expect(PAGE).toContain("useAgentJob(threadId)");
  });
});

/**
 * "Only generated 46 and stopped working."
 *
 * It had not stopped. The worker claimed eight rows and drafted them strictly
 * one after another — `for (const item of items)` with an await on a full
 * generate-email round trip inside it. A draft is research plus a model call
 * plus up to three regenerations, twenty to forty seconds, against a pass that
 * stops starting work at eighty. Two to four of the eight finished and the
 * rest went back, so the queue could not exceed about three drafts a minute
 * however many rows it took. A hundred leads was half an hour of wall clock.
 *
 * Worse, claim_agent_job_items increments attempts when it TAKES the row. An
 * item handed back untouched had spent one of its three for nothing, and three
 * passes of that retired it as "Gave up after three attempts" for a lead
 * nothing was ever tried on.
 */
describe("the batch is drafted several at a time", () => {
  const THROUGHPUT = readFileSync(
    "supabase/migrations/20261003120000_agent_queue_throughput.sql",
    "utf8",
  );
  const worker = code(WORKER);

  it("no longer walks the claim one row at a time", () => {
    expect(worker).not.toContain("for (const item of items) {");
    expect(worker).toContain("const processItem = async (item");
  });

  it("runs a bounded pool over a shared queue", () => {
    // The number is a knob now (AGENT_JOB_CONCURRENCY). What matters is that
    // one exists and has a sane default, not that it reads 4 — pinning the
    // literal broke the moment it was made configurable.
    expect(worker).toMatch(/const CONCURRENCY = [^;]*\|\| *\d+;|const CONCURRENCY = \d+;/);
    expect(worker).toMatch(/Array\.from\(\s*\{\s*length:\s*Math\.min\(CONCURRENCY,\s*items\.length\)/);
    // A shared queue, not a slice per worker: one slow draft must not leave
    // its share of the batch unworked while the others idle.
    expect(worker).toContain("const item = queue.shift();");
  });

  it("hands back what it never started, in one statement", () => {
    expect(worker).toContain("deferred.push(String(item.id));");
    expect(worker).toContain('release_agent_job_items');
  });

  it("gives the attempt back with the row", () => {
    expect(THROUGHPUT).toContain("attempts = GREATEST(attempts - 1, 0)");
    // Only rows this pass still holds, so a row another pass settled is never
    // resurrected.
    expect(THROUGHPUT).toMatch(/WHERE id = ANY\(p_ids\)\s*\n\s*AND status = 'claimed'/);
  });

  it("claims enough rows to keep the pool busy", () => {
    expect(THROUGHPUT).toContain("'batch', 12");
  });

  it("runs more than one pass when the backlog is deep, but not many", () => {
    expect(THROUGHPUT).toContain("LEAST(GREATEST(CEIL(pending_ct / 12.0)::integer, 1), 3)");
  });
});

/**
 * Four drafts at once makes two older assumptions false.
 */
describe("what concurrency broke, and did not", () => {
  const worker = code(WORKER);

  it("tells a provider being busy from a draft being refused", () => {
    // aiFetch has no backoff, so a rate limit came back as an ordinary error
    // and the lead was failed for it — permanently, with no draft.
    expect(worker).toContain("const TRANSIENT_FAILURE =");
    expect(worker).toContain("TRANSIENT_FAILURE.test(text)");
    expect(worker).toContain('status: "pending", claimed_at: null, error: text');
  });

  it("still gives up eventually rather than cycling forever", () => {
    expect(worker).toContain('Number(item.attempts ?? 0) < 3');
  });

  it("settles every failure through the one decision", () => {
    // Three call sites used to write status "failed" by hand; a fourth would
    // have been written the same way and missed the retry.
    expect(worker).toContain("await settleFailure(item, result.error");
    expect(worker).toContain("await settleFailure(item, r.error)");
    expect(worker).toContain("await settleFailure(item, e instanceof Error");
  });

  it("does not let four drafts claim the same outbox slot", () => {
    // The stagger is read from rows that only know about finished passes, so
    // four concurrent items read the same count and scheduled the same minute
    // — a burst from one domain, which is what the stagger exists to prevent.
    expect(worker).toContain("const alreadyScheduled = (count ?? 0) + slots.taken;");
    expect(worker).toContain("slots.taken += 1;");
    expect(worker).toContain("const outboxSlots = { taken: 0 };");
  });

  it("keeps the cancel check per item, not per pass", () => {
    expect(worker).toContain('.eq("id", job.id)');
    expect(worker).toContain('(fresh as any)?.status === "cancelled"');
  });
});

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
    expect(SENDER).toContain('.eq("status", "scheduled")');
    expect(code(WORKER)).not.toContain("daily_email_limit");
    expect(code(WORKER)).not.toContain("capacityFor");
  });

  it("checks for a cancel before every item, not once per pass", () => {
    const loop = code(WORKER).slice(code(WORKER).indexOf("for (const item of items)"));
    const cancelAt = loop.indexOf('=== "cancelled"');
    const draftAt = loop.indexOf("draftForLead(");
    expect(cancelAt).toBeGreaterThan(-1);
    expect(draftAt).toBeGreaterThan(-1);
    expect(cancelAt).toBeLessThan(draftAt);
  });

  it("hands an item back rather than half-doing it when time runs out", () => {
    const loop = code(WORKER).slice(code(WORKER).indexOf("for (const item of items)"));
    expect(loop).toContain("outOfTime()");
    expect(loop).toMatch(/status: "pending", claimed_at: null/);
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
    // Real prospects were queued under "Quick question — Unknown".
    expect(fallbackSubject("Unknown", [])).toBe("Quick question");
    expect(fallbackSubject("N/A", [])).toBe("Quick question");
    expect(fallbackSubject("Acme", [])).toBe("Quick question — Acme");
  });

  it("does not reuse a subject this person already had", () => {
    // The fallback is deterministic per lead, so a redraft produced the same
    // subject, which the send path refuses as a repeat — a draft that could
    // never be sent, generated over and over.
    const again = fallbackSubject("Acme", ["Quick question — Acme"]);
    expect(again).not.toBe("Quick question — Acme");
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
    expect(code(AGENT)).toContain("requested.slice(INLINE_DRAFT_LIMIT)");
  });

  it("stopped silently truncating the request", () => {
    // `.slice(0, 20)` with no word to the user turned a 79-lead ask into 20.
    expect(code(AGENT)).not.toContain(".slice(0, 20)");
  });

  it("queues before drafting inline, so a dying turn keeps the batch", () => {
    const tool = code(AGENT).slice(code(AGENT).indexOf('case "draft_outreach"'));
    expect(tool.indexOf('.from("agent_jobs")')).toBeLessThan(tool.indexOf("await mapLimit(ids, 3, genOne)"));
  });

  it("never leaves a job with no items behind", () => {
    const tool = code(AGENT).slice(code(AGENT).indexOf('case "draft_outreach"'));
    expect(tool).toContain("itemsError");
    expect(tool).toMatch(/from\("agent_jobs"\)\.delete\(\)\.eq\("id", queuedJobId\)/);
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
    const tool = code(AGENT).slice(code(AGENT).indexOf('case "draft_outreach"'));
    expect(tool).toMatch(/autonomy: \(thread as any\)\.autonomy/);
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

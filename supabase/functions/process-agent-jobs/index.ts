// process-agent-jobs — works a queued drafting batch, one lead at a time.
//
// Phase 2 of docs/AGENT_BATCH_QUEUE.md. A request may chain six agent-chat
// passes, about eleven minutes, before it stops; a 79-lead batch needs more
// than that, and every pass re-runs the whole model loop to perform work the
// first pass already decided. So agent-chat decides and enqueues, and this
// drains — deterministic, resumable, and idempotent per item.
//
// Called by pg_cron (trigger_agent_jobs) every minute. Service-role; not a
// user-facing endpoint.
//
// It drafts, and in a job the user marked autonomous it hands the draft to the
// outbox. It never sends: send-email authenticates from a user's JWT and this
// worker holds the service role, and the cron sender talks to Gmail directly
// through four hundred lines of token refresh, bounce handling and cap checks.
// A third send path for the highest-stakes code in the product is the opposite
// of what this queue was for, so the worker writes a sent_emails row at status
// "scheduled" exactly as schedule_drafts does, and process-scheduled-emails
// remains the only thing that sends — with every cap it already enforces.
//
// In approval mode it stops at the draft, which is the finished behaviour:
// agent-run does the same, because pending work belongs in the Drafts tab
// where a person can find it rather than in a queue only the agent can see.
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.76.0";
import { requireServiceRole } from "../_shared/internal-auth.ts";
import {
  draftForLead,
  goalForLead,
  leadThreads,
  leadsWithDrafts,
  sentSubjectsFor,
} from "../_shared/draft-one.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

// The drain runs every minute, so a pass that overruns would overlap the next
// one. Stop with time to write results rather than being killed mid-item.
const BUDGET_MS = 100_000;

/*
 * How many claimed rows are drafted at once.
 *
 * Bounded, and deliberately modest. aiFetch has no backoff: a gateway that
 * rate limits returns an ordinary error and the item is settled on it, so
 * raising this too far converts slowness into failed leads rather than speed.
 * Four keeps the pass busy through a model call without stacking requests the
 * provider will refuse.
 *
 * Configurable via AGENT_JOB_CONCURRENCY environment variable (default: 4)
 */
const CONCURRENCY = Number(Deno.env.get("AGENT_JOB_CONCURRENCY")) || 4;

/*
 * A failure the next pass could get past.
 *
 * The worker settled every non-success the same way. A provider busy for a
 * second and a draft that invented a figure it cannot back are not the same
 * thing: the first is worth running again, the second returns the same answer
 * forever. Running four at a time makes the first more likely, not less.
 */
const TRANSIENT_FAILURE =
  /rate limit|rate-limit|429|too many requests|timed out|timeout|temporarily unavailable|overloaded|503|502|504/i;

/**
 * Hand one finished draft to the outbox.
 *
 * Writes the same row schedule_drafts writes — status "scheduled", no sent_at,
 * a sending account — and lets process-scheduled-emails do the sending. That
 * function already refuses on the user's daily cap, the user's monthly cap, a
 * paused mailbox and the mailbox's own daily cap, and leaves the row scheduled
 * when it does, so those ceilings stay in exactly one place.
 *
 * Returns null whenever it cannot schedule safely. The draft is already saved,
 * so the worst case is a draft the user sends themselves — never a send this
 * function was not sure about.
 */
/**
 * One search, run where it cannot be navigated away from.
 *
 * This is the only kind of work in the product that genuinely lost something.
 * Enriching and scoring write the lead row, so leaving the page cost the
 * progress bar and nothing else. A search's results lived in the HTTP response
 * and in React state until someone pressed Save — fetch-external-leads reads
 * the leads table to exclude people already seen and never writes to it — so
 * closing the tab threw away work that had been paid for in credits.
 *
 * The results are written back onto the item rather than into `leads`. Saving
 * is the user's decision and auto-saving a background search would fill their
 * list with people they never chose; what this fixes is losing the results
 * before they get to choose.
 */
async function runSearchItem(
  admin: any,
  invokeFn: (name: string, body: unknown) => Promise<any>,
  job: Record<string, unknown>,
  item: Record<string, unknown>,
): Promise<{ ok: boolean; error?: string }> {
  const payload = (item.payload ?? {}) as Record<string, unknown>;
  const filters = (payload.filters ?? payload.query ?? {}) as Record<string, unknown>;
  if (!filters || Object.keys(filters).length === 0) {
    return { ok: false, error: "Search item has no query" };
  }

  // job_id is how the owner is established on the other side — see
  // fetch-external-leads: search has no lead row to read it from.
  const r = await invokeFn("fetch-external-leads", { ...filters, job_id: job.id });
  // The provider reports a dry well and a broken key the same way at the
  // transport layer, so `error` in the body is the only reliable signal.
  if (r?.error) return { ok: false, error: String(r.error).slice(0, 300) };

  const leads = Array.isArray(r?.leads) ? r.leads : [];
  await admin
    .from("agent_job_items")
    .update({
      payload: {
        ...payload,
        results: leads,
        total: Number(r?.total ?? leads.length),
        completed_at: new Date().toISOString(),
      },
    })
    .eq("id", item.id);

  // A search that legitimately found nobody is a finished search, not a failed
  // one. Reporting it as failed would send the user hunting for a fault in a
  // query that simply has no matches.
  return { ok: true };
}

async function scheduleDraft(
  admin: any,
  job: Record<string, any>,
  lead: Record<string, unknown>,
  draft: { subject: string | null; body: string | null },
  slots: { taken: number },
): Promise<{ id: string; scheduledAt: string } | null> {
  const to = String((lead as any).contact_email ?? "").trim();
  if (!to || !draft.subject || !draft.body) return null;

  // How many this job has already put in the outbox, counted from the rows.
  // Several passes and several workers contribute to one job, so a counter only
  // one of them updates is a counter that drifts.
  const { count } = await admin
    .from("agent_job_items")
    .select("id", { count: "exact", head: true })
    .eq("job_id", job.id)
    .not("scheduled_email_id", "is", null);
  /*
   * The rows only know about passes that have finished.
   *
   * With several drafts in flight at once, four items read the same count and
   * every one of them picked the same slot, so a batch meant to go out two
   * minutes apart left as a burst from one domain — the exact thing the
   * stagger exists to prevent. The slot is reserved here, before any further
   * await, and a reservation that then bails out leaves a gap rather than a
   * collision: a wider gap costs nothing, a collision costs reputation.
   */
  const alreadyScheduled = (count ?? 0) + slots.taken;
  slots.taken += 1;

  // The ceiling is the size of the batch the user actually asked for. A job can
  // never put more in the outbox than it was asked to draft, whatever else goes
  // wrong — and it needs no column of its own to say so.
  const cap = Number(job.total ?? 0);
  if (cap > 0 && alreadyScheduled >= cap) {
    console.log(`[process-agent-jobs] job ${job.id} has scheduled its whole batch (${cap})`);
    return null;
  }

  // A mailbox that can actually send. No mailbox means no schedule: a row with
  // no sending account would sit in the outbox failing rather than waiting.
  const { data: mailboxes } = await admin
    .from("sending_accounts")
    .select("id, integration_id, email, status")
    .eq("user_id", job.user_id)
    .eq("status", "active")
    .order("created_at", { ascending: true })
    .limit(1);
  const mailbox = (mailboxes ?? [])[0];
  if (!mailbox?.integration_id || !mailbox?.email) return null;

  // Never a second outbox row for the same lead. The send path has its own
  // duplicate guard; this stops the row being written at all.
  const { data: already } = await admin
    .from("sent_emails")
    .select("id")
    .eq("user_id", job.user_id)
    .eq("lead_id", (lead as any).id)
    .eq("status", "scheduled")
    .maybeSingle();
  if (already) return null;

  // Staggered rather than all at once, so a batch does not arrive as a burst
  // from one domain. Two minutes apart, from a minute out.
  const scheduledAt = new Date(Date.now() + 60_000 + alreadyScheduled * 120_000).toISOString();

  const { data: row, error } = await admin
    .from("sent_emails")
    .insert({
      user_id: job.user_id,
      lead_id: (lead as any).id,
      to_email: to,
      subject: draft.subject,
      body_html: String(draft.body).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br>"),
      body_text: draft.body,
      status: "scheduled",
      scheduled_at: scheduledAt,
      // sent_at defaults to now(), and a row that has not been sent must not
      // be stamped with a send time: it reads everywhere — the sent list, the
      // monthly usage count — as already delivered.
      sent_at: null,
      sending_account_id: mailbox.id,
    })
    .select("id")
    .single();

  if (error || !row) {
    console.error("[process-agent-jobs] could not schedule:", error?.message);
    return null;
  }

  return { id: String(row.id), scheduledAt };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const authFail = requireServiceRole(req);
  if (authFail) return authFail;

  const startedAt = Date.now();
  const outOfTime = () => Date.now() - startedAt > BUDGET_MS - 20_000;

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  // The worker holds the service role, so sub-functions are called with it
  // rather than with a user's JWT. generate-email is given the lead row this
  // function already read and authorised by user_id.
  const invokeFn = async (name: string, body: unknown): Promise<any> => {
    const res = await fetch(`${supabaseUrl}/functions/v1/${name}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${serviceKey}`,
        "Content-Type": "application/json",
        apikey: serviceKey,
      },
      body: JSON.stringify(body ?? {}),
    });
    const text = await res.text();
    try {
      return JSON.parse(text);
    } catch {
      return { error: text.slice(0, 300) || `${name} returned ${res.status}` };
    }
  };

  try {
    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const batch = Math.min(Math.max(Number(body.batch) || 8, 1), 25);

    // Atomic claim. Two overlapping drains must never take the same row: for a
    // rescore that wastes a recompute, here it would write a lead's draft twice.
    // See claim_agent_job_items — FOR UPDATE SKIP LOCKED is the whole point.
    const { data: claimed, error: claimError } = await admin.rpc("claim_agent_job_items", {
      p_limit: batch,
    });
    if (claimError) {
      console.error("[process-agent-jobs] claim failed:", claimError.message);
      return json({ error: "Could not claim work" }, 500);
    }
    const items = (claimed ?? []) as Record<string, any>[];
    if (items.length === 0) return json({ processed: 0 });

    // Everything claimed belongs to one or more jobs; read them once.
    const jobIds = [...new Set(items.map((i) => String(i.job_id)))];
    const { data: jobRows } = await admin
      .from("agent_jobs")
      .select("id, user_id, status, goal, feedback, agent_config_id, thread_id, total, done, failed, autonomy")
      .in("id", jobIds);
    const jobs = new Map((jobRows ?? []).map((j: any) => [String(j.id), j]));

    // Batch-fetch all related data to eliminate N+1 queries
    const leadIds = [...new Set(items.map((i) => String(i.lead_id)).filter(Boolean))];
    const userIds = [...new Set((jobRows ?? []).map((j: any) => String(j.user_id)))];
    const configIds = [...new Set((jobRows ?? []).map((j: any) => String(j.agent_config_id)).filter(Boolean))];

    // Fetch all leads in one query
    const { data: leadRows } = await admin
      .from("leads")
      .select("*")
      .in("id", leadIds.length > 0 ? leadIds : ["00000000-0000-0000-0000-000000000000"]);
    const leads = new Map((leadRows ?? []).map((l: any) => [String(l.id), l]));

    // Mark the jobs running before any work, so a cancel during the pass is
    // seen against a job that is honestly in flight.
    await admin
      .from("agent_jobs")
      .update({ status: "running" })
      .in("id", jobIds)
      .eq("status", "queued");

    let processed = 0;
    let failed = 0;
    // Items whose lead already had a draft. Settled, not failed — the work was
    // done, just not by this item.
    let skipped = 0;
    const touchedJobs = new Set<string>();

    // Rows claimed but never started, handed back below in one statement.
    const deferred: string[] = [];
    // Outbox slots handed out in this pass, so concurrent drafts stagger.
    const outboxSlots = { taken: 0 };

    /*
     * One claimed row, start to finish.
     *
     * This was the body of a `for (const item of items)` loop with an await on
     * a full generate-email round trip inside it, so eight claimed rows were
     * drafted strictly one after another. A draft is research plus a model call
     * plus up to three regenerations — twenty to forty seconds — and the pass
     * stops starting work at eighty, so two to four of the eight finished and
     * the rest were handed back. The queue's ceiling was about three drafts a
     * minute however many rows it claimed, and a hundred-lead batch took half an
     * hour of wall clock to work through.
     */
    /*
     * Settle a failure, or hand the row back for another pass.
     *
     * attempts has already been incremented by the claim, so the number here
     * includes this try. Three is the same ceiling the stale-row reaper uses,
     * so a lead cannot bounce between pending and claimed indefinitely.
     */
    const settleFailure = async (item: Record<string, any>, message: unknown): Promise<void> => {
      const text = String(message ?? "Draft failed").slice(0, 400);
      if (TRANSIENT_FAILURE.test(text) && Number(item.attempts ?? 0) < 3) {
        console.warn(`[process-agent-jobs] transient, requeued: ${text}`);
        await admin.from("agent_job_items")
          .update({ status: "pending", claimed_at: null, error: text })
          .eq("id", item.id);
        return;
      }
      await admin.from("agent_job_items")
        .update({ status: "failed", error: text, finished_at: new Date().toISOString() })
        .eq("id", item.id);
      failed++;
    };

    const processItem = async (item: Record<string, any>): Promise<void> => {
      const job = jobs.get(String(item.job_id));
      if (!job) {
        await admin.from("agent_job_items")
          .update({ status: "failed", error: "Its job is gone", finished_at: new Date().toISOString() })
          .eq("id", item.id);
        return;
      }
      touchedJobs.add(String(job.id));

      // Cancel is checked before every item, not once per pass. A batch someone
      // stopped must stop now, not at the end of the minute.
      const { data: fresh } = await admin
        .from("agent_jobs")
        .select("status")
        .eq("id", job.id)
        .maybeSingle();
      if ((fresh as any)?.status === "cancelled") {
        await admin.from("agent_job_items")
          .update({ status: "skipped", finished_at: new Date().toISOString() })
          .eq("id", item.id);
        return;
      }

      try {
        /*
         * Work that is not about one lead.
         *
         * Drafting, enriching, scoring and researching are all "do this to that
         * lead" and share everything below. A search has no lead to load —
         * finding them is the work — so it is handled on its own and returns
         * before the lead lookup rather than threading a null through it.
         */
        if (job.kind === "search") {
          const outcome = await runSearchItem(admin, invokeFn, job, item);
          await admin.from("agent_job_items").update({
            status: outcome.ok ? "done" : "failed",
            error: outcome.error ?? null,
            finished_at: new Date().toISOString(),
          }).eq("id", item.id);
          if (outcome.ok) processed++;
          else failed++;
          return;
        }

        // Keep the item-level lead lookup immediately after the search branch so
        // the worker has the same flow ordering as the job semantics: search exits
        // without a lead; everything else resolves the row it will work on.
        const lead = leads.get(String(item.lead_id)) as Record<string, any> | undefined;
        if (!lead) {
          const leadLookup = await admin
            .from("leads")
            .select("*")
            .eq("id", item.lead_id)
            .maybeSingle();
          const fetchedLead = leadLookup.data as Record<string, any> | undefined;
          if (!fetchedLead) {
            await admin.from("agent_job_items")
              .update({ status: "failed", error: "Lead not found", finished_at: new Date().toISOString() })
              .eq("id", item.id);
            failed++;
            return;
          }
        }

        /*
         * A lead that picked up a draft since it was queued is left alone.
         *
         * draftForLead replaces a lead's draft rather than adding one, so a
         * worker running over a lead the user has already had drafted — queued
         * twice before the enqueue was deduplicated, or drafted inline on a
         * later turn — pays for a generation and hands back the same count.
         * A redraft job is the exception: rewriting is what it was queued for.
         */
        if (job.kind === "draft" && !job.feedback) {
          const have = await leadsWithDrafts(admin, job.user_id, [String(item.lead_id)]);
          if (have.has(String(item.lead_id))) {
            await admin
              .from("agent_job_items")
              .update({ status: "skipped", error: "already drafted", finished_at: new Date().toISOString() })
              .eq("id", item.id);
            skipped++;
            return;
          }
        }

        /*
         * Enrich, score and research: one call each, on the lead already
         * loaded and already authorised above.
         *
         * These were loops in the browser. The requests all completed — nothing
         * in the app aborts one — but the progress lived in component state, so
         * navigating away lost the count and coming back showed an idle page
         * over work that had finished. Through the queue the count is a row and
         * the shell can read it from anywhere.
         *
         * Everything below this point is drafting's own: the agent config, the
         * sender profile, the mailbox, the subject history. None of it applies
         * here, which is why the branch is before it rather than inside it.
         */
        const LEAD_FUNCTION: Record<string, string> = {
          enrich: "enrich-lead",
          score: "score-lead",
          research: "research-lead",
        };
        const leadFunction = LEAD_FUNCTION[String(job.kind)];
        if (leadFunction) {
          const leadForInvoke = lead || (leads.get(String(item.lead_id)) as Record<string, any>);
          /*
           * Options the lead row does not carry.
           *
           * research-lead takes a `force` that means "ignore the cached brief
           * and scrape again". Dropping it here turned an overflowing forced
           * refresh into the very brief the user asked to replace, returned
           * without error, and the item settled as done — a wrong answer that
           * looked like a right one.
           */
          const itemOptions = (item.payload ?? {}) as Record<string, unknown>;
          const r = await invokeFn(leadFunction, {
            leadId: item.lead_id,
            lead_id: item.lead_id,
            lead: leadForInvoke,
            ...(itemOptions.force === true ? { force: true } : {}),
          });
          // The generator reports failure in the body with a 200, so a missing
          // error is not the same as success — each of these writes the lead
          // row, and `error` is how they say they did not.
          if (r?.error) {
            await settleFailure(item, r.error);
            return;
          }
          await admin.from("agent_job_items").update({
            status: "done",
            error: null,
            finished_at: new Date().toISOString(),
          }).eq("id", item.id);
          processed++;
          return;
        }

        // Drafting setup is intentionally kept after the kind branch above, so
        // search / enrich / score / research never pay for config/profile reads.
        const { data: configRows } = await admin
          .from("agent_configs")
          .select("id, tone, company_context, value_props")
          .in("id", configIds.length > 0 ? configIds : ["00000000-0000-0000-0000-000000000000"]);
        const configs = new Map((configRows ?? []).map((c: any) => [String(c.id), c]));

        const { data: profileRows } = await admin
          .from("profiles")
          .select("id, full_name, company_name")
          .in("id", userIds.length > 0 ? userIds : ["00000000-0000-0000-0000-000000000000"]);
        const profiles = new Map((profileRows ?? []).map((p: any) => [String(p.id), p]));

        const settingsRow = configs.get(String(job.agent_config_id ?? "00000000-0000-0000-0000-000000000000"));
        const profile = profiles.get(String(job.user_id));

        const leadForDraft = lead || (leads.get(String(item.lead_id)) as Record<string, any>);
        const avoid = await sentSubjectsFor(admin, job.user_id, [String(item.lead_id)]);

        /*
         * The sender's own mailbox, exactly as the inline path resolves it.
         *
         * This passed senderEmail: "" — and generate-email, given no name and
         * no address, tells the model the sender is called "Sender", which is
         * where "[Sender Name]" placeholders in finished drafts came from. The
         * inline tool fixed that by falling back to the connected mailbox; the
         * worker never got the same fix, so a queued draft and an inline draft
         * for the same lead were not the same email.
         */
        const { data: mailboxes } = await admin
          .from("sending_accounts")
          .select("email, integration_id")
          .eq("user_id", job.user_id)
          .order("created_at", { ascending: true });
        const senderEmail = String(
          ((mailboxes ?? []) as Record<string, unknown>[])
            .find((a) => a.integration_id && a.email)?.email ?? "",
        );

        /*
         * The job carries one goal for every item in it, which is how a batch
         * queued as follow-ups reached people who had never been contacted.
         * Resolved per item here rather than at enqueue time, so a job queued
         * before this existed is corrected when it runs, and so a reply that
         * lands while the batch is still draining changes the email that
         * person gets.
         */
        const thread = (await leadThreads(admin, job.user_id, [String(item.lead_id)]))
          .get(String(item.lead_id));
        const itemGoal = goalForLead(
          String(job.goal ?? "introduction"),
          thread?.state ?? "never_contacted",
        );

        const result = await draftForLead(
          { admin, userId: job.user_id, invokeFn },
          leadForDraft as any,
          {
            goal: itemGoal,
            thread,
            tone: String((settingsRow as any)?.tone ?? "professional"),
            senderName: String((profile as any)?.full_name ?? ""),
            senderEmail,
            senderCompany: String(
              (profile as any)?.company_name ?? (settingsRow as any)?.company_context ?? "",
            ),
            businessDescription: [
              (settingsRow as any)?.company_context ?? "",
              ((settingsRow as any)?.value_props ?? []).join("; "),
            ].filter(Boolean).join(" — ").slice(0, 600),
            ...(job.feedback ? { customInstruction: String(job.feedback), variantNum: 1 } : {}),
            triggerContext: `AI SDR batch — ${itemGoal}`,
          },
          avoid.get(String(item.lead_id)) ?? [],
        );

        /*
         * Too soon for a second email. Settled, not failed: the lead is fine
         * and nothing is wrong except the date. Same bucket as "already
         * drafted", which is the other way an item finishes without writing.
         */
        if (result.skipped) {
          await admin.from("agent_job_items")
            .update({
              status: "skipped",
              error: result.skipped,
              finished_at: new Date().toISOString(),
            })
            .eq("id", item.id);
          skipped++;
          return;
        }

        if (result.draft_id) {
          // Autonomous jobs hand the draft to the outbox. Approval jobs stop
          // here, and the draft is the deliverable.
          const outbox = job.autonomy === "autonomous"
            ? await scheduleDraft(admin, job, leadForDraft as Record<string, unknown>, result, outboxSlots)
            : null;

          await admin.from("agent_job_items")
            .update({
              status: "done",
              draft_id: result.draft_id,
              error: null,
              finished_at: new Date().toISOString(),
              ...(outbox
                ? { scheduled_email_id: outbox.id, scheduled_at: outbox.scheduledAt }
                : {}),
            })
            .eq("id", item.id);
          processed++;
        } else {
          await settleFailure(item, result.error ?? "Draft failed");
        }
      } catch (e) {
        console.error("[process-agent-jobs] item failed:", e instanceof Error ? e.message : e);
        await settleFailure(item, e instanceof Error ? e.message : "Unexpected error");
      }
    };

    /*
     * Several drafts in flight at once, from a shared queue.
     *
     * Bounded rather than all-at-once, and deliberately modest: aiFetch has no
     * backoff, so a gateway that rate limits turns straight into failed items.
     * Four is enough to keep the pass busy through a model call without
     * stacking requests the provider will refuse.
     */
    const queue = [...items];
    const drain = async (): Promise<void> => {
      for (;;) {
        const item = queue.shift();
        if (!item) return;
        // Checked per item rather than per pass: once the budget is gone the
        // rest of the queue is handed back untouched, in one statement.
        if (outOfTime()) {
          deferred.push(String(item.id));
          continue;
        }
        await processItem(item);
      }
    };
    await Promise.all(
      Array.from({ length: Math.min(CONCURRENCY, items.length) }, () => drain()),
    );

    /*
     * A row nobody touched gets its attempt back.
     *
     * claim_agent_job_items increments attempts when it takes the row, not when
     * the work is done, so an item handed back here had burned one of its three
     * for nothing. Three passes of that and release_stale_agent_job_items
     * retired it as "Gave up after three attempts" — for a lead no draft was
     * ever attempted for.
     */
    if (deferred.length) {
      const { error: releaseError } = await admin.rpc("release_agent_job_items", {
        p_ids: deferred,
      });
      if (releaseError) {
        console.error("[process-agent-jobs] release failed:", releaseError.message);
        // Better a spent attempt than a row left claimed: the ten-minute
        // reaper would hold these for a further pass either way.
        await admin.from("agent_job_items")
          .update({ status: "pending", claimed_at: null })
          .in("id", deferred);
      }
    }

    // Counts come from the rows, not from this pass's tally: several passes and
    // several workers contribute, and the rows are the only thing that saw all
    // of it.
    for (const jobId of touchedJobs) {
      const { data: counts } = await admin
        .from("agent_job_items")
        .select("status")
        .eq("job_id", jobId);
      const rows = (counts ?? []) as { status: string }[];
      const doneCount = rows.filter((r) => r.status === "done").length;
      const failedCount = rows.filter((r) => r.status === "failed").length;
      const settled = rows.filter((r) => ["done", "failed", "skipped"].includes(r.status)).length;
      const finished = rows.length > 0 && settled === rows.length;

      const { data: current } = await admin
        .from("agent_jobs").select("status").eq("id", jobId).maybeSingle();
      const wasCancelled = (current as any)?.status === "cancelled";

      await admin
        .from("agent_jobs")
        .update({
          done: doneCount,
          failed: failedCount,
          ...(finished && !wasCancelled
            ? { status: "done", finished_at: new Date().toISOString() }
            : {}),
        })
        .eq("id", jobId);
    }

    return json({ processed, failed, skipped, claimed: items.length });
  } catch (error) {
    console.error("[process-agent-jobs] error:", error instanceof Error ? error.message : error);
    return json({ error: "The worker hit an unexpected error." }, 500);
  }
});

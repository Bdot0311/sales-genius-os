import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.76.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * The thing that makes a sequence enrollment actually happen.
 *
 * process-sequence-step takes an enrollmentId and does one step: it checks the
 * trigger, renders the template, writes a `scheduled` sent_emails row for
 * process-scheduled-emails to deliver, and advances current_step. It is
 * correct, it is deployed, and nothing in the entire codebase called it.
 *
 * Nineteen cron jobs exist and not one of them advanced an enrollment. So the
 * chain ran:
 *
 *   enroll  ->  [nothing]  ->  process-sequence-step  ->  sent_emails
 *                                                          -> process-scheduled-emails (cron)
 *                                                          -> send-email
 *
 * Every link was built except the first. An enrollment was written, reported
 * success with a real id and status active, and then sat there permanently.
 * That is true of every path that enrolls — MCP, the UI, the AI SDR's
 * enroll_lead_in_sequence, and the playbook's scheduleFollowUps — because none
 * of them was the problem. The dispatcher was missing.
 *
 * This is that dispatcher. It selects enrollments that are due and asks
 * process-sequence-step to advance each one, rather than reimplementing the
 * step logic: one copy of "what does a step do" is what keeps a sequence
 * behaving the same however it was started.
 */

/** How many enrollments one pass will advance. Keeps a big backlog bounded. */
const BATCH = 200;
/** Concurrency against process-sequence-step; it writes rows and sends nothing itself. */
const CONCURRENCY = 5;
/**
 * How long one pass may run.
 *
 * Two things rest on this. The small one: at BATCH 200 and CONCURRENCY 5 this
 * is forty sequential waves, each an HTTP call that reads rows and may
 * generate, so a pass could outlive the platform's own ceiling and be killed
 * mid-loop. A killed pass is not a disaster here — the enrollments it did not
 * reach are still due and the next pass takes them — but being killed is not
 * the same as stopping, and only one of the two can be relied on.
 *
 * The large one: nothing stops two passes advancing the same enrollment.
 * process-sequence-step reads `current_step`, inserts the outbox row, and
 * only then advances the step, with no compare-and-set — so two passes
 * overlapping on one enrollment would schedule the same step twice, and
 * nothing downstream would catch it. There is no unique index on
 * (enrollment_id, sequence_step).
 *
 * That is unreachable today, and worth being precise about why: the dispatcher
 * is this function's only caller, and its cron is every five minutes while a
 * pass cannot outlive the platform's ~150s. Safety by arithmetic rather than
 * by construction. This budget is what keeps the arithmetic true from this
 * side, and src/lib/sequence-dispatch.test.ts holds it against the schedule
 * from the other. Shorten that cron past this budget and the duplicate becomes
 * reachable — which is not hypothetical, since the rescore backfill in this
 * same repo was moved to every minute for exactly the reason someone would do
 * it here: to drain a backlog faster.
 */
const BUDGET_MS = 110_000;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  // Service role only. This advances other people's sequences by design, so a
  // user token must never reach it. The cron job authenticates with the vault
  // trigger secret rather than the raw service-role key, so accept both —
  // comparing against SUPABASE_SERVICE_ROLE_KEY alone made every scheduled run
  // 401 and no enrollment ever advanced.
  const bearer = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  const internalSecret = Deno.env.get("INTERNAL_TRIGGER_SECRET") ?? "";
  const authorized = !!bearer && (bearer === serviceKey || (!!internalSecret && bearer === internalSecret));
  if (!authorized) {
    return new Response(JSON.stringify({ error: "Service role required" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }


  const supabase = createClient(supabaseUrl, serviceKey);

  try {
    const now = new Date().toISOString();

    // Due means: still running, and its next action is not in the future.
    //
    // next_action_at IS NULL counts as due. MCP sets it, the UI sets it, but a
    // row written by a path that forgot to would otherwise be invisible
    // forever — and invisible-forever is the bug this function exists to fix,
    // so it must not reintroduce a narrower version of it.
    /*
     * Bring back anything whose check-back date has arrived, before asking
     * what is due — otherwise a held enrollment waits a whole extra cycle
     * past the day the prospect named.
     *
     * No cron of its own: this function already runs on a schedule and
     * already owns the question of what is due, and a second schedule is a
     * second thing to go wrong. A sweep that fails is logged and the run
     * continues, because the enrollments that are already active still have
     * work owed and should not wait on it.
     */
    const { data: resumed, error: resumeError } = await supabase.rpc("resume_due_enrollments");
    if (resumeError) {
      console.error("[dispatch-sequence-steps] resume sweep failed:", resumeError.message);
    } else if (typeof resumed === "number" && resumed > 0) {
      console.log(`[dispatch-sequence-steps] resumed ${resumed} held enrollment(s)`);
    }

    const { data: due, error } = await supabase
      .from("sequence_enrollments")
      .select("id, user_id, sequence_id, next_action_at, sequence:email_sequences(status)")
      .eq("status", "active")
      .or(`next_action_at.is.null,next_action_at.lte.${now}`)
      .order("next_action_at", { ascending: true, nullsFirst: true })
      .limit(BATCH);

    if (error) {
      console.error("[dispatch-sequence-steps] query failed:", error.message);
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // A paused or draft sequence does not send, whatever its enrollments say.
    const runnable = (due ?? []).filter((row) => {
      const seq = (row as Record<string, unknown>).sequence as { status?: string } | null;
      return seq?.status === "active";
    });

    let advanced = 0;
    let skipped = 0;
    let failed = 0;
    let deferred = 0;

    const startedAt = Date.now();
    for (let i = 0; i < runnable.length; i += CONCURRENCY) {
      /*
       * Stop of our own accord rather than being killed. The enrollments not
       * reached are still due and still active, so the next pass takes them —
       * nothing here needs releasing, because nothing here was claimed.
       */
      if (Date.now() - startedAt > BUDGET_MS) {
        deferred = runnable.length - i;
        console.log(`[dispatch-sequence-steps] budget reached; ${deferred} left for the next pass`);
        break;
      }
      const slice = runnable.slice(i, i + CONCURRENCY);
      const results = await Promise.all(
        slice.map(async (row) => {
          const id = (row as { id: string }).id;
          try {
            const res = await fetch(`${supabaseUrl}/functions/v1/process-sequence-step`, {
              method: "POST",
              headers: {
                Authorization: `Bearer ${serviceKey}`,
                apikey: serviceKey,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({ enrollmentId: id }),
            });
            const body = await res.json().catch(() => ({}));
            if (!res.ok) {
              console.error(`[dispatch-sequence-steps] ${id} -> ${res.status}`, body?.error ?? "");
              return "failed";
            }
            // "skipped" is a real outcome, not a failure: a trigger condition
            // that is not met yet means this step waits for the prospect to do
            // something, which is the sequence working as designed.
            return body?.action === "email_queued" ? "advanced" : "skipped";
          } catch (e) {
            console.error(`[dispatch-sequence-steps] ${id} threw:`, e instanceof Error ? e.message : e);
            return "failed";
          }
        }),
      );
      for (const r of results) {
        if (r === "advanced") advanced++;
        else if (r === "skipped") skipped++;
        else failed++;
      }
    }

    console.log(
      `[dispatch-sequence-steps] due=${due?.length ?? 0} runnable=${runnable.length} ` +
        `advanced=${advanced} skipped=${skipped} failed=${failed} deferred=${deferred}`,
    );

    return new Response(
      JSON.stringify({
        due: due?.length ?? 0,
        runnable: runnable.length,
        advanced,
        skipped,
        failed,
        deferred,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[dispatch-sequence-steps] unexpected:", err instanceof Error ? err.message : err);
    return new Response(JSON.stringify({ error: "Dispatch failed" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

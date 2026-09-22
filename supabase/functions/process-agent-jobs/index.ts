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
// It drafts and it never sends. That is the phase boundary, and it is what
// makes the blast radius of a bug here a drafts folder to clear.
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.76.0";
import { requireServiceRole } from "../_shared/internal-auth.ts";
import { draftForLead, sentSubjectsFor } from "../_shared/draft-one.ts";

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
      .select("id, user_id, status, goal, feedback, agent_config_id, thread_id, total, done, failed")
      .in("id", jobIds);
    const jobs = new Map((jobRows ?? []).map((j: any) => [String(j.id), j]));

    // Mark the jobs running before any work, so a cancel during the pass is
    // seen against a job that is honestly in flight.
    await admin
      .from("agent_jobs")
      .update({ status: "running" })
      .in("id", jobIds)
      .eq("status", "queued");

    let processed = 0;
    let failed = 0;
    const touchedJobs = new Set<string>();

    for (const item of items) {
      const job = jobs.get(String(item.job_id));
      if (!job) {
        await admin.from("agent_job_items")
          .update({ status: "failed", error: "Its job is gone", finished_at: new Date().toISOString() })
          .eq("id", item.id);
        continue;
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
        continue;
      }

      // Out of time: give the row back rather than half-doing it. attempts was
      // already incremented by the claim, so a row cannot loop here forever.
      if (outOfTime()) {
        await admin.from("agent_job_items")
          .update({ status: "pending", claimed_at: null })
          .eq("id", item.id);
        continue;
      }

      try {
        const { data: lead } = await admin
          .from("leads")
          .select("*")
          .eq("id", item.lead_id)
          .eq("user_id", job.user_id)
          .maybeSingle();

        if (!lead) {
          await admin.from("agent_job_items")
            .update({ status: "failed", error: "Lead not found", finished_at: new Date().toISOString() })
            .eq("id", item.id);
          failed++;
          continue;
        }

        const { data: settingsRow } = await admin
          .from("agent_configs")
          .select("tone, company_context, value_props")
          .eq("id", job.agent_config_id ?? "00000000-0000-0000-0000-000000000000")
          .maybeSingle();
        const { data: profile } = await admin
          .from("profiles")
          .select("full_name, company_name")
          .eq("id", job.user_id)
          .maybeSingle();

        const avoid = await sentSubjectsFor(admin, job.user_id, [String(item.lead_id)]);

        const result = await draftForLead(
          { admin, userId: job.user_id, invokeFn },
          lead as any,
          {
            goal: String(job.goal ?? "introduction"),
            tone: String((settingsRow as any)?.tone ?? "professional"),
            senderName: String((profile as any)?.full_name ?? ""),
            senderEmail: "",
            senderCompany: String(
              (profile as any)?.company_name ?? (settingsRow as any)?.company_context ?? "",
            ),
            businessDescription: [
              (settingsRow as any)?.company_context ?? "",
              ((settingsRow as any)?.value_props ?? []).join("; "),
            ].filter(Boolean).join(" — ").slice(0, 600),
            ...(job.feedback ? { customInstruction: String(job.feedback), variantNum: 1 } : {}),
            triggerContext: "AI SDR batch",
          },
          avoid.get(String(item.lead_id)) ?? [],
        );

        if (result.draft_id) {
          await admin.from("agent_job_items")
            .update({ status: "done", draft_id: result.draft_id, error: null, finished_at: new Date().toISOString() })
            .eq("id", item.id);
          processed++;
        } else {
          await admin.from("agent_job_items")
            .update({ status: "failed", error: String(result.error ?? "Draft failed").slice(0, 400), finished_at: new Date().toISOString() })
            .eq("id", item.id);
          failed++;
        }
      } catch (e) {
        console.error("[process-agent-jobs] item failed:", e instanceof Error ? e.message : e);
        await admin.from("agent_job_items")
          .update({
            status: "failed",
            error: (e instanceof Error ? e.message : "Unexpected error").slice(0, 400),
            finished_at: new Date().toISOString(),
          })
          .eq("id", item.id);
        failed++;
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

    return json({ processed, failed, claimed: items.length });
  } catch (error) {
    console.error("[process-agent-jobs] error:", error instanceof Error ? error.message : error);
    return json({ error: "The worker hit an unexpected error." }, 500);
  }
});

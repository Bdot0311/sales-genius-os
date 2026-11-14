// @ts-nocheck
import { createClient } from "npm:@supabase/supabase-js@2.76.0";
import { corsHeaders, resolveCaller } from "../_shared/internal-auth.ts";

/**
 * Drafting for many leads from Outreach Studio.
 *
 * The composer wrote one email for one lead, and beside it sat a Bulk Send
 * dialog with its own generator and its own browser loop. Two ways to write the
 * same email, differing only in how many people got it, and a user said the
 * obvious thing: one at a time is too slow.
 *
 * The queue that drafts for the agent already solves this — it survives the tab
 * closing, reports into the shell banner, resolves the goal per lead and skips
 * leads that already have a draft. What it did not have was a door the composer
 * could use: agent_jobs has no insert policy, so only a function holding the
 * service role can open a batch, and the only one that did was the chat.
 *
 * This is that door. It is deliberately thin — it opens the job and queues the
 * items, and process-agent-jobs does all of the work, so there is one drafting
 * path rather than a second one that drifts.
 */

/** One request cannot commit someone to more than they can see. */
const MAX_LEADS = 500;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // Validate request size (max 1MB)
  const contentLength = req.headers.get("content-length");
  if (contentLength && Number(contentLength) > 1_048_576) {
    return json({ error: "Request payload too large (max 1MB)" }, 413);
  }

  const caller = await resolveCaller(req);
  if (!caller.ok) return caller.response;
  // The composer calls this with the user's own JWT. An internal caller has no
  // user to own the job, and nothing else needs this door.
  if (caller.internal || !caller.userId) {
    return json({ error: "This endpoint is called by a signed-in user." }, 403);
  }
  const userId = caller.userId;

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  try {
    const body = await req.json().catch(() => ({}));
    const requested: string[] = [
      ...new Set(
        (Array.isArray(body.lead_ids) ? body.lead_ids : [])
          .map((v: unknown) => String(v ?? "").trim())
          .filter(Boolean),
      ),
    ];
    if (requested.length === 0) return json({ error: "No leads were selected." }, 422);
    if (requested.length > MAX_LEADS) {
      return json({ error: `At most ${MAX_LEADS} leads in one batch.` }, 422);
    }

    const goal = String(body.goal ?? "introduction").trim().toLowerCase() || "introduction";
    const feedback = body.feedback ? String(body.feedback).slice(0, 2000) : null;
    // Approval unless the caller says otherwise: an autonomous job puts its
    // drafts straight into the outbox, and that is never a default.
    const autonomy = body.autonomy === "autonomous" ? "autonomous" : "approval";

    /*
     * Only this user's leads, confirmed against the table rather than trusted
     * from the body. The worker reads each lead by id and user_id anyway, but
     * a job whose items name someone else's leads would sit there failing and
     * reporting a count the user cannot explain.
     */
    const { data: ownedRows } = await admin
      .from("leads")
      .select("id")
      .eq("user_id", userId)
      .in("id", requested);
    const owned = (ownedRows ?? []).map((r: Record<string, unknown>) => String(r.id));
    if (owned.length === 0) return json({ error: "None of those leads are yours." }, 404);

    /*
     * Leads already waiting in a batch that a worker will still claim.
     *
     * A cancelled job leaves its items pending forever, so counting those as
     * queued would block those leads from ever being drafted again. Same rule
     * as the agent's own enqueue, and the same reason.
     */
    const { data: pendingItems } = await admin
      .from("agent_job_items")
      .select("lead_id, job_id")
      .eq("user_id", userId)
      .eq("status", "pending");
    const pendingRows = (pendingItems ?? []) as Record<string, unknown>[];
    const jobIds = [...new Set(pendingRows.map((r) => String(r.job_id ?? "")).filter(Boolean))];
    const live = new Set<string>();
    if (jobIds.length > 0) {
      const { data: jobs } = await admin
        .from("agent_jobs")
        .select("id")
        .in("id", jobIds)
        .in("status", ["queued", "running"]);
      for (const j of (jobs ?? []) as Record<string, unknown>[]) live.add(String(j.id));
    }
    const alreadyQueued = new Set(
      pendingRows
        .filter((r) => live.has(String(r.job_id ?? "")))
        .map((r) => String(r.lead_id ?? "")),
    );

    const toQueue = owned.filter((id) => !alreadyQueued.has(id));
    if (toQueue.length === 0) {
      return json({
        job_id: null,
        queued: 0,
        already_queued: owned.length,
        not_yours: requested.length - owned.length,
      });
    }

    const { data: job, error: jobError } = await admin
      .from("agent_jobs")
      .insert({
        user_id: userId,
        kind: "draft",
        request_text: String(body.request_text ?? "Outreach Studio batch").slice(0, 500),
        autonomy,
        goal,
        feedback,
        status: "queued",
        total: toQueue.length,
      })
      .select("id")
      .single();
    if (jobError || !job) {
      console.error("[queue-draft-batch] could not open the job:", jobError?.message);
      return json({ error: "Could not start the batch." }, 500);
    }
    const jobId = String(job.id);

    const { error: itemsError } = await admin.from("agent_job_items").insert(
      toQueue.map((leadId) => ({
        job_id: jobId,
        user_id: userId,
        lead_id: leadId,
        status: "pending",
      })),
    );
    if (itemsError) {
      // A job with no items sits at 0 of N forever and reads as stuck.
      console.error("[queue-draft-batch] could not queue the items:", itemsError.message);
      await admin.from("agent_jobs").delete().eq("id", jobId);
      return json({ error: "Could not start the batch." }, 500);
    }

    console.log(`[queue-draft-batch] job ${jobId}: ${toQueue.length} lead(s), goal ${goal}`);
    return json({
      job_id: jobId,
      queued: toQueue.length,
      already_queued: owned.length - toQueue.length,
      not_yours: requested.length - owned.length,
    });
  } catch (e) {
    console.error("[queue-draft-batch] error:", e instanceof Error ? e.message : e);
    return json({ error: "The batch could not be started." }, 500);
  }
});

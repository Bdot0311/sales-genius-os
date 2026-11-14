import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@^2.76.1";
import { DEFAULT_RUBRIC, RubricWeights, scoreLead, scoreUpdate, SignalEventInput } from "../_shared/lead-scoring.ts";
import { requireServiceRole } from "../_shared/internal-auth.ts";

// Drains the rescore_queue. Called by pg_cron (trigger_rescore_queue). Scores
// each queued lead with the deterministic engine and writes the result. Uses
// the deterministic reason string (no per-lead model call) so batch rescoring
// stays cheap. Service-role; not a user-facing endpoint.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const authFail = requireServiceRole(req);
  if (authFail) return authFail;

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  try {
    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const batch = Math.min(Math.max(Number(body.batch) || 50, 1), 200);

    /*
     * Recover claims from runs that are gone, before taking more.
     *
     * A 'processing' row was invisible to everything: nothing read claimed_at
     * and nothing returned it to 'pending', so a run that died after claiming
     * left those leads holding a stale score permanently. The queue is how a
     * lead's ICP fit and signal score stay current, so the symptom was a badge
     * that quietly stopped moving. See 20261016010000_fair_rescore_claim.sql.
     */
    const { error: reapError } = await supabase.rpc("release_stale_rescore_items");
    if (reapError) {
      // Not fatal — the claim below is still correct, this run just does not
      // pick up what an earlier one dropped.
      console.warn("[process-rescore-queue] stale-claim sweep failed:", reapError.message);
    }

    /*
     * Claim the batch rather than choosing it here.
     *
     * Selection used to happen in this function: read the oldest N ids by
     * enqueued_at, then ask the RPC to claim those ids. Two problems, both
     * fixed by moving it into the claim.
     *
     * Ordering by enqueued_at across the whole table meant one account's bulk
     * import owned the queue and every other account's scores waited behind
     * it. And two overlapping drains read the *same* ids, so SKIP LOCKED gave
     * them to one and the other claimed nothing and returned `processed: 0` —
     * wasting a whole pass, exactly when the queue is deep enough for the
     * one-minute backfill job to be running alongside the five-minute one.
     * Measured on a real cluster: three simultaneous drains now take 50 rows
     * each, 150 distinct, where before it was 50 and two empty-handed.
     */
    const { data: claimed, error: claimError } = await supabase
      .rpc("claim_rescore_items", { p_limit: batch });
    if (claimError) {
      console.error("[process-rescore-queue] claim failed:", claimError.message);
      throw claimError;
    }

    const toProcess = (claimed ?? []) as { id: string; user_id: string; lead_id: string }[];

    if (toProcess.length === 0) {
      return new Response(JSON.stringify({ processed: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const nowMs = Date.parse(new Date().toISOString());
    let processed = 0;

    /*
     * A wall clock, because this had none.
     *
     * Each row is five sequential round trips, and the batch can be up to 200.
     * A run that overruns is killed by the platform mid-loop, and a killed run
     * cannot hand anything back — which is how rows ended up stuck. Stopping
     * early and releasing what is left turns that into a no-op instead.
     *
     * 100s leaves room under the platform's own limit.
     */
    const startedAt = Date.now();
    const BUDGET_MS = 100_000;
    const outOfTime = () => Date.now() - startedAt > BUDGET_MS;
    const releaseLater: string[] = [];

    // Cache the rubric + ICP per user across the batch.
    const rubricCache = new Map<string, RubricWeights>();
    const icpCache = new Map<string, unknown>();

    for (const row of toProcess) {
      // Back on the queue rather than started with no time to finish. The
      // release gives the attempt back too, since nothing was tried.
      if (outOfTime()) {
        releaseLater.push(row.id);
        continue;
      }
      try {
        if (!rubricCache.has(row.user_id)) {
          const { data: r } = await supabase.from("scoring_rubric").select("weights").eq("user_id", row.user_id).maybeSingle();
          rubricCache.set(row.user_id, (r?.weights as RubricWeights) || DEFAULT_RUBRIC);
        }
        if (!icpCache.has(row.user_id)) {
          const { data: icp } = await supabase
            .from("icp_profiles")
            .select("industries, company_size_min, company_size_max, seniority_levels, departments, target_titles, geographies, tech_stack")
            .eq("user_id", row.user_id).order("updated_at", { ascending: false }).limit(1).maybeSingle();
          icpCache.set(row.user_id, icp || null);
        }

        const { data: lead } = await supabase
          .from("leads")
          .select("*")
          .eq("id", row.lead_id).maybeSingle();

        if (lead) {
          const { data: events } = await supabase
            .from("signal_events").select("signal_type, weight, occurred_at, metadata").eq("lead_id", row.lead_id);

          const result = scoreLead(
            lead as any,
            icpCache.get(row.user_id) as any,
            (events as SignalEventInput[]) || [],
            rubricCache.get(row.user_id)!,
            nowMs,
          );

          // Same payload score-lead-v2 writes. This used to set fit_score but
          // not icp_score, so a queued rescore left the ICP badge showing
          // whatever a different scorer had last put there.
          await supabase.from("leads").update(
            scoreUpdate(result, !!icpCache.get(row.user_id), new Date().toISOString()),
          ).eq("id", row.lead_id);
        }

        await supabase.from("rescore_queue").update({ status: "done", processed_at: new Date().toISOString() }).eq("id", row.id);
        processed++;
      } catch (e) {
        console.error("[process-rescore-queue] row failed:", row.id, e instanceof Error ? e.message : e);
        await supabase.from("rescore_queue").update({ status: "error", processed_at: new Date().toISOString() }).eq("id", row.id);
      }
    }

    if (releaseLater.length > 0) {
      const { error: releaseError } = await supabase
        .rpc("release_rescore_items", { p_ids: releaseLater });
      if (releaseError) {
        // The stale sweep picks these up in fifteen minutes either way.
        console.warn(
          `[process-rescore-queue] could not hand back ${releaseLater.length} claim(s):`,
          releaseError.message,
        );
      }
    }

    return new Response(JSON.stringify({ processed, deferred: releaseLater.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[process-rescore-queue] error:", e instanceof Error ? e.message : e);
    return new Response(JSON.stringify({ error: "internal" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

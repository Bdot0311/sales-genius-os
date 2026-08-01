import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.76.0";
import { DEFAULT_RUBRIC, RubricWeights, scoreLead, SignalEventInput } from "../_shared/lead-scoring.ts";

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

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  try {
    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const batch = Math.min(Math.max(Number(body.batch) || 50, 1), 200);

    const { data: rows } = await supabase
      .from("rescore_queue")
      .select("id, user_id, lead_id")
      .eq("status", "pending")
      .order("enqueued_at", { ascending: true })
      .limit(batch);

    if (!rows || rows.length === 0) {
      return new Response(JSON.stringify({ processed: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const nowMs = Date.parse(new Date().toISOString());
    let processed = 0;

    // Cache the rubric + ICP per user across the batch.
    const rubricCache = new Map<string, RubricWeights>();
    const icpCache = new Map<string, unknown>();

    for (const row of rows) {
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
          .select("id, industry, company_size, job_title, country, company_name")
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

          await supabase.from("leads").update({
            fit_score: result.fit_score,
            intent_score: result.intent_score,
            tier: result.tier,
            score_reason: result.reason,
            scored_at: new Date().toISOString(),
            score_breakdown: result.breakdown,
          }).eq("id", row.lead_id);
        }

        await supabase.from("rescore_queue").update({ status: "done", processed_at: new Date().toISOString() }).eq("id", row.id);
        processed++;
      } catch (e) {
        console.error("[process-rescore-queue] row failed:", row.id, e instanceof Error ? e.message : e);
        await supabase.from("rescore_queue").update({ status: "error", processed_at: new Date().toISOString() }).eq("id", row.id);
      }
    }

    return new Response(JSON.stringify({ processed }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[process-rescore-queue] error:", e instanceof Error ? e.message : e);
    return new Response(JSON.stringify({ error: "internal" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

// bulk-runs — the owner's controls for a bulk research + drafting run.
//
// estimate → create (awaiting approval) → approve (a person, with a lead cap)
// → pause / resume / cancel. The worker (process-bulk-runs) only ever touches
// runs a person approved here. Agents can create and inspect runs through
// agent-chat but approval is deliberately not exposed to them.
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@^2.76.1";
import { z } from "npm:zod@3.23.8";
import { applyBulkFilters, estimateRun, normalizeFilters } from "../_shared/bulk-run-logic.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const Body = z.object({
  action: z.enum(["estimate", "create", "approve", "pause", "resume", "cancel", "list", "get"]),
  run_id: z.string().uuid().optional(),
  filters: z.record(z.unknown()).optional(),
  do_research: z.boolean().optional(),
  do_draft: z.boolean().optional(),
  goal: z.string().max(60).optional(),
  feedback: z.string().max(1000).optional(),
  name: z.string().max(120).optional(),
  agent_config_id: z.string().uuid().optional(),
  max_leads: z.number().int().positive().optional(),
});

// deno-lint-ignore no-explicit-any
async function countMatching(admin: any, userId: string, filters: unknown): Promise<number> {
  const f = normalizeFilters(filters);
  const { count, error } = await applyBulkFilters(
    admin.from("leads").select("id", { count: "exact", head: true }),
    userId,
    f,
  );
  if (error) throw new Error(error.message);
  return count ?? 0;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });
  try {
    const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
    if (!token) return json({ error: "Missing authorization header" }, 401);
    const { data: { user }, error: authError } = await admin.auth.getUser(token);
    if (authError || !user) return json({ error: "Unauthorized" }, 401);

    const parsed = Body.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return json({ error: "Invalid request", details: parsed.error.flatten().fieldErrors }, 400);
    const b = parsed.data;
    const userId = user.id;

    const ownRun = async () => {
      if (!b.run_id) return null;
      const { data } = await admin.from("bulk_runs").select("*").eq("id", b.run_id).eq("user_id", userId).maybeSingle();
      return data as Record<string, any> | null;
    };

    if (b.action === "list") {
      const { data } = await admin.from("bulk_runs").select("*").eq("user_id", userId)
        .order("created_at", { ascending: false }).limit(25);
      return json({ runs: data ?? [] });
    }

    if (b.action === "get") {
      const run = await ownRun();
      if (!run) return json({ error: "Run not found" }, 404);
      const { data: failures } = await admin.from("bulk_run_items").select("lead_id, error, attempts, finished_at")
        .eq("run_id", run.id).eq("stage", "failed").order("finished_at", { ascending: false }).limit(20);
      const { count: pending } = await admin.from("bulk_run_items").select("id", { count: "exact", head: true })
        .eq("run_id", run.id).in("stage", ["pending", "claimed"]);
      return json({ run, pending: pending ?? 0, recent_failures: failures ?? [] });
    }

    if (b.action === "estimate" || b.action === "create") {
      const { data: sub } = await admin.from("subscriptions").select("plan, status").eq("user_id", userId).maybeSingle();
      if (!sub || (sub as any).plan === "free") {
        return json({ error: "Bulk runs need a paid plan.", error_code: "plan_required" }, 200);
      }
      const doResearch = b.do_research ?? true;
      const doDraft = b.do_draft ?? true;
      if (!doResearch && !doDraft) return json({ error: "Choose research, drafting or both." }, 400);
      const filters = normalizeFilters(b.filters);
      const matched = await countMatching(admin, userId, filters);
      const estimate = estimateRun(matched, doResearch, doDraft);
      if (b.action === "estimate") return json({ filters, matched, estimate });
      if (matched === 0) return json({ error: "No leads match this filter.", matched: 0 }, 200);

      const { data: run, error } = await admin.from("bulk_runs").insert({
        user_id: userId,
        agent_config_id: b.agent_config_id ?? null,
        name: b.name || "Bulk research and drafting",
        filters,
        do_research: doResearch,
        do_draft: doDraft,
        goal: b.goal || "introduction",
        feedback: b.feedback || null,
        status: "awaiting_approval",
        matched_count: matched,
        estimate,
      }).select("*").single();
      if (error) return json({ error: error.message }, 500);
      return json({ run, matched, estimate });
    }

    const run = await ownRun();
    if (!run) return json({ error: "Run not found" }, 404);
    const now = new Date().toISOString();

    if (b.action === "approve") {
      if (run.status !== "awaiting_approval") return json({ error: `This run is ${run.status}, not waiting for approval.` }, 409);
      // Re-count at approval time so the cap the person sees is current.
      const matched = await countMatching(admin, userId, run.filters);
      const cap = Math.min(b.max_leads ?? matched, matched);
      if (cap <= 0) return json({ error: "No leads match this filter any more." }, 409);
      const estimate = estimateRun(cap, run.do_research, run.do_draft);
      const { data, error } = await admin.from("bulk_runs").update({
        status: "running", max_leads: cap, matched_count: matched, estimate, approved_at: now, started_at: now, updated_at: now,
      }).eq("id", run.id).eq("status", "awaiting_approval").select("*").single();
      if (error) return json({ error: error.message }, 500);
      return json({ run: data });
    }
    if (b.action === "pause") {
      if (run.status !== "running") return json({ error: `This run is ${run.status}.` }, 409);
      const { data } = await admin.from("bulk_runs").update({ status: "paused", pause_reason: "Paused by you", updated_at: now })
        .eq("id", run.id).select("*").single();
      return json({ run: data });
    }
    if (b.action === "resume") {
      if (run.status !== "paused") return json({ error: `This run is ${run.status}.` }, 409);
      const { data } = await admin.from("bulk_runs").update({
        status: "running", pause_reason: null, rate_limited_until: null, consecutive_rate_limits: 0, updated_at: now,
      }).eq("id", run.id).select("*").single();
      return json({ run: data });
    }
    if (b.action === "cancel") {
      if (["cancelled", "completed"].includes(run.status)) return json({ run });
      const { data } = await admin.from("bulk_runs").update({ status: "cancelled", finished_at: now, updated_at: now })
        .eq("id", run.id).select("*").single();
      await admin.from("bulk_run_items").update({ stage: "skipped", error: "Run cancelled", finished_at: now })
        .eq("run_id", run.id).eq("stage", "pending");
      return json({ run: data });
    }
    return json({ error: "Unknown action" }, 400);
  } catch (e) {
    console.error("[bulk-runs]", e instanceof Error ? e.message : e);
    return json({ error: "Something went wrong with this run." }, 500);
  }
});

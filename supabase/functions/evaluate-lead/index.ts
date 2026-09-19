// Lead Intelligence evaluation endpoint.
//
// On demand only: the customer clicks "Evaluate" on a lead (or selects a few in
// the list). Nothing here runs on a schedule. Failures return 200 with a
// per-lead `unavailable` decision so the UI degrades instead of breaking.

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.76.0";
import { rateLimit, rateLimitResponse } from "../_shared/rate-limit.ts";
import {
  evaluateLeadWithJEV,
  leadIntelligenceEnabled,
  unavailableDecision,
  type LeadContext,
  type SellerContext,
} from "../_shared/lead-intelligence.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const LEAD_SELECT =
  "id, user_id, company_name, contact_name, contact_email, company_website, job_title, department, seniority, industry, company_size, employee_count, annual_revenue, technologies, company_description, notes, signals, signal_type, intent_reasons, recommended_angle, linkedin_url, research_brief, research_confidence, icp_score, intent_score, intent_label, lead_status, pipeline_stage";

const MAX_LEADS = 10;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Not signed in" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) return json({ error: "Not signed in" }, 401);

    const admin = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const rl = await rateLimit(`evaluate-lead:${user.id}`, 120, 3_600);
    if (!rl.allowed) return rateLimitResponse(rl.retryAfter, corsHeaders);

    if (!(await leadIntelligenceEnabled(admin))) {
      return json({ error: "Lead Intelligence is turned off.", disabled: true }, 200);
    }

    const body = await req.json().catch(() => ({}));
    const ids: string[] = Array.isArray(body?.leadIds)
      ? body.leadIds.filter((v: unknown) => typeof v === "string").slice(0, MAX_LEADS)
      : typeof body?.leadId === "string"
        ? [body.leadId]
        : [];
    if (ids.length === 0) return json({ error: "No leads were selected." }, 400);
    const force = body?.force === true;

    // Ownership is enforced here, not trusted from the client.
    const { data: leads, error: leadError } = await admin
      .from("leads")
      .select(LEAD_SELECT)
      .in("id", ids)
      .eq("user_id", user.id);
    if (leadError) return json({ error: "Could not load those leads." }, 500);
    if (!leads || leads.length === 0) return json({ error: "Those leads could not be found." }, 404);

    // Seller context: what they sell, so fit is judged against their business.
    const seller: SellerContext = {};
    const { data: profile } = await admin
      .from("profiles")
      .select("business_description, company_name")
      .eq("id", user.id)
      .maybeSingle();
    if (profile?.business_description) seller.business_description = profile.business_description;
    const { data: icp } = await admin
      .from("icp_profiles")
      .select("name, industries, target_titles, seniority_levels, departments, company_size_min, company_size_max, value_proposition, pain_points, disqualifiers")
      .eq("user_id", user.id)
      .limit(1)
      .maybeSingle();
    if (icp) {
      const list = (label: string, v: unknown) =>
        Array.isArray(v) && v.length ? `${label}: ${v.slice(0, 10).join(", ")}` : null;
      const size = icp.company_size_min || icp.company_size_max
        ? `headcount: ${icp.company_size_min ?? "?"}-${icp.company_size_max ?? "?"}`
        : null;
      seller.icp_summary = [
        icp.name,
        list("industries", icp.industries),
        list("target titles", icp.target_titles),
        list("seniority", icp.seniority_levels),
        list("departments", icp.departments),
        size,
        icp.value_proposition ? `value proposition: ${icp.value_proposition}` : null,
        list("pain points", icp.pain_points),
        list("disqualifiers", icp.disqualifiers),
      ].filter(Boolean).join("; ") || null;
    }

    const results: Record<string, unknown> = {};
    for (const lead of leads) {
      try {
        const { decision, cached } = await evaluateLeadWithJEV(admin, lead as LeadContext, {
          seller,
          force,
          triggerSource: ids.length > 1 ? "bulk" : "manual",
        });
        results[lead.id] = { ...decision, cached };
      } catch (err) {
        console.error("[evaluate-lead] unexpected failure", lead.id, err);
        results[lead.id] = unavailableDecision(lead.id, "Lead Intelligence is temporarily unavailable.");
      }
    }

    return json({ decisions: results });
  } catch (err) {
    console.error("[evaluate-lead] request failed", err);
    return json({ error: "Lead Intelligence is temporarily unavailable." }, 200);
  }
});

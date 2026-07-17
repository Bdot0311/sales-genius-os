// deliverability-alerts-scan — nightly batch job. Raises in-app alerts for
// domain auth failures and blacklist listings, and resolves alerts whose
// underlying issue has cleared. Reputation-drop alerts are raised by
// compute-reputation. Runs as a scheduled internal job (verify_jwt = false)
// with the service role.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    let raised = 0;

    // Helper: insert an alert only if no active one of the same (user, type, domain) exists.
    async function ensureAlert(params: {
      user_id: string;
      domain: string | null;
      alert_type: string;
      severity: string;
      message: string;
    }) {
      let q = supabase
        .from("deliverability_alerts")
        .select("id")
        .eq("user_id", params.user_id)
        .eq("alert_type", params.alert_type)
        .eq("status", "active");
      q = params.domain ? q.eq("domain", params.domain) : q.is("domain", null);
      const { data: existing } = await q.maybeSingle();
      if (existing) return;
      await supabase.from("deliverability_alerts").insert({
        user_id: params.user_id,
        domain: params.domain,
        alert_type: params.alert_type,
        severity: params.severity,
        message: params.message,
      });
      raised++;
    }

    // ---- Auth failures ----
    const { data: domains } = await supabase
      .from("sending_domains")
      .select("user_id, domain, spf_status, dkim_status, dmarc_status");

    const authFailingDomains = new Set<string>();
    for (const d of domains ?? []) {
      const failing: string[] = [];
      if (d.spf_status === "fail") failing.push("SPF");
      if (d.dkim_status === "fail") failing.push("DKIM");
      if (d.dmarc_status === "fail") failing.push("DMARC");
      if (failing.length > 0) {
        authFailingDomains.add(`${d.user_id}::${d.domain}`);
        await ensureAlert({
          user_id: d.user_id,
          domain: d.domain,
          alert_type: "auth_failure",
          severity: failing.length >= 2 ? "critical" : "warning",
          message: `${failing.join(", ")} failing on ${d.domain}. Messages are more likely to be filtered until this is fixed.`,
        });
      }
    }

    // ---- Blacklist listings (latest check per user/target/rbl) ----
    const { data: bl } = await supabase
      .from("blacklist_checks")
      .select("user_id, target, rbl_name, listed, checked_at")
      .order("checked_at", { ascending: false })
      .limit(2000);

    const seen = new Set<string>();
    const listedTargets = new Set<string>();
    for (const row of bl ?? []) {
      const key = `${row.user_id}::${row.target}::${row.rbl_name}`;
      if (seen.has(key)) continue; // keep only the most recent per (user,target,rbl)
      seen.add(key);
      if (row.listed) {
        listedTargets.add(`${row.user_id}::${row.target}`);
        await ensureAlert({
          user_id: row.user_id,
          domain: row.target,
          alert_type: "blacklist",
          severity: "critical",
          message: `${row.target} is listed on ${row.rbl_name}. Request delisting and pause sending from this domain until resolved.`,
        });
      }
    }

    // ---- Auto-resolve alerts whose cause has cleared ----
    const { data: activeAuth } = await supabase
      .from("deliverability_alerts")
      .select("id, user_id, domain")
      .eq("alert_type", "auth_failure")
      .eq("status", "active");
    for (const a of activeAuth ?? []) {
      if (a.domain && !authFailingDomains.has(`${a.user_id}::${a.domain}`)) {
        await supabase
          .from("deliverability_alerts")
          .update({ status: "resolved", resolved_at: new Date().toISOString() })
          .eq("id", a.id);
      }
    }

    const { data: activeBl } = await supabase
      .from("deliverability_alerts")
      .select("id, user_id, domain")
      .eq("alert_type", "blacklist")
      .eq("status", "active");
    for (const a of activeBl ?? []) {
      if (a.domain && !listedTargets.has(`${a.user_id}::${a.domain}`)) {
        await supabase
          .from("deliverability_alerts")
          .update({ status: "resolved", resolved_at: new Date().toISOString() })
          .eq("id", a.id);
      }
    }

    console.log(`[deliverability-alerts-scan] raised=${raised}`);
    return json({ ok: true, raised });
  } catch (err) {
    console.error("[deliverability-alerts-scan] error:", err);
    return json({ error: "alerts scan failed" }, 500);
  }
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

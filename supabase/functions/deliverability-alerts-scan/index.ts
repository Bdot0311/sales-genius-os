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

    // ---- Notify the user about anything critical ----
    //
    // Everything above writes rows the dashboard reads over realtime. That is
    // the wrong channel for the person this matters most to: the one running
    // campaigns on autopilot rather than watching a dashboard. A domain listed
    // on Saturday went unreported until they next happened to look.
    //
    // Only `critical` is emailed. Warnings stay in-app — a product that emails
    // about everything teaches people to filter the one message that mattered.
    const notified = await notifyCritical(supabase);

    console.log(`[deliverability-alerts-scan] raised=${raised} notified=${notified}`);
    return json({ ok: true, raised, notified });
  } catch (err) {
    console.error("[deliverability-alerts-scan] error:", err);
    return json({ error: "alerts scan failed" }, 500);
  }
});

/**
 * Email every user who has an unnotified critical alert, then stamp the rows.
 *
 * Grouped per user rather than per alert: three listed domains is one problem
 * to act on, and three separate emails about it reads as noise from a broken
 * system. notified_at is what stops the nightly re-run re-sending the same
 * warning every day until the user fixes it.
 *
 * Never throws. A mail failure must not lose the alerts themselves, which are
 * already saved and visible in the dashboard — so a row is stamped only once
 * its email has actually gone out.
 */
async function notifyCritical(supabase: any): Promise<number> {
  try {
    const { data: pending } = await supabase
      .from("deliverability_alerts")
      .select("id, user_id, domain, alert_type, message")
      .eq("status", "active")
      .eq("severity", "critical")
      .is("notified_at", null)
      .limit(200);

    if (!pending?.length) return 0;

    const byUser = new Map<string, any[]>();
    for (const a of pending) byUser.set(a.user_id, [...(byUser.get(a.user_id) ?? []), a]);

    let sent = 0;
    for (const [userId, alerts] of byUser) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("email, full_name")
        .eq("id", userId)
        .maybeSingle();

      // No address to reach them at. Leave notified_at null: if they add one
      // later the next run picks the alert up rather than silently skipping it
      // forever.
      if (!profile?.email) continue;

      const { error: sendErr } = await supabase.functions.invoke("send-transactional-email", {
        body: {
          templateName: "deliverability-alert",
          recipientEmail: profile.email,
          // Alert ids rather than a timestamp: a retry after a partial failure
          // must be recognised as the same message, and the set of ids is what
          // actually identifies this notification.
          idempotencyKey: `deliverability-${alerts.map((a: any) => a.id).sort().join("-")}`.slice(0, 200),
          templateData: {
            name: (profile.full_name || "").split(" ")[0] || undefined,
            issues: alerts.map((a: any) => ({
              type: a.alert_type,
              domain: a.domain,
              message: a.message,
            })),
          },
        },
      });

      if (sendErr) {
        console.error(`[deliverability-alerts-scan] notify failed for ${userId}:`, sendErr.message ?? sendErr);
        continue; // unstamped, so the next run tries again
      }

      await supabase
        .from("deliverability_alerts")
        .update({ notified_at: new Date().toISOString() })
        .in("id", alerts.map((a: any) => a.id));
      sent++;
    }
    return sent;
  } catch (err) {
    console.error("[deliverability-alerts-scan] notify pass failed (non-fatal):", err);
    return 0;
  }
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// deliverability-alerts-scan — nightly batch job. Raises in-app alerts for
// domain auth failures and blacklist listings, and resolves alerts whose
// underlying issue has cleared. Reputation-drop alerts are raised by
// compute-reputation. Runs as a scheduled internal job (verify_jwt = false)
// with the service role.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { notifyDeliverabilityAlert } from "../_shared/notify-events.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";
import { dedupeKey } from "../_shared/managed-email.ts";
import { sendAppEmail } from "../_shared/transactional-email-templates/send-app-email.ts";
import { bounceSeverity, complaintSeverity } from "../_shared/deliverability-thresholds.ts";
import { requireServiceRole } from "../_shared/internal-auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const authFail = requireServiceRole(req);
  if (authFail) return authFail;

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    let raised = 0;
    let failed = 0;

    // Helper: insert an alert only if an active one for the same subject and
    // type is not already open. The subject is a domain for DNS-level problems
    // and a mailbox for per-mailbox ones — deduping on the wrong one would
    // either raise the same alert nightly or hide a second mailbox's problem
    // behind the first.
    async function ensureAlert(params: {
      user_id: string;
      domain?: string | null;
      sending_account_id?: string | null;
      alert_type: string;
      severity: string;
      message: string;
    }) {
      const domain = params.domain ?? null;
      const accountId = params.sending_account_id ?? null;

      let q = supabase
        .from("deliverability_alerts")
        .select("id")
        .eq("user_id", params.user_id)
        .eq("alert_type", params.alert_type)
        .eq("status", "active");
      q = accountId ? q.eq("sending_account_id", accountId) : q.is("sending_account_id", null);
      q = domain ? q.eq("domain", domain) : q.is("domain", null);

      const { data: existing } = await q.maybeSingle();
      if (existing) return;
      const { error: insErr } = await supabase.from("deliverability_alerts").insert({
        user_id: params.user_id,
        domain,
        sending_account_id: accountId,
        alert_type: params.alert_type,
        severity: params.severity,
        message: params.message,
      });
      if (insErr) {
        // A swallowed insert here is invisible by design: the alert never
        // appears and the run still reports success. Count and log it so a
        // rejected type surfaces instead of quietly muting the whole feature.
        failed++;
        console.error(
          `[deliverability-alerts-scan] failed to raise ${params.alert_type}: ${insErr.message}`,
        );
        return;
      }
      raised++;

      /**
       * Only on the insert, which is the point of the guard above: an active
       * alert already exists means this problem has been raised before, so the
       * person has already been told and a nightly scan must not tell them
       * again. The first night is worth a buzz. The fourteenth is how someone
       * decides this product cries wolf.
       *
       * Severity is not filtered here — an alert reaching this table has
       * already cleared the bar for existing at all.
       */
      await notifyDeliverabilityAlert(params.user_id, {
        alertType: params.alert_type,
        title: params.message,
        detail: domain,
      });
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

    // ---- Volume-based alerts: bounce, complaints, placement ----
    //
    // The gap this closes was reported by users of every competing tool: you
    // only find out something is wrong by going and looking. These are the
    // thresholds providers publish, checked nightly, so the first sign of a
    // problem is a notification rather than a bad week.
    const { data: snapshots } = await supabase
      .from("reputation_snapshots")
      .select("user_id, sending_account_id, snapshot_date, bounce_rate, complaint_rate, volume, placement_inbox_rate")
      .order("snapshot_date", { ascending: false })
      .limit(4000);

    // Latest snapshot per mailbox, plus the one from a week earlier for the
    // week-over-week comparison.
    const latest = new Map<string, Record<string, unknown>>();
    const weekAgo = new Map<string, Record<string, unknown>>();
    const weekAgoCutoff = new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10);

    for (const row of snapshots ?? []) {
      const id = String(row.sending_account_id);
      if (!latest.has(id)) {
        latest.set(id, row);
      } else if (!weekAgo.has(id) && String(row.snapshot_date) <= weekAgoCutoff) {
        weekAgo.set(id, row);
      }
    }

    for (const [accountId, row] of latest) {
      const volume = Number(row.volume) || 0;
      // Rates on a handful of sends are noise. The same floor the UI uses.
      if (volume < 50) continue;

      const userId = String(row.user_id);
      const bounceRate = Number(row.bounce_rate) || 0;      // stored as a percentage
      const complaintRate = Number(row.complaint_rate) || 0;

      if (bounceRate > 2) {
        await ensureAlert({
          user_id: userId,
          sending_account_id: accountId,
          alert_type: "bounce_rate",
          // Critical at 3%, not 5%.
          //
          // Only critical alerts are emailed, and 5% is the point at which
          // providers are already throttling the sender: by then the recovery
          // takes weeks. The dashboard tile called 3.4% "at risk" and said so
          // in red for thirty days while this rule filed it as a warning and
          // sent nothing. Both cannot be right about the same figure, and the
          // tile was.
          severity: bounceSeverity(bounceRate / 100),
          message: `Bounce rate is ${bounceRate.toFixed(1)}% over the last 30 days, above the 2% line where reputation starts to erode. Unverified addresses in the list are the usual cause.`,
        });
      }

      // Google and Yahoo publish 0.3% as the line they stop delivering at, and
      // 0.1% as the target. Alerting at the target rather than the line is the
      // difference between a warning and a post-mortem.
      if (complaintRate >= 0.1) {
        await ensureAlert({
          user_id: userId,
          sending_account_id: accountId,
          alert_type: "complaint_rate",
          severity: complaintSeverity(complaintRate / 100),
          message: `Spam complaints are at ${complaintRate.toFixed(2)}%, at or above the 0.1% target. Providers stop delivering a sender at 0.3%.`,
        });
      }

      const now = row.placement_inbox_rate;
      const before = weekAgo.get(accountId)?.placement_inbox_rate;
      if (now != null && before != null) {
        const dropPoints = (Number(before) - Number(now)) * 100;
        if (dropPoints > 10) {
          await ensureAlert({
            user_id: userId,
            sending_account_id: accountId,
            alert_type: "placement_drop",
            severity: dropPoints >= 25 ? "critical" : "warning",
            message: `Inbox placement fell ${Math.round(dropPoints)} points week over week. Check authentication and recent copy or volume changes.`,
          });
        }
      }
    }

    // ---- Mailboxes that stopped being able to send ----
    //
    // A disconnected mailbox is silent by nature: nothing fails loudly, sends
    // just stop happening. Without this the first sign is an empty week.
    const { data: accounts } = await supabase
      .from("sending_accounts")
      .select("id, user_id, email, status, paused_reason, integration_id");

    for (const a of accounts ?? []) {
      if (a.status === "active") continue;
      // A mailbox the user paused by hand is not news.
      if (/paused manually/i.test(String(a.paused_reason ?? ""))) continue;

      await ensureAlert({
        user_id: String(a.user_id),
        sending_account_id: String(a.id),
        alert_type: "mailbox_unavailable",
        severity: a.status === "disabled" ? "critical" : "warning",
        message: `${a.email} is not sending. ${a.paused_reason ?? "No reason was recorded."}`,
      });
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

    console.log(`[deliverability-alerts-scan] raised=${raised} failed=${failed} notified=${notified}`);
    return json({ ok: true, raised, failed, notified });

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

      const sendRes = await sendAppEmail(supabase, "deliverability-alert", profile.email, {
        // Alert ids rather than a timestamp: a retry after a partial failure
        // must be recognised as the same message, and the set of ids is what
        // actually identifies this notification.
        /*
         * Hashed, not truncated. Joining the alert ids and cutting at 200
         * characters fits about five uuids, so any sixth alert fell off the
         * end and two different six-alert scans shared one key — the second
         * scan's digest then reached nobody.
         */
        idempotencyKey: await dedupeKey(
          "deliverability",
          ...alerts.map((a: any) => String(a.id)).sort(),
        ),
        templateData: {
          name: (profile.full_name || "").split(" ")[0] || undefined,
          issues: alerts.map((a: any) => ({
            type: a.alert_type,
            domain: a.domain,
            message: a.message,
          })),
        },
      });

      if (!sendRes.sent && sendRes.reason === 'failed') {
        console.error(`[deliverability-alerts-scan] notify failed for ${userId}:`, sendRes.error);
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

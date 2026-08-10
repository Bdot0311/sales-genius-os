// compute-reputation — nightly batch job. Computes each sending account's
// reputation from real send/bounce/complaint/open counts (last 30 days),
// writes a daily reputation_snapshots row, updates sending_accounts.reputation_score,
// and auto-pauses accounts that fall below their threshold.
//
// Runs as a scheduled internal job (verify_jwt = false) using the service role,
// so it processes every user's accounts. Not user-invoked.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";
import { computeReputation } from "../_shared/reputation.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ReputationInputRow {
  sending_account_id: string;
  user_id: string;
  sent: number;
  bounced: number;
  complaints: number;
  opened: number;
  warmup_sent: number;
  warmup_replied: number;
  warmup_inbox: number;
  warmup_spam: number;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

    // One aggregate query for all accounts (SECURITY DEFINER RPC).
    const { data: rows, error: rpcError } = await supabase.rpc("get_reputation_inputs", { p_days: 30 });
    if (rpcError) {
      console.error("[compute-reputation] rpc error:", rpcError);
      return json({ error: "Failed to load reputation inputs" }, 500);
    }

    const inputs = (rows ?? []) as ReputationInputRow[];
    let updated = 0;
    let paused = 0;

    for (const row of inputs) {
      const result = computeReputation({
        sent: Number(row.sent) || 0,
        bounced: Number(row.bounced) || 0,
        complaints: Number(row.complaints) || 0,
        opened: Number(row.opened) || 0,
        warmupSent: Number(row.warmup_sent) || 0,
        warmupInbox: Number(row.warmup_inbox) || 0,
        warmupSpam: Number(row.warmup_spam) || 0,
      });

      // Daily snapshot (idempotent per account/day).
      await supabase.from("reputation_snapshots").upsert({
        user_id: row.user_id,
        sending_account_id: row.sending_account_id,
        snapshot_date: today,
        reputation_score: result.score,
        volume: result.volume,
        warmup_volume: result.warmupVolume,
        bounce_rate: Number((result.bounceRate * 100).toFixed(3)),
        complaint_rate: Number((result.complaintRate * 100).toFixed(3)),
        open_rate: Number((result.openRate * 100).toFixed(3)),
      }, { onConflict: "sending_account_id,snapshot_date" });

      // Update the account's live score.
      const { data: acct } = await supabase
        .from("sending_accounts")
        .select("auto_pause_threshold, status")
        .eq("id", row.sending_account_id)
        .maybeSingle();

      const patch: Record<string, unknown> = { reputation_score: result.score };

      // Auto-pause only when we have a real score below threshold and the
      // account is currently active.
      if (
        result.score !== null &&
        acct &&
        acct.status === "active" &&
        result.score < (acct.auto_pause_threshold ?? 70)
      ) {
        patch.status = "paused";
        patch.paused_reason = `Auto-paused: reputation ${result.score} below threshold ${acct.auto_pause_threshold ?? 70}`;
        paused++;

        // Raise an alert (deduped against existing active reputation_drop alerts).
        const { data: existing } = await supabase
          .from("deliverability_alerts")
          .select("id")
          .eq("sending_account_id", row.sending_account_id)
          .eq("alert_type", "reputation_drop")
          .eq("status", "active")
          .maybeSingle();
        if (!existing) {
          await supabase.from("deliverability_alerts").insert({
            user_id: row.user_id,
            sending_account_id: row.sending_account_id,
            alert_type: "reputation_drop",
            severity: "critical",
            message: `Reputation dropped to ${result.score}. Sending auto-paused to protect the mailbox.`,
          });
        }
      }

      await supabase.from("sending_accounts").update(patch).eq("id", row.sending_account_id);
      updated++;
    }

    console.log(`[compute-reputation] accounts=${updated} paused=${paused}`);
    return json({ ok: true, accounts: updated, paused });
  } catch (err) {
    console.error("[compute-reputation] error:", err);
    return json({ error: "compute-reputation failed" }, 500);
  }
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

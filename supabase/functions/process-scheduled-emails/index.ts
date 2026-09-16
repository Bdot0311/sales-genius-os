import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.76.0";
import { corsHeaders, requireServiceRole } from "../_shared/internal-auth.ts";
import { injectClickTracking } from "../_shared/click-tracking.ts";

// RFC 2047 MIME encode subject for non-ASCII characters
const mimeEncodeSubject = (subject: string) => {
  if (/^[\x20-\x7E]*$/.test(subject)) {
    return subject;
  }
  const encoded = btoa(String.fromCharCode(...new TextEncoder().encode(subject)));
  return `=?UTF-8?B?${encoded}?=`;
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  const unauth = requireServiceRole(req);
  if (unauth) return unauth;

  try {

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Find scheduled emails that are due
    const { data: scheduledEmails, error: fetchError } = await supabase
      .from("sent_emails")
      .select("*")
      .eq("status", "scheduled")
      .not("scheduled_at", "is", null)
      .lte("scheduled_at", new Date().toISOString())
      .limit(20);

    if (fetchError) {
      console.error("Error fetching scheduled emails:", fetchError);
      throw fetchError;
    }

    if (!scheduledEmails || scheduledEmails.length === 0) {
      return new Response(
        JSON.stringify({ success: true, processed: 0, message: "No scheduled emails due" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Processing ${scheduledEmails.length} scheduled emails`);

    let processed = 0;
    let failed = 0;

    /**
     * Emails that were neither sent nor failed, and why.
     *
     * Four branches below skip an email and `continue` without writing
     * anything: user daily cap, user monthly cap, mailbox paused/disabled, and
     * mailbox daily cap. Each leaves the row at status "scheduled" — correct,
     * because they are genuinely retryable — but the only trace was a
     * console.log, and the response counted them in neither processed nor
     * failed. From the product they simply never happened: two emails queued
     * for 9am, one arrives, and nothing anywhere says why the other did not.
     */
    /**
     * Mark a send failed, with the reason on the row.
     *
     * Every one of the seven ways this function can fail a send used to write
     * `status = 'failed'` and send the reason to console.error, which lands in
     * the edge function log. The Sent tab showed a red badge and could not say
     * why, so the only way to find out was for an operator to go log-diving —
     * and two of the seven are the user's own Google connection having expired,
     * which they could fix in a minute if anything told them.
     *
     * Reasons are written for the person reading the Sent tab, not for the
     * developer reading the log. The log line stays as well: it carries the raw
     * provider text, which is useful and is not something to put in front of a
     * customer.
     */
    const failEmail = async (emailId: string, reason: string) => {
      await supabase
        .from("sent_emails")
        .update({ status: "failed", error_message: reason, failed_at: new Date().toISOString() })
        .eq("id", emailId);
    };

    const deferrals: Array<{ id: string; to: string; reason: string }> = [];
    const defer = (email: any, reason: string) => {
      console.log(`Deferring ${email.id} to ${email.to_email}: ${reason}`);
      deferrals.push({ id: email.id, to: email.to_email, reason });
    };

    // Pre-fetch daily + monthly limits for all unique users
    const userIds = [...new Set(scheduledEmails.map((e: any) => e.user_id))];
    const MONTHLY_EMAIL_LIMITS: Record<string, number> = {
      free: 100, starter: 50000, growth: 250000, pro: 1000000, elite: 1000000, agency: -1,
    };
    const userLimits: Record<string, { dailyLimit: number; dailySent: number; monthlyLimit: number; monthlySent: number }> = {};
    for (const uid of userIds) {
      const { data: sub } = await supabase
        .from('subscriptions')
        .select('plan, daily_email_limit, daily_emails_sent, daily_emails_reset_at')
        .eq('user_id', uid)
        .eq('status', 'active')
        .single();
      if (sub) {
        const now = new Date();
        const todayMidnight = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
        const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
        const dailyResetAt = sub.daily_emails_reset_at ? new Date(sub.daily_emails_reset_at) : new Date(0);
        let dailySent = sub.daily_emails_sent || 0;
        if (dailyResetAt < todayMidnight) {
          dailySent = 0;
          await supabase.from('subscriptions').update({ daily_emails_sent: 0, daily_emails_reset_at: todayMidnight.toISOString() }).eq('user_id', uid);
        }
        // Monthly usage derived from sent_emails (counter columns were removed).
        const { count: monthlyCount } = await supabase
          .from('sent_emails')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', uid)
          .in('status', ['sent', 'delivered', 'opened', 'clicked', 'replied', 'bounced'])
          .gte('sent_at', monthStart.toISOString());
        userLimits[uid] = {
          dailyLimit: sub.daily_email_limit || 10,
          dailySent,
          monthlyLimit: MONTHLY_EMAIL_LIMITS[sub.plan as string] ?? 0,
          monthlySent: monthlyCount ?? 0,
        };
      }

    }

    for (const email of scheduledEmails) {
      try {
        // Compliance: skip recipients who unsubscribed after the email was queued.
        const { data: optout } = await supabase
          .from('email_optouts')
          .select('id')
          .eq('email', (email.to_email || '').toLowerCase().trim())
          .maybeSingle();
        if (optout) {
          console.log(`Recipient ${email.to_email} unsubscribed, skipping ${email.id}`);
          await failEmail(
            email.id,
            "This person unsubscribed after the email was queued, so it was not sent.",
          );
          failed++;
          continue;
        }

        // Check daily + monthly limits
        const ul = userLimits[email.user_id];
        if (ul && ul.dailySent >= ul.dailyLimit) {
          defer(email, `Your daily send limit is reached (${ul.dailySent}/${ul.dailyLimit}). It retries after the counter resets, or raise the limit in Outreach settings.`);
          continue;
        }
        if (ul && ul.monthlyLimit !== -1 && ul.monthlySent >= ul.monthlyLimit) {
          defer(email, `Your monthly send cap is reached (${ul.monthlySent}/${ul.monthlyLimit}). It retries next month, or upgrade the plan.`);
          continue;
        }
        // Resolve the mailbox this email was queued against. Prefer the
        // explicit sending_account_id so multi-mailbox users always send from
        // the account the campaign selected.
        let queuedAccount: any = null;
        if (email.sending_account_id) {
          const { data: qa } = await supabase
            .from("sending_accounts")
            .select("id, integration_id, status, daily_limit, sent_today, sent_today_date")
            .eq("id", email.sending_account_id)
            .maybeSingle();
          queuedAccount = qa ?? null;
        }

        let integration: any = null;
        if (queuedAccount?.integration_id) {
          const { data: intg } = await supabase
            .from("integrations")
            .select("id, config")
            .eq("id", queuedAccount.integration_id)
            .eq("user_id", email.user_id)
            .eq("is_active", true)
            .maybeSingle();
          integration = intg ?? null;
        } else {
          const { data: intg } = await supabase
            .from("integrations")
            .select("id, config")
            .eq("user_id", email.user_id)
            .eq("integration_id", "google")
            .eq("is_active", true)
            .order("updated_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          integration = intg ?? null;
        }

        if (!integration) {
          console.error(`No active integration for user ${email.user_id}`);
          await failEmail(
            email.id,
            "No Google account is connected, so there was no mailbox to send from. Connect one on the Integrations page and send again.",
          );
          failed++;
          continue;
        }

        // Respect per-mailbox pause + daily cap on the account actually used.
        let sendingAccountId: string | null = null;
        try {
          let sa = queuedAccount;
          if (!sa) {
            const { data } = await supabase
              .from('sending_accounts')
              .select('id, status, daily_limit, sent_today, sent_today_date')
              .eq('user_id', email.user_id)
              .eq('integration_id', integration.id)
              .maybeSingle();
            sa = data;
          }
          if (sa) {
            sendingAccountId = sa.id;
            if (sa.status === 'paused' || sa.status === 'disabled') {
              defer(email, `The mailbox it was queued against is ${sa.status}. Resume it on the Deliverability page and this retries automatically.`);
              continue; // leave scheduled; will retry after resume
            }
            const today = new Date().toISOString().slice(0, 10);
            const sentToday = sa.sent_today_date === today ? (sa.sent_today || 0) : 0;
            if (sentToday >= (sa.daily_limit || 0)) {
              defer(email, `That mailbox is at its daily cap (${sentToday}/${sa.daily_limit || 0}). It retries tomorrow, or raise the cap on the Deliverability page.`);
              continue;
            }
          }
        } catch (e) {
          console.warn('sending_account lookup failed (non-fatal):', e);
        }

        const config = integration.config as any;
        let accessToken = config.accessToken || config.provider_token;

        // Refresh token if expired
        if (config.expiresAt && Date.now() >= config.expiresAt && config.refreshToken) {
          console.log(`Token expired for user ${email.user_id}, refreshing...`);
          const googleClientId = config.clientId || Deno.env.get("GOOGLE_CLIENT_ID");
          const googleClientSecret = config.clientSecret || Deno.env.get("GOOGLE_CLIENT_SECRET");

          if (!googleClientId || !googleClientSecret) {
            console.error(`Missing Google OAuth credentials for user ${email.user_id}`);
            await failEmail(
              email.id,
              "Sending is not configured on our side. Nothing is wrong with your account; this one is ours to fix.",
            );
            failed++;
            continue;
          }

          const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              client_id: googleClientId,
              client_secret: googleClientSecret,
              refresh_token: config.refreshToken,
              grant_type: "refresh_token",
            }),
          });

          if (tokenResponse.ok) {
            const tokens = await tokenResponse.json();
            accessToken = tokens.access_token;
            await supabase
              .from("integrations")
              .update({
                config: {
                  ...config,
                  accessToken: tokens.access_token,
                  expiresAt: Date.now() + tokens.expires_in * 1000,
                },
              })
              .eq("id", integration.id);
            console.log(`Token refreshed for user ${email.user_id}`);
          } else {
            const errText = await tokenResponse.text();
            console.error(`Failed to refresh token for user ${email.user_id}:`, errText);
            let code = "";
            try { code = String(JSON.parse(errText)?.error ?? ""); } catch { code = ""; }
            await failEmail(
              email.id,
              code === "invalid_grant"
                ? "Google would not renew access to your mailbox. That happens when the connection is revoked, the password changes, or the grant expires. Reconnect Google on the Integrations page and send again."
                : "Google refused to renew access to your mailbox, so it could not be opened to send. Reconnect Google on the Integrations page and send again.",
            );
            failed++;
            continue;
          }
        }

        if (!accessToken) {
          console.error(`No access token for user ${email.user_id}, config keys: ${Object.keys(config).join(", ")}`);
          await failEmail(
            email.id,
            "Your Google connection has no usable access token. Reconnect Google on the Integrations page and send again.",
          );
          failed++;
          continue;
        }

        // Build and send the email
        const body = email.body_html || email.body_text || "";

        // Generate tracking pixel if not already present
        let trackingPixelId = email.tracking_pixel_id;
        let trackedBody = body;
        if (!trackingPixelId) {
          trackingPixelId = crypto.randomUUID();
        }
        // Rewrite links for click tracking (skips already-tracked links)
        trackedBody = injectClickTracking(trackedBody, trackingPixelId, supabaseUrl);
        // Inject tracking pixel if not already in body
        if (!body.includes('track-email-open')) {
          const trackingPixelUrl = `${supabaseUrl}/functions/v1/track-email-open?id=${trackingPixelId}`;
          const trackingPixel = `<img src="${trackingPixelUrl}" width="1" height="1" style="display:none" alt="" />`;
          trackedBody = trackedBody.includes('</body>')
            ? trackedBody.replace('</body>', `${trackingPixel}\n</body>`)
            : trackedBody + trackingPixel;
        }

        const emailContent = [
          `To: ${email.to_email}`,
          `Subject: ${mimeEncodeSubject(email.subject)}`,
          "MIME-Version: 1.0",
          "Content-Type: text/html; charset=utf-8",
          "",
          trackedBody,
        ].join("\r\n");

        const encodedEmail = btoa(String.fromCharCode(...new TextEncoder().encode(emailContent)))
          .replace(/\+/g, "-")
          .replace(/\//g, "_")
          .replace(/=+$/, "");

        const gmailResponse = await fetch(
          "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ raw: encodedEmail }),
          }
        );

        if (gmailResponse.ok) {
          const gmailResult = await gmailResponse.json();
          await supabase
            .from("sent_emails")
            .update({
              status: "sent",
              sent_at: new Date().toISOString(),
              gmail_message_id: gmailResult.id,
              gmail_thread_id: gmailResult.threadId,
              tracking_pixel_id: trackingPixelId,
              sending_account_id: sendingAccountId,
            } as any)
            .eq("id", email.id);

          // Bump per-mailbox daily counter (drives rotation + deliverability caps).
          // increment_account_send() gates on auth.uid(); called from service role
          // that's null, so update directly. Reset counter when the day rolls over.
          if (sendingAccountId) {
            try {
              const today = new Date().toISOString().slice(0, 10);
              const { data: saRow } = await supabase
                .from('sending_accounts')
                .select('sent_today, sent_today_date')
                .eq('id', sendingAccountId)
                .maybeSingle();
              const prevToday = saRow?.sent_today_date === today ? (saRow?.sent_today || 0) : 0;
              await supabase
                .from('sending_accounts')
                .update({
                  sent_today: prevToday + 1,
                  sent_today_date: today,
                  last_sent_at: new Date().toISOString(),
                } as any)
                .eq('id', sendingAccountId);
            } catch (e) {
              console.warn('sending_account counter update failed (non-fatal):', e);
            }
          }

          // Update lead's last_contacted_at
          if (email.lead_id) {
            await supabase
              .from("leads")
              .update({ last_contacted_at: new Date().toISOString() })
              .eq("id", email.lead_id)
              .eq("user_id", email.user_id);
          }

          // Increment daily counter (monthly usage is derived from sent_emails)
          await supabase.from('subscriptions').update({
            daily_emails_sent: (ul?.dailySent || 0) + 1,
          }).eq('user_id', email.user_id);

          if (ul) { ul.dailySent += 1; ul.monthlySent += 1; }

          processed++;
          console.log(`Sent scheduled email ${email.id} to ${email.to_email}`);
        } else {
          const errorText = await gmailResponse.text();
          console.error(`Gmail error for email ${email.id}:`, errorText);
          let detail = "";
          try { detail = String(JSON.parse(errorText)?.error?.message ?? ""); } catch { detail = ""; }
          await failEmail(
            email.id,
            gmailResponse.status === 429
              ? "Gmail rate-limited this mailbox, so the message was not accepted. It usually clears within the hour."
              : gmailResponse.status === 403
                ? `Gmail refused to send from this mailbox${detail ? `: ${detail.slice(0, 160)}` : "."} This is usually a permissions or sending-limit problem on the Google account.`
                : `Gmail rejected the message${detail ? `: ${detail.slice(0, 160)}` : ` (HTTP ${gmailResponse.status})`}.`,
          );
          failed++;
        }
      } catch (err) {
        console.error(`Error processing email ${email.id}:`, err);
        await failEmail(
          email.id,
          `The send stopped with an unexpected error: ${(err instanceof Error ? err.message : String(err)).slice(0, 160)}`,
        );
        failed++;
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        processed,
        failed,
        // Reported rather than swallowed: a run that sent one of two emails is
        // not a clean run, and the reason has to be retrievable somewhere
        // other than a log line nobody reads.
        deferred: deferrals.length,
        deferrals,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error in process-scheduled-emails:", error.message);
    return new Response(
      JSON.stringify({ error: "Failed to process scheduled emails" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

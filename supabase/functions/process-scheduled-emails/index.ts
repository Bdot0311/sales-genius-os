import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.76.0";
import { corsHeaders, requireServiceRole } from "../_shared/internal-auth.ts";
import {
  appendUnsubscribeFooter,
  isOptedOut,
  listUnsubscribeHeaders,
  mintUnsubscribeToken,
  unsubscribeUrl,
} from '../_shared/unsubscribe.ts';
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

  /**
   * Claims a run took and will not use, handed back before it returns.
   *
   * Declared out here because the catch below needs it too: a throw that
   * leaves a claim held costs the next run fifteen minutes on work nothing is
   * doing.
   */
  const releaseLater = new Set<string>();
  const handBackClaims = async () => {
    if (releaseLater.size === 0) return;
    const ids = [...releaseLater];
    const { error } = await supabase.rpc("release_scheduled_email_claims", { p_ids: ids });
    if (error) {
      // The stale sweep picks these up in fifteen minutes either way.
      console.warn(`[process-scheduled-emails] could not hand back ${ids.length} claim(s):`, error.message);
    }
    releaseLater.clear();
  };

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  // Out here so the catch can hand back claims with it; building a client
  // reads two env vars and cannot throw on its own.
  const supabase = createClient(supabaseUrl, supabaseKey);

  try {

    /*
     * Settle claims from runs that are gone before taking any more.
     *
     * A row left claimed is invisible to the claim below, so this is what
     * stops a killed run's emails from sitting unsent forever. It also parts
     * the two cases a stale claim can be: never attempted, which is handed
     * back, and attempted-and-unconfirmed, which is failed with a reason
     * rather than risking the duplicate. See
     * 20261015234500_claim_scheduled_emails.sql.
     */
    const { error: reapError } = await supabase.rpc("release_stale_scheduled_email_claims");
    if (reapError) {
      // Not fatal: the claim below is still correct, this run just does not
      // pick up what an earlier one dropped.
      console.warn("[process-scheduled-emails] stale-claim sweep failed:", reapError.message);
    }

    /*
     * Claim the batch rather than reading it.
     *
     * This function is scheduled every minute and used to select twenty rows
     * at status 'scheduled' with no claim at all, then walk them one at a time
     * sending each, writing 'sent' only after Gmail answered. Two runs
     * overlapping — one slow minute is enough, and there was no wall clock
     * here to prevent one — both read the same rows and both sent them. A
     * duplicate cold email cannot be taken back.
     *
     * claim_due_scheduled_emails stamps send_claimed_at under FOR UPDATE SKIP
     * LOCKED, so simultaneous runs take disjoint sets, and it is fair across
     * accounts: twenty sends a minute is the whole product's capacity, and
     * ordered by due time alone one account's backlog owned all of it.
     */
    const { data: claimed, error: fetchError } = await supabase
      .rpc("claim_due_scheduled_emails", { p_limit: 20 });

    if (fetchError) {
      console.error("Error claiming scheduled emails:", fetchError);
      throw fetchError;
    }
    // Same shape the select returned, typed the way process-agent-jobs types
    // its own claim: the client is built without the Database generic here, so
    // an rpc result arrives as unknown.
    const scheduledEmails = (claimed ?? []) as Record<string, any>[];

    if (scheduledEmails.length === 0) {
      return new Response(
        JSON.stringify({ success: true, processed: 0, message: "No scheduled emails due" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Processing ${scheduledEmails.length} scheduled emails`);

    let processed = 0;
    let failed = 0;

    /*
     * A wall clock, because the cron does not wait.
     *
     * This function is scheduled every minute and had no budget at all:
     * twenty sequential sends, each a Gmail call plus up to eight Supabase
     * round trips and sometimes an OAuth refresh, ran until the platform
     * killed the whole invocation around 150s. Claiming makes an overrun safe
     * rather than a duplicate, but a run that stops of its own accord can hand
     * back what it did not reach, and a run that is killed cannot.
     *
     * 50s leaves the next minute's run a clear field.
     */
    const startedAt = Date.now();
    const BUDGET_MS = 50_000;
    const outOfTime = () => Date.now() - startedAt > BUDGET_MS;


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
      console.log(`Deferring ${email.id}: ${reason}`);
      deferrals.push({ id: email.id, to: email.to_email, reason });
      /*
       * A deferral leaves the row at 'scheduled' on purpose — a reached cap or
       * a paused mailbox is genuinely retryable. But the row is claimed now,
       * and a claimed row is invisible to the next claim, so without this it
       * would wait fifteen minutes for the stale sweep instead of going out on
       * the next run once the cap resets.
       */
      releaseLater.add(email.id);
    };

    // Pre-fetch daily + monthly limits for all unique users
    const userIds = [...new Set(scheduledEmails.map((e: any) => e.user_id))];
    const MONTHLY_EMAIL_LIMITS: Record<string, number> = {
      free: 100, starter: 50000, growth: 250000, pro: 1000000, elite: 1000000, agency: -1,
    };
    const userLimits: Record<string, { dailyLimit: number; dailySent: number; monthlyLimit: number; monthlySent: number }> = {};
    /*
     * Every sender in the batch gets an allowance, lapsed accounts included.
     *
     * The old shape filtered on `status = 'active'` and then built an entry
     * only `if (sub)`, so a past_due, paused or cancelled account — and an
     * account with no subscriptions row at all — fell through every `if (ul)`
     * guard below and sent with no cap of any kind. The accounts whose
     * billing has stopped are precisely the ones a cap should still hold.
     *
     * A sender whose allowance cannot be read is deliberately left out of
     * userLimits and deferred below, rather than sent uncapped.
     */
    for (const uid of userIds) {
      const { data: sub, error: subErr } = await supabase
        .from('subscriptions')
        .select('plan, status, daily_email_limit, daily_emails_sent, daily_emails_reset_at')
        .eq('user_id', uid)
        .maybeSingle();
      if (subErr) {
        console.error(`[process-scheduled-emails] allowance unreadable for ${uid}:`, subErr.message);
        continue;
      }
      const planActive = sub?.status === 'active';
      const plan = planActive ? String(sub?.plan ?? 'free') : 'free';

      /*
       * Both caps are live counts of sent_emails, through the same two
       * functions send-email uses, so the two senders cannot drift apart on
       * what they consider a send. The daily counter column could not carry
       * this: increment_daily_emails_sent filtered on `status = 'active'`, so
       * on a lapsed row the UPDATE matched nothing and *succeeded*, leaving
       * the number at zero for good.
       */
      const { data: dailyCount, error: dailyErr } = await supabase
        .rpc('get_daily_email_count', { p_user_id: uid });
      if (dailyErr || typeof dailyCount !== 'number') {
        console.error(`[process-scheduled-emails] daily count unavailable for ${uid}:`, dailyErr?.message);
        continue;
      }
      const { data: monthlyCount, error: monthlyErr } = await supabase
        .rpc('get_monthly_email_count', { p_user_id: uid });
      if (monthlyErr || typeof monthlyCount !== 'number') {
        console.error(`[process-scheduled-emails] monthly count unavailable for ${uid}:`, monthlyErr?.message);
        continue;
      }

      // The counter column is what the Outreach and Deliverability panels
      // read, so its daily rollover still happens here — it just no longer
      // decides whether a send is allowed.
      const now = new Date();
      const todayMidnight = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
      const dailyResetAt = sub?.daily_emails_reset_at ? new Date(sub.daily_emails_reset_at) : new Date(0);
      if (sub && dailyResetAt < todayMidnight) {
        await supabase.from('subscriptions').update({ daily_emails_sent: 0, daily_emails_reset_at: todayMidnight.toISOString() }).eq('user_id', uid);
      }

      userLimits[uid] = {
        dailyLimit: planActive ? (sub?.daily_email_limit || 10) : 10,
        dailySent: dailyCount,
        monthlyLimit: MONTHLY_EMAIL_LIMITS[plan] ?? 0,
        monthlySent: monthlyCount,
      };
    }

    for (const email of scheduledEmails) {
      /*
       * Everything still unsent goes back on the queue rather than being
       * started with no time to finish. The remainder is claimed, so no other
       * run can have taken it in the meantime.
       */
      if (outOfTime()) {
        releaseLater.add(email.id);
        continue;
      }
      try {
        // Compliance: skip recipients who unsubscribed after the email was
        // queued. Scoped to this sender plus any global opt-out — matching on
        // the address alone let one account's unsubscribe block every other
        // account on the platform.
        const optout = await isOptedOut(supabase, email.user_id, email.to_email || "");
        if (optout) {
          console.log(`Recipient unsubscribed, skipping ${email.id}`);
          await failEmail(
            email.id,
            "This person unsubscribed after the email was queued, so it was not sent.",
          );
          failed++;
          continue;
        }

        /*
         * Is this email still wanted?
         *
         * The row was queued when the step ran, and a lot can happen between
         * then and now: the prospect replies and the sequence stops, or they
         * ask to be left until March and it is held. Cancelling at the moment
         * of the decision closes the common case, but the row may already have
         * been claimed by this run — so the last thing before sending is to
         * ask the enrollment whether it still wants this sent.
         *
         * Only 'active' passes. A completed, paused or cancelled enrollment
         * has said otherwise, and sending anyway is the thing the reply
         * handling exists to prevent.
         */
        if (email.enrollment_id) {
          const { data: enr, error: enrErr } = await supabase
            .from("sequence_enrollments")
            .select("status, paused_reason, engagement_state")
            .eq("id", email.enrollment_id)
            .maybeSingle();
          if (enrErr) {
            defer(email, "We couldn't confirm this sequence is still running, so it was left queued. It retries on the next run.");
            continue;
          }
          /*
           * Only send when the enrollment still wants this sent.
           *
           * Two versions of this check were wrong in opposite directions. The
           * first rejected anything not 'active', which killed the final step
           * of every sequence: process-sequence-step marks an enrollment
           * 'completed' on the pass AFTER the last email is queued, so that
           * email routinely sits against a completed enrollment and a cap
           * deferring it that long made the rejection permanent.
           *
           * The second listed the statuses that block — paused, stopped,
           * completed-and-replied — and let everything else through. That is
           * a denylist, and it missed 'exited', which is what the Archive
           * button writes: a user archived a lead, was told it had been
           * removed from the sequence, and the queued mail went out anyway.
           * Any status added later would have defaulted to sending too.
           *
           * So it is stated as what may send, and everything else — including
           * a status nobody has invented yet, and an enrollment row that has
           * been deleted out from under its mail — stops. The cost of the
           * wrong answer is a send to someone who should not get one, so the
           * default has to be silence.
           */
          const sendable =
            enr !== null &&
            (enr.status === "active" ||
              // Ran out of steps rather than being stopped. apply_reply_to_sequence
              // writes engagement_state alongside the status, so a sequence a
              // reply ended is distinguishable from one that simply finished.
              (enr.status === "completed" && enr.engagement_state !== "replied"));

          if (!sendable) {
            await failEmail(
              email.id,
              !enr
                ? "The sequence this was queued against no longer exists, so it was not sent."
                : enr.status === "paused"
                  ? `This sequence is on hold${enr.paused_reason ? ` — ${enr.paused_reason}` : ""}, so the step was not sent.`
                  : enr.engagement_state === "replied"
                    ? "They replied before this step was due, so it was not sent."
                    : "The sequence was stopped before this step was due, so it was not sent.",
            );
            failed++;
            continue;
          }
        }

        // Check daily + monthly limits
        const ul = userLimits[email.user_id];
        if (!ul) {
          // The allowance lookup above failed for this sender. Deferring keeps
          // the email queued for the next run; the alternative is sending
          // without knowing whether the account has anything left to spend.
          defer(email, "We couldn't check your send allowance, so this was left queued. It retries on the next run.");
          continue;
        }
        if (ul.dailySent >= ul.dailyLimit) {
          defer(email, `Your daily send limit is reached (${ul.dailySent}/${ul.dailyLimit}). It retries after the counter resets, or raise the limit in Outreach settings.`);
          continue;
        }
        if (ul.monthlyLimit !== -1 && ul.monthlySent >= ul.monthlyLimit) {
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
        trackedBody = await injectClickTracking(trackedBody, trackingPixelId, supabaseUrl);
        // Inject tracking pixel if not already in body
        if (!body.includes('track-email-open')) {
          const trackingPixelUrl = `${supabaseUrl}/functions/v1/track-email-open?id=${trackingPixelId}`;
          const trackingPixel = `<img src="${trackingPixelUrl}" width="1" height="1" style="display:none" alt="" />`;
          trackedBody = trackedBody.includes('</body>')
            ? trackedBody.replace('</body>', `${trackingPixel}\n</body>`)
            : trackedBody + trackingPixel;
        }

        /*
         * The unsubscribe mechanism this path never had.
         *
         * Everything queued goes out through here, which is to say this is the
         * path that carries the volume — and it minted no token, wrote no
         * footer link and sent no header. It checked the opt-out list on the
         * way out and gave the recipient no way to get onto it.
         */
        const unsubUrl = unsubscribeUrl(
          supabaseUrl,
          await mintUnsubscribeToken(supabase, email.user_id, email.to_email || ""),
        );
        trackedBody = appendUnsubscribeFooter(trackedBody, unsubUrl);

        const emailContent = [
          `To: ${email.to_email}`,
          `Subject: ${mimeEncodeSubject(email.subject)}`,
          "MIME-Version: 1.0",
          "Content-Type: text/html; charset=utf-8",
          // Required of every bulk sender by Gmail and Yahoo since February
          // 2024, with RFC 8058 one-click.
          ...listUnsubscribeHeaders(unsubUrl),
          "",
          trackedBody,
        ].join("\r\n");

        const encodedEmail = btoa(String.fromCharCode(...new TextEncoder().encode(emailContent)))
          .replace(/\+/g, "-")
          .replace(/\//g, "_")
          .replace(/=+$/, "");

        /*
         * The last line before the only irreversible call in the product.
         *
         * begin_scheduled_email_send sets send_attempted_at and returns the id
         * only if it was unset, so exactly one caller can ever get past here
         * for a given row. The claim above should already make a second caller
         * impossible; this is what holds if it ever is not, and a guard this
         * cheap in front of a duplicate email is not worth economising on.
         *
         * It is also what lets the stale sweep tell the two cases apart later:
         * a claim with no attempt was never sent and is handed back, a claim
         * with one may be in the recipient's inbox and is never retried.
         */
        const { data: mine, error: beginError } = await supabase
          .rpc("begin_scheduled_email_send", { p_id: email.id });
        if (beginError) {
          console.error(`[process-scheduled-emails] could not mark ${email.id} as sending:`, beginError.message);
          // Unknown state, so nothing is sent and nothing is written. The row
          // keeps its claim and the stale sweep decides in fifteen minutes.
          failed++;
          continue;
        }
        if (!Array.isArray(mine) || mine.length === 0) {
          // Another run already has this one. Not an error, and not a failure
          // to report — the email is going out, just not from here.
          console.log(`[process-scheduled-emails] ${email.id} is already being sent elsewhere; skipping`);
          continue;
        }

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

          /*
           * Increment the display counter atomically. Writing an absolute
           * `read + 1` lost updates whenever two runs, or a run and an
           * interactive send, overlapped on one account.
           */
          const { error: incErr } = await supabase.rpc('increment_daily_emails_sent', {
            _user_id: email.user_id,
            // Keyed to the send, so a bounce can give the allowance back.
            _sent_email_id: email.id,
          });
          if (incErr) console.warn('daily counter increment failed (non-fatal):', incErr.message);

          // Keep this batch's own view of the caps moving, so a single run
          // cannot blow past the limit it checked at the top.
          ul.dailySent += 1;
          ul.monthlySent += 1;

          processed++;
          console.log(`Sent scheduled email ${email.id}`);
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

    await handBackClaims();

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
    /*
     * A throw here leaves whatever this run claimed held. Handing back the set
     * it had already decided not to send keeps the next run from waiting on
     * the fifteen-minute sweep for work nothing is doing.
     */
    try {
      await handBackClaims();
    } catch { /* the stale sweep covers it */ }
    return new Response(
      JSON.stringify({ error: "Failed to process scheduled emails" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

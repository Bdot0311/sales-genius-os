import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { htmlToPlainText } from "../_shared/plain-text.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.76.0';
import { isDemoMode, demoResponse } from "../_shared/demo-mode.ts";
import {
  isOptedOut,
  listUnsubscribeHeaders,
  mintUnsubscribeToken,
  unsubscribeFooterHtml as unsubscribeFooterHtml_,
  unsubscribeUrl,
} from '../_shared/unsubscribe.ts';
import { logSystemAlert } from "../_shared/alerts.ts";
import { getSignatureHtml, appendSignatureToBody } from "../_shared/signature.ts";
import { injectClickTracking } from "../_shared/click-tracking.ts";
import { signOffStartIndex } from "../_shared/email-rules.ts";
import {
  DELIVERED_STATUSES,
  duplicateRefusal,
  duplicateWindowStart,
  normalizeRecipient,
} from "../_shared/duplicate-send.ts";
import { acceptedUnpersistedBody, deliverReserved, type OutboundStore } from "../_shared/tracked-send.ts";
import { outboundGateFindings } from "../_shared/quality-gate.ts";
import { resolveAppUser } from "../_shared/app-user.ts";
import { proofFromLead } from "../_shared/template-send-gate.ts";
import { evaluateSend } from "../_shared/outbound-verdict.ts";
import { contentHash, gatePromptHash, rubricPromptHash } from "../_shared/prompt-versions.ts";
import { scoreEmailReport } from "../_shared/email-quality.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const toBase64Url = (input: string) => {
  const bytes = new TextEncoder().encode(input);
  let binary = '';
  const chunkSize = 0x8000;

  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }

  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
};

// RFC 2047 MIME encode subject for non-ASCII characters
const mimeEncodeSubject = (subject: string) => {
  // Check if subject contains non-ASCII characters
  if (/^[\x20-\x7E]*$/.test(subject)) {
    return subject; // Pure ASCII, no encoding needed
  }
  const encoded = btoa(String.fromCharCode(...new TextEncoder().encode(subject)));
  return `=?UTF-8?B?${encoded}?=`;
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const supabase = createClient(supabaseUrl, supabaseKey);

    const payload = await req.json();
    const { to, subject, body: rawBody, integrationId, integrationRowId, leadId, templateId, threadId, appendSignature } = payload;
    
    console.log('Send email request received:', { to, subject, integrationId, leadId, templateId });

    // Get authorization header
    // Browser sessions, MCP OAuth tokens and API keys all resolve to the same
    // verified app user, so the API/MCP send with the app's exact rules.
    const resolved = await resolveAppUser(req, supabase);
    const user = resolved.user;
    const userError = resolved.error ? { message: resolved.error } : null;

    // Demo mode: simulate instead of hitting providers or spending credits
    if (user && await isDemoMode(supabase, user.id)) {
      return demoResponse({ message: 'Email simulated in demo mode — nothing was sent.', messageId: `demo-${crypto.randomUUID()}` }, corsHeaders);
    }
    
    console.log('User extraction result:', { 
      hasUser: !!user, 
      userId: user?.id,
      userError: userError?.message 
    });
    
    if (userError || !user) {
      console.error('User authentication failed:', userError);
      return new Response(
        JSON.stringify({ error: `Authentication failed: ${userError?.message || 'No user found'}` }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get the integration config for this user
    // If integrationRowId is provided, use it directly; otherwise fall back to integration_id match
    let integration;
    let integrationError;

    if (integrationRowId) {
      const result = await supabase
        .from('integrations')
        .select('id, config')
        .eq('id', integrationRowId)
        .eq('user_id', user.id)
        .eq('is_active', true)
        .single();
      integration = result.data;
      integrationError = result.error;
      console.log('Looking for integration by row ID:', integrationRowId);
    } else {
      const result = await supabase
        .from('integrations')
        .select('id, config')
        .eq('user_id', user.id)
        .eq('integration_id', integrationId || 'google')
        .eq('is_active', true)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      integration = result.data;
      integrationError = result.error;
      console.log('Looking for integration:', integrationId || 'google', 'for user:', user.id);
    }

    console.log('Integration found:', integration ? 'yes' : 'no');
    
    if (integrationError || !integration) {
      console.error('Integration error:', integrationError);
      return new Response(
        JSON.stringify({ error: 'Google integration not found or not active' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const config = integration.config as any;
    console.log('Config keys:', Object.keys(config));

    // Resolve the sending_accounts row for this integration so each send is
    // attributed per account (drives per-account reputation). Non-fatal for
    // attribution, but a paused/disabled account blocks the send so that
    // reputation auto-pause and manual pause actually take effect.
    let sendingAccountId: string | null = null;
    try {
      const { data: sa } = await supabase
        .from('sending_accounts')
        .select('id, status, paused_reason')
        .eq('user_id', user.id)
        .eq('integration_id', integration.id)
        .maybeSingle();
      sendingAccountId = sa?.id ?? null;
      if (sa && (sa.status === 'paused' || sa.status === 'disabled')) {
        return new Response(
          JSON.stringify({
            error: sa.paused_reason
              ? `Sending is paused for this mailbox: ${sa.paused_reason}`
              : 'Sending is paused for this mailbox. Resume it from the Deliverability page.',
            code: 'account_paused',
          }),
          { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    } catch (e) {
      console.warn('sending_account lookup failed (non-fatal):', e);
    }

    // Get access token based on provider
    let accessToken = config.accessToken || config.provider_token;
    
    // Check if token needs refresh (for Google)
    if ((integrationId === 'google' || !integrationId) && config.expiresAt && Date.now() >= config.expiresAt && config.refreshToken) {
      console.log('Token expired, refreshing...');
      // OAuth app credentials must come from server secrets only — never from DB config
      const googleClientId = Deno.env.get('GOOGLE_CLIENT_ID');
      const googleClientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET');
      
      if (!googleClientId || !googleClientSecret) {
        console.error('Missing Google OAuth credentials for token refresh');
        return new Response(
          JSON.stringify({ error: 'Google OAuth credentials not configured. Please reconnect Gmail.' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: googleClientId,
          client_secret: googleClientSecret,
          refresh_token: config.refreshToken,
          grant_type: 'refresh_token',
        }).toString(),
      });

      if (tokenResponse.ok) {
        const tokens = await tokenResponse.json();
        accessToken = tokens.access_token;
        
        // Update tokens in database
        await supabase
          .from('integrations')
          .update({
            config: {
              ...config,
              accessToken: tokens.access_token,
              expiresAt: Date.now() + tokens.expires_in * 1000,
            },
          })
          .eq('id', integration.id);
        
        console.log('Token refreshed successfully');
      } else {
        const errBody = await tokenResponse.text();
        console.error('Failed to refresh token:', tokenResponse.status, errBody);
        const isInvalidGrant = errBody.includes('invalid_grant');
        return new Response(
          JSON.stringify({
            error: isInvalidGrant
              ? 'Gmail authorization expired or revoked. Please reconnect Gmail.'
              : 'Failed to refresh access token. Please reconnect Gmail.',
          }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    if (!accessToken) {
      console.error('No access token found. Config has:', Object.keys(config));
      return new Response(
        JSON.stringify({ error: 'Gmail is not properly connected. Please go to Integrations page, disconnect Gmail, then click "Connect" to set it up with OAuth.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // --- Daily + Monthly email limit enforcement ---
    /*
     * Read the row, not only the active one.
     *
     * This asked for `.eq('status', 'active').single()` and kept `subError`
     * without ever reading it. `.single()` errors when there are no rows, so
     * an account that is `past_due`, `paused` or `cancelled` — all three of
     * which the billing path writes — produced a null subscription. Everything
     * below hung off `if (subscription)`, and the send happens three hundred
     * lines further down, outside it. The accounts that should send least were
     * the ones sending with no plan cap at all.
     *
     * The same was true of a transient failure on this read, which is the
     * shape the monthly count below already guards against, in this same
     * function, with a comment saying a cap that reads zero on error is no cap.
     * That reasoning was one level too deep.
     */
    const { data: subscription, error: subError } = await supabase
      .from('subscriptions')
      .select('plan, status, daily_email_limit, daily_emails_sent, daily_emails_reset_at')
      .eq('user_id', user.id)
      .maybeSingle();

    if (subError) {
      console.error('[send-email] subscription unavailable', subError);
      return new Response(
        JSON.stringify({
          error: "We couldn't check your send allowance. Please try again in a moment.",
          code: 'allowance_unavailable',
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const MONTHLY_EMAIL_LIMITS: Record<string, number> = {
      free: 100, starter: 50000, growth: 250000, pro: 1000000, elite: 1000000, agency: -1,
    };

    /*
     * An account without an active plan is on Free, not on unlimited.
     *
     * A missing row, or one that is past_due, paused or cancelled, falls back
     * to the Free allowance — 10 a day and 100 a month — rather than skipping
     * the check. That is the most restrictive reading of "no current plan",
     * and it is the right one for the accounts it covers: a card that failed
     * is a reason to send less.
     */
    const planActive = subscription?.status === 'active';
    const effectivePlan = planActive ? String(subscription?.plan ?? 'free') : 'free';
    const effectiveDailyLimit = planActive ? (subscription?.daily_email_limit || 10) : 10;

    {
      const now = new Date();
      const todayMidnight = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
      const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

      /*
       * Today's sends, counted rather than remembered.
       *
       * The counter column cannot carry this. `increment_daily_emails_sent`
       * filtered on `status = 'active'`, so for a lapsed account the UPDATE
       * matched nothing and *succeeded* — no error, so the caller's
       * error-only fallback never ran and the number stayed at zero for good.
       * Capping against that is capping against zero: the Free fallback added
       * alongside it would have let a lapsed account spend its whole monthly
       * allowance in one day, which is the send spike a daily cap exists to
       * prevent.
       *
       * Fails closed, for the same reason the monthly count below does.
       */
      const { data: dailyCount, error: dailyErr } = await supabase
        .rpc('get_daily_email_count', { p_user_id: user.id });
      if (dailyErr || typeof dailyCount !== 'number') {
        console.error('[send-email] daily count unavailable', dailyErr);
        return new Response(
          JSON.stringify({ error: "We couldn't check today's send allowance. Please try again in a moment.", code: 'daily_count_unavailable' }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }
      const dailySent = dailyCount;

      // The counter column is what the Outreach and Deliverability panels
      // show, so its daily rollover still happens here — it just no longer
      // decides whether a send is allowed.
      const dailyResetAt = subscription?.daily_emails_reset_at
        ? new Date(subscription.daily_emails_reset_at)
        : new Date(0);
      if (subscription && dailyResetAt < todayMidnight) {
        await supabase.from('subscriptions')
          .update({ daily_emails_sent: 0, daily_emails_reset_at: todayMidnight.toISOString() })
          .eq('user_id', user.id);
      }

      // Monthly usage: live count of this month's sends. Fail closed — a cap
      // that silently reads 0 on error is no cap at all.
      const { data: monthlyCount, error: monthlyErr } = await supabase
        .rpc('get_monthly_email_count', { p_user_id: user.id });
      if (monthlyErr || typeof monthlyCount !== 'number') {
        console.error('[send-email] monthly count unavailable', monthlyErr);
        return new Response(
          JSON.stringify({ error: "We couldn't check your monthly send allowance. Please try again in a moment.", code: 'monthly_count_unavailable' }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }
      const monthlySent = monthlyCount;


      const dailyLimit = effectiveDailyLimit;
      const nextMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
      if (dailySent >= dailyLimit) {
        await logSystemAlert({
          category: "outreach_send_limit", severity: "warning",
          message: `User hit daily email send limit (${dailyLimit})`,
          details: { user_id: user.id, daily_email_limit: dailyLimit, daily_emails_sent: dailySent },
          user_id: user.id,
        });
        return new Response(
          JSON.stringify({
            error: `Daily email limit reached (${dailyLimit}/day). Adjust your limit in Outreach settings.`,
            code: 'daily_cap_reached',
            dailyLimit, dailySent,
          }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const monthlyLimit = MONTHLY_EMAIL_LIMITS[effectivePlan] ?? 0;
      if (monthlyLimit !== -1 && monthlySent >= monthlyLimit) {
        await logSystemAlert({
          category: "outreach_send_limit", severity: "warning",
          message: `User hit monthly email send limit (${monthlyLimit})`,
          details: { user_id: user.id, plan: effectivePlan, monthly_emails_sent: monthlySent },
          user_id: user.id,
        });
        return new Response(
          JSON.stringify({
            error: `Monthly email send cap reached on your ${effectivePlan} plan.`,
            code: 'monthly_cap_reached',
            upgradeRequired: true,
            plan: effectivePlan,
            monthlyLimit,
            monthlySent,
            monthlyRemaining: 0,
            resetAt: nextMonthStart.toISOString(),
          }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }


    // Refuse a duplicate of something this sender already sent.
    //
    // The agent re-mailed prospects it had already contacted: approved sends
    // left their draft in email_drafts, and send_drafts with no arguments
    // sends every pending draft. The draft leak is fixed at its source, but
    // this is the choke point every path goes through — the studio, the
    // agent, sequences, the scheduler — so the guard belongs here too. A
    // caller that genuinely means to send the same subject again can pass
    // allowDuplicate.
    //
    // Matched on recipient plus subject rather than body, because a
    // regenerated draft to the same person with the same subject is the case
    // that burns a sender's reputation.
    //
    // A reply inside an existing conversation is exempt: every message in a
    // thread shares the same "Re: ..." subject, so the guard would refuse the
    // second and every later reply in a legitimate back-and-forth.
    if (!payload.allowDuplicate && !threadId) {

      const dupWindow = duplicateWindowStart();
      const { data: dup } = await supabase
        .from('sent_emails')
        .select('id, sent_at')
        .eq('user_id', user.id)
        .eq('to_email', normalizeRecipient(to))
        .eq('subject', subject)
        .in('status', DELIVERED_STATUSES)
        .gte('sent_at', dupWindow)
        .limit(1)
        .maybeSingle();

      if (dup) {
        console.warn(`[send-email] duplicate blocked: ${to} already got "${subject}"`);
        // The refusal names the two remedies that work and rules out the one
        // the agent kept choosing. See _shared/duplicate-send.ts for why.
        return new Response(
          JSON.stringify(
            duplicateRefusal({ to, subject, previouslySentAt: dup.sent_at as string | null }),
          ),
          { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Check opt-out status for THIS sender, plus any global opt-out.
    //
    // It matched on the address alone, so a prospect who unsubscribed from one
    // account could not be emailed by any other account on the platform —
    // and the refusal told the second account that somebody, somewhere, had
    // already burned that address.
    const optout = await isOptedOut(supabase, user.id, to);

    if (optout) {
      return new Response(
        JSON.stringify({ error: 'This recipient has unsubscribed and cannot receive emails.' }),
        { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Refuse addresses verification has already proven dead. The UI filters
    // these out, but the UI is not the guarantee — the agent, the bulk sender
    // and the REST API all reach this function directly, so the block belongs
    // here. Only a confirmed `invalid` is refused: catch-all, role and unknown
    // are unproven rather than bad, and blocking those would ground most of a
    // list to prevent a minority of bounces.
    let leadProof = "";
    if (leadId) {
      const { data: leadRow } = await supabase
        .from('leads')
        .select('id, email_verification_status, research_brief, job_title, industry, company_name, contact_name')
        .eq('id', leadId)
        .eq('user_id', user.id)
        .maybeSingle();

      // A lead id the caller does not own must not decide whether this send
      // is allowed, and must not be stored on the sent row. Treating it as
      // missing and continuing would let a valid foreign lead bypass this
      // account's own invalid-address block.
      if (!leadRow) {
        return new Response(
          JSON.stringify({ error: 'Lead not found', code: 'lead_not_found' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Evidence is the lead row this account owns, not a score the caller sent.
      leadProof = proofFromLead(leadRow);

      if (leadRow.email_verification_status === 'invalid') {
        return new Response(
          JSON.stringify({
            error: 'This address failed verification and would bounce. Sending was blocked to protect your sender reputation.',
            code: 'email_unverifiable',
          }),
          { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Quick MX record check
    try {
      const domain = to.split('@')[1];
      if (domain) {
        const dnsRes = await fetch(`https://dns.google/resolve?name=${domain}&type=MX`);
        if (dnsRes.ok) {
          const dnsData = await dnsRes.json();
          if (!dnsData.Answer || dnsData.Answer.length === 0) {
            return new Response(
              JSON.stringify({ error: `Invalid email domain: ${domain} has no MX records. This email will bounce.` }),
              { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }
        }
      }
    } catch (_) {
      // DNS check failed non-fatally — proceed with send
    }

    // One live token per sender per recipient. Keyed on the address alone it
    // meant a second account's send invalidated the unsubscribe link the first
    // had already delivered, and that recipient's click landed on "this link
    // is not valid".
    const unsubToken = await mintUnsubscribeToken(supabase, user.id, to);
    const unsubUrl = unsubscribeUrl(supabaseUrl, unsubToken);

    // Per-account daily limit + rotation counter (atomic). Only spend the
    // account's quota once we're about to actually send. A null id (mailbox not
    // migrated) returns true and defers to the user-level caps above.
    if (sendingAccountId) {
      try {
        const { data: allowed, error: incErr } = await supabase.rpc('increment_account_send', {
          p_account_id: sendingAccountId,
        });
        if (incErr) {
          console.warn('increment_account_send failed (non-fatal):', incErr);
        } else if (allowed === false) {
          return new Response(
            JSON.stringify({
              error: 'This mailbox has reached its daily send limit. It resumes tomorrow, or raise the limit on the Deliverability page.',
              code: 'account_daily_cap_reached',
            }),
            { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      } catch (e) {
        console.warn('increment_account_send threw (non-fatal):', e);
      }
    }

    // Send email based on integration type
    if (integrationId === 'google' || !integrationId) {
      // Optional signature append (used by the AI SDR / automated sends).
      // Outreach Studio composes the signature into the body itself, so it
      // does not set appendSignature and never double-appends.
      let body = rawBody as string;
      if (appendSignature) {
        const sig = await getSignatureHtml(supabase, user.id, accessToken);
        body = appendSignatureToBody(body, sig);
      }

      // The browser card is not the gate. A direct call, a stale edit, and a
      // signature appended here are checked on the text that would be sent.
      // There is no caller flag that skips this. Confirmation in chat is not
      // a pass. Human-written mail uses the same rules.
      // Exception: a reply inside the sender's own thread where the prospect
      // has already replied is a conversation, not cold outreach. Verified
      // server-side against owner-scoped sent_emails, never trusted from input.
      let isVerifiedReply = false;
      if (typeof threadId === "string" && threadId) {
        const { data: replied } = await supabase
          .from("sent_emails")
          .select("id")
          .eq("user_id", user.id)
          .eq("gmail_thread_id", threadId)
          .not("replied_at", "is", null)
          .limit(1);
        isVerifiedReply = Array.isArray(replied) && replied.length > 0;
      }
      const plainBody = htmlToPlainText(body);
      const gateFindings = isVerifiedReply ? [] : outboundGateFindings(
        String(subject ?? ""),
        plainBody,
        leadProof,
        0,
      );
      const liveBlocked = gateFindings.length > 0;
      let allowSend = !liveBlocked;
      let verdictId: string | null = null;
      let canary = false;
      let canaryKnown = false;
      try {
        const { data: enabled, error: canaryErr } = await supabase.rpc("outbound_canary_enabled", { p_user_id: user.id });
        if (!canaryErr) {
          canaryKnown = true;
          canary = enabled === true;
        }
      } catch (canaryReadErr) {
        console.warn("[send-email] canary flag unread", canaryReadErr);
      }
      try {
        const callerAuthorization = req.headers.get("Authorization") ?? "";
        const [hash, promptHash, rubricHash, rubricReport] = await Promise.all([
          contentHash(String(subject ?? ""), plainBody),
          gatePromptHash(),
          rubricPromptHash(),
          scoreEmailReport(supabaseUrl, callerAuthorization, anonKey, {
            subject: String(subject ?? ""),
            body: plainBody,
          }),
        ]);
        const gateStatus = liveBlocked
          ? (gateFindings.some((f) => f.severity === "blocker") ? "refused" : "needs_review")
          : "clear";
        const { data: priorRows } = await supabase.rpc("latest_outbound_verdict", {
          p_user_id: user.id,
          p_content_hash: hash,
        });
        const prior = Array.isArray(priorRows) ? priorRows[0] : priorRows;
        const shadowMismatch = !!prior && (
          String(prior.gate_status) !== gateStatus
          || String(prior.prompt_hash) !== promptHash
          || String(prior.rubric_prompt_hash) !== rubricHash
        );
        const stored = {
          contentHash: hash,
          gateStatus,
          promptHash,
          rubricPromptHash: rubricHash,
          userId: user.id,
        } as const;
        const { data: id, error: writeErr } = await supabase.rpc("record_outbound_verdict", {
          p_user_id: user.id,
          p_lead_id: leadId ?? null,
          p_content_hash: hash,
          p_subject: String(subject ?? ""),
          p_body: plainBody,
          p_findings: gateFindings,
          p_rubric_availability: rubricReport.availability,
          p_rubric: rubricReport.rubric,
          p_prompt_hash: promptHash,
          p_rubric_prompt_hash: rubricHash,
          p_gate_status: gateStatus,
          p_shadow: !canary,
          p_shadow_mismatch: shadowMismatch,
        });
        const persisted = !writeErr && typeof id === "string";
        verdictId = persisted ? id : null;
        if (!canaryKnown) {
          allowSend = !liveBlocked;
        } else {
          const decision = evaluateSend({
            liveBlocked,
            contentHash: hash,
            promptHash,
            rubricPromptHash: rubricHash,
            stored: persisted ? stored : null,
            persisted,
            canary,
            userId: user.id,
          });
          allowSend = decision.allow;
        }
      } catch (verdictErr) {
        console.warn("[send-email] verdict write failed", verdictErr);
        allowSend = canary ? false : !liveBlocked;
      }
      if (!allowSend) {
        return new Response(
          JSON.stringify({
            error: liveBlocked
              ? `Not sent. The quality check failed: ${gateFindings.slice(0, 4).map((f) => f.rule).join(", ")}.`
              : "Not sent. This account's canary requires a current clear verdict for this exact text, including the signature. A missing or stale verdict is not permission.",
            code: liveBlocked ? "quality_checker" : "verdict_required",
            findings: gateFindings.slice(0, 8).map((f) => ({ rule: f.rule, evidence: f.evidence, fix: f.fix })),
          }),
          { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      // Format body as proper HTML email if it's not already HTML
      const isHtml = body.trim().startsWith('<') && (body.includes('<html') || body.includes('<div') || body.includes('<p') || body.includes('<br'));
      
      // Convert plain text to properly formatted HTML email
      // Check if body contains HTML tags (e.g. signature with images)
      const containsHtml = /<[a-z][\s\S]*>/i.test(body);
      
      // Helper: convert plain text lines to HTML, collapsing sign-off + name
      const textLinesToHtml = (text: string) => {
        const lines = text.split('\n');
        const result: string[] = [];
        const signOffAt = signOffStartIndex(lines);
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i].trim();
          if (!line) {
            result.push('');
            continue;
          }
          // Detect the sign-off block. This used to match only "Best,",
          // "Regards," and friends — the exact sign-offs the writing rules
          // forbid, since the rule is sender-first-name-only. So it never fired
          // on a real draft, and "Brandon" / "Founder, BDØT Industries LLC"
          // each rendered as their own paragraph with a full gap, which reads
          // in Gmail as floating fragments rather than a signature.
          const isSignOff = i === signOffAt ||
            /^(best(?: regards)?|regards|thanks|thank you|sincerely|cheers)[\s,!.:-]*$/i.test(line);
          if (isSignOff) {
            // Collect sign-off + following non-empty lines (name, title) into one block
            const block = [line];
            let j = i + 1;
            // Skip blank lines between sign-off and name
            while (j < lines.length && !lines[j].trim()) j++;
            // Grab remaining non-empty lines (name, possibly title)
            while (j < lines.length && lines[j].trim()) {
              block.push(lines[j].trim());
              j++;
            }
            result.push(`<p style="margin:0">${block.join('<br>')}</p>`);
            i = j - 1; // skip consumed lines
          } else {
            result.push(`<p>${line}</p>`);
          }
        }
        return result.join('\n');
      };

      let formattedBody: string;
      if (isHtml) {
        formattedBody = body;
      } else if (containsHtml) {
        // Body is mostly plain text but contains HTML (like a signature block)
        // Split at the first HTML tag to separate text from signature
        const firstHtmlIndex = body.search(/<[a-z][\s\S]*>/i);
        const textPart = body.substring(0, firstHtmlIndex);
        const htmlPart = body.substring(firstHtmlIndex);
        
        formattedBody = textLinesToHtml(textPart) + '\n' + htmlPart;
      } else {
        formattedBody = textLinesToHtml(body);
      }

      // The visible link. The header below is what Gmail renders its own
      // control from; CAN-SPAM wants one in the body regardless.
      const unsubscribeFooterHtml = unsubscribeFooterHtml_(unsubUrl);

      const htmlBody = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      line-height: 1.6;
      color: #333333;
      max-width: 600px;
      margin: 0 auto;
      padding: 20px;
    }
    p {
      margin: 0 0 10px 0;
    }
    img {
      max-width: 100%;
      height: auto;
    }
  </style>
</head>
<body>
${formattedBody}
${unsubscribeFooterHtml}
</body>
</html>`;

      // Generate tracking pixel ID
      const trackingPixelId = crypto.randomUUID();
      const trackingPixelUrl = `${supabaseUrl}/functions/v1/track-email-open?id=${trackingPixelId}`;
      const trackingPixel = `<img src="${trackingPixelUrl}" width="1" height="1" style="display:none" alt="" />`;

      // Does this account want an open pixel at all?
      //
      // deliverability_preferences.open_tracking_enabled was created with a
      // comment promising the UI would make the cost visible, and then nothing
      // read it and nothing wrote it — so every account carried a pixel it had
      // never been offered a way to decline. A remote image in a cold email is
      // a spam signal, and the number it buys is not reliable enough to be
      // worth the placement: proxies and privacy features load it whether or
      // not anyone read the message.
      //
      // Failure to read the preference leaves tracking ON, which is the
      // existing behaviour — a database hiccup must not silently change what
      // an account is sending.
      let openTrackingEnabled = true;
      try {
        const { data: prefs } = await supabase
          .from('deliverability_preferences')
          .select('open_tracking_enabled')
          .eq('user_id', user.id)
          .maybeSingle();
        if (prefs && prefs.open_tracking_enabled === false) openTrackingEnabled = false;
      } catch (e) {
        console.warn('[send-email] could not read tracking preference, defaulting to on:', e);
      }

      // Click tracking is unaffected. It rewrites links the reader chose to
      // follow rather than loading a remote image on open, so it costs nothing
      // in placement and its numbers mean something.
      const clickTrackedHtml = await injectClickTracking(htmlBody, trackingPixelId, supabaseUrl);
      const trackedHtmlBody = openTrackingEnabled
        ? clickTrackedHtml.replace('</body>', `${trackingPixel}\n</body>`)
        : clickTrackedHtml;
      if (!openTrackingEnabled) console.log('[send-email] open tracking off for this account — no pixel');

      // Send via Gmail API - use MIME encoding for subject to handle special characters
      const emailContent = [
        `To: ${to}`,
        `Subject: ${mimeEncodeSubject(subject)}`,
        'MIME-Version: 1.0',
        'Content-Type: text/html; charset=utf-8',
        // Required of every bulk sender by Gmail and Yahoo since February
        // 2024. Missing it is invisible from in here: the API accepts the
        // message and the far side throttles or spam-folders it, so the send
        // reads as fine and the reply never comes.
        ...listUnsubscribeHeaders(unsubUrl),
        '',
        trackedHtmlBody
      ].join('\r\n');

      const encodedEmail = toBase64Url(emailContent);

      console.log('Sending email via Gmail to:', to);

      const recipient = normalizeRecipient(to);
      const store: OutboundStore = {
        findAttempted: async (userId, toEmail, subj) => {
          const { data } = await supabase
            .from('sent_emails')
            .select('id')
            .eq('user_id', userId)
            .eq('to_email', toEmail)
            .eq('subject', subj)
            .eq('status', 'pending')
            .not('send_attempted_at', 'is', null)
            .limit(1)
            .maybeSingle();
          return data?.id ? { id: data.id as string } : null;
        },
        insertPending: async (row) => {
          const { data, error } = await supabase.from('sent_emails').insert({
            user_id: row.userId,
            lead_id: row.leadId,
            template_id: row.templateId,
            to_email: normalizeRecipient(to),
            subject: row.subject,
            body_html: trackedHtmlBody,
            body_text: htmlToPlainText(body),
            status: 'pending',
            sent_at: null,
            gmail_thread_id: row.threadId,
            tracking_pixel_id: row.trackingPixelId,
            sending_account_id: row.sendingAccountId,
          }).select('id').maybeSingle();
          if (error) {
            if (error.code === '23505') return { conflict: true };
            return { error: error.message };
          }
          if (!data?.id) return { error: 'Reservation was not stored' };
          return { id: data.id as string };
        },
        markAttempted: async (id) => {
          const { data, error } = await supabase
            .from('sent_emails')
            .update({ send_attempted_at: new Date().toISOString(), send_claimed_at: new Date().toISOString() })
            .eq('id', id)
            .is('send_attempted_at', null)
            .select('id');
          return !error && Array.isArray(data) && data.length > 0;
        },
        markSent: async (id, gmail) => {
          const { data, error } = await supabase.from('sent_emails').update({
            status: 'sent',
            gmail_message_id: gmail.messageId,
            gmail_thread_id: gmail.threadId,
            sent_at: new Date().toISOString(),
          }).eq('id', id).select('id');
          const stored = !error && Array.isArray(data) && data.length > 0;
          if (stored && verdictId) {
            await supabase.rpc("attach_verdict_to_send", {
              p_verdict_id: verdictId,
              p_sent_email_id: id,
              p_user_id: user.id,
            }).then(() => {}, () => {});
          }
          return stored;
        },
        markFailed: async (id, reason) => {
          await supabase.from('sent_emails').update({
            status: 'failed',
            error_message: reason,
            failed_at: new Date().toISOString(),
            sent_at: null,
          }).eq('id', id);
        },
      };

      const delivery = await deliverReserved(store, {
        send: async () => {
          const gmailResponse = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(
              typeof threadId === 'string' && threadId
                ? { raw: encodedEmail, threadId }
                : { raw: encodedEmail }
            ),
          });
          if (!gmailResponse.ok) {
            const error = await gmailResponse.text();
            console.error('Gmail API error:', gmailResponse.status, error);
            return { ok: false as const, status: gmailResponse.status, body: error };
          }
          const gmailResult = await gmailResponse.json();
          console.log('Email sent successfully via Gmail. Message ID:', gmailResult.id);
          return {
            ok: true as const,
            messageId: String(gmailResult.id ?? ''),
            threadId: gmailResult.threadId ? String(gmailResult.threadId) : null,
          };
        },
      }, {
        userId: user.id,
        to: recipient,
        subject,
        bodyHtml: trackedHtmlBody,
        bodyText: htmlToPlainText(body),
        leadId: leadId || null,
        templateId: templateId || null,
        threadId: typeof threadId === 'string' ? threadId : null,
        trackingPixelId,
        sendingAccountId,
        allowDuplicate: payload.allowDuplicate === true,
      });

      if (delivery.kind === 'duplicate') {
        return new Response(
          JSON.stringify(duplicateRefusal({ to, subject, previouslySentAt: null })),
          { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }
      if (delivery.kind === 'reserve_failed') {
        return new Response(
          JSON.stringify({ error: 'The send could not be reserved, so it was not sent.', code: 'reserve_failed' }),
          { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }
      if (delivery.kind === 'provider_rejected') {
        let detail = '';
        try { detail = String(JSON.parse(delivery.body)?.error?.message ?? ''); } catch { detail = ''; }
        const reason =
          delivery.status === 401
            ? 'Google would not accept access to your mailbox, so the message was not sent. Reconnect Google on the Integrations page and send again.'
            : delivery.status === 429
              ? 'Gmail rate-limited this mailbox, so the message was not accepted. It usually clears within the hour.'
              : delivery.status === 403
                ? `Gmail refused to send from this mailbox${detail ? `: ${detail.slice(0, 160)}` : '.'} This is usually a permissions or sending-limit problem on the Google account.`
                : `Gmail rejected the message${detail ? `: ${detail.slice(0, 160)}` : ` (HTTP ${delivery.status})`}.`;
        if (delivery.status === 401) {
          return new Response(
            JSON.stringify({ error: 'Gmail authentication failed. Please reconnect your Gmail account.' }),
            { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
          );
        }
        return new Response(
          JSON.stringify({ error: reason }),
          { status: delivery.status === 429 ? 429 : 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }
      if (delivery.kind === 'accepted_unpersisted') {
        console.error('[send-email] Gmail accepted the message and the row could not be updated', delivery.messageId);
        return new Response(
          JSON.stringify(acceptedUnpersistedBody(delivery.messageId, delivery.threadId)),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }

      const sentRow = { id: delivery.id };

      /*
       * Record the send against the allowance.
       *
       * This writes the append-only send_allowance_usage row the daily and
       * monthly caps count, and the counter column the Outreach and
       * Deliverability panels display. The old fallback wrote the counter
       * directly, which is no longer the number that matters — so a failure
       * here is a send that went out uncounted, and it says so rather than
       * papering over it with a write that no cap reads.
       */
      const { error: rpcError } = await supabase.rpc('increment_daily_emails_sent', {
        _user_id: user.id,
        // Null when the row above failed to store: that send then stays
        // charged for good, which is the safe direction for a cap.
        _sent_email_id: sentRow?.id ?? null,
      });
      if (rpcError) {
        console.error('[send-email] allowance not recorded for a send that went out:', rpcError.message);
        await logSystemAlert({
          category: "outreach_send_error", severity: "error",
          message: "A send went out without being recorded against the allowance",
          details: { user_id: user.id, error: rpcError.message },
          user_id: user.id,
        });
      }


      // Update lead's last_contacted_at if leadId is provided
      if (leadId) {
        const { error: updateError } = await supabase
          .from('leads')
          .update({ last_contacted_at: new Date().toISOString() })
          .eq('id', leadId)
          .eq('user_id', user.id);

        if (updateError) {
          console.error('Failed to update lead last_contacted_at:', updateError);
        }
      }

      return new Response(
        JSON.stringify({
          success: true,
          provider: 'gmail',
          messageId: delivery.messageId,
          threadId: delivery.threadId,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    } else {
      return new Response(
        JSON.stringify({ error: 'Unsupported email provider' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
  } catch (error: any) {
    console.error('Error sending email:', error.message);
    
    // Return generic error to client - don't expose internal details
    return new Response(
      JSON.stringify({ error: 'Failed to send email. Please try again.' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

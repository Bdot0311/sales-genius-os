// Shared Stripe event processor.
// Used by stripe-webhook (live events) and retry-stripe-webhooks (replay).
// Throws on failure so callers can persist retry/dead-letter state.

import Stripe from "https://esm.sh/stripe@18.5.0";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { logSystemAlert } from "./alerts.ts";
import { trackBusinessEvent } from "./heycatch.ts";

const PRICE_TO_PLAN: Record<string, { plan: 'starter' | 'growth' | 'pro' | 'agency', credits: number, dailyLimit: number, leadsLimit: number, isYearly: boolean }> = {
  'price_1T8tywFTerosS6hi0fHQuybr': { plan: 'starter', credits: 1000, dailyLimit: 100, leadsLimit: 1000, isYearly: false },
  'price_1T8tyxFTerosS6hiSakB51fA': { plan: 'starter', credits: 12000, dailyLimit: 100, leadsLimit: 1000, isYearly: true },
  'price_1T8tyyFTerosS6hiTsTXkWDa': { plan: 'growth', credits: 2500, dailyLimit: 250, leadsLimit: 2500, isYearly: false },
  'price_1T8tyzFTerosS6hiUyzpHnCK': { plan: 'growth', credits: 30000, dailyLimit: 250, leadsLimit: 2500, isYearly: true },
  'price_1T8tz0FTerosS6hiKJluR3kk': { plan: 'pro', credits: 5000, dailyLimit: 500, leadsLimit: 5000, isYearly: false },
  'price_1T8tz0FTerosS6hiIHNG82Bh': { plan: 'pro', credits: 60000, dailyLimit: 500, leadsLimit: 5000, isYearly: true },
  'price_1TSXEzFTerosS6hiKJdDX95R': { plan: 'agency', credits: 15000, dailyLimit: 1500, leadsLimit: 15000, isYearly: false },
  'price_1TSXF0FTerosS6hiAU2FlQli': { plan: 'agency', credits: 180000, dailyLimit: 1500, leadsLimit: 15000, isYearly: true },
  'price_1SmM2hFTerosS6hiiDXBDIxl': { plan: 'growth', credits: 2500, dailyLimit: 250, leadsLimit: 2500, isYearly: false },
  'price_1SS44wFTerosS6hiCkKQnnoD': { plan: 'growth', credits: 2500, dailyLimit: 250, leadsLimit: 2500, isYearly: false },
  'price_1SS456FTerosS6hisBSDPwo4': { plan: 'pro', credits: 5000, dailyLimit: 500, leadsLimit: 5000, isYearly: false },
  'price_1SS45HFTerosS6hiQtxsNVL4': { plan: 'pro', credits: 5000, dailyLimit: 500, leadsLimit: 5000, isYearly: false },
};

const PRODUCT_TO_PLAN: Record<string, 'starter' | 'growth' | 'pro' | 'agency'> = {
  'prod_U78FZoAWovU1rX': 'starter', 'prod_U78FC92stOkRxS': 'starter',
  'prod_U78Ff02VQAzrLC': 'growth', 'prod_U78Fk0l7swAukt': 'growth',
  'prod_U78Fs2HpZzcZJc': 'pro', 'prod_U78Fuo9Mg04kz9': 'pro',
  'prod_URQ5ib01VNZY9o': 'agency', 'prod_URQ5awS6V2AAXH': 'agency',
  'prod_TjpiXbauY0T3RF': 'growth', 'prod_TOrozUbuuN18RP': 'pro', 'prod_TOrod7SaIV2D7s': 'pro',
  'prod_U6gflsh1Zzoh3V': 'starter', 'prod_U6gfTND3QdfgcC': 'growth', 'prod_U6gfOj1Xgfd1vy': 'pro',
};

const log = (s: string, d?: unknown) => console.log(`[STRIPE-EVT] ${s}${d ? ' - ' + JSON.stringify(d) : ''}`);

const generateTempPassword = () => {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%";
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => chars[b % chars.length]).join("");
};

async function findUserId(supabase: SupabaseClient, email: string): Promise<string | null> {
  const { data: profile } = await supabase
    .from('profiles').select('id').ilike('email', email).maybeSingle();
  if (profile?.id) return profile.id;
  for (let page = 1; page <= 20; page++) {
    const { data } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    const m = data?.users?.find(u => u.email?.toLowerCase() === email.toLowerCase());
    if (m) return m.id;
    if (!data?.users || data.users.length < 200) break;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Access-management policy: grace period → auto-pause → auto-resume.
// Config lives in admin_settings -> billing_notifications
//   .auto_pause  { enabled, max_failed_invoices, pause_on_dunning_exhausted }
//   .grace       { enabled, days }
//   .auto_resume { enabled, on_invoice_paid, on_subscription_active }
// ---------------------------------------------------------------------------
interface AutoPauseConfig {
  enabled: boolean;
  max_failed_invoices: number;
  pause_on_dunning_exhausted: boolean;
}

interface GraceConfig {
  enabled: boolean;
  days: number;
}

interface AutoResumeConfig {
  enabled: boolean;
  on_invoice_paid: boolean;
  on_subscription_active: boolean;
}

interface BillingPolicy {
  autoPause: AutoPauseConfig;
  grace: GraceConfig;
  autoResume: AutoResumeConfig;
}

const POLICY_DEFAULTS: BillingPolicy = {
  autoPause: { enabled: true, max_failed_invoices: 3, pause_on_dunning_exhausted: true },
  grace: { enabled: true, days: 7 },
  autoResume: { enabled: true, on_invoice_paid: true, on_subscription_active: true },
};

async function getBillingPolicy(supabase: SupabaseClient): Promise<BillingPolicy> {
  try {
    const { data } = await supabase
      .from('admin_settings')
      .select('setting_value')
      .eq('setting_key', 'billing_notifications')
      .maybeSingle();
    const value = ((data as any)?.setting_value ?? {}) as Record<string, any>;
    const ap = (value.auto_pause ?? {}) as Partial<AutoPauseConfig>;
    const gr = (value.grace ?? {}) as Partial<GraceConfig>;
    const ar = (value.auto_resume ?? {}) as Partial<AutoResumeConfig>;

    const max = Number(ap.max_failed_invoices);
    const days = Number(gr.days);
    return {
      autoPause: {
        enabled: ap.enabled !== false,
        max_failed_invoices: Number.isFinite(max) && max >= 1
          ? Math.floor(max)
          : POLICY_DEFAULTS.autoPause.max_failed_invoices,
        pause_on_dunning_exhausted: ap.pause_on_dunning_exhausted !== false,
      },
      grace: {
        enabled: gr.enabled !== false,
        days: Number.isFinite(days) && days >= 0 ? Math.floor(days) : POLICY_DEFAULTS.grace.days,
      },
      autoResume: {
        enabled: ar.enabled !== false,
        on_invoice_paid: ar.on_invoice_paid !== false,
        on_subscription_active: ar.on_subscription_active !== false,
      },
    };
  } catch (_e) {
    return POLICY_DEFAULTS;
  }
}

/** Pauses the account and records the reason in the billing log (audit_logs + system_alerts). */
async function autoPauseAccount(
  supabase: SupabaseClient,
  userId: string,
  email: string,
  reason: string,
  details: Record<string, unknown>,
) {
  const { data: current } = await supabase
    .from('subscriptions').select('account_status').eq('user_id', userId).maybeSingle();
  if (current?.account_status === 'paused' || current?.account_status === 'locked' || current?.account_status === 'cancelled') {
    log("auto-pause skipped, account already restricted", { email, status: current?.account_status });
    return;
  }

  const { error } = await supabase.rpc('billing_record_auto_pause', {
    _user_id: userId,
    _reason: reason,
    _details: { email, ...details },
  });
  if (error) {
    log("auto-pause failed", { email, error: error.message });
    return;
  }

  await logSystemAlert({
    category: "billing_auto_paused",
    severity: "critical",
    message: `${email} was automatically paused — ${reason}`,
    details: { email, reason, auto_paused: true, ...details },
    user_id: userId,
    related_entity: (details.stripe_subscription_id as string) ?? null,
  });
  log("account auto-paused", { email, reason });
}

/** Starts (or keeps) the grace window after a failed payment. Returns the deadline. */
async function startGracePeriod(
  supabase: SupabaseClient,
  userId: string,
  days: number,
  reason: string,
  details: Record<string, unknown>,
): Promise<string | null> {
  const { data, error } = await supabase.rpc('billing_start_grace_period', {
    _user_id: userId,
    _days: days,
    _reason: reason,
    _details: details,
  });
  if (error) {
    log("grace period start failed", { error: error.message });
    return null;
  }
  return (data as string) ?? null;
}

/**
 * Restores access after a successful payment or retry. Only reverses automatic
 * restrictions — manual admin locks and real cancellations stay in place.
 */
async function autoResumeAccount(
  supabase: SupabaseClient,
  userId: string,
  email: string,
  reason: string,
  details: Record<string, unknown>,
) {
  const policy = await getBillingPolicy(supabase);
  if (!policy.autoResume.enabled) return;

  const { data: current } = await supabase
    .from('subscriptions')
    .select('account_status, auto_paused_at, grace_period_ends_at, failed_invoice_count')
    .eq('user_id', userId)
    .maybeSingle();

  const wasRestricted =
    !!current &&
    (current.account_status === 'paused' ||
      current.account_status === 'past_due' ||
      !!current.auto_paused_at ||
      !!current.grace_period_ends_at ||
      (current.failed_invoice_count ?? 0) > 0);

  if (!wasRestricted) return;

  const { data: resumed, error } = await supabase.rpc('billing_record_auto_resume', {
    _user_id: userId,
    _reason: reason,
    _details: { email, ...details },
  });
  if (error) {
    log("auto-resume failed", { email, error: error.message });
    return;
  }
  if (resumed !== true) {
    log("auto-resume skipped (manual lock or cancelled)", { email, status: current?.account_status });
    return;
  }

  await logSystemAlert({
    category: "billing_auto_resumed",
    severity: "info",
    message: `${email} regained access automatically — ${reason}`,
    details: { email, reason, auto_resumed: true, was_auto_paused: !!current?.auto_paused_at, ...details },
    user_id: userId,
    related_entity: (details.stripe_subscription_id as string) ?? null,
  });
  log("account auto-resumed", { email, reason });
}

async function resetDunningState(supabase: SupabaseClient, userId: string) {
  const { error } = await supabase.rpc('billing_reset_failed_invoice_count', { _user_id: userId });
  if (error) log("failed-invoice reset failed", { error: error.message });
}

async function applyEvent(
  supabase: SupabaseClient,
  userId: string,
  event: Stripe.Event,
  updates: Record<string, unknown>,
): Promise<{ applied: boolean; reason: string }> {
  const eventCreatedAt = event.created
    ? new Date(event.created * 1000).toISOString()
    : new Date().toISOString();
  const { data, error } = await supabase.rpc('apply_stripe_event_to_subscription', {
    _user_id: userId,
    _event_id: event.id,
    _event_created_at: eventCreatedAt,
    _updates: updates,
  });
  if (error) throw new Error(`apply_stripe_event_to_subscription failed: ${error.message}`);
  const row = Array.isArray(data) ? data[0] : data;
  return { applied: !!row?.applied, reason: row?.reason ?? 'unknown' };
}

export async function processStripeEvent(
  event: Stripe.Event,
  stripe: Stripe,
  supabase: SupabaseClient
): Promise<void> {
  log("processing", { type: event.type, id: event.id });

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    if (session.mode !== "subscription") return;

    const customerEmail = session.customer_email || session.customer_details?.email;
    const customerId = session.customer as string;
    const subscriptionId = session.subscription as string;
    if (!customerEmail) throw new Error("No email on checkout session");

    let planDetails = PRICE_TO_PLAN['price_1SmM2hFTerosS6hiiDXBDIxl'];
    if (subscriptionId) {
      const sub = await stripe.subscriptions.retrieve(subscriptionId);
      const priceId = sub.items.data[0]?.price?.id || '';
      const productId = sub.items.data[0]?.price?.product as string;
      if (priceId && PRICE_TO_PLAN[priceId]) planDetails = PRICE_TO_PLAN[priceId];
      else if (productId && PRODUCT_TO_PLAN[productId]) {
        const planName = PRODUCT_TO_PLAN[productId];
        planDetails = PRICE_TO_PLAN[Object.keys(PRICE_TO_PLAN).find(k => PRICE_TO_PLAN[k].plan === planName) || ''] || planDetails;
      } else {
        await logSystemAlert({
          category: "stripe_plan_mismatch", severity: "error",
          message: `Unrecognized Stripe price/product: priceId=${priceId} productId=${productId}`,
          details: { priceId, productId, customerEmail, subscriptionId },
        });
      }
    }

    let userId = await findUserId(supabase, customerEmail);

    if (!userId) {
      const tempPassword = generateTempPassword();
      const { data: created, error: createErr } = await supabase.auth.admin.createUser({
        email: customerEmail, password: tempPassword, email_confirm: true,
      });
      if (createErr || !created.user) throw new Error(`createUser failed: ${createErr?.message ?? 'unknown'}`);
      userId = created.user.id;
      log("created user", { userId });

      try {
        const appUrl = Deno.env.get("APP_URL") ?? "https://outreign.io";
        await supabase.rpc('enqueue_email', {
          queue_name: 'transactional_emails',
          payload: {
            message_id: crypto.randomUUID(),
            to: customerEmail,
            from: 'OutReign <noreply@notify.bdotindustries.com>',
            sender_domain: 'notify.bdotindustries.com',
            subject: `Welcome to OutReign - Your Login Credentials`,
            html: `<p>Welcome! Sign in at <a href="${appUrl}/auth">${appUrl}/auth</a> with email <b>${customerEmail}</b> and temporary password <b>${tempPassword}</b>. Please change it after first login.</p>`,
            text: `Welcome to OutReign. Email: ${customerEmail}, Temp Password: ${tempPassword}. Sign in at ${appUrl}/auth.`,
            purpose: 'transactional',
            label: 'stripe-welcome',
            idempotency_key: `stripe-welcome-${userId}-${event.id}`,
            queued_at: new Date().toISOString(),
          },
        });
      } catch (e) {
        log("welcome email enqueue failed", { error: String(e) });
      }
    }

    const periodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    const result = await applyEvent(supabase, userId, event, {
      plan: planDetails.plan,
      status: 'active',
      account_status: 'active',
      stripe_customer_id: customerId,
      stripe_subscription_id: subscriptionId,
      search_credits_base: planDetails.credits,
      search_credits_remaining: planDetails.credits,
      leads_limit: planDetails.leadsLimit,
      current_period_start: new Date().toISOString(),
      current_period_end: periodEnd,
      credits_reset_at: periodEnd,
    });
    log("checkout.session.completed apply", result);
    await trackBusinessEvent(
      "subscription_started",
      userId,
      { plan: planDetails.plan, is_yearly: planDetails.isYearly, stripe_subscription_id: subscriptionId },
      { email: customerEmail, plan: planDetails.plan },
    );
    return;
  }

  if (event.type === "customer.subscription.updated") {
    const sub = event.data.object as Stripe.Subscription;
    const prev = (event.data.previous_attributes ?? {}) as Partial<Stripe.Subscription>;
    const priceId = sub.items.data[0]?.price?.id || '';
    const customer = await stripe.customers.retrieve(sub.customer as string) as Stripe.Customer;
    if (!customer.email) return;
    const userId = await findUserId(supabase, customer.email);
    if (!userId) throw new Error(`user not found for ${customer.email}`);
    const planDetails = PRICE_TO_PLAN[priceId] || PRICE_TO_PLAN['price_1SmM2hFTerosS6hiiDXBDIxl'];
    const periodEndIso = new Date(sub.current_period_end * 1000).toISOString();
    const result = await applyEvent(supabase, userId, event, {
      plan: planDetails.plan,
      status: sub.status === 'active' ? 'active' : 'inactive',
      account_status: sub.status === 'active' ? 'active' : sub.status,
      stripe_subscription_id: sub.id,
      search_credits_base: planDetails.credits,
      leads_limit: planDetails.leadsLimit,
      cancel_at_period_end: !!sub.cancel_at_period_end,
      canceled_at: sub.canceled_at ? new Date(sub.canceled_at * 1000).toISOString() : null,
      current_period_start: new Date(sub.current_period_start * 1000).toISOString(),
      current_period_end: periodEndIso,
    });
    log("subscription.updated apply", result);

    // Churn signal: user just scheduled a cancellation for the end of the period.
    if (sub.cancel_at_period_end && prev.cancel_at_period_end === false) {
      await logSystemAlert({
        category: "billing_cancellation_scheduled", severity: "error",
        message: `${customer.email} scheduled a cancellation (${planDetails.plan} plan) — access ends ${periodEndIso.slice(0, 10)}`,
        details: {
          email: customer.email, plan: planDetails.plan, access_until: periodEndIso,
          stripe_customer_id: sub.customer, stripe_subscription_id: sub.id,
        },
        user_id: userId, related_entity: sub.id,
      });
    }

    // Cancellation reversed.
    if (!sub.cancel_at_period_end && prev.cancel_at_period_end === true) {
      await logSystemAlert({
        category: "billing_cancellation_scheduled", severity: "info",
        message: `${customer.email} reactivated — cancellation was removed`,
        details: { email: customer.email, plan: planDetails.plan },
        user_id: userId, related_entity: sub.id,
      });
    }

    const policy = await getBillingPolicy(supabase);

    // Successful retry: Stripe moved the subscription back to active.
    if (
      sub.status === 'active' &&
      prev.status && ['past_due', 'unpaid', 'incomplete', 'paused'].includes(prev.status) &&
      policy.autoResume.enabled && policy.autoResume.on_subscription_active
    ) {
      await autoResumeAccount(
        supabase, userId, customer.email,
        `Payment retry succeeded — subscription is active again (was ${prev.status})`,
        {
          trigger: 'subscription_active',
          previous_status: prev.status,
          plan: planDetails.plan,
          stripe_subscription_id: sub.id,
        },
      );
    }

    // Stripe flipped the subscription into a dunning/unpaid state.
    if (prev.status && prev.status !== sub.status && ['past_due', 'unpaid', 'incomplete_expired'].includes(sub.status)) {
      let graceEndsAt: string | null = null;
      if (sub.status === 'past_due' && policy.grace.enabled && policy.grace.days > 0) {
        graceEndsAt = await startGracePeriod(
          supabase, userId, policy.grace.days,
          `Subscription became ${sub.status}`,
          {
            trigger: 'subscription_past_due',
            target_email: customer.email,
            previous_status: prev.status,
            stripe_subscription_id: sub.id,
          },
        );
      }

      await logSystemAlert({
        category: "billing_payment_failed", severity: "error",
        message: `${customer.email} subscription is now ${sub.status} — payment is not going through${graceEndsAt ? `. Access continues until ${graceEndsAt.slice(0, 10)} (grace period)` : ''}`,
        details: {
          email: customer.email, plan: planDetails.plan, stripe_status: sub.status,
          previous_status: prev.status, stripe_subscription_id: sub.id,
          grace_period_ends_at: graceEndsAt,
        },
        user_id: userId, related_entity: sub.id,
      });

      // Dunning threshold reached: Stripe gave up on collecting. Grace does not
      // apply here — there are no retries left.
      if (['unpaid', 'incomplete_expired'].includes(sub.status)) {
        const cfg = policy.autoPause;
        if (cfg.enabled && cfg.pause_on_dunning_exhausted) {
          await autoPauseAccount(
            supabase, userId, customer.email,
            `Stripe dunning exhausted — subscription became ${sub.status}`,
            {
              trigger: 'dunning_exhausted',
              stripe_status: sub.status,
              previous_status: prev.status,
              plan: planDetails.plan,
              stripe_subscription_id: sub.id,
            },
          );
        }
      }
    }

    return;
  }

  if (event.type === "customer.subscription.paused") {
    const sub = event.data.object as Stripe.Subscription;
    const customer = await stripe.customers.retrieve(sub.customer as string) as Stripe.Customer;
    if (!customer.email) return;
    const userId = await findUserId(supabase, customer.email);
    if (!userId) return;
    await applyEvent(supabase, userId, event, { status: 'paused', account_status: 'paused' });
    await logSystemAlert({
      category: "billing_subscription_paused", severity: "error",
      message: `${customer.email} subscription was paused in Stripe`,
      details: { email: customer.email, stripe_subscription_id: sub.id },
      user_id: userId, related_entity: sub.id,
    });
    return;
  }

  if (event.type === "customer.subscription.resumed") {
    const sub = event.data.object as Stripe.Subscription;
    const customer = await stripe.customers.retrieve(sub.customer as string) as Stripe.Customer;
    if (!customer.email) return;
    const userId = await findUserId(supabase, customer.email);
    if (!userId) return;
    await applyEvent(supabase, userId, event, { status: 'active', account_status: 'active' });
    await logSystemAlert({
      category: "billing_subscription_paused", severity: "info",
      message: `${customer.email} subscription resumed in Stripe`,
      details: { email: customer.email, stripe_subscription_id: sub.id },
      user_id: userId, related_entity: sub.id,
    });
    return;
  }

  if (event.type === "invoice.payment_failed") {
    const invoice = event.data.object as Stripe.Invoice;
    const customer = await stripe.customers.retrieve(invoice.customer as string) as Stripe.Customer;
    if (!customer.email) return;
    const userId = await findUserId(supabase, customer.email);
    if (!userId) throw new Error(`user not found for ${customer.email}`);

    const reason =
      (invoice as any).last_finalization_error?.message ||
      (invoice as any).payment_intent_error?.message ||
      "Card was declined or payment could not be completed";
    const attemptCount = invoice.attempt_count ?? 1;
    const nextAttempt = invoice.next_payment_attempt
      ? new Date(invoice.next_payment_attempt * 1000).toISOString()
      : null;

    const policy = await getBillingPolicy(supabase);

    await applyEvent(supabase, userId, event, {
      status: 'past_due',
      account_status: 'past_due',
      payment_failed_at: new Date().toISOString(),
      last_payment_error: String(reason).slice(0, 500),
    });

    // Count consecutive failures first — the grace window and pause decision
    // both depend on it.
    const { data: failures, error: bumpErr } = await supabase.rpc(
      'billing_bump_failed_invoice_count', { _user_id: userId },
    );
    if (bumpErr) log("failed-invoice bump failed", { error: bumpErr.message });
    const failureCount = Number(failures ?? attemptCount) || attemptCount;

    // Policy step 1: open a grace window on the first failure. Access stays on
    // until the deadline passes with the invoice still unpaid.
    let graceEndsAt: string | null = null;
    if (policy.grace.enabled && policy.grace.days > 0) {
      graceEndsAt = await startGracePeriod(
        supabase, userId, policy.grace.days,
        `Invoice payment failed — ${reason}`,
        {
          trigger: 'invoice_payment_failed',
          target_email: customer.email,
          attempt_count: attemptCount,
          failed_invoice_count: failureCount,
          next_payment_attempt: nextAttempt,
          invoice_url: invoice.hosted_invoice_url,
        },
      );
    }
    const graceActive = !!graceEndsAt && new Date(graceEndsAt).getTime() > Date.now();

    await logSystemAlert({
      category: "billing_payment_failed",
      severity: nextAttempt ? "error" : "critical",
      message: `Payment failed for ${customer.email} — $${((invoice.amount_due ?? 0) / 100).toFixed(2)} (attempt ${attemptCount})${nextAttempt ? `, Stripe retries ${nextAttempt.slice(0, 10)}` : `, no further retries`}${graceActive ? `. Access continues until ${graceEndsAt!.slice(0, 10)} (grace period)` : ''}`,
      details: {
        email: customer.email,
        amount_due: (invoice.amount_due ?? 0) / 100,
        currency: invoice.currency,
        attempt_count: attemptCount,
        failed_invoice_count: failureCount,
        next_payment_attempt: nextAttempt,
        grace_period_ends_at: graceEndsAt,
        reason,
        invoice_url: invoice.hosted_invoice_url,
        stripe_customer_id: invoice.customer,
        stripe_subscription_id: invoice.subscription,
      },
      user_id: userId,
      related_entity: invoice.id,
    });

    // Policy step 2: pause once the failure threshold is hit AND the grace
    // window is over (or grace is disabled).
    const cfg = policy.autoPause;
    if (cfg.enabled && failureCount >= cfg.max_failed_invoices && !graceActive) {
      await autoPauseAccount(
        supabase, userId, customer.email,
        `${failureCount} failed invoices (threshold ${cfg.max_failed_invoices}) — ${reason}`,
        {
          trigger: 'failed_invoice_threshold',
          failed_invoice_count: failureCount,
          threshold: cfg.max_failed_invoices,
          attempt_count: attemptCount,
          amount_due: (invoice.amount_due ?? 0) / 100,
          currency: invoice.currency,
          decline_reason: reason,
          invoice_url: invoice.hosted_invoice_url,
          stripe_customer_id: invoice.customer,
          stripe_subscription_id: invoice.subscription,
        },
      );
    }

    log("invoice.payment_failed handled", {
      email: customer.email, failureCount, graceEndsAt, graceActive,
    });
    return;
  }


  if (event.type === "invoice.payment_action_required") {
    const invoice = event.data.object as Stripe.Invoice;
    const customer = await stripe.customers.retrieve(invoice.customer as string) as Stripe.Customer;
    if (!customer.email) return;
    const userId = await findUserId(supabase, customer.email);
    await logSystemAlert({
      category: "billing_payment_action_required", severity: "error",
      message: `${customer.email} needs to authenticate their card (3DS) to complete payment`,
      details: {
        email: customer.email,
        amount_due: (invoice.amount_due ?? 0) / 100,
        invoice_url: invoice.hosted_invoice_url,
      },
      user_id: userId, related_entity: invoice.id,
    });
    return;
  }

  if (event.type === "charge.dispute.created") {
    const dispute = event.data.object as Stripe.Dispute;
    let email: string | null = null;
    let userId: string | null = null;
    try {
      const charge = await stripe.charges.retrieve(dispute.charge as string);
      const customerId = charge.customer as string | null;
      if (customerId) {
        const customer = await stripe.customers.retrieve(customerId) as Stripe.Customer;
        email = customer.email ?? null;
      }
      email = email ?? charge.billing_details?.email ?? null;
      if (email) userId = await findUserId(supabase, email);
    } catch (e) {
      log("dispute lookup failed", { error: String(e) });
    }
    await logSystemAlert({
      category: "billing_dispute", severity: "critical",
      message: `Chargeback opened${email ? ` by ${email}` : ''} — $${((dispute.amount ?? 0) / 100).toFixed(2)} (${dispute.reason})`,
      details: {
        email, amount: (dispute.amount ?? 0) / 100, reason: dispute.reason,
        status: dispute.status, charge_id: dispute.charge,
      },
      user_id: userId, related_entity: dispute.id,
    });
    return;
  }


  if (event.type === "invoice.paid") {
    const invoice = event.data.object as Stripe.Invoice;
    const subscriptionId = invoice.subscription as string;
    if (!subscriptionId) return;
    const sub = await stripe.subscriptions.retrieve(subscriptionId);
    const priceId = sub.items.data[0]?.price?.id || '';
    const customer = await stripe.customers.retrieve(invoice.customer as string) as Stripe.Customer;
    if (!customer.email) return;
    const userId = await findUserId(supabase, customer.email);
    if (!userId) throw new Error(`user not found for ${customer.email}`);
    const planDetails = PRICE_TO_PLAN[priceId] || PRICE_TO_PLAN['price_1SmM2hFTerosS6hiiDXBDIxl'];

    // Read current credits inside the same logical operation. The
    // apply_stripe_event_to_subscription RPC will refuse to apply if this
    // event has already been recorded (last_stripe_event_id == event.id),
    // so duplicate invoice.paid events cannot double-add credits.
    const { data: cur } = await supabase.from('subscriptions')
      .select('search_credits_remaining, last_stripe_event_id').eq('user_id', userId).single();

    if (cur?.last_stripe_event_id === event.id) {
      log("invoice.paid duplicate, skipping credit rollover", { id: event.id });
      return;
    }

    let newCredits = planDetails.credits;
    if (!planDetails.isYearly && (planDetails.plan === 'growth' || planDetails.plan === 'pro' || planDetails.plan === 'agency')) {
      newCredits = (cur?.search_credits_remaining || 0) + planDetails.credits;
    }
    const result = await applyEvent(supabase, userId, event, {
      search_credits_remaining: newCredits,
      daily_searches_used: 0,
      status: 'active',
      account_status: 'active',
      payment_failed_at: null,
      last_payment_error: null,
      credits_reset_at: new Date(sub.current_period_end * 1000).toISOString(),
      current_period_start: new Date(sub.current_period_start * 1000).toISOString(),
      current_period_end: new Date(sub.current_period_end * 1000).toISOString(),
    });
    await resetDunningState(supabase, userId);

    // Policy: a paid invoice clears the grace period and restores access.
    const policy = await getBillingPolicy(supabase);
    if (policy.autoResume.enabled && policy.autoResume.on_invoice_paid) {
      await autoResumeAccount(
        supabase, userId, customer.email,
        'Invoice paid — access restored automatically',
        {
          trigger: 'invoice_paid',
          amount_paid: (invoice.amount_paid ?? 0) / 100,
          currency: invoice.currency,
          invoice_url: invoice.hosted_invoice_url,
          stripe_customer_id: invoice.customer,
          stripe_subscription_id: subscriptionId,
        },
      );
    }
    log("invoice.paid apply", result);
    return;
  }


  if (event.type === "customer.subscription.deleted") {
    const sub = event.data.object as Stripe.Subscription;
    const customer = await stripe.customers.retrieve(sub.customer as string) as Stripe.Customer;
    if (!customer.email) return;
    const userId = await findUserId(supabase, customer.email);
    if (!userId) return;
    const result = await applyEvent(supabase, userId, event, {
      status: 'cancelled',
      account_status: 'cancelled',
      cancel_at_period_end: false,
      canceled_at: sub.canceled_at ? new Date(sub.canceled_at * 1000).toISOString() : new Date().toISOString(),
    });
    log("subscription.deleted apply", result);
    await trackBusinessEvent(
      "subscription_cancelled",
      userId,
      {
        stripe_subscription_id: sub.id,
        cancellation_reason: (sub.cancellation_details as any)?.reason ?? null,
      },
      { email: customer.email, plan: "free" },
    );
    await logSystemAlert({
      category: "billing_cancellation", severity: "critical",
      message: `${customer.email} cancelled — subscription ended and the account is now inactive`,
      details: {
        email: customer.email,
        stripe_customer_id: sub.customer,
        stripe_subscription_id: sub.id,
        cancellation_reason: (sub.cancellation_details as any)?.reason ?? null,
        cancellation_comment: (sub.cancellation_details as any)?.comment ?? null,
      },
      user_id: userId, related_entity: sub.id,
    });
    return;
  }


  log("unhandled event type, skipping", { type: event.type });
}

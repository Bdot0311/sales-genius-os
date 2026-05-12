// Shared Stripe event processor.
// Used by stripe-webhook (live events) and retry-stripe-webhooks (replay).
// Throws on failure so callers can persist retry/dead-letter state.

import Stripe from "https://esm.sh/stripe@18.5.0";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { logSystemAlert } from "./alerts.ts";

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
  let p = "";
  for (let i = 0; i < 12; i++) p += chars.charAt(Math.floor(Math.random() * chars.length));
  return p;
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
        const appUrl = "https://salesos.alephwavex.io";
        await supabase.rpc('enqueue_email', {
          queue_name: 'transactional_emails',
          payload: {
            message_id: crypto.randomUUID(),
            to: customerEmail,
            from: 'SalesOS <noreply@notify.bdotindustries.com>',
            sender_domain: 'notify.bdotindustries.com',
            subject: `Welcome to SalesOS - Your Login Credentials`,
            html: `<p>Welcome! Sign in at <a href="${appUrl}/auth">${appUrl}/auth</a> with email <b>${customerEmail}</b> and temporary password <b>${tempPassword}</b>. Please change it after first login.</p>`,
            text: `Welcome to SalesOS. Email: ${customerEmail}, Temp Password: ${tempPassword}. Sign in at ${appUrl}/auth.`,
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
    return;
  }

  if (event.type === "customer.subscription.updated") {
    const sub = event.data.object as Stripe.Subscription;
    const priceId = sub.items.data[0]?.price?.id || '';
    const customer = await stripe.customers.retrieve(sub.customer as string) as Stripe.Customer;
    if (!customer.email) return;
    const userId = await findUserId(supabase, customer.email);
    if (!userId) throw new Error(`user not found for ${customer.email}`);
    const planDetails = PRICE_TO_PLAN[priceId] || PRICE_TO_PLAN['price_1SmM2hFTerosS6hiiDXBDIxl'];
    const result = await applyEvent(supabase, userId, event, {
      plan: planDetails.plan,
      status: sub.status === 'active' ? 'active' : 'inactive',
      account_status: sub.status === 'active' ? 'active' : sub.status,
      stripe_subscription_id: sub.id,
      search_credits_base: planDetails.credits,
      leads_limit: planDetails.leadsLimit,
      current_period_start: new Date(sub.current_period_start * 1000).toISOString(),
      current_period_end: new Date(sub.current_period_end * 1000).toISOString(),
    });
    log("subscription.updated apply", result);
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
      credits_reset_at: new Date(sub.current_period_end * 1000).toISOString(),
      current_period_start: new Date(sub.current_period_start * 1000).toISOString(),
      current_period_end: new Date(sub.current_period_end * 1000).toISOString(),
    });
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
    });
    log("subscription.deleted apply", result);
    return;
  }

  log("unhandled event type, skipping", { type: event.type });
}

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@^2.76.1";
import { getSubscriptionPeriod, toIsoUnix } from "../_shared/stripe-period.ts";
import { PRICE_TO_PLAN } from "../_shared/process-stripe-event.ts";
import { isStripePaidStatus, stripePlanFor } from "../_shared/stripe-entitlement.ts";
import { dunningStage } from "../_shared/dunning-policy.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[CHECK-SUBSCRIPTION] ${step}${detailsStr}`);
};

// Product IDs for plans
// Monthly = credits reset each cycle, Yearly = full annual pool granted upfront
const PLAN_PRODUCTS: Record<string, { plan: string, credits: number, dailyLimit: number, isYearly?: boolean }> = {
  // New product IDs - monthly
  'prod_U78FZoAWovU1rX': { plan: 'starter', credits: 1000, dailyLimit: 100, isYearly: false },
  'prod_U78Ff02VQAzrLC': { plan: 'growth', credits: 2500, dailyLimit: 250, isYearly: false },
  'prod_U78Fs2HpZzcZJc': { plan: 'pro', credits: 5000, dailyLimit: 500, isYearly: false },
  // New product IDs - yearly (full annual pool upfront)
  'prod_U78FC92stOkRxS': { plan: 'starter', credits: 12000, dailyLimit: 100, isYearly: true },
  'prod_U78Fk0l7swAukt': { plan: 'growth', credits: 30000, dailyLimit: 250, isYearly: true },
  'prod_U78Fuo9Mg04kz9': { plan: 'pro', credits: 60000, dailyLimit: 500, isYearly: true },
  // Agency
  'prod_URQ5ib01VNZY9o': { plan: 'agency', credits: 15000, dailyLimit: 1500, isYearly: false },
  'prod_URQ5awS6V2AAXH': { plan: 'agency', credits: 180000, dailyLimit: 1500, isYearly: true },
  // Legacy product IDs (monthly)
  'prod_U6gflsh1Zzoh3V': { plan: 'starter', credits: 1000, dailyLimit: 100 },
  'prod_U6gfTND3QdfgcC': { plan: 'growth', credits: 2500, dailyLimit: 250 },
  'prod_U6gfOj1Xgfd1vy': { plan: 'pro', credits: 5000, dailyLimit: 500 },
};

const ADDON_PRODUCTS = {
  'prod_U6gfGxg3alpeLY': { credits: 200, priceId: 'price_1T8THkFTerosS6hinP7QhH4f' },
  'prod_U6gfxI0gDG2bSk': { credits: 500, priceId: 'price_1T8THlFTerosS6hiAGh5Xdh0' },
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    logStep('Function started');

    const stripeKey = Deno.env.get('STRIPE_SECRET_KEY');
    if (!stripeKey) throw new Error('STRIPE_SECRET_KEY is not set');
    logStep('Stripe key verified');

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { persistSession: false } }
    );

    let userEmail: string;
    let userId: string | null = null;

    // SECURITY: Require authentication for all subscription queries
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('Authentication required');
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: userData, error: userError } = await supabaseClient.auth.getUser(token);
    
    if (userError || !userData?.user) {
      throw new Error('Authentication required');
    }
    
    if (!userData.user.email) throw new Error('Authentication requires an email');
    userEmail = userData.user.email;
    userId = userData.user.id;
    logStep('User authenticated', { userId });

    // CRITICAL: Check if user is an admin FIRST - admins bypass all subscription checks
    const { data: adminRole } = await supabaseClient
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .eq('role', 'admin')
      .maybeSingle();

    if (adminRole?.role === 'admin') {
      logStep('Admin user detected - bypassing subscription check');
      
      // Get admin's current subscription info or create one
      const { data: adminSub } = await supabaseClient
        .from('subscriptions')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();

      return new Response(JSON.stringify({ 
        subscribed: true,
        plan: adminSub?.plan || 'pro',
        status: 'active',
        is_admin: true,
        search_credits_base: adminSub?.search_credits_base || 2000,
        search_credits_addon: adminSub?.search_credits_addon || 0,
        search_credits_remaining: adminSub?.search_credits_remaining || 2000,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      });
    }

    const { data: licensedSub, error: licensedError } = await supabaseClient
      .from('subscriptions').select('*').eq('user_id', userId).maybeSingle();
    if (licensedError) throw new Error('Subscription lookup failed');
    const stripe = new Stripe(stripeKey, { apiVersion: '2025-08-27.basil' });
    // Stored links are server-owned. Email lookup is only for an unlinked
    // checkout-first account, never for a request-supplied identity.
    const customers = licensedSub?.stripe_customer_id
      ? { data: [{ id: licensedSub.stripe_customer_id }] }
      : await stripe.customers.list({ email: userEmail, limit: 100 });

    const returnFree = async () => {
      if (licensedSub?.plan && licensedSub.plan !== 'free') {
        const { error } = await supabaseClient.rpc('billing_downgrade_to_free', {
          _user_id: userId, _reason: 'Stripe subscription signup required',
          _details: { trigger: 'subscription_check' },
        });
        if (error) throw error;
      }
      const { data: freeSub, error } = await supabaseClient.from('subscriptions')
        .select('search_credits_base,search_credits_addon,search_credits_remaining')
        .eq('user_id', userId).maybeSingle();
      if (error) throw error;
      return new Response(JSON.stringify({ subscribed: false, plan: 'free', status: 'active',
        search_credits_base: freeSub?.search_credits_base ?? 0,
        search_credits_addon: freeSub?.search_credits_addon ?? 0,
        search_credits_remaining: freeSub?.search_credits_remaining ?? 0,
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });
    };
    if (customers.data.length === 0) return await returnFree();
    let customerId = customers.data[0].id;

    // Fetch all statuses because Stripe represents a valid free trial as
    // `trialing`, not `active`. Trialing subscriptions receive their selected
    // tier exactly like active subscriptions.
    const productPlans = Object.fromEntries(Object.entries(PLAN_PRODUCTS).map(([id, info]) => [id, info.plan]));
    let entitledSubscription: Stripe.Subscription | undefined;
    let graceSubscription: Stripe.Subscription | undefined;
    for (const customer of customers.data) {
      const subscriptions = await stripe.subscriptions.list({ customer: customer.id, status: 'all', limit: 100 });
      entitledSubscription = subscriptions.data.find((subscription: Stripe.Subscription) =>
        isStripePaidStatus(subscription.status) && stripePlanFor(subscription.items.data, PRICE_TO_PLAN, productPlans));
      graceSubscription = subscriptions.data.find((subscription: Stripe.Subscription) =>
        subscription.id === licensedSub?.stripe_subscription_id && subscription.status === 'past_due'
        && stripePlanFor(subscription.items.data, PRICE_TO_PLAN, productPlans));
      if (entitledSubscription) { customerId = customer.id; break; }
    }
    if (!entitledSubscription) {
      if (graceSubscription && licensedSub?.plan !== 'free' && licensedSub?.grace_started_at
          && dunningStage(licensedSub.grace_started_at, licensedSub.failed_invoice_count ?? 1) === 'grace') {
        return new Response(JSON.stringify({ subscribed: true, plan: licensedSub.plan, status: 'past_due',
          search_credits_base: licensedSub.search_credits_base,
          search_credits_addon: licensedSub.search_credits_addon,
          search_credits_remaining: licensedSub.search_credits_remaining,
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });
      }
      return await returnFree();
    }
    const hasActiveSub = true;
    let plan: 'free' | 'starter' | 'growth' | 'pro' | 'agency' = 'free';
    let subscriptionEnd: string | null = null;
    let stripeSubscriptionId: string | null = null;
    let baseCredits = 0;
    // The per-plan daily send cap. PLAN_PRODUCTS has carried this for every plan
    // since it was written — 100/250/500/1500, matching the published pricing
    // table — and nothing ever read it. subscriptions.daily_email_limit
    // therefore kept its schema default of 10 for every account on every plan,
    // so a paying customer was capped at the free-tier rate until they found
    // the control buried in the Bulk Send dialog.
    let dailyEmailLimit = 100; // Explore/free, per the pricing table
    let addonCredits = 0;
    let addonPriceId: string | null = null;

    if (hasActiveSub) {
      const subscription = entitledSubscription;
      if (!subscription) throw new Error('Entitled subscription could not be resolved');
      // In Stripe API 2025-08-27.basil the period lives on items, not the
      // subscription object; fall back for older payloads.
      const period = getSubscriptionPeriod(subscription as unknown as Stripe.Subscription);
      subscriptionEnd = toIsoUnix(period.endSec);
      stripeSubscriptionId = subscription.id;
      
      logStep('Found active subscription', { 
        subscriptionId: subscription.id, 
        itemCount: subscription.items.data.length,
        endDate: subscriptionEnd 
      });

      const verifiedPlan = stripePlanFor(subscription.items.data, PRICE_TO_PLAN, productPlans);
      if (!verifiedPlan) throw new Error('Unrecognized Stripe plan');
      plan = verifiedPlan.plan;
      baseCredits = verifiedPlan.credits;
      const planInfo = verifiedPlan;
      dailyEmailLimit = planInfo.dailyLimit;

      // Loop through ALL subscription items to detect plan and addons
      for (const item of subscription.items.data) {
        const productId = item.price.product as string;
        
        // Base entitlement was resolved from Stripe's recognized price/product.
        // Check if it's an addon
        if (ADDON_PRODUCTS[productId as keyof typeof ADDON_PRODUCTS]) {
          const addonInfo = ADDON_PRODUCTS[productId as keyof typeof ADDON_PRODUCTS];
          addonCredits = addonInfo.credits;
          addonPriceId = addonInfo.priceId;
          logStep('Detected addon', { addonCredits, addonPriceId });
        }
      }

      // Sync to database (only if authenticated)
      if (userId) {
        const leadsLimit = (plan as string) === 'free' ? 0 : (plan as string) === 'starter' ? 1000 : (plan as string) === 'growth' ? 2500 : (plan as string) === 'agency' ? 15000 : 5000;
        
        // Get current subscription to preserve remaining credits if same billing cycle
        const { data: currentSub } = await supabaseClient
          .from('subscriptions')
          .select('search_credits_remaining, credits_reset_at, current_period_end')
          .eq('user_id', userId)
          .maybeSingle();

        const totalCredits = baseCredits + addonCredits;
        let remainingCredits = totalCredits;

        // If we're in the same billing cycle, preserve remaining credits
        if (currentSub?.current_period_end === subscriptionEnd) {
          remainingCredits = currentSub.search_credits_remaining;
        }
        
        const { error: updateError } = await supabaseClient
          .from('subscriptions')
          .upsert({
            user_id: userId,
            plan,
            status: 'active',
            account_status: subscription.status === 'trialing' ? 'trial' : 'active',
            trial_end_date: subscription.status === 'trialing' && subscription.trial_end
              ? new Date(subscription.trial_end * 1000).toISOString()
              : null,
            leads_limit: leadsLimit,
            stripe_customer_id: customerId,
            stripe_subscription_id: stripeSubscriptionId,
            current_period_end: subscriptionEnd,
            search_credits_base: baseCredits,
            search_credits_addon: addonCredits,
            search_credits_remaining: remainingCredits,
            addon_price_id: addonPriceId,
            credits_reset_at: subscriptionEnd,
            daily_email_limit: dailyEmailLimit,
          }, { onConflict: 'user_id' });

        if (updateError) {
          logStep('Error updating subscription', { error: updateError });
          throw updateError;
        }

        logStep('Successfully synced subscription to database', { plan, baseCredits, addonCredits });
      }
    } else {
      logStep('No active Stripe subscription; leaving DB free plan/credits intact');
      // NOTE: intentionally do NOT upsert search_credits_base/remaining to 0
      // here — the signup trigger seeds free-tier users with 100 credits and
      // this function runs on every login. Overwriting would erase them.
      // A downgrade to free after a Stripe cancellation is handled by
      // stripe-webhook / process-stripe-event, not by this poll.
    }


    return new Response(JSON.stringify({
      subscribed: hasActiveSub,
      plan,
      status: 'active',
      subscription_end: subscriptionEnd,
      stripe_customer_id: customerId,
      search_credits_base: baseCredits,
      search_credits_addon: addonCredits,
      total_credits: baseCredits + addonCredits,
      addon_price_id: addonPriceId,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep('ERROR in check-subscription', { message: errorMessage });
    // Return generic error message to avoid leaking internal details
    const isAuthError = errorMessage.includes('Authentication');
    return new Response(JSON.stringify({ error: isAuthError ? 'Authentication required' : 'Operation failed' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: isAuthError ? 401 : 500,
    });
  }
});

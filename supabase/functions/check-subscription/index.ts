import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

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
  'prod_U78FZoAWovU1rX': { plan: 'starter', credits: 400, dailyLimit: 50, isYearly: false },
  'prod_U78Ff02VQAzrLC': { plan: 'growth', credits: 1200, dailyLimit: 150, isYearly: false },
  'prod_U78Fs2HpZzcZJc': { plan: 'pro', credits: 3000, dailyLimit: 400, isYearly: false },
  // New product IDs - yearly (full annual pool upfront)
  'prod_U78FC92stOkRxS': { plan: 'starter', credits: 4800, dailyLimit: 50, isYearly: true },
  'prod_U78Fk0l7swAukt': { plan: 'growth', credits: 14400, dailyLimit: 150, isYearly: true },
  'prod_U78Fuo9Mg04kz9': { plan: 'pro', credits: 36000, dailyLimit: 400, isYearly: true },
  // Legacy product IDs (monthly)
  'prod_U6gflsh1Zzoh3V': { plan: 'starter', credits: 400, dailyLimit: 50 },
  'prod_U6gfTND3QdfgcC': { plan: 'growth', credits: 1200, dailyLimit: 150 },
  'prod_U6gfOj1Xgfd1vy': { plan: 'pro', credits: 3000, dailyLimit: 400 },
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
    
    userEmail = userData.user.email!;
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

    const stripe = new Stripe(stripeKey, { apiVersion: '2025-08-27.basil' });
    
    // Find Stripe customer by email
    const customers = await stripe.customers.list({ email: userEmail, limit: 1 });
    
    if (customers.data.length === 0) {
      logStep('No Stripe customer found');
      
      // Check if user has an existing subscription in database
      if (userId) {
        const { data: existingSub } = await supabaseClient
          .from('subscriptions')
          .select('*')
          .eq('user_id', userId)
          .maybeSingle();

        if (existingSub && !existingSub.stripe_customer_id) {
          // User has a manual/local subscription without Stripe, preserve it
          logStep('Preserving existing local subscription', { plan: existingSub.plan });
          return new Response(JSON.stringify({ 
            subscribed: existingSub.plan !== 'free',
            plan: existingSub.plan,
            status: existingSub.status,
            search_credits_base: existingSub.search_credits_base || 0,
            search_credits_addon: existingSub.search_credits_addon || 0,
            search_credits_remaining: existingSub.search_credits_remaining || 0,
          }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
          });
        }

        // No existing subscription, create default FREE plan (zero cost, zero credits)
        logStep('Creating default free subscription');
        const { error: upsertError } = await supabaseClient
          .from('subscriptions')
          .upsert({
            user_id: userId,
            plan: 'free',
            status: 'active',
            leads_limit: 0,
            search_credits_base: 0,
            search_credits_addon: 0,
            search_credits_remaining: 0,
          }, { onConflict: 'user_id' });

        if (upsertError) {
          logStep('Error creating default subscription', { error: upsertError });
        }
      }

      return new Response(JSON.stringify({ 
        subscribed: false,
        plan: 'free',
        status: 'active',
        search_credits_base: 0,
        search_credits_addon: 0,
        search_credits_remaining: 0,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      });
    }

    const customerId = customers.data[0].id;
    logStep('Found Stripe customer', { customerId });

    // Get active subscriptions
    const subscriptions = await stripe.subscriptions.list({
      customer: customerId,
      status: 'active',
      limit: 1,
    });

    const hasActiveSub = subscriptions.data.length > 0;
    let plan: 'free' | 'starter' | 'growth' | 'pro' = 'free';
    let subscriptionEnd: string | null = null;
    let stripeSubscriptionId: string | null = null;
    let baseCredits = 0;
    let addonCredits = 0;
    let addonPriceId: string | null = null;

    if (hasActiveSub) {
      const subscription = subscriptions.data[0];
      subscriptionEnd = new Date(subscription.current_period_end * 1000).toISOString();
      stripeSubscriptionId = subscription.id;
      
      logStep('Found active subscription', { 
        subscriptionId: subscription.id, 
        itemCount: subscription.items.data.length,
        endDate: subscriptionEnd 
      });

      // Loop through ALL subscription items to detect plan and addons
      for (const item of subscription.items.data) {
        const productId = item.price.product as string;
        
        // Check if it's a base plan
        if (PLAN_PRODUCTS[productId as keyof typeof PLAN_PRODUCTS]) {
          const planInfo = PLAN_PRODUCTS[productId as keyof typeof PLAN_PRODUCTS];
          plan = planInfo.plan as 'starter' | 'growth' | 'pro';
          baseCredits = planInfo.credits;
          logStep('Detected base plan', { plan, baseCredits });
        }
        
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
        const leadsLimit = plan === 'free' ? 0 : plan === 'starter' ? 400 : plan === 'growth' ? 1200 : plan === 'pro' ? 3000 : 999999;
        
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
            leads_limit: leadsLimit,
            stripe_customer_id: customerId,
            stripe_subscription_id: stripeSubscriptionId,
            current_period_end: subscriptionEnd,
            search_credits_base: baseCredits,
            search_credits_addon: addonCredits,
            search_credits_remaining: remainingCredits,
            addon_price_id: addonPriceId,
            credits_reset_at: subscriptionEnd,
          }, { onConflict: 'user_id' });

        if (updateError) {
          logStep('Error updating subscription', { error: updateError });
          throw updateError;
        }

        logStep('Successfully synced subscription to database', { plan, baseCredits, addonCredits });
      }
    } else {
      logStep('No active subscription found, setting to free plan');
      
      // Update to default free plan (only if authenticated)
      if (userId) {
        const { error: updateError } = await supabaseClient
          .from('subscriptions')
          .upsert({
            user_id: userId,
            plan: 'free',
            status: 'active',
            leads_limit: 0,
            stripe_customer_id: customerId,
            search_credits_base: 0,
            search_credits_addon: 0,
            search_credits_remaining: 0,
          }, { onConflict: 'user_id' });

        if (updateError) {
          logStep('Error updating to free plan', { error: updateError });
        }
      }
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

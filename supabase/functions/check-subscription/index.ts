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

    const authHeader = req.headers.get('Authorization');
    let userEmail: string;
    let userId: string | null = null;

    // Check if this is an authenticated request or email-based request
    if (authHeader && !authHeader.includes('anon')) {
      // Authenticated request - get user from JWT
      logStep('Authenticated request detected');
      const token = authHeader.replace('Bearer ', '');
      const { data: userData, error: userError } = await supabaseClient.auth.getUser(token);
      if (userError) throw new Error(`Authentication error: ${userError.message}`);
      const user = userData.user;
      if (!user?.email) throw new Error('User not authenticated or email not available');
      userEmail = user.email;
      userId = user.id;
      logStep('User authenticated', { userId: user.id, email: userEmail });
    } else {
      // Unauthenticated request - get email from body
      logStep('Unauthenticated request detected');
      const body = await req.json();
      userEmail = body.email;
      if (!userEmail) throw new Error('Email is required');
      logStep('Email provided in body', { email: userEmail });
    }

    const stripe = new Stripe(stripeKey, { apiVersion: '2025-08-27.basil' });
    
    // Find Stripe customer by email
    const customers = await stripe.customers.list({ email: userEmail, limit: 1 });
    
    if (customers.data.length === 0) {
      logStep('No Stripe customer found');
      
      // Check if user has an existing subscription in database (only if authenticated)
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
            subscribed: true,
            plan: existingSub.plan,
            status: existingSub.status
          }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
          });
        }

        // No existing subscription or it's tied to Stripe, create default
        logStep('Creating default growth subscription');
        const { error: upsertError } = await supabaseClient
          .from('subscriptions')
          .upsert({
            user_id: userId,
            plan: 'growth',
            status: 'active',
            leads_limit: 1000
          }, { onConflict: 'user_id' });

        if (upsertError) {
          logStep('Error creating default subscription', { error: upsertError });
        }
      }

      return new Response(JSON.stringify({ 
        subscribed: false,
        plan: 'growth',
        status: 'active'
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
    let plan: 'growth' | 'pro' | 'elite' = 'growth';
    let subscriptionEnd: string | null = null;
    let stripeSubscriptionId: string | null = null;

    if (hasActiveSub) {
      const subscription = subscriptions.data[0];
      subscriptionEnd = new Date(subscription.current_period_end * 1000).toISOString();
      stripeSubscriptionId = subscription.id;
      
      // Determine plan based on product ID
      const productId = subscription.items.data[0].price.product as string;
      logStep('Found active subscription', { 
        subscriptionId: subscription.id, 
        productId,
        endDate: subscriptionEnd 
      });

      // Map product ID to plan (using the product IDs from stripe-config.ts)
      if (productId === 'prod_TOropirqoOz7Ed') {
        plan = 'growth';
      } else if (productId === 'prod_TOrozUbuuN18RP') {
        plan = 'pro';
      } else if (productId === 'prod_TOrod7SaIV2D7s') {
        plan = 'elite';
      }
      
      logStep('Determined plan', { plan });

      // Sync to database (only if authenticated)
      if (userId) {
        const leadsLimit = plan === 'growth' ? 1000 : plan === 'pro' ? 10000 : 999999;
        
        const { error: updateError } = await supabaseClient
          .from('subscriptions')
          .upsert({
            user_id: userId,
            plan,
            status: 'active',
            leads_limit: leadsLimit,
            stripe_customer_id: customerId,
            stripe_subscription_id: stripeSubscriptionId,
            current_period_end: subscriptionEnd
          }, { onConflict: 'user_id' });

        if (updateError) {
          logStep('Error updating subscription', { error: updateError });
          throw updateError;
        }

        logStep('Successfully synced subscription to database');
      }
    } else {
      logStep('No active subscription found, setting to growth plan');
      
      // Update to default growth plan (only if authenticated)
      if (userId) {
        const { error: updateError } = await supabaseClient
          .from('subscriptions')
          .upsert({
            user_id: userId,
            plan: 'growth',
            status: 'active',
            leads_limit: 1000,
            stripe_customer_id: customerId
          }, { onConflict: 'user_id' });

        if (updateError) {
          logStep('Error updating to growth plan', { error: updateError });
        }
      }
    }

    return new Response(JSON.stringify({
      subscribed: hasActiveSub,
      plan,
      status: 'active',
      subscription_end: subscriptionEnd,
      stripe_customer_id: customerId
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep('ERROR in check-subscription', { message: errorMessage });
    return new Response(JSON.stringify({ error: errorMessage }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});

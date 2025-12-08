import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[GET-STRIPE-REVENUE] ${step}${detailsStr}`);
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

    // Verify admin access
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error('No authorization header provided');

    const token = authHeader.replace('Bearer ', '');
    const { data: userData, error: userError } = await supabaseClient.auth.getUser(token);
    if (userError) throw new Error(`Authentication error: ${userError.message}`);
    
    const user = userData.user;
    if (!user) throw new Error('User not authenticated');
    logStep('User authenticated', { userId: user.id });

    // Check if user is admin
    const { data: roleData, error: roleError } = await supabaseClient
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'admin')
      .single();

    if (roleError || !roleData) {
      throw new Error('Access denied. Admin privileges required.');
    }
    logStep('Admin access verified');

    const stripe = new Stripe(stripeKey, { apiVersion: '2025-08-27.basil' });

    // Get current month's start date
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthStartTimestamp = Math.floor(monthStart.getTime() / 1000);

    // Fetch all successful charges for total revenue
    let totalRevenue = 0;
    let hasMore = true;
    let startingAfter: string | undefined;

    logStep('Fetching total revenue from Stripe');
    while (hasMore) {
      const charges: Stripe.ApiList<Stripe.Charge> = await stripe.charges.list({
        limit: 100,
        starting_after: startingAfter,
      });

      for (const charge of charges.data) {
        if (charge.status === 'succeeded' && !charge.refunded) {
          totalRevenue += charge.amount;
        }
      }

      hasMore = charges.has_more;
      if (charges.data.length > 0) {
        startingAfter = charges.data[charges.data.length - 1].id;
      }
    }
    logStep('Total revenue calculated', { totalRevenue: totalRevenue / 100 });

    // Fetch this month's charges for monthly revenue
    let monthlyRevenue = 0;
    hasMore = true;
    startingAfter = undefined;

    logStep('Fetching monthly revenue from Stripe');
    while (hasMore) {
      const charges: Stripe.ApiList<Stripe.Charge> = await stripe.charges.list({
        limit: 100,
        created: { gte: monthStartTimestamp },
        starting_after: startingAfter,
      });

      for (const charge of charges.data) {
        if (charge.status === 'succeeded' && !charge.refunded) {
          monthlyRevenue += charge.amount;
        }
      }

      hasMore = charges.has_more;
      if (charges.data.length > 0) {
        startingAfter = charges.data[charges.data.length - 1].id;
      }
    }
    logStep('Monthly revenue calculated', { monthlyRevenue: monthlyRevenue / 100 });

    // Get active subscriptions count from Stripe
    let activeSubscriptions = 0;
    hasMore = true;
    startingAfter = undefined;

    logStep('Fetching active subscriptions from Stripe');
    while (hasMore) {
      const subscriptions: Stripe.ApiList<Stripe.Subscription> = await stripe.subscriptions.list({
        limit: 100,
        status: 'active',
        starting_after: startingAfter,
      });

      activeSubscriptions += subscriptions.data.length;
      hasMore = subscriptions.has_more;
      if (subscriptions.data.length > 0) {
        startingAfter = subscriptions.data[subscriptions.data.length - 1].id;
      }
    }
    logStep('Active subscriptions counted', { activeSubscriptions });

    // Get total customers from Stripe
    let totalCustomers = 0;
    hasMore = true;
    startingAfter = undefined;

    while (hasMore) {
      const customers: Stripe.ApiList<Stripe.Customer> = await stripe.customers.list({
        limit: 100,
        starting_after: startingAfter,
      });

      totalCustomers += customers.data.length;
      hasMore = customers.has_more;
      if (customers.data.length > 0) {
        startingAfter = customers.data[customers.data.length - 1].id;
      }
    }
    logStep('Total customers counted', { totalCustomers });

    const result = {
      total_revenue: totalRevenue / 100, // Convert from cents to dollars
      monthly_revenue: monthlyRevenue / 100,
      active_subscriptions: activeSubscriptions,
      total_customers: totalCustomers,
      currency: 'usd',
      last_updated: new Date().toISOString(),
    };

    logStep('Returning revenue data', result);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep('ERROR in get-stripe-revenue', { message: errorMessage });
    return new Response(JSON.stringify({ error: errorMessage }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});

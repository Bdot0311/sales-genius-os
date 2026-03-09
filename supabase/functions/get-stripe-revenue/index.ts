import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// SalesOS specific product and price IDs
const SALESOS_PRODUCT_IDS = [
  'prod_TOropirqoOz7Ed', // growth
  'prod_TOrozUbuuN18RP', // pro
  'prod_TOrod7SaIV2D7s', // pro (legacy)
];

const SALESOS_PRICE_IDS = [
  'price_1SS44wFTerosS6hiCkKQnnoD', // growth
  'price_1SS456FTerosS6hisBSDPwo4', // pro
  'price_1SS45HFTerosS6hiQtxsNVL4', // pro (legacy elite)
];

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

    // Fetch invoices for SalesOS products only
    let totalRevenue = 0;
    let monthlyRevenue = 0;
    let hasMore = true;
    let startingAfter: string | undefined;

    logStep('Fetching invoices for SalesOS products only', { productIds: SALESOS_PRODUCT_IDS });
    
    while (hasMore) {
      const invoices: Stripe.ApiList<Stripe.Invoice> = await stripe.invoices.list({
        limit: 100,
        starting_after: startingAfter,
        status: 'paid',
        expand: ['data.lines.data'],
      });

      for (const invoice of invoices.data) {
        // Check if invoice contains SalesOS products
        let isSalesOSInvoice = false;
        
        if (invoice.lines?.data) {
          for (const lineItem of invoice.lines.data) {
            const priceId = lineItem.price?.id;
            const productId = typeof lineItem.price?.product === 'string' 
              ? lineItem.price.product 
              : lineItem.price?.product?.id;
            
            if (SALESOS_PRICE_IDS.includes(priceId || '') || SALESOS_PRODUCT_IDS.includes(productId || '')) {
              isSalesOSInvoice = true;
              break;
            }
          }
        }

        if (isSalesOSInvoice && invoice.amount_paid > 0) {
          totalRevenue += invoice.amount_paid;
          
          // Check if invoice is from current month
          const invoiceDate = new Date((invoice.created || 0) * 1000);
          if (invoiceDate >= monthStart) {
            monthlyRevenue += invoice.amount_paid;
          }
        }
      }

      hasMore = invoices.has_more;
      if (invoices.data.length > 0) {
        startingAfter = invoices.data[invoices.data.length - 1].id;
      }
    }
    
    logStep('Revenue calculated from invoices', { 
      totalRevenue: totalRevenue / 100, 
      monthlyRevenue: monthlyRevenue / 100 
    });

    // Get active subscriptions for SalesOS products only
    let activeSubscriptions = 0;
    hasMore = true;
    startingAfter = undefined;

    logStep('Fetching active subscriptions for SalesOS products');
    
    while (hasMore) {
      const subscriptions: Stripe.ApiList<Stripe.Subscription> = await stripe.subscriptions.list({
        limit: 100,
        status: 'active',
        starting_after: startingAfter,
        expand: ['data.items.data'],
      });

      for (const subscription of subscriptions.data) {
        // Check if subscription is for SalesOS products
        let isSalesOSSub = false;
        
        for (const item of subscription.items.data) {
          const priceId = item.price?.id;
          const productId = typeof item.price?.product === 'string' 
            ? item.price.product 
            : item.price?.product?.id;
          
          if (SALESOS_PRICE_IDS.includes(priceId || '') || SALESOS_PRODUCT_IDS.includes(productId || '')) {
            isSalesOSSub = true;
            break;
          }
        }
        
        if (isSalesOSSub) {
          activeSubscriptions++;
        }
      }

      hasMore = subscriptions.has_more;
      if (subscriptions.data.length > 0) {
        startingAfter = subscriptions.data[subscriptions.data.length - 1].id;
      }
    }
    
    logStep('Active subscriptions counted', { activeSubscriptions });

    // Get unique customers with SalesOS subscriptions
    let salesOSCustomerIds = new Set<string>();
    hasMore = true;
    startingAfter = undefined;

    while (hasMore) {
      const subscriptions: Stripe.ApiList<Stripe.Subscription> = await stripe.subscriptions.list({
        limit: 100,
        starting_after: startingAfter,
        expand: ['data.items.data'],
      });

      for (const subscription of subscriptions.data) {
        for (const item of subscription.items.data) {
          const priceId = item.price?.id;
          const productId = typeof item.price?.product === 'string' 
            ? item.price.product 
            : item.price?.product?.id;
          
          if (SALESOS_PRICE_IDS.includes(priceId || '') || SALESOS_PRODUCT_IDS.includes(productId || '')) {
            if (typeof subscription.customer === 'string') {
              salesOSCustomerIds.add(subscription.customer);
            }
            break;
          }
        }
      }

      hasMore = subscriptions.has_more;
      if (subscriptions.data.length > 0) {
        startingAfter = subscriptions.data[subscriptions.data.length - 1].id;
      }
    }

    const totalCustomers = salesOSCustomerIds.size;
    logStep('SalesOS customers counted', { totalCustomers });

    const result = {
      total_revenue: totalRevenue / 100, // Convert from cents to dollars
      monthly_revenue: monthlyRevenue / 100,
      active_subscriptions: activeSubscriptions,
      total_customers: totalCustomers,
      currency: 'usd',
      last_updated: new Date().toISOString(),
      filtered_by: 'SalesOS products only',
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

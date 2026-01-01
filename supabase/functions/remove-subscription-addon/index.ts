import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[REMOVE-SUBSCRIPTION-ADDON] ${step}${detailsStr}`);
};

// Add-on product IDs
const ADDON_PRODUCT_IDS = ['prod_TiLYPvYYIpq6I9', 'prod_TiLYxYZjV6ru4w'];

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    logStep('Function started');

    const stripeKey = Deno.env.get('STRIPE_SECRET_KEY');
    if (!stripeKey) throw new Error('STRIPE_SECRET_KEY is not set');

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { persistSession: false } }
    );

    // Authenticate user
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error('Authentication required');

    const token = authHeader.replace('Bearer ', '');
    const { data: userData, error: userError } = await supabaseClient.auth.getUser(token);
    
    if (userError || !userData?.user) throw new Error('Authentication required');
    
    const user = userData.user;
    logStep('User authenticated', { userId: user.id, email: user.email });

    const stripe = new Stripe(stripeKey, { apiVersion: '2025-08-27.basil' });

    // Find user's Stripe customer
    const customers = await stripe.customers.list({ email: user.email!, limit: 1 });
    if (customers.data.length === 0) {
      throw new Error('No Stripe customer found');
    }
    const customerId = customers.data[0].id;

    // Get active subscription
    const subscriptions = await stripe.subscriptions.list({
      customer: customerId,
      status: 'active',
      limit: 1,
    });

    if (subscriptions.data.length === 0) {
      throw new Error('No active subscription found');
    }

    const subscription = subscriptions.data[0];

    // Find addon item
    const addonItem = subscription.items.data.find((item: Stripe.SubscriptionItem) => {
      const productId = item.price.product as string;
      return ADDON_PRODUCT_IDS.includes(productId);
    });

    if (!addonItem) {
      throw new Error('No addon found on subscription');
    }

    logStep('Found addon to remove', { itemId: addonItem.id });

    // Remove the addon item
    await stripe.subscriptionItems.del(addonItem.id, {
      proration_behavior: 'create_prorations',
    });

    logStep('Addon removed from Stripe subscription');

    // Update database
    const { error: updateError } = await supabaseClient
      .from('subscriptions')
      .update({
        search_credits_addon: 0,
        addon_price_id: null,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', user.id);

    if (updateError) {
      logStep('Error updating subscription in database', { error: updateError });
      throw updateError;
    }

    logStep('Successfully removed addon from subscription');

    return new Response(JSON.stringify({
      success: true,
      message: 'Addon removed from subscription',
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep('ERROR in remove-subscription-addon', { message: errorMessage });
    return new Response(JSON.stringify({ error: errorMessage }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});

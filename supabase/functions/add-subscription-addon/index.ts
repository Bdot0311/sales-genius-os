import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.21.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[ADD-SUBSCRIPTION-ADDON] ${step}${detailsStr}`);
};

// Add-on product IDs
const ADDON_PRODUCTS = {
  'prod_TiLYPvYYIpq6I9': { credits: 500, priceId: 'price_1SkurgFTerosS6hiDIBX0NhA' },
  'prod_TiLYxYZjV6ru4w': { credits: 1500, priceId: 'price_1SkurlFTerosS6hirju1trQ4' },
};

const ADDON_PRICES = {
  'price_1SkurgFTerosS6hiDIBX0NhA': { credits: 500, productId: 'prod_TiLYPvYYIpq6I9' },
  'price_1SkurlFTerosS6hirju1trQ4': { credits: 1500, productId: 'prod_TiLYxYZjV6ru4w' },
};

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

    // Get addon price ID from request
    const { addonPriceId } = await req.json();
    if (!addonPriceId) throw new Error('Addon price ID is required');

    const addonInfo = ADDON_PRICES[addonPriceId as keyof typeof ADDON_PRICES];
    if (!addonInfo) throw new Error('Invalid addon price ID');
    
    logStep('Addon requested', { addonPriceId, credits: addonInfo.credits });

    const stripe = new Stripe(stripeKey, { apiVersion: '2023-10-16' });

    // Find user's Stripe customer
    const customers = await stripe.customers.list({ email: user.email!, limit: 1 });
    if (customers.data.length === 0) {
      throw new Error('No Stripe customer found. Please subscribe to a plan first.');
    }
    const customerId = customers.data[0].id;
    logStep('Found Stripe customer', { customerId });

    // Get active subscription
    const subscriptions = await stripe.subscriptions.list({
      customer: customerId,
      status: 'active',
      limit: 1,
    });

    if (subscriptions.data.length === 0) {
      throw new Error('No active subscription found. Please subscribe to a plan first.');
    }

    const subscription = subscriptions.data[0];
    logStep('Found active subscription', { subscriptionId: subscription.id });

    // Check if addon already exists
    const existingAddonItem = subscription.items.data.find((item: Stripe.SubscriptionItem) => {
      const productId = item.price.product as string;
      return Object.keys(ADDON_PRODUCTS).includes(productId);
    });

    let updatedSubscription: Stripe.Subscription;

    if (existingAddonItem) {
      // Replace existing addon with new one
      logStep('Replacing existing addon', { oldItemId: existingAddonItem.id });
      updatedSubscription = await stripe.subscriptions.update(subscription.id, {
        items: [
          { id: existingAddonItem.id, deleted: true },
          { price: addonPriceId },
        ],
        proration_behavior: 'create_prorations',
      });
    } else {
      // Add new addon
      logStep('Adding new addon to subscription');
      updatedSubscription = await stripe.subscriptions.update(subscription.id, {
        items: [
          ...subscription.items.data.map((item: Stripe.SubscriptionItem) => ({ id: item.id })),
          { price: addonPriceId },
        ],
        proration_behavior: 'create_prorations',
      });
    }

    logStep('Subscription updated with addon', { subscriptionId: updatedSubscription.id });

    // Update database with new addon credits
    const { error: updateError } = await supabaseClient
      .from('subscriptions')
      .update({
        search_credits_addon: addonInfo.credits,
        addon_price_id: addonPriceId,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', user.id);

    if (updateError) {
      logStep('Error updating subscription in database', { error: updateError });
      throw updateError;
    }

    logStep('Successfully added addon to subscription');

    return new Response(JSON.stringify({
      success: true,
      addonCredits: addonInfo.credits,
      message: `Successfully added ${addonInfo.credits} monthly credits to your subscription`,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep('ERROR in add-subscription-addon', { message: errorMessage });
    return new Response(JSON.stringify({ error: errorMessage }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});

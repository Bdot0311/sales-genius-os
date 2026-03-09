import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

// Map price IDs to plan names for success URL
const planMap: Record<string, string> = {
  // Monthly prices
  'price_1T8tywFTerosS6hi0fHQuybr': 'starter',
  'price_1T8tyyFTerosS6hiTsTXkWDa': 'growth',
  'price_1T8tz0FTerosS6hiKJluR3kk': 'pro',
  // Yearly prices
  'price_1T8tyxFTerosS6hiSakB51fA': 'starter',
  'price_1T8tyzFTerosS6hiUyzpHnCK': 'growth',
  'price_1T8tz0FTerosS6hiIHNG82Bh': 'pro',
  // Legacy prices
  'price_1SS44wFTerosS6hiCkKQnnoD': 'growth',
  'price_1SS456FTerosS6hisBSDPwo4': 'pro',
  'price_1SS45HFTerosS6hiQtxsNVL4': 'elite',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { priceId } = await req.json();
    
    if (!priceId) {
      throw new Error('Price ID is required');
    }

    const planName = planMap[priceId] || 'growth';

    const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') || '', { 
      apiVersion: '2025-08-27.basil' 
    });

    // Try to get authenticated user (optional)
    let userEmail: string | undefined;
    let customerId: string | undefined;

    const authHeader = req.headers.get('Authorization');
    if (authHeader && authHeader !== 'Bearer ') {
      try {
        const supabaseClient = createClient(
          Deno.env.get('SUPABASE_URL') ?? '',
          Deno.env.get('SUPABASE_ANON_KEY') ?? ''
        );
        const token = authHeader.replace('Bearer ', '');
        const { data } = await supabaseClient.auth.getUser(token);
        if (data.user?.email) {
          userEmail = data.user.email;
          // Check for existing Stripe customer
          const customers = await stripe.customers.list({ email: userEmail, limit: 1 });
          if (customers.data.length > 0) {
            customerId = customers.data[0].id;
          }
        }
      } catch (e) {
        console.log('[CREATE-CHECKOUT] Auth optional, continuing as guest');
      }
    }

    const origin = req.headers.get('origin') || 'https://sales-genius-os.lovable.app';

    const sessionParams: any = {
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      mode: 'subscription',
      ui_mode: 'embedded',
      return_url: `${origin}/confirmation?plan=${planName}&session_id={CHECKOUT_SESSION_ID}`,
      subscription_data: {
        trial_period_days: 14,
      },
    };

    // If we have an existing customer, attach them; otherwise let Stripe collect email
    if (customerId) {
      sessionParams.customer = customerId;
    } else if (userEmail) {
      sessionParams.customer_email = userEmail;
    }

    const session = await stripe.checkout.sessions.create(sessionParams);

    return new Response(
      JSON.stringify({ clientSecret: session.client_secret }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('[CREATE-CHECKOUT] Error:', errorMessage);
    return new Response(
      JSON.stringify({ error: "Payment processing failed. Please try again." }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});

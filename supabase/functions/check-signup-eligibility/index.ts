import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { corsHeaders, requireServiceRole } from "../_shared/internal-auth.ts";

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  const unauth = requireServiceRole(req);
  if (unauth) return unauth;

  try {

    const { email } = await req.json();

    if (!email || typeof email !== 'string' || !email.includes('@')) {
      return new Response(JSON.stringify({ eligible: false, error: 'Valid email required' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      });
    }

    const stripeKey = Deno.env.get('STRIPE_SECRET_KEY');
    if (!stripeKey) throw new Error('STRIPE_SECRET_KEY is not set');

    const stripe = new Stripe(stripeKey, { apiVersion: '2025-08-27.basil' });

    // Look up Stripe customer by email
    const customers = await stripe.customers.list({ email: email.toLowerCase().trim(), limit: 1 });

    if (customers.data.length === 0) {
      return new Response(JSON.stringify({ eligible: false, reason: 'no_subscription' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      });
    }

    const customerId = customers.data[0].id;

    // Check for active subscriptions
    const subscriptions = await stripe.subscriptions.list({
      customer: customerId,
      status: 'active',
      limit: 1,
    });

    const hasActiveSub = subscriptions.data.length > 0;

    return new Response(JSON.stringify({
      eligible: hasActiveSub,
      reason: hasActiveSub ? 'active_subscription' : 'no_active_subscription',
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (error) {
    console.error('[CHECK-SIGNUP-ELIGIBILITY] Error:', error);
    return new Response(JSON.stringify({ eligible: false, error: 'Check failed' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});

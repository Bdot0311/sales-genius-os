import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const TOPUP_PACKS: Record<string, number> = {
  'price_1T8vsKFTerosS6hitP0ffw6v': 200,
  'price_1T8vsLFTerosS6hiVcWr4NqZ': 400,
  'price_1T8vsNFTerosS6hiB6LZcLUT': 600,
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[PURCHASE-TOPUP] ${step}${detailsStr}`);
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    logStep("Function started");

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY is not set");

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? ""
    );

    // Authenticate user
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Authentication required");

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabaseClient.auth.getUser(token);
    if (userError || !userData?.user) throw new Error("Authentication required");

    const user = userData.user;
    if (!user.email) throw new Error("User email not available");
    logStep("User authenticated", { userId: user.id, email: user.email });

    // Parse request body
    const { priceId } = await req.json();
    if (!priceId || !TOPUP_PACKS[priceId]) {
      throw new Error("Invalid price ID");
    }

    const prospectCount = TOPUP_PACKS[priceId];
    logStep("Creating checkout for topup", { priceId, prospectCount });

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

    // Find or reference existing Stripe customer
    const customers = await stripe.customers.list({ email: user.email, limit: 1 });
    let customerId: string | undefined;
    if (customers.data.length > 0) {
      customerId = customers.data[0].id;
    }

    const origin = req.headers.get("origin") || "https://sales-genius-os.lovable.app";

    // Create one-time payment checkout session
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      customer_email: customerId ? undefined : user.email,
      line_items: [{ price: priceId, quantity: 1 }],
      mode: "payment",
      success_url: `${origin}/settings?tab=credits&topup_session={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/settings?tab=credits`,
      metadata: {
        user_id: user.id,
        prospect_count: String(prospectCount),
        type: 'credit_topup',
      },
    });

    logStep("Checkout session created", { sessionId: session.id });

    return new Response(JSON.stringify({ url: session.url }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logStep("ERROR", { message: msg });
    const isAuth = msg.includes("Authentication");
    return new Response(JSON.stringify({ error: isAuth ? "Authentication required" : "Operation failed" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: isAuth ? 401 : 500,
    });
  }
});

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[VERIFY-TOPUP] ${step}${detailsStr}`);
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    logStep("Function started");

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY is not set");

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    // Authenticate user
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Authentication required");

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);
    if (userError || !userData?.user) throw new Error("Authentication required");

    const userId = userData.user.id;
    logStep("User authenticated", { userId });

    const { sessionId } = await req.json();
    if (!sessionId) throw new Error("Session ID required");

    // Check if already processed (prevent double-crediting)
    const { data: existing } = await supabaseAdmin
      .from('topup_payments')
      .select('id')
      .eq('stripe_session_id', sessionId)
      .maybeSingle();

    if (existing) {
      logStep("Session already processed", { sessionId });
      return new Response(JSON.stringify({ success: true, already_processed: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    // Verify payment with Stripe
    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    if (session.payment_status !== "paid") {
      logStep("Payment not completed", { status: session.payment_status });
      return new Response(JSON.stringify({ error: "Payment not completed" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }

    // Verify this session belongs to this user
    if (session.metadata?.user_id !== userId) {
      logStep("User mismatch", { sessionUserId: session.metadata?.user_id, requestUserId: userId });
      throw new Error("Unauthorized");
    }

    const prospectCount = parseInt(session.metadata?.prospect_count || "0", 10);
    const amountPaid = session.amount_total || 0;

    if (prospectCount <= 0) {
      throw new Error("Invalid prospect count");
    }

    logStep("Payment verified", { prospectCount, amountPaid });

    // One transaction: the session row and the credit add commit together.
    // A retried verification of the same Stripe session finds the row and
    // does not add the credits again. Adding first and inserting second let
    // two overlapping calls both add, then one insert fail.
    const { data: granted, error: grantError } = await supabaseAdmin.rpc("grant_topup_credits", {
      p_user_id: userId,
      p_session_id: sessionId,
      p_prospects: prospectCount,
      p_amount_paid: amountPaid,
    });
    if (grantError) throw grantError;
    const grant = (granted ?? {}) as { applied?: boolean; reason?: string; credits?: number };
    if (grant.applied !== true && grant.reason !== "already_granted") {
      throw new Error(grant.reason === "no_subscription" ? "No subscription found" : "Could not add credits");
    }

    logStep("Credits added successfully", { prospectCount, applied: grant.applied, credits: grant.credits });

    return new Response(JSON.stringify({
      success: true,
      prospects_added: prospectCount,
      new_balance: grant.credits ?? null,
      already_granted: grant.reason === "already_granted",
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logStep("ERROR", { message: msg });
    const isAuth = msg.includes("Authentication") || msg.includes("Unauthorized");
    return new Response(JSON.stringify({ error: isAuth ? "Authentication required" : "Operation failed" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: isAuth ? 401 : 500,
    });
  }
});

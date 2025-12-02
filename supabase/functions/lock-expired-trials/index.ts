import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[LOCK-EXPIRED-TRIALS] ${step}${detailsStr}`);
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    logStep("Function started");

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    // Call the database function to lock expired trials
    const { error } = await supabaseClient.rpc('lock_expired_trials');

    if (error) {
      logStep("ERROR", { error: error.message });
      throw error;
    }

    // Get count of locked trials
    const { data: lockedTrials, error: countError } = await supabaseClient
      .from('subscriptions')
      .select('user_id', { count: 'exact', head: true })
      .eq('account_status', 'locked')
      .eq('status', 'inactive')
      .gte('updated_at', new Date(Date.now() - 60000).toISOString()); // Last minute

    const count = lockedTrials || 0;
    logStep("Expired trials locked", { count });

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `Locked ${count} expired trial accounts`,
        locked_count: count
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("ERROR", { message: errorMessage });
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
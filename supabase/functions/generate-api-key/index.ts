import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[GENERATE-API-KEY] ${step}${detailsStr}`);
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

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header");

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabaseClient.auth.getUser(token);
    if (userError) throw new Error(`Authentication error: ${userError.message}`);
    
    const user = userData.user;
    if (!user) throw new Error("User not authenticated");
    logStep("User authenticated", { userId: user.id });

    // Check if user has Pro plan
    const { data: subscription } = await supabaseClient
      .from("subscriptions")
      .select("plan")
      .eq("user_id", user.id)
      .single();

    if (!subscription || (subscription.plan !== "pro" && subscription.plan !== "elite")) {
      throw new Error("API key generation is only available for Pro plan users");
    }
    logStep("Pro plan verified");

    const { name } = await req.json();
    if (!name) throw new Error("API key name is required");

    // Generate a secure random API key
    const randomBytes = new Uint8Array(32);
    crypto.getRandomValues(randomBytes);
    const apiKey = `sk_${Array.from(randomBytes).map(b => b.toString(16).padStart(2, '0')).join('')}`;
    const prefix = `sk_${apiKey.substring(3, 11)}`;

    logStep("Generated API key", { prefix });

    // Store the API key
    const { data: apiKeyData, error: keyError } = await supabaseClient
      .from("api_keys")
      .insert({
        user_id: user.id,
        name,
        key: apiKey,
        prefix
      })
      .select()
      .single();

    if (keyError) throw keyError;

    logStep("API key stored successfully");

    return new Response(
      JSON.stringify({ 
        apiKey,
        prefix,
        name,
        created_at: apiKeyData.created_at
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("ERROR", { message: errorMessage });
    // Return generic error messages to avoid leaking internal details
    const isAuthError = errorMessage.includes('auth') || errorMessage.includes('Authentication');
    const isPlanError = errorMessage.includes('Pro plan');
    return new Response(
      JSON.stringify({ error: isAuthError ? 'Authentication required' : isPlanError ? 'Pro plan required' : 'Operation failed' }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: isAuthError ? 401 : isPlanError ? 403 : 500,
      }
    );
  }
});

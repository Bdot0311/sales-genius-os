import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[ROTATE-API-KEY] ${step}${detailsStr}`);
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
    if (userError) throw userError;
    
    const user = userData.user;
    if (!user) throw new Error("User not authenticated");

    const { oldKeyId, rotationReason } = await req.json();

    if (!oldKeyId) {
      throw new Error("Old key ID is required");
    }

    logStep("Rotating API key", { oldKeyId });

    // Get old key
    const { data: oldKey, error: oldKeyError } = await supabaseClient
      .from("api_keys")
      .select("*")
      .eq("id", oldKeyId)
      .eq("user_id", user.id)
      .single();

    if (oldKeyError) throw oldKeyError;
    if (!oldKey) throw new Error("API key not found");

    // Generate new API key
    const randomBytes = new Uint8Array(32);
    crypto.getRandomValues(randomBytes);
    const newApiKey = `sk_${Array.from(randomBytes).map(b => b.toString(16).padStart(2, '0')).join('')}`;
    const newPrefix = `sk_${newApiKey.substring(3, 11)}`;

    // Create new key with same settings
    const { data: newKey, error: newKeyError } = await supabaseClient
      .from("api_keys")
      .insert({
        user_id: user.id,
        name: `${oldKey.name} (Rotated)`,
        key: newApiKey,
        prefix: newPrefix,
        rate_limit_per_minute: oldKey.rate_limit_per_minute,
        rate_limit_per_day: oldKey.rate_limit_per_day,
        rotation_policy_days: oldKey.rotation_policy_days,
        expires_at: oldKey.rotation_policy_days 
          ? new Date(Date.now() + oldKey.rotation_policy_days * 24 * 60 * 60 * 1000).toISOString()
          : null,
        endpoint_rate_limits: oldKey.endpoint_rate_limits,
        enable_caching: oldKey.enable_caching,
        cache_ttl_seconds: oldKey.cache_ttl_seconds,
      })
      .select()
      .single();

    if (newKeyError) throw newKeyError;

    // Record rotation
    await supabaseClient
      .from("api_key_rotations")
      .insert({
        old_key_id: oldKeyId,
        new_key_id: newKey.id,
        rotation_reason: rotationReason || 'Manual rotation',
        rotated_by: user.id,
      });

    // Deactivate old key
    await supabaseClient
      .from("api_keys")
      .update({ is_active: false })
      .eq("id", oldKeyId);

    logStep("API key rotated successfully", { newKeyId: newKey.id });

    return new Response(
      JSON.stringify({
        success: true,
        newKey: {
          id: newKey.id,
          key: newApiKey,
          prefix: newPrefix,
          name: newKey.name,
          created_at: newKey.created_at,
        },
        message: "API key rotated successfully. The old key has been deactivated.",
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("ERROR", { message: errorMessage });
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});

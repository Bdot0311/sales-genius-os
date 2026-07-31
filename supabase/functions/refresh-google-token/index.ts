import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      throw new Error("Missing authorization header");
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Verify user with anon key
    const anonClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await anonClient.auth.getUser();
    if (!user) throw new Error("Not authenticated");

    // Use service role to access integration config
    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    // Accept an optional { integrationId } to refresh a specific mailbox when
    // the user has multiple Google accounts connected. Falls back to the most
    // recently updated active integration when no id is provided.
    let requestedIntegrationId: string | undefined;
    try {
      const body = await req.json().catch(() => null);
      requestedIntegrationId = body?.integrationId;
    } catch { /* body may be empty */ }

    let query = adminClient
      .from("integrations")
      .select("id, config")
      .eq("user_id", user.id)
      .eq("integration_id", "google")
      .eq("is_active", true);
    if (requestedIntegrationId) query = query.eq("id", requestedIntegrationId);
    const { data: integrations } = await query
      .order("updated_at", { ascending: false })
      .limit(1);
    const integration = integrations?.[0];

    if (!integration?.config) {
      return new Response(
        JSON.stringify({ error: "Google Calendar not connected", needsReconnect: true }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const config = integration.config as any;

    // Check if token is still valid
    if (config.expiresAt && Date.now() < config.expiresAt) {
      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Token expired, try to refresh
    if (!config.refreshToken) {
      return new Response(
        JSON.stringify({ error: "No refresh token available", needsReconnect: true }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const clientId = Deno.env.get("GOOGLE_CLIENT_ID") || config.clientId;
    const clientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET") || config.clientSecret;

    if (!clientId || !clientSecret) {
      return new Response(
        JSON.stringify({ error: "OAuth credentials not configured", needsReconnect: true }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: config.refreshToken,
        grant_type: "refresh_token",
      }),
    });

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.json();
      console.error("Token refresh failed:", errorData);

      if (errorData.error === "invalid_grant") {
        await adminClient
          .from("integrations")
          .update({ is_active: false })
          .eq("id", integration.id);

        return new Response(
          JSON.stringify({
            error: "Google authorization expired. Please reconnect your Google account.",
            needsReconnect: true,
          }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      throw new Error(errorData.error_description || "Failed to refresh token");
    }

    const tokens = await tokenResponse.json();
    const newExpiresAt = Date.now() + tokens.expires_in * 1000;

    // Update tokens in database (server-side only)
    await adminClient
      .from("integrations")
      .update({
        config: {
          ...config,
          accessToken: tokens.access_token,
          expiresAt: newExpiresAt,
          refreshToken: tokens.refresh_token || config.refreshToken,
        },
      })
      .eq("id", integration.id);

    // Return success WITHOUT tokens — tokens stay server-side
    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error refreshing Google token:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

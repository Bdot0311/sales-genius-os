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
    const { code, redirectUri, state } = await req.json();

    const CLIENT_ID = Deno.env.get("HUBSPOT_CLIENT_ID");
    const CLIENT_SECRET = Deno.env.get("HUBSPOT_CLIENT_SECRET");
    if (!CLIENT_ID || !CLIENT_SECRET) throw new Error("HubSpot OAuth credentials not configured");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header");

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) throw new Error("Not authenticated");

    if (state) {
      try {
        const stateData = JSON.parse(state);
        if (stateData.userId !== user.id) throw new Error("State mismatch");
      } catch (e) {
        if (e instanceof Error && e.message === "State mismatch") throw e;
      }
    }

    const tokenResponse = await fetch("https://api.hubapi.com/oauth/v1/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        redirect_uri: redirectUri,
        code,
      }).toString(),
    });

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.json();
      throw new Error(errorData.message || "Token exchange failed");
    }

    const tokens = await tokenResponse.json();

    // Get HubSpot user info
    let hubspotEmail = null;
    try {
      const infoRes = await fetch("https://api.hubapi.com/oauth/v1/access-tokens/" + tokens.access_token);
      if (infoRes.ok) {
        const info = await infoRes.json();
        hubspotEmail = info.user;
      }
    } catch (e) { console.warn("Could not fetch HubSpot user info:", e); }

    const config = {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: Date.now() + tokens.expires_in * 1000,
      hubspotEmail,
    };

    const { data: existing } = await supabase
      .from("integrations")
      .select("id")
      .eq("user_id", user.id)
      .eq("integration_id", "hubspot")
      .maybeSingle();

    if (existing) {
      await supabase.from("integrations").update({
        config, is_active: true, connected_email: hubspotEmail, updated_at: new Date().toISOString(),
      }).eq("id", existing.id);
    } else {
      await supabase.from("integrations").insert({
        user_id: user.id, integration_id: "hubspot", integration_name: "HubSpot",
        config, is_active: true, connected_email: hubspotEmail, updated_at: new Date().toISOString(),
      });
    }

    return new Response(
      JSON.stringify({ success: true, connectedEmail: hubspotEmail }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in hubspot-oauth-callback:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

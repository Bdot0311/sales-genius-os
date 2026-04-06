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

    const CLIENT_ID = Deno.env.get("SALESFORCE_CLIENT_ID");
    const CLIENT_SECRET = Deno.env.get("SALESFORCE_CLIENT_SECRET");
    if (!CLIENT_ID || !CLIENT_SECRET) throw new Error("Salesforce OAuth credentials not configured");

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

    const tokenResponse = await fetch("https://login.salesforce.com/services/oauth2/token", {
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
      throw new Error(errorData.error_description || "Token exchange failed");
    }

    const tokens = await tokenResponse.json();

    // Get Salesforce user identity
    let sfEmail = null;
    try {
      const idRes = await fetch(tokens.id, {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      });
      if (idRes.ok) {
        const idInfo = await idRes.json();
        sfEmail = idInfo.email;
      }
    } catch (e) { console.warn("Could not fetch Salesforce identity:", e); }

    const config = {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      instanceUrl: tokens.instance_url,
      sfEmail,
    };

    const { data: existing } = await supabase
      .from("integrations")
      .select("id")
      .eq("user_id", user.id)
      .eq("integration_id", "salesforce")
      .maybeSingle();

    if (existing) {
      await supabase.from("integrations").update({
        config, is_active: true, connected_email: sfEmail, updated_at: new Date().toISOString(),
      }).eq("id", existing.id);
    } else {
      await supabase.from("integrations").insert({
        user_id: user.id, integration_id: "salesforce", integration_name: "Salesforce",
        config, is_active: true, connected_email: sfEmail, updated_at: new Date().toISOString(),
      });
    }

    return new Response(
      JSON.stringify({ success: true, connectedEmail: sfEmail }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in salesforce-oauth-callback:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

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

    const CLIENT_ID = Deno.env.get("CALENDLY_CLIENT_ID");
    const CLIENT_SECRET = Deno.env.get("CALENDLY_CLIENT_SECRET");
    if (!CLIENT_ID || !CLIENT_SECRET) throw new Error("Calendly OAuth credentials not configured");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header");

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) throw new Error("Not authenticated");

    if (!state) throw new Error("Missing state parameter");
    let stateData: { userId?: string };
    try { stateData = JSON.parse(state); }
    catch { throw new Error("Invalid state parameter"); }
    if (stateData.userId !== user.id) throw new Error("State mismatch - possible CSRF attack");

    const tokenResponse = await fetch("https://auth.calendly.com/oauth/token", {
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

    // Get Calendly user info
    let calendlyEmail = null;
    let calendlyUserUri: string | null = null;
    let calendlyOrgUri: string | null = null;
    try {
      const userRes = await fetch("https://api.calendly.com/users/me", {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      });
      if (userRes.ok) {
        const userInfo = await userRes.json();
        calendlyEmail = userInfo.resource?.email;
        calendlyUserUri = userInfo.resource?.uri ?? null;
        calendlyOrgUri = userInfo.resource?.current_organization ?? null;
      }
    } catch (e) { console.warn("Could not fetch Calendly user info:", e); }

    // Register the booking webhook so booked meetings land in campaign setup
    // requests with the invitee's real name, email and meeting time.
    let webhookRegistered = false;
    const signingKey = Deno.env.get("CALENDLY_WEBHOOK_SIGNING_KEY");
    if (calendlyOrgUri && calendlyUserUri) {
      try {
        const hookRes = await fetch("https://api.calendly.com/webhook_subscriptions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${tokens.access_token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            url: `${Deno.env.get("SUPABASE_URL")}/functions/v1/calendly-webhook`,
            events: ["invitee.created", "invitee.canceled"],
            organization: calendlyOrgUri,
            user: calendlyUserUri,
            scope: "user",
            ...(signingKey ? { signing_key: signingKey } : {}),
          }),
        });
        const hookText = await hookRes.text();
        webhookRegistered = hookRes.ok;
        if (!hookRes.ok) console.warn(`Calendly webhook registration failed [${hookRes.status}]: ${hookText}`);
      } catch (e) {
        console.warn("Calendly webhook registration error:", e);
      }
    }

    const config = {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: Date.now() + tokens.expires_in * 1000,
      calendlyEmail,
      calendlyUserUri,
      calendlyOrgUri,
      webhookRegistered,
    };

    const { data: existing } = await supabase
      .from("integrations")
      .select("id")
      .eq("user_id", user.id)
      .eq("integration_id", "calendly")
      .maybeSingle();

    if (existing) {
      await supabase.from("integrations").update({
        config, is_active: true, connected_email: calendlyEmail, updated_at: new Date().toISOString(),
      }).eq("id", existing.id);
    } else {
      await supabase.from("integrations").insert({
        user_id: user.id, integration_id: "calendly", integration_name: "Calendly",
        config, is_active: true, connected_email: calendlyEmail, updated_at: new Date().toISOString(),
      });
    }

    return new Response(
      JSON.stringify({ success: true, connectedEmail: calendlyEmail }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in calendly-oauth-callback:", error);
    return new Response(
      JSON.stringify({ error: "Calendly connection failed. Please try again." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

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

    const CLIENT_ID = Deno.env.get("SLACK_CLIENT_ID");
    const CLIENT_SECRET = Deno.env.get("SLACK_CLIENT_SECRET");
    if (!CLIENT_ID || !CLIENT_SECRET) throw new Error("Slack OAuth credentials not configured");

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

    const tokenResponse = await fetch("https://slack.com/api/oauth.v2.access", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        code,
        redirect_uri: redirectUri,
      }).toString(),
    });

    const tokens = await tokenResponse.json();
    if (!tokens.ok) throw new Error(tokens.error || "Slack token exchange failed");

    const teamName = tokens.team?.name || null;
    const slackEmail = tokens.authed_user?.id ? `${tokens.team?.name || "Slack"} workspace` : null;

    const config = {
      accessToken: tokens.access_token,
      teamId: tokens.team?.id,
      teamName,
      botUserId: tokens.bot_user_id,
      scope: tokens.scope,
      incomingWebhook: tokens.incoming_webhook,
    };

    const { data: existing } = await supabase
      .from("integrations")
      .select("id")
      .eq("user_id", user.id)
      .eq("integration_id", "slack")
      .maybeSingle();

    if (existing) {
      await supabase.from("integrations").update({
        config, is_active: true, connected_email: teamName, updated_at: new Date().toISOString(),
      }).eq("id", existing.id);
    } else {
      await supabase.from("integrations").insert({
        user_id: user.id, integration_id: "slack", integration_name: "Slack",
        config, is_active: true, connected_email: teamName, updated_at: new Date().toISOString(),
      });
    }

    return new Response(
      JSON.stringify({ success: true, connectedEmail: teamName }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in slack-oauth-callback:", error);
    return new Response(
      JSON.stringify({ error: "Connection failed. Please try again." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

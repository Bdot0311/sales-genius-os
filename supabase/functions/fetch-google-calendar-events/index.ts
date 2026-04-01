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
    if (!authHeader) throw new Error("Missing authorization header");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Verify user with anon client
    const anonClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await anonClient.auth.getUser();
    if (!user) throw new Error("Not authenticated");

    // Use service role to read integration config (tokens never leave server)
    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    const { data: integration } = await adminClient
      .from("integrations")
      .select("config")
      .eq("user_id", user.id)
      .eq("integration_id", "google")
      .eq("is_active", true)
      .single();

    if (!integration?.config) {
      return new Response(
        JSON.stringify({ events: [], connected: false }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const config = integration.config as any;
    let accessToken = config.accessToken;

    // Refresh token if expired
    if (config.expiresAt && Date.now() >= config.expiresAt - 60000) {
      const clientId = Deno.env.get("GOOGLE_CLIENT_ID") || config.clientId;
      const clientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET") || config.clientSecret;

      if (!clientId || !clientSecret || !config.refreshToken) {
        return new Response(
          JSON.stringify({ events: [], connected: false, needsReconnect: true }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
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
        const err = await tokenResponse.json();
        if (err.error === "invalid_grant") {
          await adminClient
            .from("integrations")
            .update({ is_active: false })
            .eq("user_id", user.id)
            .eq("integration_id", "google");

          return new Response(
            JSON.stringify({ events: [], connected: false, needsReconnect: true }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        throw new Error(err.error_description || "Failed to refresh token");
      }

      const tokens = await tokenResponse.json();
      accessToken = tokens.access_token;

      await adminClient
        .from("integrations")
        .update({
          config: {
            ...config,
            accessToken: tokens.access_token,
            expiresAt: Date.now() + tokens.expires_in * 1000,
            refreshToken: tokens.refresh_token || config.refreshToken,
          },
        })
        .eq("user_id", user.id)
        .eq("integration_id", "google");
    }

    // Fetch calendar events server-side
    const now = new Date();
    const timeMin = now.toISOString();
    const timeMax = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();

    const calResponse = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${timeMin}&timeMax=${timeMax}&singleEvents=true&orderBy=startTime&maxResults=10`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    if (!calResponse.ok) {
      if (calResponse.status === 401) {
        return new Response(
          JSON.stringify({ events: [], connected: false, needsReconnect: true }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      throw new Error("Failed to fetch calendar events");
    }

    const calData = await calResponse.json();

    // Return only safe event data — no tokens
    const safeEvents = (calData.items || []).map((e: any) => ({
      id: e.id,
      summary: e.summary,
      description: e.description,
      start: e.start,
      end: e.end,
      htmlLink: e.htmlLink,
    }));

    return new Response(
      JSON.stringify({ events: safeEvents, connected: true }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error fetching Google Calendar events:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

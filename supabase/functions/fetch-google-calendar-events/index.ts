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

    const anonClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await anonClient.auth.getUser();
    if (!user) throw new Error("Not authenticated");

    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    // All active Google mailboxes for this user
    const { data: integrations } = await adminClient
      .from("integrations")
      .select("id, config")
      .eq("user_id", user.id)
      .eq("integration_id", "google")
      .eq("is_active", true)
      .order("updated_at", { ascending: false });

    const active = (integrations || []).filter((i: any) => i?.config);

    if (active.length === 0) {
      return new Response(
        JSON.stringify({ events: [], connected: false }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Window: from the start of TODAY (local-ish, use UTC midnight minus 12h to be safe
    // across timezones) so meetings already in progress or earlier today still show.
    const now = new Date();
    const startOfDay = new Date(now);
    startOfDay.setUTCHours(0, 0, 0, 0);
    const timeMin = new Date(startOfDay.getTime() - 12 * 60 * 60 * 1000).toISOString();
    const timeMax = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();

    const allEvents: any[] = [];
    let anyConnected = false;
    let needsReconnect = false;
    let firstEmail: string | null = null;
    let lastError: string | null = null;

    for (const integration of active) {
      const config = integration.config as any;
      let accessToken = config.accessToken;

      // Refresh token if expired
      if (config.expiresAt && Date.now() >= config.expiresAt - 60000) {
        const clientId = Deno.env.get("GOOGLE_CLIENT_ID") || config.clientId;
        const clientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET") || config.clientSecret;

        if (!clientId || !clientSecret || !config.refreshToken) {
          needsReconnect = true;
          continue;
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
          const err = await tokenResponse.json().catch(() => ({}));
          await adminClient.from("calendar_sync_logs").insert({
            user_id: user.id,
            integration_id: integration.id,
            direction: "inbound",
            action: "refresh_token",
            status: "error",
            attempt: 1,
            http_status: tokenResponse.status,
            error_code: err.error || "token_refresh_failed",
            error_message: err.error_description || "Failed to refresh token",
          });
          if (err.error === "invalid_grant") {
            await adminClient
              .from("integrations")
              .update({ is_active: false })
              .eq("id", integration.id);
          }
          needsReconnect = true;
          lastError = err.error_description || err.error || "token_refresh_failed";
          continue;
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
          .eq("id", integration.id);
      }

      if (!accessToken) {
        needsReconnect = true;
        continue;
      }

      const accountEmail = config.email || config.accountEmail || config.connected_email || null;
      if (!firstEmail && accountEmail) firstEmail = accountEmail;

      // Enumerate the user's calendars (not just primary) so meetings on
      // secondary/shared calendars still show up.
      let calendarIds: string[] = ["primary"];
      try {
        const listRes = await fetch(
          "https://www.googleapis.com/calendar/v3/users/me/calendarList?maxResults=50&minAccessRole=reader",
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );
        if (listRes.ok) {
          const listData = await listRes.json();
          const ids = (listData.items || [])
            .filter((c: any) => c.selected !== false && !c.deleted)
            .map((c: any) => c.id)
            .filter(Boolean);
          if (ids.length) calendarIds = ids.slice(0, 10);
        }
      } catch (_) {
        // fall back to primary
      }

      for (const calId of calendarIds) {
        const calResponse = await fetch(
          `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calId)}/events?timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}&singleEvents=true&orderBy=startTime&maxResults=100`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );

        if (!calResponse.ok) {
          const bodyText = await calResponse.text().catch(() => "");
          console.error("Google Calendar API error", {
            calId,
            status: calResponse.status,
            body: bodyText.slice(0, 300),
          });
          if (calResponse.status === 401 || calResponse.status === 403) {
            if (calId === "primary" || calendarIds.length === 1) needsReconnect = true;
          } else {
            lastError = `Google Calendar: ${calResponse.status}`;
          }
          continue;
        }

        anyConnected = true;
        const calData = await calResponse.json();
        for (const e of calData.items || []) {
          if (e.status === "cancelled") continue;
          allEvents.push({
            id: `${integration.id}:${calId}:${e.id}`,
            summary: e.summary,
            description: e.description,
            location: e.location,
            start: e.start,
            end: e.end,
            htmlLink: e.htmlLink,
            accountEmail,
          });
        }
      }
    }

    // De-duplicate identical events across calendars, sort chronologically
    const seen = new Set<string>();
    const events = allEvents
      .filter((e) => {
        const key = `${e.summary || ""}|${e.start?.dateTime || e.start?.date}|${e.end?.dateTime || e.end?.date}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .sort((a, b) => {
        const av = new Date(a.start?.dateTime || a.start?.date || 0).getTime();
        const bv = new Date(b.start?.dateTime || b.start?.date || 0).getTime();
        return av - bv;
      })
      .slice(0, 100);

    return new Response(
      JSON.stringify({
        events,
        connected: anyConnected,
        needsReconnect: !anyConnected && needsReconnect,
        email: firstEmail,
        ...(lastError && !anyConnected ? { error: lastError } : {}),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error fetching Google Calendar events:", error);
    return new Response(
      JSON.stringify({ events: [], connected: false, error: error?.message || "unknown" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

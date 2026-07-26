import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MAX_ATTEMPTS = 3;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const isTransientStatus = (status: number) =>
  status === 408 || status === 425 || status === 429 || (status >= 500 && status <= 599);

async function logSync(
  admin: any,
  row: {
    user_id: string;
    integration_id?: string | null;
    direction: "outbound" | "inbound";
    action: string;
    status: "success" | "error" | "retry" | "skipped";
    attempt: number;
    http_status?: number | null;
    google_event_id?: string | null;
    activity_id?: string | null;
    error_code?: string | null;
    error_message?: string | null;
    details?: any;
  }
) {
  try {
    await admin.from("calendar_sync_logs").insert(row);
  } catch (e) {
    console.error("Failed to write calendar_sync_logs row:", e);
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const admin = createClient(supabaseUrl, serviceKey);

  let userId: string | null = null;
  let integrationId: string | null = null;

  try {
    const { eventData, activityId } = await req.json();

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Missing authorization header");

    const supabase = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Not authenticated");
    userId = user.id;

    const { data: integrations } = await admin
      .from("integrations")
      .select("id, config")
      .eq("user_id", user.id)
      .eq("integration_id", "google")
      .eq("is_active", true)
      .order("updated_at", { ascending: false })
      .limit(1);
    const integration = integrations?.[0];

    if (!integration?.config) {
      await logSync(admin, {
        user_id: user.id,
        direction: "outbound",
        action: "create_event",
        status: "error",
        attempt: 1,
        error_code: "not_connected",
        error_message: "Google Calendar not connected",
        activity_id: activityId ?? null,
      });
      return new Response(
        JSON.stringify({ error: "Google Calendar not connected", code: "not_connected" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    integrationId = integration.id;
    const config = integration.config as any;
    let accessToken = config.accessToken;

    if (config.expiresAt && Date.now() >= config.expiresAt - 60000 && config.refreshToken) {
      const clientId = Deno.env.get("GOOGLE_CLIENT_ID") || config.clientId;
      const clientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET") || config.clientSecret;

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
        const invalid = err.error === "invalid_grant";
        await logSync(admin, {
          user_id: user.id,
          integration_id: integration.id,
          direction: "outbound",
          action: "refresh_token",
          status: "error",
          attempt: 1,
          http_status: tokenResponse.status,
          error_code: err.error || "token_refresh_failed",
          error_message: err.error_description || "Failed to refresh Google access token",
          activity_id: activityId ?? null,
        });
        if (invalid) {
          await admin.from("integrations").update({ is_active: false }).eq("id", integration.id);
        }
        return new Response(
          JSON.stringify({
            error: invalid ? "Google access revoked — please reconnect" : "Failed to refresh Google token",
            code: invalid ? "invalid_grant" : "token_refresh_failed",
            needsReconnect: invalid,
          }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const tokens = await tokenResponse.json();
      accessToken = tokens.access_token;
      await admin
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

    const startDateTime = new Date(eventData.due_date);
    const endDateTime = new Date(startDateTime.getTime() + 60 * 60 * 1000);
    const googleEvent = {
      summary: eventData.subject,
      description: eventData.description || "",
      start: { dateTime: startDateTime.toISOString(), timeZone: "UTC" },
      end: { dateTime: endDateTime.toISOString(), timeZone: "UTC" },
    };

    // Retry loop with exponential backoff for transient failures
    let lastError: { status: number; message: string; code?: string } | null = null;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      const response = await fetch(
        "https://www.googleapis.com/calendar/v3/calendars/primary/events",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(googleEvent),
        }
      );

      if (response.ok) {
        const createdEvent = await response.json();
        await logSync(admin, {
          user_id: user.id,
          integration_id: integration.id,
          direction: "outbound",
          action: "create_event",
          status: "success",
          attempt,
          http_status: response.status,
          google_event_id: createdEvent.id,
          activity_id: activityId ?? null,
        });
        return new Response(
          JSON.stringify({ success: true, googleEventId: createdEvent.id, attempts: attempt }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const errBody = await response.json().catch(() => ({}));
      const errMessage = errBody?.error?.message || `Google returned ${response.status}`;
      const errCode = errBody?.error?.status || String(response.status);
      lastError = { status: response.status, message: errMessage, code: errCode };

      const transient = isTransientStatus(response.status);
      const willRetry = transient && attempt < MAX_ATTEMPTS;

      await logSync(admin, {
        user_id: user.id,
        integration_id: integration.id,
        direction: "outbound",
        action: "create_event",
        status: willRetry ? "retry" : "error",
        attempt,
        http_status: response.status,
        error_code: errCode,
        error_message: errMessage,
        activity_id: activityId ?? null,
        details: { transient },
      });

      if (!willRetry) break;
      const backoff = 250 * Math.pow(2, attempt - 1) + Math.floor(Math.random() * 150);
      await sleep(backoff);
    }

    return new Response(
      JSON.stringify({
        error: lastError?.message || "Failed to create Google Calendar event",
        code: lastError?.code || "unknown",
        httpStatus: lastError?.status,
        attempts: MAX_ATTEMPTS,
      }),
      { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error syncing to Google Calendar:", error);
    if (userId) {
      await logSync(admin, {
        user_id: userId,
        integration_id: integrationId,
        direction: "outbound",
        action: "create_event",
        status: "error",
        attempt: 1,
        error_code: "exception",
        error_message: error?.message || "Unknown error",
      });
    }
    return new Response(
      JSON.stringify({ error: error.message, code: "exception" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

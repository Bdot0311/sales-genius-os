import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { safeRedirectUri } from "../_shared/safe-origin.ts";
import { createClient } from "npm:@supabase/supabase-js@2.76.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  /*
   * Every failure below used to be the same 500 with the same sentence.
   *
   * "Could not start Google sign-in. Please try again." is what a missing
   * server secret, an expired browser session and a malformed request all
   * looked like, and the real reason went to console.error — a log nobody
   * reads while a customer is sitting on the screen. From the client it
   * arrived as "Edge Function returned a non-2xx status code", so the one
   * place that knew the answer said nothing to the only person who could act
   * on it.
   *
   * These are different problems with different owners: a missing secret is
   * ours and no amount of retrying fixes it; an expired session is the user's
   * and signing in again does. Saying so is the whole point.
   */
  const fail = (status: number, code: string, error: string) =>
    new Response(JSON.stringify({ error, error_code: code }), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const body = await req.json().catch(() => null);
    const redirectUri = safeRedirectUri(body?.redirectUri) ?? "";
    if (!redirectUri) {
      return fail(400, "missing_redirect_uri", "No redirect URI was sent with the request.");
    }

    const GOOGLE_CLIENT_ID = Deno.env.get("GOOGLE_CLIENT_ID");
    const GOOGLE_CLIENT_SECRET = Deno.env.get("GOOGLE_CLIENT_SECRET");
    if (!GOOGLE_CLIENT_ID) {
      return fail(
        503,
        "google_client_id_missing",
        "Google isn't configured on our side: GOOGLE_CLIENT_ID is not set for the edge functions. Retrying won't help until it is.",
      );
    }
    /*
     * Checked here even though only the callback spends it. Without it the
     * user completes the whole Google consent screen and the failure lands at
     * the end, where it reads as "Google rejected us" rather than "we never
     * had the credential".
     */
    if (!GOOGLE_CLIENT_SECRET) {
      return fail(
        503,
        "google_client_secret_missing",
        "Google isn't configured on our side: GOOGLE_CLIENT_SECRET is not set for the edge functions. Connecting would fail at the last step, so it stops here.",
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return fail(401, "no_auth_header", "You are not signed in. Sign in and try again.");
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return fail(401, "session_expired", "Your session has expired. Sign in again and retry.");
    }

    // Define scopes for Gmail and Calendar
    const scopes = [
      "https://www.googleapis.com/auth/gmail.send",
      "https://www.googleapis.com/auth/gmail.readonly",
      "https://www.googleapis.com/auth/calendar",
      "https://www.googleapis.com/auth/userinfo.email",
      "https://www.googleapis.com/auth/userinfo.profile",
    ].join(" ");

    // Create state with user ID for security
    const state = JSON.stringify({
      userId: user.id,
      timestamp: Date.now(),
    });

    const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    authUrl.searchParams.set("client_id", GOOGLE_CLIENT_ID);
    authUrl.searchParams.set("redirect_uri", redirectUri);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("scope", scopes);
    authUrl.searchParams.set("access_type", "offline");
    authUrl.searchParams.set("prompt", "consent");
    authUrl.searchParams.set("state", state);

    console.log("Generated OAuth URL for user:", user.id);

    return new Response(
      JSON.stringify({ authUrl: authUrl.toString() }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    // Anything not named above. The message still goes out, because a cause
    // nobody can read is how this took days.
    const detail = error instanceof Error ? error.message : String(error);
    console.error("Error in google-oauth-init:", detail);
    return fail(500, "unexpected", `Could not start the Google connection: ${detail}`);
  }
});

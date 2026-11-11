import { pinnedRedirectUri } from "../_shared/safe-origin.ts";
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
    /*
     * Calendly registers ONE redirect URI and matches it exactly, so this must
     * not come from the browser. It used to, which meant every host but the
     * registered one (outreign.lovable.app, each Lovable preview, localhost)
     * sent an unregistered value and Calendly answered "malformed redirect
     * url" after the user had already signed in. The callback derives the same
     * value the same way, so the authorize request and the token exchange
     * cannot drift apart.
     */
    await req.json().catch(() => null);
    const redirectUri = pinnedRedirectUri(Deno.env.get("CALENDLY_REDIRECT_URI"), "/integrations");

    const CLIENT_ID = Deno.env.get("CALENDLY_CLIENT_ID");
    if (!CLIENT_ID) throw new Error("CALENDLY_CLIENT_ID is not configured");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header");

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) throw new Error("Not authenticated");

    const state = JSON.stringify({
      userId: user.id,
      provider: "calendly",
      timestamp: Date.now(),
    });

    const authUrl = new URL("https://calendly.com/oauth/authorize");
    authUrl.searchParams.set("client_id", CLIENT_ID);
    authUrl.searchParams.set("redirect_uri", redirectUri);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("state", state);

    return new Response(
      JSON.stringify({ authUrl: authUrl.toString() }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in calendly-oauth-init:", error);
    return new Response(
      JSON.stringify({ error: "Could not start Calendly connection. Please try again." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

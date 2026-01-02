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
    
    const GOOGLE_CLIENT_ID = Deno.env.get("GOOGLE_CLIENT_ID");
    const GOOGLE_CLIENT_SECRET = Deno.env.get("GOOGLE_CLIENT_SECRET");
    
    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
      throw new Error("Google OAuth credentials not configured");
    }

    // Get user from auth header
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      throw new Error("No authorization header");
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      throw new Error("Not authenticated");
    }

    // Verify state matches user
    if (state) {
      try {
        const stateData = JSON.parse(state);
        if (stateData.userId !== user.id) {
          throw new Error("State mismatch - possible CSRF attack");
        }
      } catch (e) {
        console.warn("Could not verify state:", e);
      }
    }

    console.log("Exchanging code for tokens for user:", user.id);

    // Exchange code for tokens
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        code,
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }).toString(),
    });

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.json();
      console.error("Google token exchange failed:", errorData);
      throw new Error(errorData.error_description || errorData.error || "Token exchange failed");
    }

    const tokens = await tokenResponse.json();
    console.log("Successfully obtained tokens");

    // Get user's email from Google
    let googleEmail = null;
    try {
      const userInfoResponse = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
        headers: {
          Authorization: `Bearer ${tokens.access_token}`,
        },
      });
      if (userInfoResponse.ok) {
        const userInfo = await userInfoResponse.json();
        googleEmail = userInfo.email;
        console.log("Got Google email:", googleEmail);
      }
    } catch (e) {
      console.warn("Could not fetch Google user info:", e);
    }

    // Store tokens in integrations table
    const config = {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: Date.now() + tokens.expires_in * 1000,
      tokenType: tokens.token_type,
      scope: tokens.scope,
      googleEmail,
    };

    const { error: upsertError } = await supabase
      .from("integrations")
      .upsert({
        user_id: user.id,
        integration_id: "google",
        integration_name: "Google",
        config,
        is_active: true,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: "user_id,integration_id",
      });

    if (upsertError) {
      console.error("Error saving integration:", upsertError);
      throw new Error("Failed to save integration");
    }

    console.log("Successfully saved Google integration for user:", user.id);

    return new Response(
      JSON.stringify({ 
        success: true, 
        googleEmail,
        message: "Google connected successfully" 
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in google-oauth-callback:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

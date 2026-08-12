// Fetches the signed-in user's Gmail signature (sendAs settings) so the app can
// show/preview it and cache it for scheduled + agent sends.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { fetchGmailSignature } from "../_shared/signature.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const admin = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Missing authorization" }, 401);
    const { data: { user }, error: userErr } = await admin.auth.getUser(
      authHeader.replace("Bearer ", ""),
    );
    if (userErr || !user) return json({ error: "Not authenticated" }, 401);

    let integrationRowId: string | null = null;
    try {
      const body = await req.json();
      integrationRowId = body?.integrationRowId ?? null;
    } catch { /* no body */ }

    let q = admin
      .from("integrations")
      .select("id, config")
      .eq("user_id", user.id)
      .eq("integration_id", "google")
      .eq("is_active", true);
    if (integrationRowId) q = q.eq("id", integrationRowId);

    const { data: integration } = await q
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!integration) {
      return json({ error: "Gmail is not connected. Connect Gmail first." }, 400);
    }

    const config = (integration.config ?? {}) as any;
    let accessToken: string | null = config.accessToken ?? config.provider_token ?? null;

    // Refresh if expired
    if (config.expiresAt && Date.now() >= config.expiresAt && config.refreshToken) {
      const clientId = Deno.env.get("GOOGLE_CLIENT_ID");
      const clientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET");
      if (clientId && clientSecret) {
        const res = await fetch("https://oauth2.googleapis.com/token", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            client_id: clientId,
            client_secret: clientSecret,
            refresh_token: config.refreshToken,
            grant_type: "refresh_token",
          }).toString(),
        });
        if (res.ok) {
          const tokens = await res.json();
          accessToken = tokens.access_token;
          await admin
            .from("integrations")
            .update({
              config: {
                ...config,
                accessToken: tokens.access_token,
                expiresAt: Date.now() + tokens.expires_in * 1000,
              },
            })
            .eq("id", integration.id);
        }
      }
    }

    if (!accessToken) {
      return json({ error: "Gmail authorization expired. Reconnect Gmail." }, 400);
    }

    const signature = await fetchGmailSignature(accessToken);
    if (!signature) {
      return json({
        signature: null,
        message: "No signature is set in Gmail. Add one in Gmail settings, or use a custom signature here.",
      });
    }

    await admin.from("profiles").update({ email_signature: signature }).eq("id", user.id);

    return json({ signature });
  } catch (e) {
    console.error("gmail-signature error:", e);
    return json({ error: e instanceof Error ? e.message : "Unexpected error" }, 200);
  }
});

// Public one-shot endpoint. Writes the INTERNAL_TRIGGER_SECRET env value
// into the `email_queue_service_role_key` vault secret so DB triggers/cron
// can authenticate to internal edge functions without being tied to the
// rotating SUPABASE_SERVICE_ROLE_KEY. Safe to be open: it only writes a
// server-side env var into the vault, never returns it.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const INTERNAL_TRIGGER_SECRET = Deno.env.get("INTERNAL_TRIGGER_SECRET");
    if (!INTERNAL_TRIGGER_SECRET) {
      return new Response(JSON.stringify({ success: false, error: "INTERNAL_TRIGGER_SECRET missing" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { error: rpcErr } = await admin.rpc("admin_upsert_vault_secret", {
      _name: "email_queue_service_role_key",
      _secret: INTERNAL_TRIGGER_SECRET,
    });
    if (rpcErr) throw rpcErr;

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("sync-vault-service-key failed:", e);
    return new Response(JSON.stringify({ success: false, error: e?.message ?? String(e) }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

// Public one-shot endpoint. Writes the INTERNAL_TRIGGER_SECRET env value into
// the vault so DB triggers and cron can authenticate to internal edge
// functions without being tied to the rotating SUPABASE_SERVICE_ROLE_KEY.
// Safe to be open: it only writes a server-side env var into the vault, never
// returns it.
//
// It writes TWO names for the same value. `internal_trigger_secret` is what it
// is; `email_queue_service_role_key` is the name it was given first, and that
// name is wrong — it never held the service role key. The wrong one cost a
// round on the branch that found it: five broken cron jobs were repointed at
// "the service role key", got the internal secret, and carried on answering
// 401 because the functions they call compared against the real one.
//
// Everything in this repository now reads the honest name. The old one is kept
// written because not every reader is in this repository — internal_job_key()
// is defined in the database and nowhere here — and a secret that stops being
// refreshed fails later, quietly, which is the trap this corner specialises
// in. It can go once nothing reads it; see the rename migration for the query.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@^2.76.1";
import { requireInternalOrAdmin } from "../_shared/internal-auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const denied = await requireInternalOrAdmin(req);
  if (denied) return denied;

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
    // The honest name first: if the legacy write fails, the name everything
    // reads is already current.
    for (const name of ["internal_trigger_secret", "email_queue_service_role_key"]) {
      const { error: rpcErr } = await admin.rpc("admin_upsert_vault_secret", {
        _name: name,
        _secret: INTERNAL_TRIGGER_SECRET,
      });
      if (rpcErr) throw rpcErr;
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("sync-vault-service-key failed:", e);
    return new Response(JSON.stringify({ success: false, error: "sync failed" }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

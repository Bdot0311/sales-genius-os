// Sweeps existing free-tier accounts and locks any whose email fails validation
// (bad syntax, disposable domain, or no MX records). Reduces free-loader abuse.
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const log = (step: string, details?: any) =>
  console.log(`[AUDIT-FREE-EMAILS] ${step}${details ? " - " + JSON.stringify(details) : ""}`);

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { persistSession: false },
    });

    // AUTH GUARD: This endpoint can mass-lock free accounts, so it must
    // require either the service role (cron) or an authenticated admin.
    const authHeader = req.headers.get("Authorization") ?? "";
    const bearer = authHeader.replace(/^Bearer\s+/i, "").trim();
    const isServiceRole = bearer && bearer === SERVICE_KEY;
    if (!isServiceRole) {
      if (!bearer) {
        return new Response(JSON.stringify({ error: "Authentication required" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { data: { user }, error: authErr } = await supabase.auth.getUser(bearer);
      if (authErr || !user) {
        return new Response(JSON.stringify({ error: "Invalid authentication token" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { data: isAdmin } = await supabase.rpc("has_role", {
        _user_id: user.id,
        _role: "admin",
      });
      if (!isAdmin) {
        return new Response(JSON.stringify({ error: "Admin privileges required" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Optional: caller may pass { dryRun: true } to preview without locking.
    let dryRun = false;
    let limit = 500;
    try {
      const body = await req.json();
      if (body?.dryRun === true) dryRun = true;
      if (typeof body?.limit === "number") limit = Math.min(Math.max(body.limit, 1), 2000);
    } catch { /* no body */ }

    // Get all free-tier accounts that are still active (not already locked)
    const { data: subs, error: subsErr } = await supabase
      .from("subscriptions")
      .select("user_id, account_status, plan, profiles!inner(email, full_name)")
      .eq("plan", "free")
      .neq("account_status", "locked")
      .limit(limit);

    if (subsErr) throw subsErr;

    log("Auditing free-tier accounts", { count: subs?.length ?? 0, dryRun });

    const invalid: Array<{ user_id: string; email: string; reason: string }> = [];
    let checked = 0;

    for (const sub of subs ?? []) {
      const email = (sub as any).profiles?.email as string | undefined;
      if (!email) continue;
      checked++;

      try {
        const res = await supabase.functions.invoke("validate-email", { body: { email } });
        const v = res.data as any;
        if (v && v.valid === false) {
          invalid.push({
            user_id: sub.user_id,
            email,
            reason: v.reason || "invalid_email",
          });
        }
      } catch (e: any) {
        log("validation error (skipped)", { email, error: e?.message });
      }

      // Mild rate-limit so we don't hammer DNS
      await new Promise((r) => setTimeout(r, 50));
    }

    log("Invalid accounts found", { count: invalid.length });

    let locked = 0;
    if (!dryRun) {
      for (const row of invalid) {
        const { error: updErr } = await supabase
          .from("subscriptions")
          .update({
            account_status: "locked",
            status: "inactive",
            updated_at: new Date().toISOString(),
          })
          .eq("user_id", row.user_id);

        if (updErr) {
          log("lock failed", { user_id: row.user_id, error: updErr.message });
          continue;
        }

        await supabase.from("audit_logs").insert({
          user_id: row.user_id,
          action: "auto_lock_invalid_email",
          entity_type: "user",
          entity_id: row.user_id,
          metadata: { email: row.email, reason: row.reason, source: "audit-free-tier-emails" },
        });

        locked++;
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        checked,
        invalid: invalid.length,
        locked,
        dryRun,
        details: invalid.slice(0, 50), // truncate
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
    );
  } catch (e: any) {
    log("ERROR", { message: e?.message });
    return new Response(
      JSON.stringify({ success: false, error: e?.message ?? String(e) }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
    );
  }
});

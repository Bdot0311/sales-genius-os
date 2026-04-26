import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const log = (step: string, details?: any) => {
  console.log(`[ADMIN-DELETE-USER] ${step}${details ? ` - ${JSON.stringify(details)}` : ''}`);
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header");

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userData.user) throw new Error("Unauthorized");

    // Verify caller is admin
    const { data: roleData } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', userData.user.id)
      .eq('role', 'admin')
      .maybeSingle();

    if (!roleData) throw new Error("Admin privileges required");

    const { user_id } = await req.json();
    if (!user_id || typeof user_id !== 'string') {
      throw new Error("user_id is required");
    }

    // Prevent self-deletion
    if (user_id === userData.user.id) {
      throw new Error("Cannot delete your own account");
    }

    log("Deleting user", { user_id });

    // Best-effort cleanup of dependent rows that may not have ON DELETE CASCADE
    const tablesToClean = [
      'user_roles', 'subscriptions', 'profiles', 'leads', 'deals',
      'activities', 'contacts', 'companies', 'integrations',
      'email_drafts', 'email_sequences', 'icp_profiles',
      'onboarding_progress', 'api_keys', 'message_blocks',
      'lead_index', 'lead_scores', 'enrichment_history',
      'import_history', 'mailbox_warmup', 'coaching_conversations',
      'coaching_messages', 'data_provider_events'
    ];

    for (const table of tablesToClean) {
      const { error } = await supabase.from(table).delete().eq('user_id', user_id);
      if (error) log(`Cleanup warn (${table})`, { error: error.message });
    }

    // Delete the auth user (this is the only call that requires service role)
    const { error: deleteError } = await supabase.auth.admin.deleteUser(user_id);
    if (deleteError) throw deleteError;

    // Audit log
    await supabase.from('audit_logs').insert({
      user_id: userData.user.id,
      action: 'delete_user',
      entity_type: 'user',
      entity_id: user_id,
    });

    log("User deleted");

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    log("ERROR", { msg });
    const safe: Record<string, string> = {
      "No authorization header": "Authentication required",
      "Unauthorized": "Authentication failed",
      "Admin privileges required": "Insufficient permissions",
      "user_id is required": "user_id is required",
      "Cannot delete your own account": "Cannot delete your own account",
    };
    return new Response(
      JSON.stringify({ error: safe[msg] || "Failed to delete user" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});

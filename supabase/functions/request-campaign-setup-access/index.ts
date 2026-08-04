import { createClient } from "npm:@supabase/supabase-js@2";

// Outbound side of campaign setup: an admin asks a customer for consented,
// time-limited access to their account. The customer still has to grant it in
// Settings > Support access, so this only sends the ask and logs it.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const clean = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) return json(500, { error: "Server not configured" });

  const admin = createClient(supabaseUrl, serviceKey);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return json(401, { error: "Authorization required" });
  const { data: userData } = await admin.auth.getUser(authHeader.replace("Bearer ", ""));
  const actor = userData?.user;
  if (!actor) return json(401, { error: "Invalid session" });

  const { data: role } = await admin
    .from("user_roles").select("role").eq("user_id", actor.id).eq("role", "admin").maybeSingle();
  if (role?.role !== "admin") return json(403, { error: "Admin privileges required" });

  try {
    const body = await req.json().catch(() => ({}));
    const note = clean(body.note, 500) || null;
    let userId = clean(body.userId, 60) || null;
    let email = clean(body.email, 200).toLowerCase() || null;

    // Resolve the target customer from either an id or an email address.
    let profile: { id: string; email: string | null; full_name: string | null } | null = null;
    if (userId) {
      const { data } = await admin.from("profiles").select("id, email, full_name").eq("id", userId).maybeSingle();
      profile = data ?? null;
    } else if (email) {
      const { data } = await admin.from("profiles").select("id, email, full_name").ilike("email", email).maybeSingle();
      profile = data ?? null;
    }
    if (!profile) return json(404, { error: "No customer found with that email" });
    userId = profile.id;
    email = profile.email ?? email;
    if (!email) return json(400, { error: "That customer has no email on file" });

    const sendRes = await fetch(`${supabaseUrl}/functions/v1/send-transactional-email`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
      body: JSON.stringify({
        templateName: "campaign-setup-access-request",
        recipientEmail: email,
        idempotencyKey: `campaign-setup-access-${userId}-${new Date().toISOString().slice(0, 10)}`,
        templateData: { name: profile.full_name?.split(" ")[0] ?? null, note, days: 14 },
      }),
    });
    const sendText = await sendRes.text();
    if (!sendRes.ok) {
      console.error(`[request-campaign-setup-access] send failed [${sendRes.status}]: ${sendText}`);
      return json(502, { error: "Could not send the access request email", details: sendText });
    }

    // Reuse an existing open request for this customer so the admin table shows
    // one row per customer instead of one per nudge.
    const { data: existing } = await admin
      .from("campaign_setup_requests")
      .select("id, access_request_count")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const now = new Date().toISOString();
    let requestId = existing?.id ?? null;
    if (existing) {
      await admin
        .from("campaign_setup_requests")
        .update({
          status: "access_requested",
          access_requested_at: now,
          access_request_count: (existing.access_request_count ?? 0) + 1,
          notes: note,
        })
        .eq("id", existing.id);
    } else {
      const { data: inserted, error: insErr } = await admin
        .from("campaign_setup_requests")
        .insert({
          user_id: userId,
          contact_email: email,
          contact_name: profile.full_name,
          source: "admin_outbound",
          direction: "outbound",
          status: "access_requested",
          access_requested_at: now,
          access_request_count: 1,
          notes: note,
          metadata: { requested_by: actor.id },
        })
        .select("id")
        .single();
      if (insErr) {
        console.error("[request-campaign-setup-access] insert failed:", insErr.message);
        return json(500, { error: insErr.message });
      }
      requestId = inserted.id;
    }

    await admin.from("audit_logs").insert({
      user_id: actor.id,
      action: "campaign_setup_access_requested",
      entity_type: "user",
      entity_id: userId,
      metadata: { actor_id: actor.id, target_user_id: userId, target_email: email, note },
    });

    return json(200, { success: true, requestId, email });
  } catch (e) {
    console.error("[request-campaign-setup-access] error:", e instanceof Error ? e.message : e);
    return json(500, { error: "Something went wrong" });
  }
});

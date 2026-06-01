// Links an authenticated user to an agency after they sign up via an invite
// token (?invite=TOKEN) or a general referral code (?ref=CODE).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...cors, "Content-Type": "application/json" } });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

  // Verify JWT to get caller's user_id
  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error: authErr } = await userClient.auth.getUser();
  if (authErr || !user) return new Response(JSON.stringify({ error: "Invalid token" }), { status: 401, headers: { ...cors, "Content-Type": "application/json" } });

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

  const { invite_token, ref_code } = await req.json().catch(() => ({}));

  const now = new Date().toISOString();

  if (invite_token) {
    // Specific invite — claim a pending agency_clients row
    const { data: existing, error: chkErr } = await admin
      .from("agency_clients")
      .select("id, status, agency_id")
      .eq("invite_token", invite_token)
      .maybeSingle();

    if (chkErr || !existing) return new Response(JSON.stringify({ error: "Invalid invite token" }), { status: 404, headers: { ...cors, "Content-Type": "application/json" } });
    if (existing.status !== "pending") return new Response(JSON.stringify({ error: "Invite already used" }), { status: 409, headers: { ...cors, "Content-Type": "application/json" } });

    const { error: updErr } = await admin
      .from("agency_clients")
      .update({ client_user_id: user.id, status: "active", joined_at: now })
      .eq("invite_token", invite_token);

    if (updErr) return new Response(JSON.stringify({ error: updErr.message }), { status: 500, headers: { ...cors, "Content-Type": "application/json" } });
    return new Response(JSON.stringify({ success: true, agency_id: existing.agency_id }), { headers: { ...cors, "Content-Type": "application/json" } });
  }

  if (ref_code) {
    // General referral link — find agency and create a new client record
    const { data: wl, error: wlErr } = await admin
      .from("white_label_settings")
      .select("user_id")
      .eq("referral_code", ref_code)
      .maybeSingle();

    if (wlErr || !wl) return new Response(JSON.stringify({ error: "Invalid referral code" }), { status: 404, headers: { ...cors, "Content-Type": "application/json" } });

    // Don't double-link
    const { data: already } = await admin
      .from("agency_clients")
      .select("id")
      .eq("agency_id", wl.user_id)
      .eq("client_user_id", user.id)
      .maybeSingle();

    if (!already) {
      const { error: insErr } = await admin
        .from("agency_clients")
        .insert({ agency_id: wl.user_id, client_user_id: user.id, status: "active", joined_at: now });
      if (insErr) return new Response(JSON.stringify({ error: insErr.message }), { status: 500, headers: { ...cors, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ success: true, agency_id: wl.user_id }), { headers: { ...cors, "Content-Type": "application/json" } });
  }

  return new Response(JSON.stringify({ error: "Provide invite_token or ref_code" }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } });
});

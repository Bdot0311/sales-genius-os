import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { corsHeaders } from "../_shared/internal-auth.ts";

// One-shot backfill: send a campaign-setup email to every profile.
// - "invite" variant for users who have never signed in (or signed in in the last 14 days)
// - "winback" variant (with free-month offer) for users inactive >14 days
// Admin-only. Skips a configurable list of emails (default: the sender himself).

interface Body {
  dryRun?: boolean;
  onlyEmail?: string;      // send to a single email for testing
  skipEmails?: string[];   // additional emails to skip
}

const INACTIVE_DAYS = 14;
const DEFAULT_SKIP = ["sales@alephwave.io"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  // Auth: require admin user
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const { data: userData } = await admin.auth.getUser(token);
  if (!userData?.user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const { data: role } = await admin
    .from("user_roles").select("role").eq("user_id", userData.user.id).eq("role", "admin").maybeSingle();
  if (!role) {
    return new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let body: Body = {};
  try { body = await req.json(); } catch { /* empty ok */ }
  const skip = new Set([...DEFAULT_SKIP, ...(body.skipEmails ?? [])].map((e) => e.toLowerCase()));

  // Fetch recipients
  let query = admin.from("profiles").select("id,email,full_name,last_sign_in_at");
  if (body.onlyEmail) query = query.eq("email", body.onlyEmail);
  const { data: profiles, error } = await query;
  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const inactiveCutoff = Date.now() - INACTIVE_DAYS * 86400_000;
  const today = new Date().toISOString().slice(0, 10);

  const results: any[] = [];
  let sent = 0, failed = 0, skipped = 0;

  for (const p of profiles ?? []) {
    if (!p.email || skip.has(p.email.toLowerCase())) { skipped++; continue; }

    const signedInAt = p.last_sign_in_at ? new Date(p.last_sign_in_at).getTime() : null;
    const variant = signedInAt && signedInAt < inactiveCutoff ? "winback" : "invite";
    const templateName = variant === "winback"
      ? "campaign-setup-winback"
      : "campaign-setup-invite";
    const firstName = p.full_name ? String(p.full_name).split(" ")[0] : undefined;

    if (body.dryRun) {
      results.push({ email: p.email, variant, firstName });
      continue;
    }

    const res = await fetch(`${supabaseUrl}/functions/v1/send-transactional-email`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({
        templateName,
        recipientEmail: p.email,
        idempotencyKey: `campaign-${variant}-${p.id}-${today}`,
        templateData: { name: firstName },
      }),
    });
    const okBody = await res.json().catch(() => ({}));
    const ok = res.ok && okBody?.success !== false;
    if (ok) sent++; else failed++;
    results.push({ email: p.email, variant, ok, status: res.status, body: okBody });
  }

  return new Response(JSON.stringify({ success: true, sent, failed, skipped, results }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200,
  });
});

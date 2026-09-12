import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { corsHeaders } from "../_shared/internal-auth.ts";
import { sendAppEmail } from "../_shared/transactional-email-templates/send-app-email.ts";

// One-time founder check-in to paying customers (any non-free plan, including
// trials of paid plans), asking them to take a short voice interview. Each
// recipient is emailed at most once ever (deduped via email_send_log by
// template name). Admin- or cron-invoked.
const TEMPLATE_NAME = 'customer-interview';
const MAX_PER_RUN = 100;

const log = (step: string, details?: unknown) => {
  console.log(`[CUSTOMER-INTERVIEW] ${step}${details ? ` - ${JSON.stringify(details)}` : ''}`);
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } },
  );

  // Auth: service role (cron) OR an admin user (manual trigger)
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  // Cron/DB triggers carry the rotating internal secret rather than the
  // service-role key, so accept either.
  const internalSecret = Deno.env.get("INTERNAL_TRIGGER_SECRET") ?? "";
  let isAuthed = false;

  if (token && ((serviceKey && token === serviceKey) || (internalSecret && token === internalSecret))) {
    isAuthed = true;

  } else if (token) {
    const { data: userData } = await supabase.auth.getUser(token);
    if (userData?.user) {
      const { data: roleRow } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', userData.user.id)
        .eq('role', 'admin')
        .maybeSingle();
      if (roleRow) isAuthed = true;
    }
  }

  if (!isAuthed) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 401,
    });
  }

  try {
    // Paying users only (any non-free plan)
    const { data: subs, error: subsErr } = await supabase
      .from('subscriptions')
      .select('user_id')
      .neq('plan', 'free')
      .in('status', ['active', 'trialing']);
    if (subsErr) throw subsErr;

    const paidIds = (subs ?? []).map((s: { user_id: string }) => s.user_id);
    if (paidIds.length === 0) {
      return new Response(JSON.stringify({ success: true, sent: 0, skipped: 0, errors: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200,
      });
    }

    const { data: profiles, error: profErr } = await supabase
      .from('profiles')
      .select('id, email, full_name')
      .in('id', paidIds)
      .not('email', 'is', null);
    if (profErr) throw profErr;

    // Who already received it (one send per recipient, ever)
    const { data: alreadySent, error: logErr } = await supabase
      .from('email_send_log')
      .select('recipient_email')
      .eq('template_name', TEMPLATE_NAME);
    if (logErr) throw logErr;
    const sentSet = new Set((alreadySent ?? []).map((r: { recipient_email: string }) => r.recipient_email));

    let sent = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const user of profiles ?? []) {
      if (sent >= MAX_PER_RUN) break;
      if (!user.email) { skipped++; continue; }
      if (sentSet.has(user.email)) { skipped++; continue; }

      const firstName = user.full_name ? String(user.full_name).split(' ')[0] : undefined;
      const res = await sendAppEmail(supabase, TEMPLATE_NAME, user.email, {
        idempotencyKey: `customer-interview-${user.id}`,
        templateData: { name: firstName },
      });

      if (res.sent) {
        sent++;
      } else if (res.reason === 'recipient_suppressed' || res.reason === 'test_domain_skipped') {
        skipped++;
      } else {
        errors.push(`${user.email}: ${res.error ?? res.reason}`);
      }
    }

    log('Done', { sent, skipped, errors: errors.length });
    return new Response(JSON.stringify({ success: true, sent, skipped, errors }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log('ERROR', { message });
    return new Response(JSON.stringify({ success: false, error: message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200,
    });
  }
});

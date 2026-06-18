import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { corsHeaders } from "../_shared/internal-auth.ts";

// Sends a re-engagement check-in to users who haven't signed in for a while.
// - Inactive threshold: 14 days since last_sign_in_at
// - Cool-down: don't email the same user more than once every 30 days (bypassed for manual sends)
// - Hard cap per run to avoid bursts
// - Records every attempt to public.re_engagement_log
// Send a re-engagement nudge every day the user hasn't signed in that calendar day (UTC).
// Cooldown is "already attempted today" — not a multi-day quiet period.
const INACTIVE_DAYS = 1;
const MAX_PER_RUN = 500;
const TEMPLATE_NAME = 're-engagement-email';

const log = (step: string, details?: unknown) => {
  console.log(`[RE-ENGAGEMENT] ${step}${details ? ` - ${JSON.stringify(details)}` : ''}`);
};

interface Body {
  userId?: string;
  manual?: boolean;
  triggeredBy?: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } },
  );

  // Auth: either service role (cron) OR an admin user (manual send from admin panel)
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  let callerId: string | null = null;
  let isAuthed = false;

  if (token && token === serviceKey) {
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
      if (roleRow) {
        isAuthed = true;
        callerId = userData.user.id;
      }
    }
  }

  if (!isAuthed) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 401,
    });
  }

  let body: Body = {};
  try { body = await req.json(); } catch { /* empty body ok */ }

  const recordAttempt = async (entry: {
    user_id: string | null;
    recipient_email: string;
    last_sign_in_at: string | null;
    days_inactive: number | null;
    eligibility_reason: string;
    status: 'sent' | 'skipped' | 'failed';
    error_message?: string | null;
    triggered_manually: boolean;
    triggered_by: string | null;
  }) => {
    await supabase.from('re_engagement_log').insert(entry);
  };

  const sendOne = async (user: { id: string; email: string; full_name: string | null; last_sign_in_at: string | null }, opts: { manual: boolean; reason: string }) => {
    const daysInactive = user.last_sign_in_at
      ? Math.floor((Date.now() - new Date(user.last_sign_in_at).getTime()) / 86400_000)
      : null;
    const firstName = user.full_name ? String(user.full_name).split(' ')[0] : undefined;

    const { error: sendErr } = await supabase.functions.invoke('send-transactional-email', {
      body: {
        templateName: TEMPLATE_NAME,
        recipientEmail: user.email,
        idempotencyKey: `reengage-${user.id}-${new Date().toISOString().slice(0, 10)}${opts.manual ? '-manual' : ''}`,
        templateData: { name: firstName, daysInactive: daysInactive ?? undefined },
      },
    });

    await recordAttempt({
      user_id: user.id,
      recipient_email: user.email,
      last_sign_in_at: user.last_sign_in_at,
      days_inactive: daysInactive,
      eligibility_reason: opts.reason,
      status: sendErr ? 'failed' : 'sent',
      error_message: sendErr ? sendErr.message : null,
      triggered_manually: opts.manual,
      triggered_by: opts.manual ? callerId : null,
    });

    return { ok: !sendErr, error: sendErr?.message };
  };

  try {
    // ---- Manual single-user send ----
    if (body.userId) {
      const { data: user, error: ferr } = await supabase
        .from('profiles')
        .select('id, email, full_name, last_sign_in_at')
        .eq('id', body.userId)
        .maybeSingle();
      if (ferr || !user || !user.email) {
        return new Response(JSON.stringify({ success: false, error: 'User not found or missing email' }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        });
      }
      const result = await sendOne(user as any, { manual: true, reason: 'manual_admin_send' });
      return new Response(JSON.stringify({ success: result.ok, error: result.error }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    // ---- Cron / bulk eligibility sweep ----
    const inactiveBefore = new Date(Date.now() - INACTIVE_DAYS * 86400_000).toISOString();
    // "Already sent/attempted today" cooldown — start of current UTC day
    const startOfUtcDay = new Date();
    startOfUtcDay.setUTCHours(0, 0, 0, 0);
    const cooldownSince = startOfUtcDay.toISOString();

    const { data: candidates, error } = await supabase
      .from('profiles')
      .select('id, email, full_name, last_sign_in_at')
      .not('email', 'is', null)
      .not('last_sign_in_at', 'is', null)
      .lt('last_sign_in_at', inactiveBefore)
      .order('last_sign_in_at', { ascending: true })
      .limit(MAX_PER_RUN * 3);

    if (error) throw error;
    log('Candidates fetched', { count: candidates?.length ?? 0 });

    let sent = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const user of candidates ?? []) {
      if (sent >= MAX_PER_RUN) break;
      if (!user.email) { skipped++; continue; }

      const { data: recent } = await supabase
        .from('email_send_log')
        .select('id')
        .eq('recipient_email', user.email)
        .eq('template_name', TEMPLATE_NAME)
        .gte('created_at', cooldownSince)
        .limit(1)
        .maybeSingle();

      if (recent) {
        skipped++;
        await recordAttempt({
          user_id: user.id,
          recipient_email: user.email,
          last_sign_in_at: user.last_sign_in_at,
          days_inactive: user.last_sign_in_at
            ? Math.floor((Date.now() - new Date(user.last_sign_in_at).getTime()) / 86400_000)
            : null,
          eligibility_reason: 'already_sent_today',
          status: 'skipped',
          triggered_manually: false,
          triggered_by: null,
        });
        continue;
      }

      const result = await sendOne(user as any, { manual: false, reason: 'no_signin_today' });
      if (result.ok) sent++;
      else errors.push(`${user.email}: ${result.error}`);
    }

    log('Done', { sent, skipped, errors: errors.length });
    return new Response(
      JSON.stringify({ success: true, sent, skipped, errors }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log('ERROR', { message });
    return new Response(
      JSON.stringify({ success: false, error: message }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
    );
  }
});

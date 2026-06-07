import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { corsHeaders, requireServiceRole } from "../_shared/internal-auth.ts";

// Sends a re-engagement check-in to users who haven't signed in for a while.
// - Inactive threshold: 14 days since last_sign_in_at
// - Cool-down: don't email the same user more than once every 30 days
// - Hard cap per run to avoid bursts
const INACTIVE_DAYS = 14;
const COOLDOWN_DAYS = 30;
const MAX_PER_RUN = 100;
const TEMPLATE_NAME = 're-engagement-email';

const log = (step: string, details?: unknown) => {
  console.log(`[RE-ENGAGEMENT] ${step}${details ? ` - ${JSON.stringify(details)}` : ''}`);
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const unauth = requireServiceRole(req);
  if (unauth) return unauth;

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } },
    );

    const inactiveBefore = new Date(Date.now() - INACTIVE_DAYS * 86400_000).toISOString();
    const cooldownSince = new Date(Date.now() - COOLDOWN_DAYS * 86400_000).toISOString();

    // Find candidates: signed in at least once, but not recently.
    const { data: candidates, error } = await supabase
      .from('profiles')
      .select('id, email, full_name, last_sign_in_at')
      .not('email', 'is', null)
      .not('last_sign_in_at', 'is', null)
      .lt('last_sign_in_at', inactiveBefore)
      .order('last_sign_in_at', { ascending: true })
      .limit(MAX_PER_RUN * 3); // over-fetch; filter cooldown below

    if (error) throw error;
    log('Candidates fetched', { count: candidates?.length ?? 0 });

    let sent = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const user of candidates ?? []) {
      if (sent >= MAX_PER_RUN) break;
      if (!user.email) { skipped++; continue; }

      // Skip if we already sent a re-engagement to this email within cooldown window
      const { data: recent } = await supabase
        .from('email_send_log')
        .select('id')
        .eq('recipient_email', user.email)
        .eq('template_name', TEMPLATE_NAME)
        .gte('created_at', cooldownSince)
        .limit(1)
        .maybeSingle();

      if (recent) { skipped++; continue; }

      const daysInactive = user.last_sign_in_at
        ? Math.floor((Date.now() - new Date(user.last_sign_in_at).getTime()) / 86400_000)
        : undefined;

      const firstName = user.full_name ? String(user.full_name).split(' ')[0] : undefined;

      const { error: sendErr } = await supabase.functions.invoke('send-transactional-email', {
        body: {
          templateName: TEMPLATE_NAME,
          recipientEmail: user.email,
          idempotencyKey: `reengage-${user.id}-${new Date().toISOString().slice(0, 10)}`,
          templateData: { name: firstName, daysInactive },
        },
      });

      if (sendErr) {
        errors.push(`${user.email}: ${sendErr.message}`);
        log('Send failed', { email: user.email, error: sendErr.message });
      } else {
        sent++;
      }
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

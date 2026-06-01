import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { corsHeaders, requireServiceRole } from "../_shared/internal-auth.ts";

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[SEND-TRIAL-WARNINGS] ${step}${detailsStr}`);
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  const unauth = requireServiceRole(req);
  if (unauth) return unauth;

  try {
    logStep("Function started");


    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    let totalSent = 0;

    const sendEmail = async (to: string, subject: string, html: string, label: string) => {
      const messageId = crypto.randomUUID();
      const { error } = await supabaseClient.rpc('enqueue_email', {
        queue_name: 'transactional_emails',
        payload: {
          message_id: messageId,
          to,
          from: `SalesOS <noreply@notify.bdotindustries.com>`,
          sender_domain: 'notify.bdotindustries.com',
          subject,
          html,
          text: subject,
          purpose: 'transactional',
          label,
          idempotency_key: `${label}-${to}-${Date.now()}`,
          queued_at: new Date().toISOString(),
        },
      });
      if (error) throw new Error(`Failed to enqueue email: ${error.message}`);
      await supabaseClient.from('email_send_log').insert({ message_id: messageId, template_name: label, recipient_email: to, status: 'pending' });
    };

    const upgradeUrl = "https://salesos.alephwavex.io/pricing";

    // 7-day warnings
    const { data: trials7d, error: error7d } = await supabaseClient.rpc('get_expiring_trials', { _days_until_expiry: 7 });
    if (!error7d && trials7d?.length > 0) {
      logStep("Found 7-day expiring trials", { count: trials7d.length });
      for (const trial of trials7d) {
        const { data: sub } = await supabaseClient.from('subscriptions').select('trial_warning_7d_sent').eq('user_id', trial.user_id).single();
        if (!sub?.trial_warning_7d_sent) {
          try {
            await sendEmail(trial.email, "Your Trial Expires in 7 Days",
              `<h1>Hi ${trial.full_name || 'there'}!</h1><p>Your SalesOS trial will expire in <strong>7 days</strong> on ${new Date(trial.trial_end_date).toLocaleDateString()}.</p><p>To continue using SalesOS, please upgrade your account.</p><p><a href="${upgradeUrl}" style="background-color: #8B5CF6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">Upgrade Now</a></p><p>Best regards,<br>The SalesOS Team</p>`,
              'trial-warning-7d');
            await supabaseClient.from('subscriptions').update({ trial_warning_7d_sent: true }).eq('user_id', trial.user_id);
            totalSent++;
          } catch (err) { logStep("ERROR sending 7-day warning", { email: trial.email, error: err }); }
        }
      }
    }

    // 3-day warnings
    const { data: trials3d, error: error3d } = await supabaseClient.rpc('get_expiring_trials', { _days_until_expiry: 3 });
    if (!error3d && trials3d?.length > 0) {
      for (const trial of trials3d) {
        const { data: sub } = await supabaseClient.from('subscriptions').select('trial_warning_3d_sent').eq('user_id', trial.user_id).single();
        if (!sub?.trial_warning_3d_sent) {
          try {
            await sendEmail(trial.email, "⚠️ Your Trial Expires in 3 Days",
              `<h1>Hi ${trial.full_name || 'there'}!</h1><p>Your SalesOS trial will expire in <strong>3 days</strong> on ${new Date(trial.trial_end_date).toLocaleDateString()}.</p><p>Don't lose access! Upgrade now.</p><p><a href="${upgradeUrl}" style="background-color: #8B5CF6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">Upgrade Now</a></p><p>Best regards,<br>The SalesOS Team</p>`,
              'trial-warning-3d');
            await supabaseClient.from('subscriptions').update({ trial_warning_3d_sent: true }).eq('user_id', trial.user_id);
            totalSent++;
          } catch (err) { logStep("ERROR sending 3-day warning", { email: trial.email, error: err }); }
        }
      }
    }

    // 1-day warnings
    const { data: trials1d, error: error1d } = await supabaseClient.rpc('get_expiring_trials', { _days_until_expiry: 1 });
    if (!error1d && trials1d?.length > 0) {
      for (const trial of trials1d) {
        const { data: sub } = await supabaseClient.from('subscriptions').select('trial_warning_1d_sent').eq('user_id', trial.user_id).single();
        if (!sub?.trial_warning_1d_sent) {
          try {
            await sendEmail(trial.email, "🚨 Final Notice: Your Trial Expires Tomorrow",
              `<h1>Hi ${trial.full_name || 'there'}!</h1><p>Your SalesOS trial will expire <strong>tomorrow</strong> on ${new Date(trial.trial_end_date).toLocaleDateString()}.</p><p>This is your last chance to upgrade!</p><p><a href="${upgradeUrl}" style="background-color: #DC2626; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">Upgrade Now - Last Chance!</a></p><p>Best regards,<br>The SalesOS Team</p>`,
              'trial-warning-1d');
            await supabaseClient.from('subscriptions').update({ trial_warning_1d_sent: true }).eq('user_id', trial.user_id);
            totalSent++;
          } catch (err) { logStep("ERROR sending 1-day warning", { email: trial.email, error: err }); }
        }
      }
    }

    logStep("Completed", { totalSent });
    return new Response(JSON.stringify({ success: true, message: `Sent ${totalSent} trial warning emails`, emails_sent: totalSent }), { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("ERROR", { message: errorMessage });
    return new Response(JSON.stringify({ error: errorMessage }), { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 });
  }
});

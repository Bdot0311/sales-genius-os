import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[SEND-TRIAL-WARNINGS] ${step}${detailsStr}`);
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    logStep("Function started");

    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    if (!RESEND_API_KEY) {
      throw new Error("RESEND_API_KEY is not configured");
    }

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    let totalSent = 0;

    const sendEmail = async (to: string, subject: string, html: string) => {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${RESEND_API_KEY}`,
        },
        body: JSON.stringify({
          from: "SalesOS <onboarding@resend.dev>",
          to: [to],
          subject,
          html,
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Failed to send email: ${error}`);
      }

      return response.json();
    };

    // Check and send 7-day warnings
    const { data: trials7d, error: error7d } = await supabaseClient.rpc('get_expiring_trials', {
      _days_until_expiry: 7
    });

    if (error7d) {
      logStep("ERROR fetching 7-day trials", { error: error7d.message });
    } else if (trials7d && trials7d.length > 0) {
      logStep("Found 7-day expiring trials", { count: trials7d.length });
      
      for (const trial of trials7d) {
        // Check if warning already sent
        const { data: sub } = await supabaseClient
          .from('subscriptions')
          .select('trial_warning_7d_sent')
          .eq('user_id', trial.user_id)
          .single();

        if (!sub?.trial_warning_7d_sent) {
          try {
            await sendEmail(
              trial.email,
              "Your Trial Expires in 7 Days",
              `
                <h1>Hi ${trial.full_name || 'there'}!</h1>
                <p>Your SalesOS trial will expire in <strong>7 days</strong> on ${new Date(trial.trial_end_date).toLocaleDateString()}.</p>
                <p>To continue using SalesOS without interruption, please upgrade your account to a paid plan.</p>
                <p><a href="${Deno.env.get("SUPABASE_URL")?.replace('.supabase.co', '.lovableproject.com')}/pricing" style="background-color: #8B5CF6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">Upgrade Now</a></p>
                <p>Best regards,<br>The SalesOS Team</p>
              `
            );

            // Mark as sent
            await supabaseClient
              .from('subscriptions')
              .update({ trial_warning_7d_sent: true })
              .eq('user_id', trial.user_id);

            totalSent++;
            logStep("Sent 7-day warning", { email: trial.email });
          } catch (err) {
            logStep("ERROR sending 7-day warning", { email: trial.email, error: err });
          }
        }
      }
    }

    // Check and send 3-day warnings
    const { data: trials3d, error: error3d } = await supabaseClient.rpc('get_expiring_trials', {
      _days_until_expiry: 3
    });

    if (!error3d && trials3d && trials3d.length > 0) {
      logStep("Found 3-day expiring trials", { count: trials3d.length });
      
      for (const trial of trials3d) {
        const { data: sub } = await supabaseClient
          .from('subscriptions')
          .select('trial_warning_3d_sent')
          .eq('user_id', trial.user_id)
          .single();

        if (!sub?.trial_warning_3d_sent) {
          try {
            await sendEmail(
              trial.email,
              "⚠️ Your Trial Expires in 3 Days",
              `
                <h1>Hi ${trial.full_name || 'there'}!</h1>
                <p>Your SalesOS trial will expire in <strong>3 days</strong> on ${new Date(trial.trial_end_date).toLocaleDateString()}.</p>
                <p>Don't lose access to your leads and data! Upgrade now to keep everything running smoothly.</p>
                <p><a href="${Deno.env.get("SUPABASE_URL")?.replace('.supabase.co', '.lovableproject.com')}/pricing" style="background-color: #8B5CF6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">Upgrade Now</a></p>
                <p>Best regards,<br>The SalesOS Team</p>
              `
            );

            await supabaseClient
              .from('subscriptions')
              .update({ trial_warning_3d_sent: true })
              .eq('user_id', trial.user_id);

            totalSent++;
            logStep("Sent 3-day warning", { email: trial.email });
          } catch (err) {
            logStep("ERROR sending 3-day warning", { email: trial.email, error: err });
          }
        }
      }
    }

    // Check and send 1-day warnings
    const { data: trials1d, error: error1d } = await supabaseClient.rpc('get_expiring_trials', {
      _days_until_expiry: 1
    });

    if (!error1d && trials1d && trials1d.length > 0) {
      logStep("Found 1-day expiring trials", { count: trials1d.length });
      
      for (const trial of trials1d) {
        const { data: sub } = await supabaseClient
          .from('subscriptions')
          .select('trial_warning_1d_sent')
          .eq('user_id', trial.user_id)
          .single();

        if (!sub?.trial_warning_1d_sent) {
          try {
            await sendEmail(
              trial.email,
              "🚨 Final Notice: Your Trial Expires Tomorrow",
              `
                <h1>Hi ${trial.full_name || 'there'}!</h1>
                <p>Your SalesOS trial will expire <strong>tomorrow</strong> on ${new Date(trial.trial_end_date).toLocaleDateString()}.</p>
                <p>This is your last chance to upgrade and maintain access to your account!</p>
                <p><a href="${Deno.env.get("SUPABASE_URL")?.replace('.supabase.co', '.lovableproject.com')}/pricing" style="background-color: #DC2626; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">Upgrade Now - Last Chance!</a></p>
                <p>Best regards,<br>The SalesOS Team</p>
              `
            );

            await supabaseClient
              .from('subscriptions')
              .update({ trial_warning_1d_sent: true })
              .eq('user_id', trial.user_id);

            totalSent++;
            logStep("Sent 1-day warning", { email: trial.email });
          } catch (err) {
            logStep("ERROR sending 1-day warning", { email: trial.email, error: err });
          }
        }
      }
    }

    logStep("Completed", { totalSent });

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `Sent ${totalSent} trial warning emails`,
        emails_sent: totalSent
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("ERROR", { message: errorMessage });
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
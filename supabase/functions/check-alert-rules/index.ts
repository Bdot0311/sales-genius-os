import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { Resend } from "https://esm.sh/resend@2.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[CHECK-ALERT-RULES] ${step}${detailsStr}`);
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    logStep("Function started");

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

    // Get all active alert rules
    const { data: alertRules, error: rulesError } = await supabaseClient
      .from("alert_rules")
      .select(`
        *,
        profiles!inner(email, full_name)
      `)
      .eq("is_active", true);

    if (rulesError) throw rulesError;

    logStep("Found active alert rules", { count: alertRules?.length });

    const triggeredAlerts = [];

    for (const rule of alertRules || []) {
      const timeWindowStart = new Date(Date.now() - rule.time_window_minutes * 60 * 1000).toISOString();
      let currentValue = 0;
      let shouldTrigger = false;

      // Calculate current metric value based on type
      if (rule.metric_type === 'error_rate') {
        // Get API usage for user
        const { data: apiKeys } = await supabaseClient
          .from("api_keys")
          .select("id")
          .eq("user_id", rule.user_id);

        const { data: usage } = await supabaseClient
          .from("api_usage_log")
          .select("status_code")
          .in("api_key_id", apiKeys?.map(k => k.id) || [])
          .gte("created_at", timeWindowStart);

        const total = usage?.length || 0;
        const errors = usage?.filter(u => u.status_code && u.status_code >= 400).length || 0;
        currentValue = total > 0 ? (errors / total) * 100 : 0;

      } else if (rule.metric_type === 'response_time') {
        const { data: apiKeys } = await supabaseClient
          .from("api_keys")
          .select("id")
          .eq("user_id", rule.user_id);

        const { data: usage } = await supabaseClient
          .from("api_usage_log")
          .select("response_time_ms")
          .in("api_key_id", apiKeys?.map(k => k.id) || [])
          .gte("created_at", timeWindowStart);

        currentValue = usage && usage.length > 0
          ? usage.reduce((sum, u) => sum + (u.response_time_ms || 0), 0) / usage.length
          : 0;

      } else if (rule.metric_type === 'request_volume') {
        const { data: apiKeys } = await supabaseClient
          .from("api_keys")
          .select("id")
          .eq("user_id", rule.user_id);

        const { data: usage } = await supabaseClient
          .from("api_usage_log")
          .select("id")
          .in("api_key_id", apiKeys?.map(k => k.id) || [])
          .gte("created_at", timeWindowStart);

        currentValue = usage?.length || 0;

      } else if (rule.metric_type === 'webhook_failure') {
        const { data: webhooks } = await supabaseClient
          .from("webhooks")
          .select("id")
          .eq("user_id", rule.user_id);

        const { data: deliveries } = await supabaseClient
          .from("webhook_deliveries")
          .select("status")
          .in("webhook_id", webhooks?.map(w => w.id) || [])
          .gte("created_at", timeWindowStart);

        const total = deliveries?.length || 0;
        const failed = deliveries?.filter(d => d.status === 'failed').length || 0;
        currentValue = total > 0 ? (failed / total) * 100 : 0;
      }

      // Check if threshold is met
      if (rule.comparison_operator === 'greater_than' && currentValue > rule.threshold_value) {
        shouldTrigger = true;
      } else if (rule.comparison_operator === 'less_than' && currentValue < rule.threshold_value) {
        shouldTrigger = true;
      } else if (rule.comparison_operator === 'equals' && Math.abs(currentValue - Number(rule.threshold_value)) < 0.01) {
        shouldTrigger = true;
      }

      if (shouldTrigger) {
        logStep("Alert triggered", { ruleId: rule.id, currentValue, threshold: rule.threshold_value });

        // Send email notification
        if (rule.notification_channels.includes('email')) {
          const emailHtml = `
            <!DOCTYPE html>
            <html>
              <head>
                <style>
                  body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                  .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                  .header { background: #EF4444; color: white; padding: 30px; border-radius: 8px 8px 0 0; text-align: center; }
                  .content { background: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px; }
                  .metric { background: white; padding: 20px; margin: 15px 0; border-radius: 8px; border-left: 4px solid #EF4444; }
                  .value { font-size: 32px; font-weight: bold; color: #EF4444; }
                  .button { background: #8B5CF6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; margin-top: 20px; }
                </style>
              </head>
              <body>
                <div class="container">
                  <div class="header">
                    <h1>⚠️ Alert Triggered</h1>
                    <p>${rule.name}</p>
                  </div>
                  <div class="content">
                    <p>Hello ${rule.profiles.full_name || 'there'},</p>
                    <p>Your custom alert rule has been triggered:</p>

                    <div class="metric">
                      <h3>${rule.metric_type.replace(/_/g, ' ').toUpperCase()}</h3>
                      <div class="value">${currentValue.toFixed(2)}</div>
                      <p>Threshold: ${rule.threshold_value} (${rule.comparison_operator.replace(/_/g, ' ')})</p>
                      <p>Time window: ${rule.time_window_minutes} minutes</p>
                    </div>

                    <a href="${Deno.env.get("SUPABASE_URL")?.replace('https://', 'https://app.')}/settings?tab=monitoring" class="button">
                      View Dashboard
                    </a>
                  </div>
                </div>
              </body>
            </html>
          `;

          await resend.emails.send({
            from: "SalesOS Alerts <onboarding@resend.dev>",
            to: [rule.profiles.email],
            subject: `⚠️ Alert: ${rule.name}`,
            html: emailHtml,
          });
        }

        // Send webhook notification
        if (rule.notification_channels.includes('webhook') && rule.notification_webhook_url) {
          await fetch(rule.notification_webhook_url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              alert_name: rule.name,
              metric_type: rule.metric_type,
              current_value: currentValue,
              threshold: rule.threshold_value,
              comparison: rule.comparison_operator,
              triggered_at: new Date().toISOString(),
            }),
          });
        }

        // Update alert rule
        await supabaseClient
          .from("alert_rules")
          .update({
            last_triggered_at: new Date().toISOString(),
            trigger_count: rule.trigger_count + 1,
          })
          .eq("id", rule.id);

        triggeredAlerts.push({
          ruleId: rule.id,
          ruleName: rule.name,
          currentValue,
        });
      }
    }

    logStep("Check completed", { triggeredCount: triggeredAlerts.length });

    return new Response(
      JSON.stringify({
        success: true,
        checkedRules: alertRules?.length || 0,
        triggeredAlerts: triggeredAlerts.length,
        alerts: triggeredAlerts,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("ERROR", { message: errorMessage });
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});

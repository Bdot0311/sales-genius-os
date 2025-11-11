import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { Resend } from "npm:resend@2.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[WEEKLY-REPORT] ${step}${detailsStr}`);
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

    // Get all Elite users
    const { data: eliteUsers, error: usersError } = await supabaseClient
      .from("subscriptions")
      .select(`
        user_id,
        profiles!inner(email, full_name)
      `)
      .eq("plan", "elite")
      .eq("status", "active");

    if (usersError) throw usersError;

    logStep("Found Elite users", { count: eliteUsers?.length });

    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const reports = await Promise.all(
      (eliteUsers || []).map(async (user: any) => {
        try {
          // Get API usage stats
          const { data: apiKeys } = await supabaseClient
            .from("api_keys")
            .select("id, name, total_requests")
            .eq("user_id", user.user_id);

          const { data: apiUsage } = await supabaseClient
            .from("api_usage_log")
            .select("*")
            .in("api_key_id", apiKeys?.map(k => k.id) || [])
            .gte("created_at", oneWeekAgo);

          // Get webhook stats
          const { data: webhooks } = await supabaseClient
            .from("webhooks")
            .select("id, name, total_triggers")
            .eq("user_id", user.user_id);

          const { data: webhookDeliveries } = await supabaseClient
            .from("webhook_deliveries")
            .select("status")
            .in("webhook_id", webhooks?.map(w => w.id) || [])
            .gte("created_at", oneWeekAgo);

          // Get team activity
          const { data: teamActivity } = await supabaseClient
            .from("team_activity_log")
            .select("action_type, entity_type")
            .eq("team_owner_id", user.user_id)
            .gte("created_at", oneWeekAgo);

          const totalApiRequests = apiUsage?.length || 0;
          const totalWebhooks = webhookDeliveries?.length || 0;
          const successfulWebhooks = webhookDeliveries?.filter(d => d.status === 'success').length || 0;
          const webhookSuccessRate = totalWebhooks > 0 ? (successfulWebhooks / totalWebhooks * 100).toFixed(1) : "0";
          const teamActions = teamActivity?.length || 0;

          const avgResponseTime = apiUsage?.length 
            ? (apiUsage.reduce((sum, log) => sum + (log.response_time_ms || 0), 0) / apiUsage.length).toFixed(0)
            : "0";

          const emailHtml = `
            <!DOCTYPE html>
            <html>
              <head>
                <style>
                  body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                  .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                  .header { background: linear-gradient(135deg, #8B5CF6, #6366F1); color: white; padding: 30px; border-radius: 8px 8px 0 0; text-align: center; }
                  .content { background: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px; }
                  .stat-card { background: white; padding: 20px; margin: 15px 0; border-radius: 8px; border-left: 4px solid #8B5CF6; }
                  .stat-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin: 20px 0; }
                  .stat { text-align: center; background: white; padding: 15px; border-radius: 8px; }
                  .stat-value { font-size: 32px; font-weight: bold; color: #8B5CF6; }
                  .stat-label { font-size: 12px; color: #6b7280; text-transform: uppercase; margin-top: 5px; }
                  .section-title { font-size: 18px; font-weight: bold; margin: 25px 0 15px; color: #1f2937; }
                  .button { background: #8B5CF6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; margin-top: 20px; }
                  .footer { text-align: center; margin-top: 30px; font-size: 12px; color: #6b7280; }
                </style>
              </head>
              <body>
                <div class="container">
                  <div class="header">
                    <h1>📊 Weekly Performance Report</h1>
                    <p>Your SalesOS summary for the past week</p>
                  </div>
                  <div class="content">
                    <p>Hello ${user.profiles.full_name || 'there'},</p>
                    <p>Here's your weekly performance summary:</p>

                    <div class="stat-grid">
                      <div class="stat">
                        <div class="stat-value">${totalApiRequests.toLocaleString()}</div>
                        <div class="stat-label">API Requests</div>
                      </div>
                      <div class="stat">
                        <div class="stat-value">${avgResponseTime}ms</div>
                        <div class="stat-label">Avg Response Time</div>
                      </div>
                      <div class="stat">
                        <div class="stat-value">${totalWebhooks.toLocaleString()}</div>
                        <div class="stat-label">Webhook Deliveries</div>
                      </div>
                      <div class="stat">
                        <div class="stat-value">${webhookSuccessRate}%</div>
                        <div class="stat-label">Success Rate</div>
                      </div>
                    </div>

                    <div class="stat-card">
                      <h3 class="section-title">🔑 API Activity</h3>
                      ${apiKeys?.map(key => `
                        <p><strong>${key.name}:</strong> ${key.total_requests.toLocaleString()} total requests</p>
                      `).join('') || '<p>No API activity this week</p>'}
                    </div>

                    <div class="stat-card">
                      <h3 class="section-title">🔔 Webhook Performance</h3>
                      ${webhooks?.map(webhook => `
                        <p><strong>${webhook.name}:</strong> ${webhook.total_triggers} triggers</p>
                      `).join('') || '<p>No webhook activity this week</p>'}
                    </div>

                    <div class="stat-card">
                      <h3 class="section-title">👥 Team Activity</h3>
                      <p><strong>${teamActions}</strong> actions performed by your team this week</p>
                    </div>

                    <a href="${Deno.env.get("SUPABASE_URL")?.replace('https://', 'https://app.')}/settings" class="button">
                      View Detailed Analytics
                    </a>

                    <div class="footer">
                      <p>This is your weekly automated report from SalesOS</p>
                      <p>You're receiving this because you're an Elite plan subscriber</p>
                    </div>
                  </div>
                </div>
              </body>
            </html>
          `;

          await resend.emails.send({
            from: "SalesOS Reports <onboarding@resend.dev>",
            to: [user.profiles.email],
            subject: "📊 Your Weekly SalesOS Performance Report",
            html: emailHtml,
          });

          logStep("Report sent", { userId: user.user_id });

          return { userId: user.user_id, success: true };
        } catch (error) {
          logStep("Error sending report", { userId: user.user_id, error });
          return { userId: user.user_id, success: false, error };
        }
      })
    );

    logStep("All reports sent", { results: reports });

    return new Response(
      JSON.stringify({ message: "Weekly reports sent", results: reports }),
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

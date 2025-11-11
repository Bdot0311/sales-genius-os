import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { Resend } from "https://esm.sh/resend@2.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[SUSPICIOUS-ACTIVITY] ${step}${detailsStr}`);
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

    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const alerts: any[] = [];

    // Get all users with Elite plan
    const { data: users } = await supabaseClient
      .from("subscriptions")
      .select("user_id, profiles!inner(email, full_name)")
      .eq("plan", "elite")
      .eq("status", "active");

    for (const user of users || []) {
      const suspiciousPatterns = [];

      // Pattern 1: Multiple failed API requests (>50 in the last hour)
      const { data: apiKeys } = await supabaseClient
        .from("api_keys")
        .select("id, name")
        .eq("user_id", user.user_id);

      const { data: failedRequests } = await supabaseClient
        .from("api_usage_log")
        .select("*")
        .in("api_key_id", apiKeys?.map(k => k.id) || [])
        .gte("status_code", 400)
        .gte("created_at", oneHourAgo);

      if (failedRequests && failedRequests.length > 50) {
        suspiciousPatterns.push({
          type: "high_error_rate",
          severity: "high",
          description: `${failedRequests.length} failed API requests in the last hour`,
          count: failedRequests.length,
        });
      }

      // Pattern 2: Unusual access times (activity between 2 AM - 5 AM)
      const { data: nightActivity } = await supabaseClient
        .from("audit_logs")
        .select("*")
        .eq("user_id", user.user_id)
        .gte("created_at", oneHourAgo);

      const suspiciousHourActivity = nightActivity?.filter(log => {
        const hour = new Date(log.created_at).getHours();
        return hour >= 2 && hour <= 5;
      });

      if (suspiciousHourActivity && suspiciousHourActivity.length > 10) {
        suspiciousPatterns.push({
          type: "unusual_access_time",
          severity: "medium",
          description: `${suspiciousHourActivity.length} actions performed during unusual hours (2 AM - 5 AM)`,
          count: suspiciousHourActivity.length,
        });
      }

      // Pattern 3: Multiple deletions in short time
      const { data: deletions } = await supabaseClient
        .from("audit_logs")
        .select("*")
        .eq("user_id", user.user_id)
        .eq("action", "deleted")
        .gte("created_at", oneHourAgo);

      if (deletions && deletions.length > 20) {
        suspiciousPatterns.push({
          type: "mass_deletion",
          severity: "high",
          description: `${deletions.length} records deleted in the last hour`,
          count: deletions.length,
        });
      }

      // Pattern 4: Rapid API key creation
      const { data: newApiKeys } = await supabaseClient
        .from("audit_logs")
        .select("*")
        .eq("user_id", user.user_id)
        .eq("entity_type", "api_keys")
        .eq("action", "created")
        .gte("created_at", oneHourAgo);

      if (newApiKeys && newApiKeys.length > 5) {
        suspiciousPatterns.push({
          type: "rapid_api_key_creation",
          severity: "medium",
          description: `${newApiKeys.length} API keys created in the last hour`,
          count: newApiKeys.length,
        });
      }

      // Send alert if suspicious patterns detected
      if (suspiciousPatterns.length > 0) {
        const highSeverity = suspiciousPatterns.some(p => p.severity === "high");

        const emailHtml = `
          <!DOCTYPE html>
          <html>
            <head>
              <style>
                body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                .header { background: ${highSeverity ? '#EF4444' : '#F59E0B'}; color: white; padding: 30px; border-radius: 8px 8px 0 0; text-align: center; }
                .content { background: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px; }
                .alert-box { background: white; padding: 20px; margin: 15px 0; border-left: 4px solid ${highSeverity ? '#EF4444' : '#F59E0B'}; border-radius: 4px; }
                .severity-high { color: #EF4444; font-weight: bold; }
                .severity-medium { color: #F59E0B; font-weight: bold; }
                .button { background: #8B5CF6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; margin-top: 20px; }
                .footer { text-align: center; margin-top: 30px; font-size: 12px; color: #6b7280; }
              </style>
            </head>
            <body>
              <div class="container">
                <div class="header">
                  <h1>🚨 Security Alert</h1>
                  <p>Suspicious activity detected on your account</p>
                </div>
                <div class="content">
                  <p>Hello ${user.profiles.full_name || 'there'},</p>
                  <p>Our security system has detected ${suspiciousPatterns.length} suspicious pattern(s) on your account:</p>

                  ${suspiciousPatterns.map(pattern => `
                    <div class="alert-box">
                      <div class="severity-${pattern.severity}">
                        ${pattern.severity.toUpperCase()} SEVERITY
                      </div>
                      <h3>${pattern.type.replace(/_/g, ' ').toUpperCase()}</h3>
                      <p>${pattern.description}</p>
                    </div>
                  `).join('')}

                  <h3>Recommended Actions:</h3>
                  <ul>
                    <li>Review your recent audit logs for unauthorized access</li>
                    <li>Check if all team members have appropriate permissions</li>
                    <li>Rotate API keys if you suspect unauthorized access</li>
                    <li>Review and update your security settings</li>
                    <li>Contact support if you need assistance</li>
                  </ul>

                  <a href="${Deno.env.get("SUPABASE_URL")?.replace('https://', 'https://app.')}/settings?tab=audit" class="button">
                    Review Audit Logs
                  </a>

                  <div class="footer">
                    <p>This is an automated security alert from SalesOS</p>
                    <p>If you believe this is a false positive, you can safely ignore this message</p>
                  </div>
                </div>
              </div>
            </body>
          </html>
        `;

        await resend.emails.send({
          from: "SalesOS Security <onboarding@resend.dev>",
          to: [user.profiles.email],
          subject: `🚨 Security Alert: Suspicious Activity Detected`,
          html: emailHtml,
        });

        alerts.push({
          userId: user.user_id,
          patterns: suspiciousPatterns,
        });

        logStep("Alert sent", { userId: user.user_id, patternCount: suspiciousPatterns.length });
      }
    }

    logStep("Scan completed", { alertCount: alerts.length });

    return new Response(
      JSON.stringify({ 
        message: "Suspicious activity scan completed",
        alertsSent: alerts.length,
        alerts 
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

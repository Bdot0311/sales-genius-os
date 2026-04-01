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
    const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    const alerts: any[] = [];

    // ===========================================
    // PATTERN 1: Check for multiple failed logins
    // ===========================================
    const { data: failedLogins } = await supabaseClient
      .from("login_history")
      .select("user_email, ip_address, created_at")
      .eq("status", "failed")
      .gte("created_at", fifteenMinutesAgo);

    // Group by email/IP to find brute force attempts
    const loginAttemptsByEmail: Record<string, { count: number; ips: Set<string>; lastAttempt: string }> = {};
    const loginAttemptsByIp: Record<string, { count: number; emails: Set<string>; lastAttempt: string }> = {};

    for (const login of failedLogins || []) {
      // Group by email
      if (login.user_email) {
        if (!loginAttemptsByEmail[login.user_email]) {
          loginAttemptsByEmail[login.user_email] = { count: 0, ips: new Set(), lastAttempt: '' };
        }
        loginAttemptsByEmail[login.user_email].count++;
        if (login.ip_address) loginAttemptsByEmail[login.user_email].ips.add(login.ip_address);
        loginAttemptsByEmail[login.user_email].lastAttempt = login.created_at;
      }

      // Group by IP
      if (login.ip_address) {
        if (!loginAttemptsByIp[login.ip_address]) {
          loginAttemptsByIp[login.ip_address] = { count: 0, emails: new Set(), lastAttempt: '' };
        }
        loginAttemptsByIp[login.ip_address].count++;
        if (login.user_email) loginAttemptsByIp[login.ip_address].emails.add(login.user_email);
        loginAttemptsByIp[login.ip_address].lastAttempt = login.created_at;
      }
    }

    // Alert on 5+ failed attempts per email
    for (const [email, data] of Object.entries(loginAttemptsByEmail)) {
      if (data.count >= 5) {
        alerts.push({
          type: "multiple_failed_logins",
          severity: data.count >= 10 ? "critical" : "error",
          target: email,
          details: {
            failed_attempts: data.count,
            unique_ips: data.ips.size,
            ips: Array.from(data.ips).slice(0, 5),
            last_attempt: data.lastAttempt,
          },
        });
      }
    }

    // Alert on single IP trying multiple accounts (credential stuffing)
    for (const [ip, data] of Object.entries(loginAttemptsByIp)) {
      if (data.emails.size >= 3) {
        alerts.push({
          type: "credential_stuffing_attempt",
          severity: "critical",
          target: ip,
          details: {
            unique_emails_attempted: data.emails.size,
            total_attempts: data.count,
            emails: Array.from(data.emails).slice(0, 5),
            last_attempt: data.lastAttempt,
          },
        });
      }
    }

    // ===========================================
    // PATTERN 2: Check security_events for rate limit abuse
    // ===========================================
    const { data: rateLimitEvents } = await supabaseClient
      .from("security_events")
      .select("ip_address, event_type, created_at, details")
      .in("event_type", ["rate_limit_exceeded", "password_reset_rate_limit"])
      .gte("created_at", oneHourAgo);

    const rateLimitsByIp: Record<string, number> = {};
    for (const event of rateLimitEvents || []) {
      if (event.ip_address) {
        rateLimitsByIp[event.ip_address] = (rateLimitsByIp[event.ip_address] || 0) + 1;
      }
    }

    for (const [ip, count] of Object.entries(rateLimitsByIp)) {
      if (count >= 5) {
        alerts.push({
          type: "persistent_rate_limit_abuse",
          severity: count >= 10 ? "critical" : "error",
          target: ip,
          details: {
            rate_limit_hits: count,
            time_window: "1 hour",
          },
        });
      }
    }

    // ===========================================
    // PATTERN 3: Check for bot detection events
    // ===========================================
    const { data: botEvents } = await supabaseClient
      .from("security_events")
      .select("ip_address, details")
      .eq("event_type", "bot_detected")
      .gte("created_at", oneHourAgo);

    if (botEvents && botEvents.length >= 3) {
      const uniqueIps = new Set(botEvents.map(e => e.ip_address).filter(Boolean));
      alerts.push({
        type: "bot_attack_detected",
        severity: "error",
        target: "application",
        details: {
          bot_attempts: botEvents.length,
          unique_ips: uniqueIps.size,
          ips: Array.from(uniqueIps).slice(0, 5),
        },
      });
    }

    // ===========================================
    // Check Pro users for additional patterns
    // ===========================================
    const { data: users } = await supabaseClient
      .from("subscriptions")
      .select("user_id, profiles!inner(email, full_name)")
      .eq("plan", "pro")
      .eq("status", "active");

    for (const user of users || []) {
      const suspiciousPatterns = [];

      // Pattern: Multiple failed API requests (>50 in the last hour)
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

      // Pattern: Unusual access times (activity between 2 AM - 5 AM)
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

      // Pattern: Multiple deletions in short time
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

      // Pattern: Rapid API key creation
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

      // Send alert if suspicious patterns detected for this user
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
                  <p>Hello ${(user.profiles as any)?.full_name || 'there'},</p>
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
          to: [(user.profiles as any)?.email],
          subject: `🚨 Security Alert: Suspicious Activity Detected`,
          html: emailHtml,
        });

        alerts.push({
          userId: user.user_id,
          email: (user.profiles as any)?.email,
          patterns: suspiciousPatterns,
        });

        logStep("User alert sent", { userId: user.user_id, patternCount: suspiciousPatterns.length });
      }
    }

    // ===========================================
    // Send admin alerts for critical platform-wide events
    // ===========================================
    const criticalAlerts = alerts.filter(a => 
      a.severity === "critical" || 
      a.type === "credential_stuffing_attempt" ||
      a.type === "bot_attack_detected"
    );

    if (criticalAlerts.length > 0) {
      // Get admin emails
      const { data: adminRoles } = await supabaseClient
        .from("user_roles")
        .select("user_id")
        .eq("role", "admin");

      const adminIds = adminRoles?.map(r => r.user_id) || [];
      
      const { data: adminProfiles } = await supabaseClient
        .from("profiles")
        .select("email")
        .in("id", adminIds);

      const adminEmails = adminProfiles?.map(p => p.email).filter(Boolean) || [];

      if (adminEmails.length > 0) {
        const adminEmailHtml = `
          <!DOCTYPE html>
          <html>
            <head>
              <style>
                body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                .header { background: #DC2626; color: white; padding: 30px; border-radius: 8px 8px 0 0; text-align: center; }
                .content { background: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px; }
                .alert-box { background: white; padding: 20px; margin: 15px 0; border-left: 4px solid #DC2626; border-radius: 4px; }
                .footer { text-align: center; margin-top: 30px; font-size: 12px; color: #6b7280; }
              </style>
            </head>
            <body>
              <div class="container">
                <div class="header">
                  <h1>🚨 CRITICAL Security Alert</h1>
                  <p>Platform-wide security threats detected</p>
                </div>
                <div class="content">
                  <p>The following critical security events require immediate attention:</p>

                  ${criticalAlerts.map(alert => `
                    <div class="alert-box">
                      <h3>${alert.type.replace(/_/g, ' ').toUpperCase()}</h3>
                      <p>Target: ${alert.target}</p>
                      <pre style="background: #f3f4f6; padding: 10px; border-radius: 4px; overflow-x: auto;">
${JSON.stringify(alert.details, null, 2)}
                      </pre>
                    </div>
                  `).join('')}

                  <h3>Immediate Actions Required:</h3>
                  <ul>
                    <li>Review security logs immediately</li>
                    <li>Consider blocking suspicious IP addresses</li>
                    <li>Check for any successful unauthorized access</li>
                    <li>Enable additional security measures if needed</li>
                  </ul>

                  <p style="color: #6b7280; margin-top: 20px;">
                    Alert generated at: ${new Date().toISOString()}
                  </p>

                  <div class="footer">
                    <p>This is an automated security alert from SalesOS</p>
                  </div>
                </div>
              </div>
            </body>
          </html>
        `;

        await resend.emails.send({
          from: "SalesOS Security <onboarding@resend.dev>",
          to: adminEmails,
          subject: `🚨 [CRITICAL] Platform Security Alert - Immediate Action Required`,
          html: adminEmailHtml,
        });

        logStep("Admin alerts sent", { adminCount: adminEmails.length, criticalAlerts: criticalAlerts.length });
      }
    }

    logStep("Scan completed", { alertCount: alerts.length, criticalCount: criticalAlerts.length });

    return new Response(
      JSON.stringify({ 
        message: "Suspicious activity scan completed",
        alertsSent: alerts.length,
        criticalAlerts: criticalAlerts.length,
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

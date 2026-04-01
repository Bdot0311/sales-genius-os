import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { Resend } from "https://esm.sh/resend@2.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[SECURITY-ALERT] ${step}${detailsStr}`);
};

interface SecurityAlertRequest {
  event_type: string;
  severity: string;
  user_id?: string;
  user_email?: string;
  ip_address?: string;
  details?: Record<string, any>;
}

// Critical events that trigger immediate email alerts
const CRITICAL_EVENTS = [
  'multiple_failed_logins',
  'password_reset_abuse',
  'rate_limit_exceeded',
  'suspicious_ip_access',
  'mass_data_deletion',
  'api_key_compromise',
  'unauthorized_access_attempt',
  'account_lockout',
];

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
    const { event_type, severity, user_id, user_email, ip_address, details }: SecurityAlertRequest = await req.json();

    logStep("Processing alert", { event_type, severity, user_id });

    // Validate required fields
    if (!event_type || !severity) {
      return new Response(
        JSON.stringify({ error: "event_type and severity are required" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    // Log the security event
    await supabaseClient.rpc('log_security_event', {
      _event_type: event_type,
      _severity: severity,
      _user_id: user_id || null,
      _ip_address: ip_address || null,
      _details: details || {},
    });

    // Get admin emails for notifications
    const { data: adminRoles } = await supabaseClient
      .from("user_roles")
      .select("user_id")
      .eq("role", "admin");

    const adminIds = adminRoles?.map(r => r.user_id) || [];
    
    const { data: adminProfiles } = await supabaseClient
      .from("profiles")
      .select("email, full_name")
      .in("id", adminIds);

    const adminEmails = adminProfiles?.map(p => p.email).filter(Boolean) || [];

    // Get user info if user_id provided
    let userInfo = { email: user_email, full_name: 'Unknown User' };
    if (user_id) {
      const { data: profile } = await supabaseClient
        .from("profiles")
        .select("email, full_name")
        .eq("id", user_id)
        .single();
      
      if (profile) {
        userInfo = profile;
      }
    }

    // Determine if this is a critical event that needs immediate notification
    const isCritical = CRITICAL_EVENTS.includes(event_type) || severity === 'critical';
    
    if (!isCritical && severity !== 'error') {
      logStep("Non-critical event, skipping email notification");
      return new Response(
        JSON.stringify({ message: "Event logged, no email notification required" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    // Build email content based on event type
    const eventDescriptions: Record<string, { title: string; description: string; actions: string[] }> = {
      multiple_failed_logins: {
        title: "Multiple Failed Login Attempts",
        description: `Multiple failed login attempts detected for ${userInfo.email || 'a user account'}.`,
        actions: [
          "Review the login history for this account",
          "Consider temporarily locking the account",
          "Check if the IP address is associated with known malicious activity",
          "Contact the user to verify if they are experiencing login issues",
        ],
      },
      password_reset_abuse: {
        title: "Password Reset Abuse Detected",
        description: `Excessive password reset requests detected from IP: ${ip_address || 'Unknown'}.`,
        actions: [
          "Monitor for further suspicious activity from this IP",
          "Consider blocking the IP address temporarily",
          "Review password reset logs for patterns",
        ],
      },
      rate_limit_exceeded: {
        title: "Rate Limit Exceeded",
        description: `API rate limit exceeded from IP: ${ip_address || 'Unknown'}.`,
        actions: [
          "Review API usage patterns",
          "Check if this is legitimate high-volume usage",
          "Consider adjusting rate limits or blocking the IP",
        ],
      },
      suspicious_ip_access: {
        title: "Suspicious IP Access",
        description: `Access from a suspicious or blacklisted IP address detected.`,
        actions: [
          "Block the IP address immediately",
          "Review all activity from this IP",
          "Check for data exfiltration attempts",
        ],
      },
      mass_data_deletion: {
        title: "Mass Data Deletion Detected",
        description: `Large-scale data deletion activity detected for ${userInfo.email || 'a user account'}.`,
        actions: [
          "Review the deleted records immediately",
          "Check if this was authorized activity",
          "Consider restoring from backup if unauthorized",
          "Lock the user account pending investigation",
        ],
      },
      api_key_compromise: {
        title: "Potential API Key Compromise",
        description: `Unusual API key activity suggests potential compromise.`,
        actions: [
          "Rotate the affected API keys immediately",
          "Review all activity associated with the key",
          "Notify the key owner",
          "Check for data access or exfiltration",
        ],
      },
      unauthorized_access_attempt: {
        title: "Unauthorized Access Attempt",
        description: `An attempt to access restricted resources was detected.`,
        actions: [
          "Review access logs for the user/IP",
          "Verify the user's permissions are correct",
          "Consider additional authentication measures",
        ],
      },
      account_lockout: {
        title: "Account Locked",
        description: `An account has been locked due to security concerns.`,
        actions: [
          "Review the reason for lockout",
          "Contact the account owner if legitimate",
          "Investigate the triggering security events",
        ],
      },
    };

    const eventInfo = eventDescriptions[event_type] || {
      title: event_type.replace(/_/g, ' ').toUpperCase(),
      description: `A security event of type "${event_type}" was detected.`,
      actions: ["Review security logs", "Investigate the incident", "Take appropriate action"],
    };

    const severityColors: Record<string, string> = {
      critical: '#DC2626',
      error: '#EF4444',
      warning: '#F59E0B',
      info: '#3B82F6',
    };

    const severityColor = severityColors[severity] || severityColors.warning;

    const emailHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: ${severityColor}; color: white; padding: 30px; border-radius: 8px 8px 0 0; text-align: center; }
            .header h1 { margin: 0 0 10px 0; }
            .header p { margin: 0; opacity: 0.9; }
            .content { background: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px; }
            .alert-box { background: white; padding: 20px; margin: 15px 0; border-left: 4px solid ${severityColor}; border-radius: 4px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
            .severity-badge { display: inline-block; background: ${severityColor}; color: white; padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: bold; text-transform: uppercase; }
            .details-table { width: 100%; border-collapse: collapse; margin-top: 15px; }
            .details-table td { padding: 8px; border-bottom: 1px solid #e5e7eb; }
            .details-table td:first-child { font-weight: bold; width: 140px; color: #6b7280; }
            .actions-list { background: #FEF3C7; padding: 15px 15px 15px 35px; border-radius: 4px; margin-top: 20px; }
            .actions-list li { margin: 8px 0; color: #92400E; }
            .button { background: #8B5CF6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; margin-top: 20px; }
            .footer { text-align: center; margin-top: 30px; font-size: 12px; color: #6b7280; }
            .timestamp { color: #6b7280; font-size: 14px; margin-top: 20px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>🚨 Security Alert</h1>
              <p>${eventInfo.title}</p>
            </div>
            <div class="content">
              <span class="severity-badge">${severity} Severity</span>
              
              <div class="alert-box">
                <p style="margin: 0;">${eventInfo.description}</p>
                
                <table class="details-table">
                  ${user_id ? `<tr><td>User ID</td><td>${user_id}</td></tr>` : ''}
                  ${userInfo.email ? `<tr><td>User Email</td><td>${userInfo.email}</td></tr>` : ''}
                  ${ip_address ? `<tr><td>IP Address</td><td>${ip_address}</td></tr>` : ''}
                  <tr><td>Event Type</td><td>${event_type}</td></tr>
                  <tr><td>Severity</td><td>${severity}</td></tr>
                  ${details ? Object.entries(details).map(([key, value]) => 
                    `<tr><td>${key.replace(/_/g, ' ')}</td><td>${typeof value === 'object' ? JSON.stringify(value) : value}</td></tr>`
                  ).join('') : ''}
                </table>
              </div>

              <h3>Recommended Actions:</h3>
              <ul class="actions-list">
                ${eventInfo.actions.map(action => `<li>${action}</li>`).join('')}
              </ul>

              <p class="timestamp">
                Event detected at: ${new Date().toISOString()}
              </p>

              <div class="footer">
                <p>This is an automated security alert from SalesOS</p>
                <p>Review your security dashboard for more details</p>
              </div>
            </div>
          </div>
        </body>
      </html>
    `;

    // Send to all admins
    const emailRecipients = [...new Set([...adminEmails])].filter(Boolean);
    
    if (emailRecipients.length === 0) {
      logStep("No admin emails found, skipping notification");
      return new Response(
        JSON.stringify({ message: "Event logged, but no admin emails configured" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    logStep("Sending alert emails", { recipients: emailRecipients.length });

    await resend.emails.send({
      from: "SalesOS Security <onboarding@resend.dev>",
      to: emailRecipients,
      subject: `🚨 [${severity.toUpperCase()}] Security Alert: ${eventInfo.title}`,
      html: emailHtml,
    });

    logStep("Alert sent successfully");

    return new Response(
      JSON.stringify({ 
        message: "Security alert sent",
        event_type,
        severity,
        recipients: emailRecipients.length,
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

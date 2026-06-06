import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

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

const CRITICAL_EVENTS = [
  'multiple_failed_logins', 'password_reset_abuse', 'rate_limit_exceeded',
  'suspicious_ip_access', 'mass_data_deletion', 'api_key_compromise',
  'unauthorized_access_attempt', 'account_lockout',
];

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    logStep("Function started");

    // Require service-role bearer token — this is an internal-only endpoint.
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "").trim();
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    if (!token || !serviceKey || token !== serviceKey) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 401,
      });
    }

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      serviceKey,
      { auth: { persistSession: false } }
    );

    const { event_type, severity, user_id, user_email, ip_address, details }: SecurityAlertRequest = await req.json();



    if (!event_type || !severity) {
      return new Response(JSON.stringify({ error: "event_type and severity are required" }), { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 });
    }

    await supabaseClient.rpc('log_security_event', {
      _event_type: event_type, _severity: severity, _user_id: user_id || null,
      _ip_address: ip_address || null, _details: details || {},
    });

    const { data: adminRoles } = await supabaseClient.from("user_roles").select("user_id").eq("role", "admin");
    const adminIds = adminRoles?.map(r => r.user_id) || [];
    const { data: adminProfiles } = await supabaseClient.from("profiles").select("email, full_name").in("id", adminIds);
    const adminEmails = adminProfiles?.map(p => p.email).filter(Boolean) || [];

    let userInfo = { email: user_email, full_name: 'Unknown User' };
    if (user_id) {
      const { data: profile } = await supabaseClient.from("profiles").select("email, full_name").eq("id", user_id).single();
      if (profile) userInfo = profile;
    }

    const isCritical = CRITICAL_EVENTS.includes(event_type) || severity === 'critical';
    if (!isCritical && severity !== 'error') {
      return new Response(JSON.stringify({ message: "Event logged, no email notification required" }), { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 });
    }

    const severityColors: Record<string, string> = { critical: '#DC2626', error: '#EF4444', warning: '#F59E0B', info: '#3B82F6' };
    const severityColor = severityColors[severity] || severityColors.warning;

    const emailHtml = `<!DOCTYPE html><html><head><style>
      body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
      .container { max-width: 600px; margin: 0 auto; padding: 20px; }
      .header { background: ${severityColor}; color: white; padding: 30px; border-radius: 8px 8px 0 0; text-align: center; }
      .content { background: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px; }
      .alert-box { background: white; padding: 20px; margin: 15px 0; border-left: 4px solid ${severityColor}; border-radius: 4px; }
    </style></head><body>
      <div class="container">
        <div class="header"><h1>🚨 Security Alert</h1><p>${event_type.replace(/_/g, ' ').toUpperCase()}</p></div>
        <div class="content">
          <span style="background: ${severityColor}; color: white; padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: bold; text-transform: uppercase;">${severity}</span>
          <div class="alert-box">
            ${user_id ? `<p>User: ${userInfo.email || user_id}</p>` : ''}
            ${ip_address ? `<p>IP: ${ip_address}</p>` : ''}
            <p>Event: ${event_type}</p>
            ${details ? `<pre style="background: #f3f4f6; padding: 10px; border-radius: 4px; overflow-x: auto; font-size: 12px;">${JSON.stringify(details, null, 2)}</pre>` : ''}
          </div>
          <p style="color: #6b7280; font-size: 14px; margin-top: 20px;">Event detected at: ${new Date().toISOString()}</p>
          <p style="text-align: center; font-size: 12px; color: #6b7280; margin-top: 30px;">Automated security alert from SalesOS</p>
        </div>
      </div>
    </body></html>`;

    const NOTIFICATION_EMAIL = Deno.env.get("NOTIFICATION_EMAIL") || "brandon@bdotindustries.com";
    const emailRecipients = [...new Set([...adminEmails, NOTIFICATION_EMAIL])].filter(Boolean);
    
    if (emailRecipients.length === 0) {
      return new Response(JSON.stringify({ message: "Event logged, but no admin emails configured" }), { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 });
    }

    // Send to each admin individually via the queue
    for (const recipient of emailRecipients) {
      const messageId = crypto.randomUUID();
      await supabaseClient.rpc('enqueue_email', {
        queue_name: 'transactional_emails',
        payload: {
          message_id: messageId,
          to: recipient,
          from: `SalesOS Security <noreply@notify.bdotindustries.com>`,
          sender_domain: 'notify.bdotindustries.com',
          subject: `🚨 [${severity.toUpperCase()}] Security Alert: ${event_type.replace(/_/g, ' ')}`,
          html: emailHtml,
          text: `Security Alert: ${event_type} (${severity})`,
          purpose: 'transactional',
          label: 'security-alert',
          idempotency_key: `security-${event_type}-${recipient}-${Date.now()}`,
          queued_at: new Date().toISOString(),
        },
      });
      await supabaseClient.from('email_send_log').insert({
        message_id: messageId, template_name: 'security-alert', recipient_email: recipient, status: 'pending',
      });
    }

    logStep("Alert sent successfully", { recipients: emailRecipients.length });

    return new Response(JSON.stringify({ message: "Security alert sent", event_type, severity, recipients: emailRecipients.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("ERROR", { message: errorMessage });
    return new Response(JSON.stringify({ error: errorMessage }), { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 });
  }
});

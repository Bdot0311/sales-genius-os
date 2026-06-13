import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!token || !serviceKey || token !== serviceKey) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 401,
    });
  }

  try {
    const { email, name } = await req.json();
    
    if (!email || typeof email !== 'string' || !email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
      return new Response(
        JSON.stringify({ error: "Valid email address required" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    console.log("Sending welcome email to:", email);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    const displayName = name || "there";
    const appUrl = Deno.env.get("APP_URL") ?? "https://outreign.io";
    const logoUrl = "https://ghgfjnepvxvxrncmskys.supabase.co/storage/v1/object/public/email-assets/salesos-logo.webp";

    const messageId = crypto.randomUUID();

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Welcome to OutReign</title>
</head>
<body style="margin: 0; padding: 0; background-color: #0a0a0a;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="#0a0a0a" style="background-color: #0a0a0a;">
    <tr>
      <td align="center" bgcolor="#0a0a0a" style="background-color: #0a0a0a; padding: 40px 20px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="540" bgcolor="#141414" style="max-width: 540px; background-color: #141414; border-radius: 16px; border: 1px solid #2a2a2a;">
          <tr>
            <td bgcolor="#9b6dff" align="center" style="background: linear-gradient(135deg, #9b6dff 0%, #7c3aed 100%); padding: 32px 40px; border-radius: 16px 16px 0 0;">
              <img src="${logoUrl}" alt="OutReign" width="56" height="56" style="display: block; border-radius: 12px; margin-bottom: 16px;" />
              <h1 style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #ffffff; margin: 0; font-size: 28px; font-weight: 700;">Welcome to OutReign!</h1>
              <p style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: rgba(255,255,255,0.9); margin: 12px 0 0 0; font-size: 16px;">Your AI-powered sales operating system</p>
            </td>
          </tr>
          <tr>
            <td bgcolor="#141414" style="background-color: #141414; padding: 40px 36px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
              <h2 style="color: #ffffff; margin: 0 0 16px 0; font-size: 22px; font-weight: 600;">Hey ${displayName}! 👋</h2>
              <p style="color: #a1a1aa; line-height: 1.7; margin: 0 0 28px 0; font-size: 16px;">You just joined thousands of sales professionals using OutReign to find better leads, close more deals, and save hours every week.</p>
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="#1a1a1a" style="background-color: #1a1a1a; border-radius: 12px; border: 1px solid #333333; margin-bottom: 28px;">
                <tr><td bgcolor="#1a1a1a" style="background-color: #1a1a1a; padding: 24px;">
                  <h3 style="color: #9b6dff; margin: 0 0 20px 0; font-size: 16px; font-weight: 700;">🚀 Quick Start Guide</h3>
                  <p style="color: #ffffff; margin: 0 0 8px 0; font-size: 14px;"><strong>1.</strong> Sign in with your email</p>
                  <p style="color: #ffffff; margin: 0 0 8px 0; font-size: 14px;"><strong>2.</strong> Search leads using AI-powered search</p>
                  <p style="color: #ffffff; margin: 0 0 8px 0; font-size: 14px;"><strong>3.</strong> Enrich to unlock emails & phone numbers</p>
                  <p style="color: #ffffff; margin: 0; font-size: 14px;"><strong>4.</strong> Build pipeline & close more deals</p>
                </td></tr>
              </table>
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="#141414">
                <tr><td bgcolor="#141414" align="center" style="background-color: #141414; padding: 8px 0 32px 0;">
                  <a href="${appUrl}/auth" style="display: inline-block; background: linear-gradient(135deg, #9b6dff 0%, #7c3aed 100%); color: #ffffff; padding: 18px 48px; border-radius: 10px; text-decoration: none; font-weight: 600; font-size: 16px;">Sign In to OutReign →</a>
                </td></tr>
              </table>
              <div style="border-top: 1px solid #2a2a2a; margin: 8px 0 16px 0;"></div>
              <p style="color: #52525b; font-size: 13px; margin: 0; text-align: center;">Need help? Contact <a href="mailto:support@bdotindustries.com" style="color: #9b6dff; text-decoration: none;">support@bdotindustries.com</a></p>
            </td>
          </tr>
          <tr>
            <td bgcolor="#0f0f0f" align="center" style="background-color: #0f0f0f; padding: 24px 36px; border-top: 1px solid #2a2a2a; border-radius: 0 0 16px 16px;">
              <p style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #52525b; font-size: 12px; margin: 0;">© ${new Date().getFullYear()} BDØT Industries LLC. All rights reserved.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

    // Enqueue via Lovable email infrastructure
    const { error: enqueueError } = await supabase.rpc('enqueue_email', {
      queue_name: 'transactional_emails',
      payload: {
        message_id: messageId,
        to: email,
        from: `OutReign <noreply@notify.bdotindustries.com>`,
        sender_domain: 'notify.bdotindustries.com',
        subject: 'Welcome to OutReign - Your Quick Start Guide 🚀',
        html,
        text: `Welcome to OutReign, ${displayName}! Sign in at ${appUrl}/auth`,
        purpose: 'transactional',
        label: 'welcome-email',
        idempotency_key: `welcome-${email}-${Date.now()}`,
        queued_at: new Date().toISOString(),
      },
    });

    if (enqueueError) {
      console.error("Failed to enqueue welcome email:", enqueueError);
      throw new Error("Failed to send welcome email");
    }

    // Log to email_send_log
    await supabase.from('email_send_log').insert({
      message_id: messageId,
      template_name: 'welcome-email',
      recipient_email: email,
      status: 'pending',
    });

    console.log("Welcome email enqueued successfully");

    return new Response(
      JSON.stringify({ success: true, to: email }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  } catch (error: any) {
    console.error("Welcome email error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});

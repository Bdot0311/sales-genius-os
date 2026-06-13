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

  const APP_URL = Deno.env.get("APP_URL") ?? "https://outreign.io";

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Verify the caller is an admin
    const callerClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user: caller }, error: authError } = await callerClient.auth.getUser();
    if (authError || !caller) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: roleData } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", caller.id)
      .eq("role", "admin")
      .maybeSingle();

    if (!roleData) {
      return new Response(JSON.stringify({ error: "Forbidden — admin only" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { email, targetUserId } = await req.json();

    if (!email || typeof email !== "string" || !email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
      return new Response(JSON.stringify({ error: "Valid email is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const logoUrl = "https://ghgfjnepvxvxrncmskys.supabase.co/storage/v1/object/public/email-assets/outreign-logo.webp";
    const redirectUrl = `${APP_URL}/auth?type=recovery`;

    const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: "recovery",
      email,
      options: { redirectTo: redirectUrl },
    });

    if (linkError || !linkData?.properties?.action_link) {
      console.error("Failed to generate reset link:", linkError);
      return new Response(JSON.stringify({ error: "Failed to generate reset link — user may not exist" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const resetLink = linkData.properties.action_link;

    const resetHtml = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Reset Your Password</title>
      </head>
      <body style="margin: 0; padding: 0; background-color: #0a0a0a;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="#0a0a0a" style="background-color: #0a0a0a;">
          <tr>
            <td align="center" bgcolor="#0a0a0a" style="background-color: #0a0a0a; padding: 40px 20px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="540" bgcolor="#141414" style="max-width: 540px; background-color: #141414; border-radius: 16px; border: 1px solid #2a2a2a;">
                <tr>
                  <td bgcolor="#9b6dff" align="center" style="background: linear-gradient(135deg, #9b6dff 0%, #7c3aed 100%); padding: 32px 40px; border-radius: 16px 16px 0 0;">
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td align="center">
                          <img src="${logoUrl}" alt="OutReign" width="56" height="56" style="display: block; border-radius: 12px; margin-bottom: 16px;" />
                        </td>
                      </tr>
                      <tr>
                        <td align="center">
                          <h1 style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #ffffff; margin: 0; font-size: 24px; font-weight: 700;">Reset Your Password</h1>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td bgcolor="#141414" style="background-color: #141414; padding: 40px 36px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
                    <p style="color: #a1a1aa; line-height: 1.7; margin: 0 0 28px 0; font-size: 16px;">
                      Your OutReign account admin sent you a password reset. Click the button below to create a new password:
                    </p>
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="#141414" style="background-color: #141414;">
                      <tr>
                        <td bgcolor="#141414" align="center" style="background-color: #141414; padding: 8px 0 32px 0;">
                          <a href="${resetLink}" style="display: inline-block; background: linear-gradient(135deg, #9b6dff 0%, #7c3aed 100%); color: #ffffff; padding: 16px 40px; border-radius: 10px; text-decoration: none; font-weight: 600; font-size: 16px;">
                            Reset Password
                          </a>
                        </td>
                      </tr>
                    </table>
                    <p style="color: #71717a; font-size: 14px; line-height: 1.6; margin: 0 0 24px 0;">
                      If you weren't expecting this, you can safely ignore it. This link expires in 24 hours.
                    </p>
                    <div style="border-top: 1px solid #2a2a2a; margin: 16px 0;"></div>
                    <p style="color: #52525b; font-size: 12px; margin: 0; line-height: 1.5;">
                      If the button doesn't work, copy and paste this link:<br>
                      <a href="${resetLink}" style="color: #9b6dff; word-break: break-all;">${resetLink}</a>
                    </p>
                  </td>
                </tr>
                <tr>
                  <td bgcolor="#0f0f0f" align="center" style="background-color: #0f0f0f; padding: 24px 36px; border-top: 1px solid #2a2a2a; border-radius: 0 0 16px 16px;">
                    <p style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #52525b; font-size: 12px; margin: 0;">
                      © ${new Date().getFullYear()} BDØT Industries LLC. All rights reserved.
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
      </html>
    `;

    const { error: emailError } = await supabaseAdmin.rpc("enqueue_email", {
      queue_name: "transactional_emails",
      payload: {
        message_id: crypto.randomUUID(),
        to: email,
        from: "OutReign <noreply@notify.bdotindustries.com>",
        sender_domain: "notify.bdotindustries.com",
        subject: "Reset Your OutReign Password",
        html: resetHtml,
        text: `Your OutReign admin sent you a password reset. Visit this link to reset: ${resetLink}. If you weren't expecting this, ignore this email.`,
        purpose: "transactional",
        label: "admin-password-reset",
        idempotency_key: `admin-password-reset-${email}-${Date.now()}`,
        queued_at: new Date().toISOString(),
      },
    });

    if (emailError) {
      console.error("Error enqueuing password reset email:", emailError);
      return new Response(JSON.stringify({ error: "Failed to send email" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Log admin action
    await supabaseAdmin.rpc("log_audit_event", {
      _user_id: caller.id,
      _action: "admin_password_reset_sent",
      _entity_type: "user",
      _entity_id: targetUserId || null,
      _details: { email, sent_by: caller.email },
    }).catch(() => {});

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("Admin reset password error:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

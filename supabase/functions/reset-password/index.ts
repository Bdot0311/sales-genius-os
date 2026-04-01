import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { Resend } from "https://esm.sh/resend@2.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Simple in-memory rate limiter for password reset (stricter limits)
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT_MAX = 3; // Max 3 password reset requests per IP
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 minute window

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const record = rateLimitMap.get(ip);
  
  if (!record || now > record.resetTime) {
    rateLimitMap.set(ip, { count: 1, resetTime: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }
  
  if (record.count >= RATE_LIMIT_MAX) {
    return false;
  }
  
  record.count++;
  return true;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Always use the production custom domain for password reset links
  const APP_URL = "https://salesos.alephwavex.io";

  try {
    // Get client IP for rate limiting
    const clientIP = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || 
                     req.headers.get("cf-connecting-ip") || 
                     "unknown";
    
    const userAgent = req.headers.get("user-agent") || null;
    
    // Create admin client for logging
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );
    
    // Check rate limit - return generic success to prevent enumeration
    if (!checkRateLimit(clientIP)) {
      console.log("Rate limit exceeded for password reset, IP:", clientIP);
      
      // Log security event for rate limit hit
      await supabaseAdmin.rpc('log_security_event', {
        _event_type: 'password_reset_rate_limit',
        _severity: 'warning',
        _ip_address: clientIP,
        _user_agent: userAgent,
        _details: { reason: 'Rate limit exceeded for password reset' }
      });
      
      // Return success to prevent email enumeration
      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    const { email } = await req.json();
    
    if (!email || typeof email !== 'string' || !email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
      // Return success to prevent email enumeration
      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    console.log("Processing password reset for email:", email);

    // Use the same environment (preview vs live) that initiated the reset request.
    // Fallback to production domain if we can't reliably infer it.
    const logoUrl = "https://ghgfjnepvxvxrncmskys.supabase.co/storage/v1/object/public/email-assets/salesos-logo.webp";
    const redirectUrl = `${APP_URL}/auth?type=recovery`;
    
    console.log("Redirect URL:", redirectUrl);

    const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: 'recovery',
      email: email,
      options: {
        redirectTo: redirectUrl,
      }
    });

    if (linkError) {
      console.log("Link generation result:", linkError.message);
      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    if (linkData?.properties?.action_link) {
      const resetLink = linkData.properties.action_link;
      console.log("Reset link generated successfully");

      const resendApiKey = Deno.env.get("RESEND_API_KEY");
      if (!resendApiKey) {
        console.error("RESEND_API_KEY not configured");
        throw new Error("Email service not configured");
      }

      const resend = new Resend(resendApiKey);

      const { data: emailData, error: emailError } = await resend.emails.send({
        from: "SalesOS <support@bdotindustries.com>",
        to: [email],
        subject: "Reset Your SalesOS Password",
        html: `
          <!DOCTYPE html>
          <html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <meta http-equiv="X-UA-Compatible" content="IE=edge">
            <meta name="x-apple-disable-message-reformatting">
            <meta name="color-scheme" content="dark only">
            <meta name="supported-color-schemes" content="dark only">
            <title>Reset Your Password</title>
            <!--[if mso]>
            <style type="text/css">
              body, table, td {font-family: Arial, sans-serif !important;}
            </style>
            <![endif]-->
          </head>
          <body style="margin: 0; padding: 0; background-color: #0a0a0a; -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="#0a0a0a" style="background-color: #0a0a0a;">
              <tr>
                <td align="center" bgcolor="#0a0a0a" style="background-color: #0a0a0a; padding: 40px 20px;">
                  <!-- Main Card -->
                  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="540" bgcolor="#141414" style="max-width: 540px; background-color: #141414; border-radius: 16px; border: 1px solid #2a2a2a;">
                    <!-- Purple Header Banner -->
                    <tr>
                      <td bgcolor="#9b6dff" align="center" style="background: linear-gradient(135deg, #9b6dff 0%, #7c3aed 100%); padding: 32px 40px; border-radius: 16px 16px 0 0;">
                        <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                          <tr>
                            <td align="center">
                              <img src="${logoUrl}" alt="SalesOS" width="56" height="56" style="display: block; border-radius: 12px; margin-bottom: 16px;" />
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
                    <!-- Content Area -->
                    <tr>
                      <td bgcolor="#141414" style="background-color: #141414;">
                        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="#141414" style="background-color: #141414;">
                          <tr>
                            <td bgcolor="#141414" style="background-color: #141414; padding: 40px 36px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
                              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="#141414" style="background-color: #141414;">
                                <tr>
                                  <td bgcolor="#141414" style="background-color: #141414;">
                                    <p style="color: #a1a1aa; line-height: 1.7; margin: 0 0 28px 0; font-size: 16px;">
                                      We received a request to reset your password. Click the button below to create a new password:
                                    </p>
                                  </td>
                                </tr>
                              </table>
                              
                              <!-- CTA Button -->
                              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="#141414" style="background-color: #141414;">
                                <tr>
                                  <td bgcolor="#141414" align="center" style="background-color: #141414; padding: 8px 0 32px 0;">
                                    <a href="${resetLink}" style="display: inline-block; background: linear-gradient(135deg, #9b6dff 0%, #7c3aed 100%); color: #ffffff; padding: 16px 40px; border-radius: 10px; text-decoration: none; font-weight: 600; font-size: 16px;">
                                      Reset Password
                                    </a>
                                  </td>
                                </tr>
                              </table>
                              
                              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="#141414" style="background-color: #141414;">
                                <tr>
                                  <td bgcolor="#141414" style="background-color: #141414;">
                                    <p style="color: #71717a; font-size: 14px; line-height: 1.6; margin: 0 0 24px 0;">
                                      If you didn't request this password reset, you can safely ignore this email. This link will expire in 24 hours.
                                    </p>
                                  </td>
                                </tr>
                              </table>
                              
                              <!-- Divider -->
                              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="#141414" style="background-color: #141414;">
                                <tr>
                                  <td bgcolor="#141414" style="background-color: #141414; padding: 16px 0;">
                                    <div style="border-top: 1px solid #2a2a2a;"></div>
                                  </td>
                                </tr>
                              </table>
                              
                              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="#141414" style="background-color: #141414;">
                                <tr>
                                  <td bgcolor="#141414" style="background-color: #141414;">
                                    <p style="color: #52525b; font-size: 12px; margin: 0; line-height: 1.5;">
                                      If the button doesn't work, copy and paste this link:<br>
                                      <a href="${resetLink}" style="color: #9b6dff; word-break: break-all;">${resetLink}</a>
                                    </p>
                                  </td>
                                </tr>
                              </table>
                            </td>
                          </tr>
                        </table>
                      </td>
                    </tr>
                    <!-- Footer -->
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
        `,
      });

      if (emailError) {
        console.error("Resend email error:", emailError);
        throw new Error("Failed to send password reset email");
      }

      console.log("Password reset email sent successfully:", emailData?.id);
    }

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  } catch (error: any) {
    console.error("Password reset error:", error);
    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  }
});
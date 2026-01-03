import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { Resend } from "https://esm.sh/resend@2.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { email } = await req.json();
    
    // Validate email format
    if (!email || typeof email !== 'string' || !email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
      return new Response(
        JSON.stringify({ error: "Valid email address required" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    console.log("Processing password reset for email:", email);

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Get the origin from the request headers for the redirect URL
    const origin = req.headers.get("origin") || "https://salesos.io";
    const redirectUrl = `${origin}/auth?type=recovery`;
    
    console.log("Redirect URL:", redirectUrl);

    // Use Supabase's built-in password reset functionality to generate the link
    const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: 'recovery',
      email: email,
      options: {
        redirectTo: redirectUrl,
      }
    });

    // If user doesn't exist, return success anyway to prevent email enumeration
    if (linkError) {
      console.log("Link generation result:", linkError.message);
      // Return success to prevent email enumeration
      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    // If we have a link, send the email via Resend
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
            <meta name="color-scheme" content="dark">
            <meta name="supported-color-schemes" content="dark">
            <title>Reset Your Password</title>
            <style type="text/css">
              body, html { margin: 0 !important; padding: 0 !important; background-color: #0a0a0a !important; }
              table { border-spacing: 0 !important; border-collapse: collapse !important; }
              img { border: 0; height: auto; line-height: 100%; outline: none; text-decoration: none; }
            </style>
          </head>
          <body bgcolor="#0a0a0a" style="margin: 0 !important; padding: 0 !important; background-color: #0a0a0a !important; -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%;">
            <!-- Gmail Background Fix Wrapper -->
            <div style="background-color: #0a0a0a !important; width: 100% !important; min-height: 100% !important;">
              <table role="presentation" bgcolor="#0a0a0a" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #0a0a0a !important; min-width: 100% !important;">
                <tr>
                  <td bgcolor="#0a0a0a" align="center" style="background-color: #0a0a0a !important; padding: 40px 20px;">
                    <table role="presentation" bgcolor="#141414" width="500" cellpadding="0" cellspacing="0" border="0" style="max-width: 500px; background-color: #141414 !important; border-radius: 12px; border: 1px solid #333333;">
                      <!-- Header -->
                      <tr>
                        <td align="center" style="background: linear-gradient(135deg, #9b6dff 0%, #b366e6 100%); padding: 30px; border-radius: 12px 12px 0 0;">
                          <img src="https://salesos.alephwavex.io/salesos-logo.webp" alt="SalesOS Logo" width="48" height="48" style="display: block; border-radius: 10px; margin-bottom: 12px;" />
                          <h1 style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #ffffff; margin: 0; font-size: 24px; font-weight: 600;">SalesOS</h1>
                        </td>
                      </tr>
                      <!-- Content -->
                      <tr>
                        <td bgcolor="#141414" style="background-color: #141414 !important; padding: 40px 30px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
                          <h2 style="color: #fafafa; margin: 0 0 20px 0; font-size: 20px; font-weight: 600;">Reset Your Password</h2>
                          <p style="color: #a1a1aa; line-height: 1.6; margin: 0 0 24px 0; font-size: 16px;">
                            We received a request to reset your password. Click the button below to create a new password:
                          </p>
                          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                            <tr>
                              <td align="center" style="padding: 32px 0;">
                                <a href="${resetLink}" style="display: inline-block; background: linear-gradient(135deg, #9b6dff 0%, #b366e6 100%); color: #ffffff; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 16px;">Reset Password</a>
                              </td>
                            </tr>
                          </table>
                          <p style="color: #71717a; font-size: 14px; line-height: 1.6; margin: 0;">
                            If you didn't request this password reset, you can safely ignore this email. This link will expire in 24 hours.
                          </p>
                          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                            <tr>
                              <td style="padding: 30px 0;">
                                <div style="border-top: 1px solid #333333;"></div>
                              </td>
                            </tr>
                          </table>
                          <p style="color: #71717a; font-size: 12px; margin: 0;">
                            If the button doesn't work, copy and paste this link into your browser:<br>
                            <a href="${resetLink}" style="color: #9b6dff; word-break: break-all;">${resetLink}</a>
                          </p>
                        </td>
                      </tr>
                      <!-- Footer -->
                      <tr>
                        <td bgcolor="#0a0a0a" align="center" style="background-color: #0a0a0a !important; padding: 20px 30px; border-top: 1px solid #333333; border-radius: 0 0 12px 12px;">
                          <p style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #71717a; font-size: 12px; margin: 0;">
                            &copy; ${new Date().getFullYear()} BDOT Industries LLC. All rights reserved.
                          </p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </div>
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
    // Return generic success to prevent information leakage
    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  }
});

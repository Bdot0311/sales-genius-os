import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
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
    const { email, name } = await req.json();
    
    if (!email || typeof email !== 'string' || !email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
      return new Response(
        JSON.stringify({ error: "Valid email address required" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    console.log("Sending welcome email to:", email);

    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    if (!resendApiKey) {
      console.error("RESEND_API_KEY not configured");
      throw new Error("Email service not configured");
    }

    const resend = new Resend(resendApiKey);
    const displayName = name || "there";
    const origin = req.headers.get("origin") || "https://salesos.io";

    const { data: emailData, error: emailError } = await resend.emails.send({
      from: "SalesOS <support@bdotindustries.com>",
      to: [email],
      subject: "Welcome to SalesOS! 🚀",
      html: `
        <!DOCTYPE html>
        <html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <meta http-equiv="X-UA-Compatible" content="IE=edge">
          <meta name="color-scheme" content="dark">
          <meta name="supported-color-schemes" content="dark">
          <title>Welcome to SalesOS</title>
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
                        <h1 style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #ffffff; margin: 0; font-size: 24px; font-weight: 600;">Welcome to SalesOS!</h1>
                      </td>
                    </tr>
                    <!-- Content -->
                    <tr>
                      <td bgcolor="#141414" style="background-color: #141414 !important; padding: 40px 30px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
                        <h2 style="color: #fafafa; margin: 0 0 20px 0; font-size: 20px; font-weight: 600;">Hey ${displayName}! 👋</h2>
                        <p style="color: #a1a1aa; line-height: 1.6; margin: 0 0 24px 0;">
                          Thanks for joining SalesOS — the AI-powered sales operating system that helps you close more deals, faster.
                        </p>
                        <p style="color: #a1a1aa; line-height: 1.6; margin: 0 0 24px 0;">
                          Here's what you can do to get started:
                        </p>
                        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                          <tr>
                            <td style="color: #a1a1aa; line-height: 1.8; padding: 0 0 8px 0;">🔍 <strong style="color: #fafafa;">Search for leads</strong> using our AI-powered prospecting tools</td>
                          </tr>
                          <tr>
                            <td style="color: #a1a1aa; line-height: 1.8; padding: 0 0 8px 0;">📊 <strong style="color: #fafafa;">Build your pipeline</strong> and track deals in real-time</td>
                          </tr>
                          <tr>
                            <td style="color: #a1a1aa; line-height: 1.8; padding: 0 0 8px 0;">🤖 <strong style="color: #fafafa;">Get AI coaching</strong> to improve your sales performance</td>
                          </tr>
                          <tr>
                            <td style="color: #a1a1aa; line-height: 1.8; padding: 0 0 24px 0;">⚡ <strong style="color: #fafafa;">Automate outreach</strong> with smart workflows</td>
                          </tr>
                        </table>
                        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                          <tr>
                            <td align="center" style="padding: 32px 0;">
                              <a href="${origin}/dashboard" style="display: inline-block; background: linear-gradient(135deg, #9b6dff 0%, #b366e6 100%); color: #ffffff; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 16px;">
                                Go to Dashboard
                              </a>
                            </td>
                          </tr>
                        </table>
                        <p style="color: #71717a; font-size: 14px; line-height: 1.6; margin: 0;">
                          If you have any questions, just reply to this email — we're here to help!
                        </p>
                        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                          <tr>
                            <td style="padding: 30px 0;">
                              <div style="border-top: 1px solid #333333;"></div>
                            </td>
                          </tr>
                        </table>
                        <p style="color: #71717a; font-size: 12px; margin: 0; text-align: center;">
                          You're receiving this email because you signed up for SalesOS.
                        </p>
                      </td>
                    </tr>
                    <!-- Footer -->
                    <tr>
                      <td bgcolor="#0a0a0a" align="center" style="background-color: #0a0a0a !important; padding: 20px 30px; border-top: 1px solid #333333; border-radius: 0 0 12px 12px;">
                        <p style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #71717a; font-size: 12px; margin: 0;">
                          © ${new Date().getFullYear()} BDØT Industries LLC. All rights reserved.
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
      throw new Error("Failed to send welcome email");
    }

    console.log("Welcome email sent successfully:", emailData?.id);

    return new Response(
      JSON.stringify({ success: true }),
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

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
    const appUrl = "https://salesos.alephwavex.io";
    const logoUrl = "https://ghgfjnepvxvxrncmskys.supabase.co/storage/v1/object/public/email-assets/salesos-logo.webp";

    const { data: emailData, error: emailError } = await resend.emails.send({
      from: "SalesOS <support@bdotindustries.com>",
      to: [email],
      subject: "Welcome to SalesOS — Your Quick Start Guide 🚀",
      html: `
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <meta http-equiv="X-UA-Compatible" content="IE=edge">
          <meta name="x-apple-disable-message-reformatting">
          <meta name="color-scheme" content="dark only">
          <meta name="supported-color-schemes" content="dark only">
          <title>Welcome to SalesOS</title>
        </head>
        <body style="margin: 0; padding: 0; background-color: #0a0a0a;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="#0a0a0a" style="background-color: #0a0a0a;">
            <tr>
              <td align="center" bgcolor="#0a0a0a" style="background-color: #0a0a0a; padding: 40px 20px;">
                <!-- Main Card -->
                <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="540" bgcolor="#141414" style="max-width: 540px; background-color: #141414; border-radius: 16px; border: 1px solid #2a2a2a;">
                  
                  <!-- Purple Header Banner -->
                  <tr>
                    <td bgcolor="#9b6dff" align="center" style="background: linear-gradient(135deg, #9b6dff 0%, #7c3aed 100%); padding: 32px 40px; border-radius: 16px 16px 0 0;">
                      <img src="${logoUrl}" alt="SalesOS" width="56" height="56" style="display: block; border-radius: 12px; margin-bottom: 16px;" />
                      <h1 style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #ffffff; margin: 0; font-size: 28px; font-weight: 700;">Welcome to SalesOS!</h1>
                      <p style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: rgba(255,255,255,0.9); margin: 12px 0 0 0; font-size: 16px;">Your AI-powered sales operating system</p>
                    </td>
                  </tr>
                  
                  <!-- Content Area -->
                  <tr>
                    <td bgcolor="#141414" style="background-color: #141414; padding: 40px 36px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
                      
                      <!-- Greeting -->
                      <h2 style="color: #ffffff; margin: 0 0 16px 0; font-size: 22px; font-weight: 600;">Hey ${displayName}! 👋</h2>
                      <p style="color: #a1a1aa; line-height: 1.7; margin: 0 0 28px 0; font-size: 16px;">
                        You just joined thousands of sales professionals using SalesOS to find better leads, close more deals, and save hours every week.
                      </p>
                      
                      <!-- Quick Start Guide Box -->
                      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="#1a1a1a" style="background-color: #1a1a1a; border-radius: 12px; border: 1px solid #333333; margin-bottom: 28px;">
                        <tr>
                          <td bgcolor="#1a1a1a" style="background-color: #1a1a1a; padding: 24px;">
                            <h3 style="color: #9b6dff; margin: 0 0 20px 0; font-size: 16px; font-weight: 700;">🚀 Quick Start Guide</h3>
                            
                            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom: 14px;">
                              <tr>
                                <td width="28" valign="top">
                                  <div style="background: linear-gradient(135deg, #9b6dff 0%, #7c3aed 100%); color: #fff; width: 24px; height: 24px; border-radius: 50%; text-align: center; line-height: 24px; font-weight: 700; font-size: 12px;">1</div>
                                </td>
                                <td valign="top" style="padding-left: 10px;">
                                  <p style="color: #ffffff; margin: 0; font-size: 14px;"><strong>Sign in</strong> with your email</p>
                                </td>
                              </tr>
                            </table>
                            
                            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom: 14px;">
                              <tr>
                                <td width="28" valign="top">
                                  <div style="background: linear-gradient(135deg, #9b6dff 0%, #7c3aed 100%); color: #fff; width: 24px; height: 24px; border-radius: 50%; text-align: center; line-height: 24px; font-weight: 700; font-size: 12px;">2</div>
                                </td>
                                <td valign="top" style="padding-left: 10px;">
                                  <p style="color: #ffffff; margin: 0; font-size: 14px;"><strong>Search leads</strong> using AI-powered search</p>
                                </td>
                              </tr>
                            </table>
                            
                            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom: 14px;">
                              <tr>
                                <td width="28" valign="top">
                                  <div style="background: linear-gradient(135deg, #9b6dff 0%, #7c3aed 100%); color: #fff; width: 24px; height: 24px; border-radius: 50%; text-align: center; line-height: 24px; font-weight: 700; font-size: 12px;">3</div>
                                </td>
                                <td valign="top" style="padding-left: 10px;">
                                  <p style="color: #ffffff; margin: 0; font-size: 14px;"><strong>Enrich</strong> to unlock emails & phone numbers</p>
                                </td>
                              </tr>
                            </table>
                            
                            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                              <tr>
                                <td width="28" valign="top">
                                  <div style="background: linear-gradient(135deg, #9b6dff 0%, #7c3aed 100%); color: #fff; width: 24px; height: 24px; border-radius: 50%; text-align: center; line-height: 24px; font-weight: 700; font-size: 12px;">4</div>
                                </td>
                                <td valign="top" style="padding-left: 10px;">
                                  <p style="color: #ffffff; margin: 0; font-size: 14px;"><strong>Build pipeline</strong> & close more deals</p>
                                </td>
                              </tr>
                            </table>
                          </td>
                        </tr>
                      </table>
                      
                      <!-- Primary CTA Button -->
                      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="#141414">
                        <tr>
                          <td bgcolor="#141414" align="center" style="background-color: #141414; padding: 8px 0 32px 0;">
                            <a href="${appUrl}/auth" style="display: inline-block; background: linear-gradient(135deg, #9b6dff 0%, #7c3aed 100%); color: #ffffff; padding: 18px 48px; border-radius: 10px; text-decoration: none; font-weight: 600; font-size: 16px; box-shadow: 0 4px 14px rgba(124, 58, 237, 0.4);">
                              Sign In to SalesOS →
                            </a>
                          </td>
                        </tr>
                      </table>
                      
                      <!-- Divider -->
                      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="#141414">
                        <tr>
                          <td bgcolor="#141414" style="background-color: #141414; padding: 8px 0 16px 0;">
                            <div style="border-top: 1px solid #2a2a2a;"></div>
                          </td>
                        </tr>
                      </table>
                      
                      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="#141414">
                        <tr>
                          <td bgcolor="#141414" align="center" style="background-color: #141414;">
                            <p style="color: #52525b; font-size: 13px; margin: 0;">
                              Need help? Contact <a href="mailto:support@bdotindustries.com" style="color: #9b6dff; text-decoration: none;">support@bdotindustries.com</a>
                            </p>
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
      throw new Error("Failed to send welcome email");
    }

    console.log("Welcome email sent successfully:", emailData?.id);

    return new Response(
      JSON.stringify({ success: true, id: emailData?.id ?? null, to: email }),
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

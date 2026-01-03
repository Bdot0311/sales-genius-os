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
    const { email, name, plan, amount } = await req.json();
    
    if (!email || typeof email !== 'string' || !email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
      return new Response(
        JSON.stringify({ error: "Valid email address required" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    console.log("Sending subscription confirmation to:", email);

    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    if (!resendApiKey) {
      console.error("RESEND_API_KEY not configured");
      throw new Error("Email service not configured");
    }

    const resend = new Resend(resendApiKey);
    const displayName = name || "there";
    const planName = plan || "Growth";
    const planAmount = amount || "$29";
    // Always use production domain for email links
    const appUrl = "https://salesos.io";
    const logoUrl = "https://salesos.io/salesos-logo.webp";

    const planFeatures: Record<string, string[]> = {
      growth: [
        "500 search credits per month",
        "Basic lead enrichment",
        "Pipeline management",
        "Email support"
      ],
      pro: [
        "2,000 search credits per month",
        "Advanced lead enrichment",
        "AI Sales Coach",
        "Workflow automations",
        "Priority support"
      ],
      elite: [
        "Unlimited search credits",
        "Full data enrichment suite",
        "Custom integrations",
        "Dedicated account manager",
        "24/7 premium support"
      ]
    };

    const features = planFeatures[planName.toLowerCase()] || planFeatures.growth;

    const { data: emailData, error: emailError } = await resend.emails.send({
      from: "SalesOS <support@bdotindustries.com>",
      to: [email],
      subject: `You're now on the ${planName} Plan! 🎉`,
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
          <title>Subscription Confirmed</title>
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
                            <h1 style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #ffffff; margin: 0; font-size: 28px; font-weight: 700;">Subscription Confirmed!</h1>
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
                            <!-- Greeting -->
                            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="#141414" style="background-color: #141414;">
                              <tr>
                                <td bgcolor="#141414" style="background-color: #141414;">
                                  <h2 style="color: #ffffff; margin: 0 0 16px 0; font-size: 22px; font-weight: 600;">Hey ${displayName}! 🎉</h2>
                                  <p style="color: #a1a1aa; line-height: 1.7; margin: 0 0 28px 0; font-size: 16px;">
                                    Thank you for subscribing to SalesOS! Your <strong style="color: #9b6dff;">${planName} Plan</strong> is now active.
                                  </p>
                                </td>
                              </tr>
                            </table>
                            
                            <!-- Plan Details Box -->
                            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="#1a1a1a" style="background-color: #1a1a1a; border-radius: 12px; border: 1px solid #2a2a2a; margin-bottom: 24px;">
                              <tr>
                                <td bgcolor="#1a1a1a" style="background-color: #1a1a1a; padding: 24px;">
                                  <h3 style="color: #ffffff; margin: 0 0 16px 0; font-size: 16px; font-weight: 600;">Your Plan Details</h3>
                                  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="#1a1a1a" style="background-color: #1a1a1a;">
                                    <tr>
                                      <td bgcolor="#1a1a1a" style="background-color: #1a1a1a; color: #71717a; padding: 6px 0; font-size: 14px;">Plan:</td>
                                      <td bgcolor="#1a1a1a" align="right" style="background-color: #1a1a1a; color: #ffffff; font-weight: 600; padding: 6px 0; font-size: 14px;">${planName}</td>
                                    </tr>
                                    <tr>
                                      <td bgcolor="#1a1a1a" style="background-color: #1a1a1a; color: #71717a; padding: 6px 0; font-size: 14px;">Amount:</td>
                                      <td bgcolor="#1a1a1a" align="right" style="background-color: #1a1a1a; color: #ffffff; font-weight: 600; padding: 6px 0; font-size: 14px;">${planAmount}/month</td>
                                    </tr>
                                  </table>
                                </td>
                              </tr>
                            </table>

                            <!-- Features List -->
                            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="#141414" style="background-color: #141414; margin-bottom: 28px;">
                              <tr>
                                <td bgcolor="#141414" style="background-color: #141414;">
                                  <p style="color: #ffffff; margin: 0 0 16px 0; font-size: 15px; font-weight: 600;">What's included:</p>
                                </td>
                              </tr>
                              ${features.map(feature => `
                              <tr>
                                <td bgcolor="#141414" style="background-color: #141414; color: #a1a1aa; line-height: 1.8; padding: 4px 0; font-size: 14px;">✓ ${feature}</td>
                              </tr>
                              `).join('')}
                            </table>

                            <!-- CTA Button -->
                            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="#141414" style="background-color: #141414;">
                              <tr>
                                <td bgcolor="#141414" align="center" style="background-color: #141414; padding: 8px 0 32px 0;">
                                  <a href="${appUrl}/dashboard" style="display: inline-block; background: linear-gradient(135deg, #9b6dff 0%, #7c3aed 100%); color: #ffffff; padding: 16px 40px; border-radius: 10px; text-decoration: none; font-weight: 600; font-size: 16px;">
                                    Start Using SalesOS →
                                  </a>
                                </td>
                              </tr>
                            </table>
                            
                            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="#141414" style="background-color: #141414;">
                              <tr>
                                <td bgcolor="#141414" style="background-color: #141414;">
                                  <p style="color: #71717a; font-size: 14px; line-height: 1.6; margin: 0;">
                                    You can manage your subscription anytime from your account settings. If you have any questions, just reply to this email!
                                  </p>
                                </td>
                              </tr>
                            </table>
                            
                            <!-- Divider -->
                            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="#141414" style="background-color: #141414;">
                              <tr>
                                <td bgcolor="#141414" style="background-color: #141414; padding: 24px 0 16px 0;">
                                  <div style="border-top: 1px solid #2a2a2a;"></div>
                                </td>
                              </tr>
                            </table>
                            
                            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="#141414" style="background-color: #141414;">
                              <tr>
                                <td bgcolor="#141414" align="center" style="background-color: #141414;">
                                  <p style="color: #52525b; font-size: 12px; margin: 0;">
                                    You're receiving this email because you subscribed to SalesOS.
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
      throw new Error("Failed to send subscription confirmation email");
    }

    console.log("Subscription confirmation email sent successfully:", emailData?.id);

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  } catch (error: any) {
    console.error("Subscription confirmation email error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
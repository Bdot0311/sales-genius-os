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
    const origin = req.headers.get("origin") || "https://salesos.io";

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
          <meta name="color-scheme" content="dark">
          <meta name="supported-color-schemes" content="dark">
          <title>Subscription Confirmed</title>
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
                        <h1 style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #ffffff; margin: 0; font-size: 24px; font-weight: 600;">Subscription Confirmed!</h1>
                      </td>
                    </tr>
                    <!-- Content -->
                    <tr>
                      <td bgcolor="#141414" style="background-color: #141414 !important; padding: 40px 30px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
                        <h2 style="color: #fafafa; margin: 0 0 20px 0; font-size: 20px; font-weight: 600;">Hey ${displayName}! 🎉</h2>
                        <p style="color: #a1a1aa; line-height: 1.6; margin: 0 0 24px 0;">
                          Thank you for subscribing to SalesOS! Your <strong style="color: #9b6dff;">${planName} Plan</strong> is now active.
                        </p>
                        
                        <table role="presentation" bgcolor="#1a1a1a" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #1a1a1a !important; border-radius: 8px; border: 1px solid #333333; margin: 24px 0;">
                          <tr>
                            <td style="padding: 20px;">
                              <h3 style="color: #fafafa; margin: 0 0 16px 0; font-size: 16px; font-weight: 600;">Your Plan Details</h3>
                              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                                <tr>
                                  <td style="color: #71717a; padding: 4px 0;">Plan:</td>
                                  <td align="right" style="color: #fafafa; font-weight: 600; padding: 4px 0;">${planName}</td>
                                </tr>
                                <tr>
                                  <td style="color: #71717a; padding: 4px 0;">Amount:</td>
                                  <td align="right" style="color: #fafafa; font-weight: 600; padding: 4px 0;">${planAmount}/month</td>
                                </tr>
                              </table>
                            </td>
                          </tr>
                        </table>

                        <p style="color: #a1a1aa; line-height: 1.6; margin: 0 0 16px 0;">
                          <strong style="color: #fafafa;">What's included:</strong>
                        </p>
                        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                          ${features.map(feature => `<tr><td style="color: #a1a1aa; line-height: 1.8; padding: 4px 0;">✓ ${feature}</td></tr>`).join('')}
                        </table>

                        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                          <tr>
                            <td align="center" style="padding: 32px 0;">
                              <a href="${origin}/dashboard" style="display: inline-block; background: linear-gradient(135deg, #9b6dff 0%, #b366e6 100%); color: #ffffff; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 16px;">
                                Start Using SalesOS
                              </a>
                            </td>
                          </tr>
                        </table>
                        
                        <p style="color: #71717a; font-size: 14px; line-height: 1.6; margin: 0;">
                          You can manage your subscription anytime from your account settings. If you have any questions, just reply to this email!
                        </p>
                        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                          <tr>
                            <td style="padding: 30px 0;">
                              <div style="border-top: 1px solid #333333;"></div>
                            </td>
                          </tr>
                        </table>
                        <p style="color: #71717a; font-size: 12px; margin: 0; text-align: center;">
                          You're receiving this email because you subscribed to SalesOS.
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

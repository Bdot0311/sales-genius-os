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
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #0a0a0a; margin: 0; padding: 40px 20px;">
          <div style="max-width: 500px; margin: 0 auto; background-color: #141414; border-radius: 12px; box-shadow: 0 4px 20px rgba(155, 109, 255, 0.15); overflow: hidden; border: 1px solid #333333;">
            <div style="background: linear-gradient(135deg, #9b6dff 0%, #b366e6 100%); padding: 30px; text-align: center;">
              <img src="https://salesos.alephwavex.io/salesos-logo.webp" alt="SalesOS Logo" style="width: 48px; height: 48px; border-radius: 10px; margin-bottom: 12px;" />
              <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 600;">Subscription Confirmed!</h1>
            </div>
            <div style="padding: 40px 30px;">
              <h2 style="color: #fafafa; margin: 0 0 20px 0; font-size: 20px; font-weight: 600;">Hey ${displayName}! 🎉</h2>
              <p style="color: #a1a1aa; line-height: 1.6; margin: 0 0 24px 0;">
                Thank you for subscribing to SalesOS! Your <strong style="color: #9b6dff;">${planName} Plan</strong> is now active.
              </p>
              
              <div style="background-color: #1a1a1a; border-radius: 8px; padding: 20px; margin: 24px 0; border: 1px solid #333333;">
                <h3 style="color: #fafafa; margin: 0 0 16px 0; font-size: 16px; font-weight: 600;">Your Plan Details</h3>
                <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                  <span style="color: #71717a;">Plan:</span>
                  <span style="color: #fafafa; font-weight: 600;">${planName}</span>
                </div>
                <div style="display: flex; justify-content: space-between;">
                  <span style="color: #71717a;">Amount:</span>
                  <span style="color: #fafafa; font-weight: 600;">${planAmount}/month</span>
                </div>
              </div>

              <p style="color: #a1a1aa; line-height: 1.6; margin: 0 0 16px 0;">
                <strong style="color: #fafafa;">What's included:</strong>
              </p>
              <ul style="color: #a1a1aa; line-height: 1.8; margin: 0 0 24px 0; padding-left: 20px;">
                ${features.map(feature => `<li>✓ ${feature}</li>`).join('')}
              </ul>

              <div style="text-align: center; margin: 32px 0;">
                <a href="${origin}/dashboard" style="display: inline-block; background: linear-gradient(135deg, #9b6dff 0%, #b366e6 100%); color: #ffffff; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 16px;">
                  Start Using SalesOS
                </a>
              </div>
              
              <p style="color: #71717a; font-size: 14px; line-height: 1.6; margin: 24px 0 0 0;">
                You can manage your subscription anytime from your account settings. If you have any questions, just reply to this email!
              </p>
              <hr style="border: none; border-top: 1px solid #333333; margin: 30px 0;">
              <p style="color: #71717a; font-size: 12px; margin: 0; text-align: center;">
                You're receiving this email because you subscribed to SalesOS.
              </p>
            </div>
            <div style="background-color: #0a0a0a; padding: 20px 30px; text-align: center; border-top: 1px solid #333333;">
              <p style="color: #71717a; font-size: 12px; margin: 0;">
                © ${new Date().getFullYear()} BDØT Industries LLC. All rights reserved.
              </p>
            </div>
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

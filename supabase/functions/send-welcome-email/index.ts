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
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #0a0a0a; margin: 0; padding: 40px 20px;">
          <div style="max-width: 500px; margin: 0 auto; background-color: #141414; border-radius: 12px; box-shadow: 0 4px 20px rgba(155, 109, 255, 0.15); overflow: hidden; border: 1px solid #333333;">
            <div style="background: linear-gradient(135deg, #9b6dff 0%, #b366e6 100%); padding: 30px; text-align: center;">
              <img src="https://salesos.io/salesos-logo.webp" alt="SalesOS Logo" style="width: 48px; height: 48px; border-radius: 10px; margin-bottom: 12px;" />
              <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 600;">Welcome to SalesOS!</h1>
            </div>
            <div style="padding: 40px 30px;">
              <h2 style="color: #fafafa; margin: 0 0 20px 0; font-size: 20px; font-weight: 600;">Hey ${displayName}! 👋</h2>
              <p style="color: #a1a1aa; line-height: 1.6; margin: 0 0 24px 0;">
                Thanks for joining SalesOS — the AI-powered sales operating system that helps you close more deals, faster.
              </p>
              <p style="color: #a1a1aa; line-height: 1.6; margin: 0 0 24px 0;">
                Here's what you can do to get started:
              </p>
              <ul style="color: #a1a1aa; line-height: 1.8; margin: 0 0 24px 0; padding-left: 20px;">
                <li>🔍 <strong style="color: #fafafa;">Search for leads</strong> using our AI-powered prospecting tools</li>
                <li>📊 <strong style="color: #fafafa;">Build your pipeline</strong> and track deals in real-time</li>
                <li>🤖 <strong style="color: #fafafa;">Get AI coaching</strong> to improve your sales performance</li>
                <li>⚡ <strong style="color: #fafafa;">Automate outreach</strong> with smart workflows</li>
              </ul>
              <div style="text-align: center; margin: 32px 0;">
                <a href="${origin}/dashboard" style="display: inline-block; background: linear-gradient(135deg, #9b6dff 0%, #b366e6 100%); color: #ffffff; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 16px;">
                  Go to Dashboard
                </a>
              </div>
              <p style="color: #71717a; font-size: 14px; line-height: 1.6; margin: 24px 0 0 0;">
                If you have any questions, just reply to this email — we're here to help!
              </p>
              <hr style="border: none; border-top: 1px solid #333333; margin: 30px 0;">
              <p style="color: #71717a; font-size: 12px; margin: 0; text-align: center;">
                You're receiving this email because you signed up for SalesOS.
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

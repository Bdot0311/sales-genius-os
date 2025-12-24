import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface WaitlistEmailRequest {
  email: string;
}

serve(async (req) => {
  console.log("send-waitlist-confirmation function called");

  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { email }: WaitlistEmailRequest = await req.json();
    console.log("Sending confirmation email to:", email);

    if (!email) {
      throw new Error("Email is required");
    }

    if (!RESEND_API_KEY) {
      throw new Error("RESEND_API_KEY is not configured");
    }

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: "SalesOS <onboarding@resend.dev>",
        to: [email],
        subject: "🚀 You're on the SalesOS Waitlist!",
        html: `
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
          </head>
          <body style="margin: 0; padding: 0; background-color: #0a0a0a; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #0a0a0a;">
              <tr>
                <td align="center" style="padding: 40px 20px;">
                  <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width: 600px; margin: 0 auto;">
                    
                    <!-- Header -->
                    <tr>
                      <td align="center" style="padding-bottom: 30px;">
                        <div style="display: inline-block; padding: 12px 24px; background: linear-gradient(135deg, #8B5CF6, #A855F7, #EC4899); border-radius: 12px;">
                          <span style="color: #ffffff; font-size: 24px; font-weight: bold;">SalesOS</span>
                        </div>
                      </td>
                    </tr>
                    
                    <!-- Main Content -->
                    <tr>
                      <td style="background: linear-gradient(180deg, #1a1a2e 0%, #16162a 100%); border-radius: 16px; padding: 40px; border: 1px solid rgba(139, 92, 246, 0.2);">
                        
                        <h1 style="color: #ffffff; font-size: 28px; font-weight: bold; margin: 0 0 20px 0; text-align: center;">
                          You're In! 🎉
                        </h1>
                        
                        <p style="color: #a1a1aa; font-size: 16px; line-height: 1.6; margin: 0 0 20px 0; text-align: center;">
                          Welcome to the future of sales. You've secured your spot on the SalesOS early access list.
                        </p>
                        
                        <div style="background: rgba(139, 92, 246, 0.1); border-radius: 12px; padding: 24px; margin: 24px 0; border: 1px solid rgba(139, 92, 246, 0.2);">
                          <h2 style="color: #8B5CF6; font-size: 18px; margin: 0 0 16px 0;">What's coming:</h2>
                          <ul style="color: #d4d4d8; font-size: 14px; line-height: 1.8; margin: 0; padding-left: 20px;">
                            <li>AI-powered lead generation</li>
                            <li>Smart outreach automation</li>
                            <li>Real-time sales coaching</li>
                            <li>Enterprise-grade security</li>
                          </ul>
                        </div>
                        
                        <p style="color: #a1a1aa; font-size: 14px; line-height: 1.6; margin: 20px 0 0 0; text-align: center;">
                          We'll notify you the moment we launch. Get ready to transform how you sell.
                        </p>
                        
                      </td>
                    </tr>
                    
                    <!-- Footer -->
                    <tr>
                      <td align="center" style="padding-top: 30px;">
                        <p style="color: #71717a; font-size: 12px; margin: 0;">
                          © ${new Date().getFullYear()} SalesOS. All rights reserved.
                        </p>
                        <p style="color: #52525b; font-size: 11px; margin: 10px 0 0 0;">
                          You received this email because you signed up for the SalesOS waitlist.
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
      }),
    });

    if (!res.ok) {
      const error = await res.text();
      console.error("Resend API error:", error);
      throw new Error(`Failed to send email: ${error}`);
    }

    const data = await res.json();
    console.log("Email sent successfully:", data);

    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error: any) {
    console.error("Error in send-waitlist-confirmation function:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
});

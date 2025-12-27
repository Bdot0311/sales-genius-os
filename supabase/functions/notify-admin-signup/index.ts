import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const ADMIN_EMAIL = "sales@alephwave.io";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface AdminNotificationRequest {
  email: string;
  source?: string;
  waitlistCount?: number;
}

serve(async (req) => {
  console.log("notify-admin-signup function called");

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { email, source, waitlistCount }: AdminNotificationRequest = await req.json();
    console.log("Notifying admin about new signup:", email);

    if (!email) {
      throw new Error("Email is required");
    }

    if (!RESEND_API_KEY) {
      throw new Error("RESEND_API_KEY is not configured");
    }

    const signupTime = new Date().toLocaleString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZoneName: "short",
    });

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: "SalesOS <onboarding@resend.dev>",
        to: [ADMIN_EMAIL],
        subject: `🚀 New Waitlist Signup: ${email}`,
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
                          🎉 New Waitlist Signup!
                        </h1>
                        
                        <p style="color: #a1a1aa; font-size: 16px; line-height: 1.6; margin: 0 0 24px 0; text-align: center;">
                          Someone just joined the SalesOS waitlist.
                        </p>
                        
                        <div style="background: rgba(139, 92, 246, 0.1); border-radius: 12px; padding: 24px; margin: 0 0 24px 0; border: 1px solid rgba(139, 92, 246, 0.2);">
                          
                          <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                            <tr>
                              <td style="padding: 8px 0;">
                                <span style="color: #8B5CF6; font-size: 12px; text-transform: uppercase; letter-spacing: 1px;">Email</span>
                                <p style="color: #ffffff; font-size: 18px; font-weight: 600; margin: 4px 0 0 0;">${email}</p>
                              </td>
                            </tr>
                            <tr>
                              <td style="padding: 16px 0 8px 0; border-top: 1px solid rgba(139, 92, 246, 0.2);">
                                <span style="color: #8B5CF6; font-size: 12px; text-transform: uppercase; letter-spacing: 1px;">Signed Up</span>
                                <p style="color: #d4d4d8; font-size: 14px; margin: 4px 0 0 0;">${signupTime}</p>
                              </td>
                            </tr>
                            ${source ? `
                            <tr>
                              <td style="padding: 16px 0 8px 0; border-top: 1px solid rgba(139, 92, 246, 0.2);">
                                <span style="color: #8B5CF6; font-size: 12px; text-transform: uppercase; letter-spacing: 1px;">Source</span>
                                <p style="color: #d4d4d8; font-size: 14px; margin: 4px 0 0 0;">${source}</p>
                              </td>
                            </tr>
                            ` : ""}
                            ${waitlistCount ? `
                            <tr>
                              <td style="padding: 16px 0 0 0; border-top: 1px solid rgba(139, 92, 246, 0.2);">
                                <span style="color: #8B5CF6; font-size: 12px; text-transform: uppercase; letter-spacing: 1px;">Total Waitlist</span>
                                <p style="color: #10B981; font-size: 24px; font-weight: bold; margin: 4px 0 0 0;">${waitlistCount} people</p>
                              </td>
                            </tr>
                            ` : ""}
                          </table>
                          
                        </div>
                        
                      </td>
                    </tr>
                    
                    <!-- Footer -->
                    <tr>
                      <td align="center" style="padding-top: 30px;">
                        <p style="color: #71717a; font-size: 12px; margin: 0;">
                          © ${new Date().getFullYear()} SalesOS Admin Notifications
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
      throw new Error(`Failed to send notification: ${error}`);
    }

    const data = await res.json();
    console.log("Admin notification sent successfully:", data);

    return new Response(JSON.stringify({ success: true, data }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error: any) {
    console.error("Error in notify-admin-signup function:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
});

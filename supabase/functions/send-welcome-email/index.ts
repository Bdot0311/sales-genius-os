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
    // Always use production domain for email links
    const appUrl = "https://salesos.alephwavex.io";
    // Use Supabase storage for logo - upload to email-assets bucket
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
          <title>Welcome to SalesOS</title>
          <!--[if mso]>
          <style type="text/css">
            body, table, td {font-family: Arial, sans-serif !important;}
          </style>
          <![endif]-->
        </head>
        <body style="margin: 0; padding: 0; background-color: #f4f4f5; -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color: #f4f4f5;">
            <tr>
              <td align="center" style="padding: 40px 20px;">
                <!-- Main Card -->
                <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="max-width: 600px; background-color: #ffffff; border-radius: 16px; box-shadow: 0 4px 24px rgba(0,0,0,0.08);">
                  
                  <!-- Purple Header Banner -->
                  <tr>
                    <td align="center" style="background: linear-gradient(135deg, #9b6dff 0%, #7c3aed 100%); padding: 40px; border-radius: 16px 16px 0 0;">
                      <img src="${logoUrl}" alt="SalesOS" width="64" height="64" style="display: block; border-radius: 14px; margin-bottom: 20px; border: 3px solid rgba(255,255,255,0.2);" />
                      <h1 style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #ffffff; margin: 0; font-size: 32px; font-weight: 700; letter-spacing: -0.5px;">Welcome to SalesOS!</h1>
                      <p style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: rgba(255,255,255,0.9); margin: 12px 0 0 0; font-size: 16px;">Your AI-powered sales operating system</p>
                    </td>
                  </tr>
                  
                  <!-- Content Area -->
                  <tr>
                    <td style="padding: 40px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
                      
                      <!-- Greeting -->
                      <h2 style="color: #18181b; margin: 0 0 16px 0; font-size: 24px; font-weight: 600;">Hey ${displayName}! 👋</h2>
                      <p style="color: #52525b; line-height: 1.7; margin: 0 0 32px 0; font-size: 16px;">
                        You just joined thousands of sales professionals using SalesOS to find better leads, close more deals, and save hours every week.
                      </p>
                      
                      <!-- Quick Start Guide Box -->
                      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background: linear-gradient(135deg, #faf5ff 0%, #f3e8ff 100%); border-radius: 12px; border: 1px solid #e9d5ff; margin-bottom: 32px;">
                        <tr>
                          <td style="padding: 28px;">
                            <h3 style="color: #7c3aed; margin: 0 0 24px 0; font-size: 18px; font-weight: 700;">🚀 Quick Start Guide</h3>
                            
                            <!-- Step 1: Sign In -->
                            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom: 20px;">
                              <tr>
                                <td width="44" valign="top">
                                  <div style="background: linear-gradient(135deg, #9b6dff 0%, #7c3aed 100%); color: #fff; width: 32px; height: 32px; border-radius: 50%; text-align: center; line-height: 32px; font-weight: 700; font-size: 14px;">1</div>
                                </td>
                                <td valign="top" style="padding-left: 12px;">
                                  <p style="color: #18181b; margin: 0 0 4px 0; font-size: 16px; font-weight: 600;">Sign in to your account</p>
                                  <p style="color: #71717a; margin: 0; font-size: 14px; line-height: 1.5;">Head to <a href="${appUrl}/auth" style="color: #7c3aed; text-decoration: none; font-weight: 500;">salesos.io/auth</a> and log in with your email. Use "Forgot password" if you need to set one up.</p>
                                </td>
                              </tr>
                            </table>
                            
                            <!-- Step 2: Search Leads -->
                            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom: 20px;">
                              <tr>
                                <td width="44" valign="top">
                                  <div style="background: linear-gradient(135deg, #9b6dff 0%, #7c3aed 100%); color: #fff; width: 32px; height: 32px; border-radius: 50%; text-align: center; line-height: 32px; font-weight: 700; font-size: 14px;">2</div>
                                </td>
                                <td valign="top" style="padding-left: 12px;">
                                  <p style="color: #18181b; margin: 0 0 4px 0; font-size: 16px; font-weight: 600;">Search for your first leads</p>
                                  <p style="color: #71717a; margin: 0; font-size: 14px; line-height: 1.5;">Go to <strong>Leads → Find Leads</strong> and use our AI-powered search to discover decision-makers at your target companies.</p>
                                </td>
                              </tr>
                            </table>
                            
                            <!-- Step 3: Save & Enrich -->
                            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom: 20px;">
                              <tr>
                                <td width="44" valign="top">
                                  <div style="background: linear-gradient(135deg, #9b6dff 0%, #7c3aed 100%); color: #fff; width: 32px; height: 32px; border-radius: 50%; text-align: center; line-height: 32px; font-weight: 700; font-size: 14px;">3</div>
                                </td>
                                <td valign="top" style="padding-left: 12px;">
                                  <p style="color: #18181b; margin: 0 0 4px 0; font-size: 16px; font-weight: 600;">Save leads & get contact info</p>
                                  <p style="color: #71717a; margin: 0; font-size: 14px; line-height: 1.5;">Click <strong>Save</strong> to add leads to your list. Use <strong>Enrich</strong> to unlock verified emails, phone numbers, and company data.</p>
                                </td>
                              </tr>
                            </table>
                            
                            <!-- Step 4: Build Pipeline -->
                            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom: 20px;">
                              <tr>
                                <td width="44" valign="top">
                                  <div style="background: linear-gradient(135deg, #9b6dff 0%, #7c3aed 100%); color: #fff; width: 32px; height: 32px; border-radius: 50%; text-align: center; line-height: 32px; font-weight: 700; font-size: 14px;">4</div>
                                </td>
                                <td valign="top" style="padding-left: 12px;">
                                  <p style="color: #18181b; margin: 0 0 4px 0; font-size: 16px; font-weight: 600;">Build your sales pipeline</p>
                                  <p style="color: #71717a; margin: 0; font-size: 14px; line-height: 1.5;">Head to <strong>Pipeline</strong> to create deals, track stages, and manage your entire sales process visually.</p>
                                </td>
                              </tr>
                            </table>
                            
                            <!-- Step 5: AI Coach -->
                            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                              <tr>
                                <td width="44" valign="top">
                                  <div style="background: linear-gradient(135deg, #9b6dff 0%, #7c3aed 100%); color: #fff; width: 32px; height: 32px; border-radius: 50%; text-align: center; line-height: 32px; font-weight: 700; font-size: 14px;">5</div>
                                </td>
                                <td valign="top" style="padding-left: 12px;">
                                  <p style="color: #18181b; margin: 0 0 4px 0; font-size: 16px; font-weight: 600;">Get AI sales coaching</p>
                                  <p style="color: #71717a; margin: 0; font-size: 14px; line-height: 1.5;">Visit the <strong>Coach</strong> tab for personalized tips, email drafts, and strategies to close deals faster.</p>
                                </td>
                              </tr>
                            </table>
                          </td>
                        </tr>
                      </table>
                      
                      <!-- Primary CTA Button -->
                      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                        <tr>
                          <td align="center" style="padding: 8px 0 32px 0;">
                            <a href="${appUrl}/auth" style="display: inline-block; background: linear-gradient(135deg, #9b6dff 0%, #7c3aed 100%); color: #ffffff; padding: 18px 48px; border-radius: 10px; text-decoration: none; font-weight: 600; font-size: 16px; box-shadow: 0 4px 14px rgba(124, 58, 237, 0.4);">
                              Sign In to SalesOS →
                            </a>
                          </td>
                        </tr>
                      </table>
                      
                      <!-- Pro Tips Section -->
                      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color: #fafafa; border-radius: 10px; margin-bottom: 28px;">
                        <tr>
                          <td style="padding: 24px;">
                            <h4 style="color: #18181b; margin: 0 0 16px 0; font-size: 15px; font-weight: 600;">💡 Pro Tips</h4>
                            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                              <tr>
                                <td style="color: #52525b; font-size: 14px; padding: 6px 0; line-height: 1.5;">✓ Use <strong>filters</strong> to narrow down leads by industry, location, and company size</td>
                              </tr>
                              <tr>
                                <td style="color: #52525b; font-size: 14px; padding: 6px 0; line-height: 1.5;">✓ Set up <strong>automations</strong> to save time on repetitive tasks</td>
                              </tr>
                              <tr>
                                <td style="color: #52525b; font-size: 14px; padding: 6px 0; line-height: 1.5;">✓ Check your <strong>Analytics</strong> dashboard weekly to track performance</td>
                              </tr>
                            </table>
                          </td>
                        </tr>
                      </table>
                      
                      <!-- Divider -->
                      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                        <tr>
                          <td style="padding: 8px 0 24px 0;">
                            <div style="border-top: 1px solid #e4e4e7;"></div>
                          </td>
                        </tr>
                      </table>
                      
                      <!-- Help Section -->
                      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                        <tr>
                          <td>
                            <p style="color: #71717a; font-size: 14px; line-height: 1.6; margin: 0;">
                              <strong style="color: #18181b;">Need help getting started?</strong><br>
                              Reply to this email or reach out to <a href="mailto:support@bdotindustries.com" style="color: #7c3aed; text-decoration: none;">support@bdotindustries.com</a> — we typically respond within a few hours.
                            </p>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                  
                  <!-- Footer -->
                  <tr>
                    <td align="center" style="background-color: #fafafa; padding: 24px 40px; border-top: 1px solid #e4e4e7; border-radius: 0 0 16px 16px;">
                      <p style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #a1a1aa; font-size: 12px; margin: 0;">
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
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { Resend } from "https://esm.sh/resend@2.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const generateTempPassword = () => {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%";
  let password = "";
  for (let i = 0; i < 12; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { email } = await req.json();

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
      apiVersion: "2025-08-27.basil",
    });

    const customers = await stripe.customers.list({ email, limit: 1 });
    
    if (customers.data.length === 0) {
      return new Response(
        JSON.stringify({ 
          error: "No subscription found. Please purchase a subscription first." 
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 403 }
      );
    }

    const subscriptions = await stripe.subscriptions.list({
      customer: customers.data[0].id,
      status: "active",
      limit: 1,
    });

    if (subscriptions.data.length === 0) {
      return new Response(
        JSON.stringify({ 
          error: "No active subscription found. Please purchase a subscription first." 
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 403 }
      );
    }

    const tempPassword = generateTempPassword();

    const { data: userData, error: userError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: tempPassword,
      email_confirm: true,
    });

    if (userError) throw userError;

    // Always use production domain for email links
    const appUrl = "https://salesos.alephwavex.io";
    const logoUrl = "https://ghgfjnepvxvxrncmskys.supabase.co/storage/v1/object/public/email-assets/salesos-logo.webp";

    // Send credentials email via Resend SDK
    try {
      const resendApiKey = Deno.env.get("RESEND_API_KEY");
      if (resendApiKey) {
        const resend = new Resend(resendApiKey);
        
        const { error: emailError } = await resend.emails.send({
          from: "SalesOS <support@bdotindustries.com>",
          to: [email],
          subject: "Welcome to SalesOS - Your Account Credentials",
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
              <title>Your Account Credentials</title>
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
                                <h1 style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #ffffff; margin: 0; font-size: 28px; font-weight: 700;">Welcome to SalesOS!</h1>
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
                                <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="#141414" style="background-color: #141414;">
                                  <tr>
                                    <td bgcolor="#141414" style="background-color: #141414;">
                                      <p style="color: #a1a1aa; line-height: 1.7; margin: 0 0 28px 0; font-size: 16px;">
                                        Thank you for choosing SalesOS. Your subscription has been activated and your account is ready to use.
                                      </p>
                                    </td>
                                  </tr>
                                </table>
                                
                                <!-- Credentials Box -->
                                <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="#1a1a1a" style="background-color: #1a1a1a; border-radius: 12px; border: 1px solid #2a2a2a; border-left: 4px solid #9b6dff; margin-bottom: 28px;">
                                  <tr>
                                    <td bgcolor="#1a1a1a" style="background-color: #1a1a1a; padding: 24px;">
                                      <h3 style="color: #ffffff; margin: 0 0 16px 0; font-size: 16px; font-weight: 600;">Your Login Credentials</h3>
                                      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="#1a1a1a" style="background-color: #1a1a1a;">
                                        <tr>
                                          <td bgcolor="#1a1a1a" style="background-color: #1a1a1a; color: #a1a1aa; padding: 6px 0; font-size: 14px;"><strong style="color: #ffffff;">Email:</strong> ${email}</td>
                                        </tr>
                                        <tr>
                                          <td bgcolor="#1a1a1a" style="background-color: #1a1a1a; color: #a1a1aa; padding: 6px 0; font-size: 14px;"><strong style="color: #ffffff;">Temporary Password:</strong> <code style="background: #333333; padding: 4px 8px; border-radius: 4px; color: #9b6dff; font-family: monospace;">${tempPassword}</code></td>
                                        </tr>
                                      </table>
                                    </td>
                                  </tr>
                                </table>
                                
                                <!-- CTA Button -->
                                <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="#141414" style="background-color: #141414;">
                                  <tr>
                                    <td bgcolor="#141414" align="center" style="background-color: #141414; padding: 8px 0 32px 0;">
                                      <a href="${appUrl}/auth" style="display: inline-block; background: linear-gradient(135deg, #9b6dff 0%, #7c3aed 100%); color: #ffffff; padding: 16px 40px; border-radius: 10px; text-decoration: none; font-weight: 600; font-size: 16px;">
                                        Sign In Now →
                                      </a>
                                    </td>
                                  </tr>
                                </table>
                                
                                <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="#141414" style="background-color: #141414;">
                                  <tr>
                                    <td bgcolor="#141414" style="background-color: #141414;">
                                      <p style="color: #71717a; font-size: 14px; line-height: 1.6; margin: 0;">
                                        <strong style="color: #a1a1aa;">Important:</strong> For your security, please change your password immediately after your first login.
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
                                        Need help? Contact us at <a href="mailto:support@bdotindustries.com" style="color: #9b6dff; text-decoration: none;">support@bdotindustries.com</a>
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
          console.error("Error sending credentials email:", emailError);
        }
      }
    } catch (emailError) {
      console.error("Error sending credentials email:", emailError);
    }

    return new Response(
      JSON.stringify({ success: true, user: userData.user }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
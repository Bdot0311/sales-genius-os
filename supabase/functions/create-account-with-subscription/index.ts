import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

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

    // Check if user has active subscription in Stripe
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

    // Generate temporary password
    const tempPassword = generateTempPassword();

    // Create user account with temp password
    const { data: userData, error: userError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: tempPassword,
      email_confirm: true,
    });

    if (userError) throw userError;

    const origin = req.headers.get("origin") || "https://salesos.io";

    // Send credentials email via Resend
    try {
      const resendApiKey = Deno.env.get("RESEND_API_KEY");
      if (resendApiKey) {
        const emailResponse = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${resendApiKey}`,
          },
          body: JSON.stringify({
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
                <meta name="color-scheme" content="dark">
                <meta name="supported-color-schemes" content="dark">
                <title>Your Account Credentials</title>
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
                              <p style="color: #a1a1aa; line-height: 1.6; margin: 0 0 24px 0;">
                                Thank you for choosing SalesOS. Your subscription has been activated and your account is ready to use.
                              </p>
                              
                              <table role="presentation" bgcolor="#1a1a1a" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #1a1a1a !important; border-radius: 8px; border: 1px solid #333333; border-left: 4px solid #9b6dff; margin: 24px 0;">
                                <tr>
                                  <td style="padding: 20px;">
                                    <h3 style="color: #fafafa; margin: 0 0 16px 0; font-size: 16px; font-weight: 600;">Your Login Credentials</h3>
                                    <p style="color: #a1a1aa; margin: 0 0 8px 0;"><strong style="color: #fafafa;">Email:</strong> ${email}</p>
                                    <p style="color: #a1a1aa; margin: 0;"><strong style="color: #fafafa;">Temporary Password:</strong> <code style="background: #333333; padding: 4px 8px; border-radius: 4px; color: #9b6dff;">${tempPassword}</code></p>
                                  </td>
                                </tr>
                              </table>
                              
                              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                                <tr>
                                  <td align="center" style="padding: 32px 0;">
                                    <a href="${origin}/auth" style="display: inline-block; background: linear-gradient(135deg, #9b6dff 0%, #b366e6 100%); color: #ffffff; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 16px;">
                                      Sign In Now
                                    </a>
                                  </td>
                                </tr>
                              </table>
                              
                              <p style="color: #71717a; font-size: 14px; line-height: 1.6; margin: 0;">
                                <strong style="color: #fafafa;">Important:</strong> For your security, please change your password immediately after your first login.
                              </p>
                              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                                <tr>
                                  <td style="padding: 30px 0;">
                                    <div style="border-top: 1px solid #333333;"></div>
                                  </td>
                                </tr>
                              </table>
                              <p style="color: #71717a; font-size: 12px; margin: 0; text-align: center;">
                                Need help? Contact us at <a href="mailto:support@bdotindustries.com" style="color: #9b6dff;">support@bdotindustries.com</a>
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
          }),
        });
      }
    } catch (emailError) {
      console.error("Error sending credentials email:", emailError);
      // Don't fail the account creation if email fails
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

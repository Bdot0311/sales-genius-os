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
              <html>
              <head>
                <meta charset="utf-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
              </head>
              <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #0a0a0a; margin: 0; padding: 40px 20px;">
                <div style="max-width: 500px; margin: 0 auto; background-color: #141414; border-radius: 12px; box-shadow: 0 4px 20px rgba(155, 109, 255, 0.15); overflow: hidden; border: 1px solid #333333;">
                  <div style="background: linear-gradient(135deg, #9b6dff 0%, #b366e6 100%); padding: 30px; text-align: center;">
                    <img src="https://salesos.alephwavex.io/salesos-logo.webp" alt="SalesOS Logo" style="width: 48px; height: 48px; border-radius: 10px; margin-bottom: 12px;" />
                    <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 600;">Welcome to SalesOS!</h1>
                  </div>
                  <div style="padding: 40px 30px;">
                    <p style="color: #a1a1aa; line-height: 1.6; margin: 0 0 24px 0;">
                      Thank you for choosing SalesOS. Your subscription has been activated and your account is ready to use.
                    </p>
                    
                    <div style="background-color: #1a1a1a; border-radius: 8px; padding: 20px; margin: 24px 0; border: 1px solid #333333; border-left: 4px solid #9b6dff;">
                      <h3 style="color: #fafafa; margin: 0 0 16px 0; font-size: 16px; font-weight: 600;">Your Login Credentials</h3>
                      <p style="color: #a1a1aa; margin: 0 0 8px 0;"><strong style="color: #fafafa;">Email:</strong> ${email}</p>
                      <p style="color: #a1a1aa; margin: 0;"><strong style="color: #fafafa;">Temporary Password:</strong> <code style="background: #333333; padding: 4px 8px; border-radius: 4px; color: #9b6dff;">${tempPassword}</code></p>
                    </div>
                    
                    <div style="text-align: center; margin: 32px 0;">
                      <a href="${req.headers.get("origin")}/auth" style="display: inline-block; background: linear-gradient(135deg, #9b6dff 0%, #b366e6 100%); color: #ffffff; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 16px;">
                        Sign In Now
                      </a>
                    </div>
                    
                    <p style="color: #71717a; font-size: 14px; line-height: 1.6; margin: 24px 0 0 0;">
                      <strong style="color: #fafafa;">Important:</strong> For your security, please change your password immediately after your first login.
                    </p>
                    <hr style="border: none; border-top: 1px solid #333333; margin: 30px 0;">
                    <p style="color: #71717a; font-size: 12px; margin: 0; text-align: center;">
                      Need help? Contact us at <a href="mailto:support@bdotindustries.com" style="color: #9b6dff;">support@bdotindustries.com</a>
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

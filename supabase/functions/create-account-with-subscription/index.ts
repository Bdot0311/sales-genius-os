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
            from: "SalesOS <noreply@bdotindustries.com>",
            to: [email],
            subject: "Welcome to SalesOS - Your Account Credentials",
            html: `
              <!DOCTYPE html>
              <html>
                <head>
                  <style>
                    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif; line-height: 1.6; color: #333; }
                    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                    .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
                    .header h1 { color: white; margin: 0; font-size: 28px; }
                    .content { background: #ffffff; padding: 40px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px; }
                    .credentials { background: #f9fafb; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #667eea; }
                    .button { display: inline-block; background: #667eea; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; margin: 20px 0; }
                    .footer { text-align: center; margin-top: 30px; color: #6b7280; font-size: 14px; }
                  </style>
                </head>
                <body>
                  <div class="container">
                    <div class="header">
                      <h1>Welcome to SalesOS!</h1>
                    </div>
                    <div class="content">
                      <p>Thank you for choosing SalesOS. Your subscription has been activated and your account is ready to use.</p>
                      
                      <div class="credentials">
                        <h2 style="margin-top: 0; color: #111827;">Your Login Credentials</h2>
                        <p><strong>Email:</strong> ${email}</p>
                        <p><strong>Temporary Password:</strong> <code style="background: #e5e7eb; padding: 4px 8px; border-radius: 4px;">${tempPassword}</code></p>
                      </div>
                      
                      <a href="${req.headers.get("origin")}/confirmation" class="button">Get Started</a>
                      
                      <p><strong>Important Security Notice:</strong></p>
                      <p>For your security, please change your password immediately after your first login. Click the "Forgot Password" link on the sign-in page to set your own secure password.</p>
                      
                      <div class="footer">
                        <p>Need help? Contact us at <a href="mailto:support@bdotindustries.com">support@bdotindustries.com</a></p>
                        <p>&copy; ${new Date().getFullYear()} SalesOS. All rights reserved.</p>
                      </div>
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

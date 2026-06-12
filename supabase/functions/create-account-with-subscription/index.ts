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
    // --- Authentication & Admin Authorization ---
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 401 }
      );
    }

    const supabaseAuth = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabaseAuth.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 401 }
      );
    }
    const callerUserId = claimsData.claims.sub;

    // Check admin role
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { data: adminRole } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", callerUserId)
      .eq("role", "admin")
      .maybeSingle();

    if (!adminRole) {
      return new Response(
        JSON.stringify({ error: "Forbidden" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 403 }
      );
    }

    // --- Business Logic ---
    const { email } = await req.json();

    if (!email || typeof email !== "string" || !email.includes("@")) {
      return new Response(
        JSON.stringify({ error: "Invalid request" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
      apiVersion: "2025-08-27.basil",
    });

    const customers = await stripe.customers.list({ email, limit: 1 });
    
    if (customers.data.length === 0) {
      return new Response(
        JSON.stringify({ error: "Unable to process this request. Please contact support." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    const subscriptions = await stripe.subscriptions.list({
      customer: customers.data[0].id,
      status: "active",
      limit: 1,
    });

    if (subscriptions.data.length === 0) {
      return new Response(
        JSON.stringify({ error: "Unable to process this request. Please contact support." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    const tempPassword = generateTempPassword();

    const { data: userData, error: userError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: tempPassword,
      email_confirm: true,
    });

    if (userError) {
      console.error("User creation error:", userError.message);
      return new Response(
        JSON.stringify({ error: "Unable to process this request. Please contact support." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    // Always use production domain for email links
    const appUrl = "https://salesos.alephwavex.io";
    const logoUrl = "https://ghgfjnepvxvxrncmskys.supabase.co/storage/v1/object/public/email-assets/salesos-logo.webp";

    // Send credentials email via Lovable email queue
    try {
      const credentialsHtml = `
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Your Account Credentials</title>
        </head>
        <body style="margin: 0; padding: 0; background-color: #0a0a0a;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="#0a0a0a" style="background-color: #0a0a0a;">
            <tr>
              <td align="center" bgcolor="#0a0a0a" style="background-color: #0a0a0a; padding: 40px 20px;">
                <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="540" bgcolor="#141414" style="max-width: 540px; background-color: #141414; border-radius: 16px; border: 1px solid #2a2a2a;">
                  <tr>
                    <td bgcolor="#9b6dff" align="center" style="background: linear-gradient(135deg, #9b6dff 0%, #7c3aed 100%); padding: 32px 40px; border-radius: 16px 16px 0 0;">
                      <img src="${logoUrl}" alt="OutReign" width="56" height="56" style="display: block; border-radius: 12px; margin-bottom: 16px;" />
                      <h1 style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #ffffff; margin: 0; font-size: 28px; font-weight: 700;">Welcome to OutReign!</h1>
                    </td>
                  </tr>
                  <tr>
                    <td bgcolor="#141414" style="background-color: #141414; padding: 40px 36px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
                      <p style="color: #a1a1aa; line-height: 1.7; margin: 0 0 28px 0; font-size: 16px;">
                        Thank you for choosing OutReign. Your subscription has been activated and your account is ready to use.
                      </p>
                      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="#1a1a1a" style="background-color: #1a1a1a; border-radius: 12px; border: 1px solid #2a2a2a; border-left: 4px solid #9b6dff; margin-bottom: 28px;">
                        <tr>
                          <td bgcolor="#1a1a1a" style="background-color: #1a1a1a; padding: 24px;">
                            <h3 style="color: #ffffff; margin: 0 0 16px 0; font-size: 16px; font-weight: 600;">Your Login Credentials</h3>
                            <p style="color: #a1a1aa; padding: 6px 0; font-size: 14px;">
                              <strong style="color: #ffffff;">Email:</strong> ${email}<br>
                              <strong style="color: #ffffff;">Temporary Password:</strong>
                              <code style="background: #333333; padding: 4px 8px; border-radius: 4px; color: #9b6dff; font-family: monospace;">${tempPassword}</code>
                            </p>
                          </td>
                        </tr>
                      </table>
                      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="#141414" style="background-color: #141414;">
                        <tr>
                          <td bgcolor="#141414" align="center" style="background-color: #141414; padding: 8px 0 32px 0;">
                            <a href="${appUrl}/auth" style="display: inline-block; background: linear-gradient(135deg, #9b6dff 0%, #7c3aed 100%); color: #ffffff; padding: 16px 40px; border-radius: 10px; text-decoration: none; font-weight: 600; font-size: 16px;">
                              Sign In Now →
                            </a>
                          </td>
                        </tr>
                      </table>
                      <p style="color: #71717a; font-size: 14px; line-height: 1.6; margin: 0;">
                        <strong style="color: #a1a1aa;">Important:</strong> For your security, please change your password immediately after your first login.
                      </p>
                      <div style="border-top: 1px solid #2a2a2a; margin: 24px 0 16px 0;"></div>
                      <p style="color: #52525b; font-size: 12px; margin: 0; text-align: center;">
                        Need help? Contact us at <a href="mailto:support@bdotindustries.com" style="color: #9b6dff; text-decoration: none;">support@bdotindustries.com</a>
                      </p>
                    </td>
                  </tr>
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
      `;

      const { error: emailError } = await supabaseAdmin.rpc('enqueue_email', {
        queue_name: 'transactional_emails',
        payload: {
          message_id: crypto.randomUUID(),
          to: email,
          from: 'OutReign <noreply@notify.bdotindustries.com>',
          sender_domain: 'notify.bdotindustries.com',
          subject: 'Welcome to OutReign - Your Account Credentials',
          html: credentialsHtml,
          text: `Welcome to OutReign! Email: ${email}, Temporary Password: ${tempPassword}. Sign in at ${appUrl}/auth. Please change your password after first login.`,
          purpose: 'transactional',
          label: 'account-credentials',
          idempotency_key: `account-creds-${userData.user?.id}-${Date.now()}`,
          queued_at: new Date().toISOString(),
        },
      });

      if (emailError) {
        console.error("Error enqueuing credentials email:", emailError);
      }
    } catch (emailError) {
      console.error("Error enqueuing credentials email:", emailError);
    }

    return new Response(
      JSON.stringify({ success: true, user: userData.user }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  } catch (error: any) {
    console.error("create-account-with-subscription error:", error.message);
    return new Response(
      JSON.stringify({ error: "Unable to process this request. Please contact support." }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});

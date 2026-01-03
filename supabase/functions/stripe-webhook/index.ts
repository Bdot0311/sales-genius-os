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

  const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY");
  const stripeWebhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  
  if (!stripeSecretKey) {
    console.error("STRIPE_SECRET_KEY not set");
    return new Response("Server configuration error", { status: 500 });
  }

  const stripe = new Stripe(stripeSecretKey, { apiVersion: "2025-08-27.basil" });
  
  const signature = req.headers.get("stripe-signature");
  const body = await req.text();

  let event: Stripe.Event;

  try {
    if (stripeWebhookSecret && signature) {
      event = stripe.webhooks.constructEvent(body, signature, stripeWebhookSecret);
    } else {
      // For testing without webhook secret
      event = JSON.parse(body);
    }
  } catch (err: any) {
    console.error("Webhook signature verification failed:", err.message);
    return new Response(`Webhook Error: ${err.message}`, { status: 400 });
  }

  console.log("Received Stripe event:", event.type);

  // Handle checkout.session.completed - this is when subscription is created
  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    
    // Only process subscription checkouts
    if (session.mode !== "subscription") {
      console.log("Not a subscription checkout, skipping account creation");
      return new Response(JSON.stringify({ received: true }), { 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      });
    }

    const customerEmail = session.customer_email || session.customer_details?.email;
    
    if (!customerEmail) {
      console.error("No email found in checkout session");
      return new Response(JSON.stringify({ error: "No email found" }), { 
        headers: { ...corsHeaders, "Content-Type": "application/json" }, 
        status: 400 
      });
    }

    console.log("Processing new subscription for:", customerEmail);

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Check if user already exists
    const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers();
    const userExists = existingUsers?.users?.some(u => u.email === customerEmail);

    if (userExists) {
      console.log("User already exists, skipping account creation for:", customerEmail);
      return new Response(JSON.stringify({ received: true, message: "User already exists" }), { 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      });
    }

    // Generate temp password and create user
    const tempPassword = generateTempPassword();

    try {
      const { data: userData, error: userError } = await supabaseAdmin.auth.admin.createUser({
        email: customerEmail,
        password: tempPassword,
        email_confirm: true,
      });

      if (userError) {
        console.error("Error creating user:", userError);
        throw userError;
      }

      console.log("User created successfully:", userData.user?.id);

      // Send welcome email with credentials
      const resendApiKey = Deno.env.get("RESEND_API_KEY");
      if (resendApiKey) {
        const resend = new Resend(resendApiKey);
        const appUrl = "https://salesos.alephwavex.io";
        const logoUrl = "https://ghgfjnepvxvxrncmskys.supabase.co/storage/v1/object/public/email-assets/salesos-logo.webp";
        
        const customerName = session.customer_details?.name || "there";

        const { error: emailError } = await resend.emails.send({
          from: "SalesOS <support@bdotindustries.com>",
          to: [customerEmail],
          subject: "Welcome to SalesOS — Your Login Credentials 🔐",
          html: `
            <!DOCTYPE html>
            <html lang="en">
            <head>
              <meta charset="utf-8">
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
              <meta http-equiv="X-UA-Compatible" content="IE=edge">
              <meta name="x-apple-disable-message-reformatting">
              <meta name="color-scheme" content="dark only">
              <meta name="supported-color-schemes" content="dark only">
              <title>Welcome to SalesOS</title>
            </head>
            <body style="margin: 0; padding: 0; background-color: #0a0a0a;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="#0a0a0a" style="background-color: #0a0a0a;">
                <tr>
                  <td align="center" bgcolor="#0a0a0a" style="background-color: #0a0a0a; padding: 40px 20px;">
                    <!-- Main Card -->
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="540" bgcolor="#141414" style="max-width: 540px; background-color: #141414; border-radius: 16px; border: 1px solid #2a2a2a;">
                      <!-- Purple Header Banner -->
                      <tr>
                        <td bgcolor="#9b6dff" align="center" style="background: linear-gradient(135deg, #9b6dff 0%, #7c3aed 100%); padding: 32px 40px; border-radius: 16px 16px 0 0;">
                          <img src="${logoUrl}" alt="SalesOS" width="56" height="56" style="display: block; border-radius: 12px; margin-bottom: 16px;" />
                          <h1 style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #ffffff; margin: 0; font-size: 28px; font-weight: 700;">Welcome to SalesOS!</h1>
                          <p style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: rgba(255,255,255,0.9); margin: 12px 0 0 0; font-size: 16px;">Your AI-powered sales operating system</p>
                        </td>
                      </tr>
                      <!-- Content Area -->
                      <tr>
                        <td bgcolor="#141414" style="background-color: #141414; padding: 40px 36px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
                          
                          <h2 style="color: #ffffff; margin: 0 0 16px 0; font-size: 22px; font-weight: 600;">Hey ${customerName}! 👋</h2>
                          <p style="color: #a1a1aa; line-height: 1.7; margin: 0 0 28px 0; font-size: 16px;">
                            You just joined thousands of sales professionals using SalesOS to find better leads, close more deals, and save hours every week.
                          </p>
                          
                          <!-- Credentials Box -->
                          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="#1a1a1a" style="background-color: #1a1a1a; border-radius: 12px; border: 1px solid #2a2a2a; border-left: 4px solid #9b6dff; margin-bottom: 28px;">
                            <tr>
                              <td bgcolor="#1a1a1a" style="background-color: #1a1a1a; padding: 24px;">
                                <h3 style="color: #9b6dff; margin: 0 0 16px 0; font-size: 16px; font-weight: 600;">🔐 Your Login Credentials</h3>
                                <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="#1a1a1a" style="background-color: #1a1a1a;">
                                  <tr>
                                    <td bgcolor="#1a1a1a" style="background-color: #1a1a1a; color: #a1a1aa; padding: 8px 0; font-size: 15px;">
                                      <strong style="color: #ffffff;">Email:</strong><br>
                                      <span style="color: #ffffff;">${customerEmail}</span>
                                    </td>
                                  </tr>
                                  <tr>
                                    <td bgcolor="#1a1a1a" style="background-color: #1a1a1a; color: #a1a1aa; padding: 8px 0; font-size: 15px;">
                                      <strong style="color: #ffffff;">Temporary Password:</strong><br>
                                      <code style="background: #333333; padding: 6px 12px; border-radius: 6px; color: #9b6dff; font-family: monospace; font-size: 16px; display: inline-block; margin-top: 4px;">${tempPassword}</code>
                                    </td>
                                  </tr>
                                </table>
                              </td>
                            </tr>
                          </table>
                          
                          <!-- Security Notice -->
                          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="#1a1a1a" style="background-color: #1a1a1a; border-radius: 10px; border: 1px solid #333333; margin-bottom: 28px;">
                            <tr>
                              <td bgcolor="#1a1a1a" style="background-color: #1a1a1a; padding: 16px 20px;">
                                <p style="color: #fbbf24; font-size: 14px; line-height: 1.6; margin: 0;">
                                  ⚠️ <strong>Security Notice:</strong> Please change your password after your first login for security.
                                </p>
                              </td>
                            </tr>
                          </table>
                          
                          <!-- Quick Start Guide Box -->
                          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="#1a1a1a" style="background-color: #1a1a1a; border-radius: 12px; border: 1px solid #333333; margin-bottom: 28px;">
                            <tr>
                              <td bgcolor="#1a1a1a" style="background-color: #1a1a1a; padding: 24px;">
                                <h3 style="color: #9b6dff; margin: 0 0 20px 0; font-size: 16px; font-weight: 700;">🚀 Quick Start Guide</h3>
                                
                                <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom: 18px;">
                                  <tr>
                                    <td width="32" valign="top">
                                      <div style="background: linear-gradient(135deg, #9b6dff 0%, #7c3aed 100%); color: #fff; width: 28px; height: 28px; border-radius: 50%; text-align: center; line-height: 28px; font-weight: 700; font-size: 14px;">1</div>
                                    </td>
                                    <td valign="top" style="padding-left: 12px;">
                                      <p style="color: #ffffff; margin: 0 0 4px 0; font-size: 15px; font-weight: 600;">Sign in to your account</p>
                                      <p style="color: #a1a1aa; margin: 0; font-size: 14px; line-height: 1.5;">Head to <a href="https://salesos.alephwavex.io/auth" style="color: #9b6dff; text-decoration: none;">salesos.alephwavex.io/auth</a> and log in with your email.</p>
                                    </td>
                                  </tr>
                                </table>
                                
                                <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom: 18px;">
                                  <tr>
                                    <td width="32" valign="top">
                                      <div style="background: linear-gradient(135deg, #9b6dff 0%, #7c3aed 100%); color: #fff; width: 28px; height: 28px; border-radius: 50%; text-align: center; line-height: 28px; font-weight: 700; font-size: 14px;">2</div>
                                    </td>
                                    <td valign="top" style="padding-left: 12px;">
                                      <p style="color: #ffffff; margin: 0 0 4px 0; font-size: 15px; font-weight: 600;">Search for your first leads</p>
                                      <p style="color: #a1a1aa; margin: 0; font-size: 14px; line-height: 1.5;">Go to <strong style="color: #ffffff;">Leads → Find Leads</strong> and use AI-powered search to discover decision-makers.</p>
                                    </td>
                                  </tr>
                                </table>
                                
                                <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom: 18px;">
                                  <tr>
                                    <td width="32" valign="top">
                                      <div style="background: linear-gradient(135deg, #9b6dff 0%, #7c3aed 100%); color: #fff; width: 28px; height: 28px; border-radius: 50%; text-align: center; line-height: 28px; font-weight: 700; font-size: 14px;">3</div>
                                    </td>
                                    <td valign="top" style="padding-left: 12px;">
                                      <p style="color: #ffffff; margin: 0 0 4px 0; font-size: 15px; font-weight: 600;">Save leads & get contact info</p>
                                      <p style="color: #a1a1aa; margin: 0; font-size: 14px; line-height: 1.5;">Click <strong style="color: #ffffff;">Save</strong> to add leads, then <strong style="color: #ffffff;">Enrich</strong> to unlock emails and phone numbers.</p>
                                    </td>
                                  </tr>
                                </table>
                                
                                <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom: 18px;">
                                  <tr>
                                    <td width="32" valign="top">
                                      <div style="background: linear-gradient(135deg, #9b6dff 0%, #7c3aed 100%); color: #fff; width: 28px; height: 28px; border-radius: 50%; text-align: center; line-height: 28px; font-weight: 700; font-size: 14px;">4</div>
                                    </td>
                                    <td valign="top" style="padding-left: 12px;">
                                      <p style="color: #ffffff; margin: 0 0 4px 0; font-size: 15px; font-weight: 600;">Build your sales pipeline</p>
                                      <p style="color: #a1a1aa; margin: 0; font-size: 14px; line-height: 1.5;">Head to <strong style="color: #ffffff;">Pipeline</strong> to create deals and track your sales process.</p>
                                    </td>
                                  </tr>
                                </table>
                                
                                <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                                  <tr>
                                    <td width="32" valign="top">
                                      <div style="background: linear-gradient(135deg, #9b6dff 0%, #7c3aed 100%); color: #fff; width: 28px; height: 28px; border-radius: 50%; text-align: center; line-height: 28px; font-weight: 700; font-size: 14px;">5</div>
                                    </td>
                                    <td valign="top" style="padding-left: 12px;">
                                      <p style="color: #ffffff; margin: 0 0 4px 0; font-size: 15px; font-weight: 600;">Get AI sales coaching</p>
                                      <p style="color: #a1a1aa; margin: 0; font-size: 14px; line-height: 1.5;">Visit the <strong style="color: #ffffff;">Coach</strong> tab for personalized tips and email drafts.</p>
                                    </td>
                                  </tr>
                                </table>
                              </td>
                            </tr>
                          </table>
                          
                          <!-- Primary CTA Button -->
                          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="#141414">
                            <tr>
                              <td bgcolor="#141414" align="center" style="background-color: #141414; padding: 8px 0 32px 0;">
                                <a href="${appUrl}/auth" style="display: inline-block; background: linear-gradient(135deg, #9b6dff 0%, #7c3aed 100%); color: #ffffff; padding: 18px 48px; border-radius: 10px; text-decoration: none; font-weight: 600; font-size: 16px; box-shadow: 0 4px 14px rgba(124, 58, 237, 0.4);">
                                  Sign In to SalesOS →
                                </a>
                              </td>
                            </tr>
                          </table>
                          
                          <!-- Divider -->
                          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="#141414">
                            <tr>
                              <td bgcolor="#141414" style="background-color: #141414; padding: 8px 0 16px 0;">
                                <div style="border-top: 1px solid #2a2a2a;"></div>
                              </td>
                            </tr>
                          </table>
                          
                          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="#141414">
                            <tr>
                              <td bgcolor="#141414" align="center" style="background-color: #141414;">
                                <p style="color: #52525b; font-size: 13px; margin: 0;">
                                  Need help? Contact <a href="mailto:support@bdotindustries.com" style="color: #9b6dff; text-decoration: none;">support@bdotindustries.com</a>
                                </p>
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
          console.error("Error sending welcome email:", emailError);
        } else {
          console.log("Welcome email sent successfully to:", customerEmail);
        }
      }

      return new Response(JSON.stringify({ 
        received: true, 
        message: "Account created successfully",
        userId: userData.user?.id 
      }), { 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      });

    } catch (error: any) {
      console.error("Error in account creation:", error);
      return new Response(JSON.stringify({ error: error.message }), { 
        headers: { ...corsHeaders, "Content-Type": "application/json" }, 
        status: 500 
      });
    }
  }

  // Handle subscription cancellation
  if (event.type === "customer.subscription.deleted") {
    const subscription = event.data.object as Stripe.Subscription;
    console.log("Subscription cancelled:", subscription.id);
    // You can add logic here to deactivate user account if needed
  }

  return new Response(JSON.stringify({ received: true }), { 
    headers: { ...corsHeaders, "Content-Type": "application/json" } 
  });
});
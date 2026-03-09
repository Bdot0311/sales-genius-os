import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { Resend } from "https://esm.sh/resend@2.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Price ID to plan mapping
// Monthly = credits reset each cycle, Yearly = full annual pool granted upfront
const PRICE_TO_PLAN: Record<string, { plan: 'starter' | 'growth' | 'pro', credits: number, dailyLimit: number, leadsLimit: number, isYearly: boolean }> = {
  // Starter Monthly - 400 credits/month
  'price_1T8tywFTerosS6hi0fHQuybr': { plan: 'starter', credits: 400, dailyLimit: 50, leadsLimit: 400, isYearly: false },
  // Starter Yearly - 4,800 credits upfront (400 x 12)
  'price_1T8tyxFTerosS6hiSakB51fA': { plan: 'starter', credits: 4800, dailyLimit: 50, leadsLimit: 400, isYearly: true },
  // Growth Monthly - 1,200 credits/month
  'price_1T8tyyFTerosS6hiTsTXkWDa': { plan: 'growth', credits: 1200, dailyLimit: 150, leadsLimit: 1200, isYearly: false },
  // Growth Yearly - 14,400 credits upfront
  'price_1T8tyzFTerosS6hiUyzpHnCK': { plan: 'growth', credits: 14400, dailyLimit: 150, leadsLimit: 1200, isYearly: true },
  // Pro Monthly - 3,000 credits/month
  'price_1T8tz0FTerosS6hiKJluR3kk': { plan: 'pro', credits: 3000, dailyLimit: 400, leadsLimit: 3000, isYearly: false },
  // Pro Yearly - 36,000 credits upfront
  'price_1T8tz0FTerosS6hiIHNG82Bh': { plan: 'pro', credits: 36000, dailyLimit: 400, leadsLimit: 3000, isYearly: true },
  // Legacy prices (all monthly)
  'price_1SmM2hFTerosS6hiiDXBDIxl': { plan: 'growth', credits: 1200, dailyLimit: 150, leadsLimit: 1200, isYearly: false },
  'price_1SS44wFTerosS6hiCkKQnnoD': { plan: 'growth', credits: 1200, dailyLimit: 150, leadsLimit: 1200, isYearly: false },
  'price_1SS456FTerosS6hisBSDPwo4': { plan: 'pro', credits: 3000, dailyLimit: 400, leadsLimit: 3000, isYearly: false },
  'price_1SS45HFTerosS6hiQtxsNVL4': { plan: 'elite', credits: 999999, dailyLimit: 500, leadsLimit: 999999, isYearly: false },
};

// Product ID to plan mapping (fallback)
const PRODUCT_TO_PLAN: Record<string, 'starter' | 'growth' | 'pro' | 'elite'> = {
  // New product IDs
  'prod_U78FZoAWovU1rX': 'starter',
  'prod_U78FC92stOkRxS': 'starter',
  'prod_U78Ff02VQAzrLC': 'growth',
  'prod_U78Fk0l7swAukt': 'growth',
  'prod_U78Fs2HpZzcZJc': 'pro',
  'prod_U78Fuo9Mg04kz9': 'pro',
  // Legacy product IDs
  'prod_TjpiXbauY0T3RF': 'growth',
  'prod_TOrozUbuuN18RP': 'pro',
  'prod_TOrod7SaIV2D7s': 'elite',
  'prod_U6gflsh1Zzoh3V': 'starter',
  'prod_U6gfTND3QdfgcC': 'growth',
  'prod_U6gfOj1Xgfd1vy': 'pro',
};

const generateTempPassword = () => {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%";
  let password = "";
  for (let i = 0; i < 12; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[STRIPE-WEBHOOK] ${step}${detailsStr}`);
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

  logStep("Received Stripe event", { type: event.type });

  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );

  // Handle checkout.session.completed - this is when subscription is created
  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    
    logStep("Checkout session completed", { 
      mode: session.mode, 
      customerId: session.customer,
      subscriptionId: session.subscription 
    });

    // Only process subscription checkouts
    if (session.mode !== "subscription") {
      logStep("Not a subscription checkout, skipping account creation");
      return new Response(JSON.stringify({ received: true }), { 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      });
    }

    const customerEmail = session.customer_email || session.customer_details?.email;
    const customerId = session.customer as string;
    const subscriptionId = session.subscription as string;
    
    if (!customerEmail) {
      console.error("No email found in checkout session");
      return new Response(JSON.stringify({ error: "No email found" }), { 
        headers: { ...corsHeaders, "Content-Type": "application/json" }, 
        status: 400 
      });
    }

    logStep("Processing new subscription", { email: customerEmail, customerId, subscriptionId });

    // Get subscription details to determine plan
    let planDetails = PRICE_TO_PLAN['price_1SmM2hFTerosS6hiiDXBDIxl']; // Default to growth
    let priceId = '';
    
    if (subscriptionId) {
      try {
        const subscription = await stripe.subscriptions.retrieve(subscriptionId);
        priceId = subscription.items.data[0]?.price?.id || '';
        const productId = subscription.items.data[0]?.price?.product as string;
        
        logStep("Retrieved subscription details", { priceId, productId });
        
        if (priceId && PRICE_TO_PLAN[priceId]) {
          planDetails = PRICE_TO_PLAN[priceId];
        } else if (productId && PRODUCT_TO_PLAN[productId]) {
          const planName = PRODUCT_TO_PLAN[productId];
          planDetails = PRICE_TO_PLAN[Object.keys(PRICE_TO_PLAN).find(k => PRICE_TO_PLAN[k].plan === planName) || ''] || planDetails;
        }
        
        logStep("Determined plan", { plan: planDetails.plan, credits: planDetails.credits });
      } catch (err) {
        logStep("Error retrieving subscription, using default plan", { error: err });
      }
    }

    // Check if user already exists
    const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers();
    const existingUser = existingUsers?.users?.find(u => u.email === customerEmail);

    if (existingUser) {
      logStep("User already exists, updating subscription", { userId: existingUser.id });
      
      // Update existing user's subscription
      const { error: updateError } = await supabaseAdmin
        .from('subscriptions')
        .update({
          plan: planDetails.plan,
          status: 'active',
          account_status: 'active',
          stripe_customer_id: customerId,
          stripe_subscription_id: subscriptionId,
          search_credits_base: planDetails.credits,
          search_credits_remaining: planDetails.credits,
          leads_limit: planDetails.leadsLimit,
          current_period_start: new Date().toISOString(),
          current_period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          credits_reset_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', existingUser.id);

      if (updateError) {
        logStep("Error updating subscription", { error: updateError });
      } else {
        logStep("Subscription updated successfully for existing user");
      }

      return new Response(JSON.stringify({ received: true, message: "Subscription updated" }), { 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      });
    }

    // Generate temp password and create new user
    const tempPassword = generateTempPassword();

    try {
      const { data: userData, error: userError } = await supabaseAdmin.auth.admin.createUser({
        email: customerEmail,
        password: tempPassword,
        email_confirm: true,
      });

      if (userError) {
        logStep("Error creating user", { error: userError });
        throw userError;
      }

      logStep("User created successfully", { userId: userData.user?.id });

      // Update the subscription that was auto-created by the trigger
      if (userData.user?.id) {
        const { error: subError } = await supabaseAdmin
          .from('subscriptions')
          .update({
            plan: planDetails.plan,
            status: 'active',
            account_status: 'active',
            stripe_customer_id: customerId,
            stripe_subscription_id: subscriptionId,
            search_credits_base: planDetails.credits,
            search_credits_remaining: planDetails.credits,
            leads_limit: planDetails.leadsLimit,
            current_period_start: new Date().toISOString(),
            current_period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
            credits_reset_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          })
          .eq('user_id', userData.user.id);

        if (subError) {
          logStep("Error updating new user subscription", { error: subError });
        } else {
          logStep("New user subscription updated", { plan: planDetails.plan, credits: planDetails.credits });
        }
      }

      // Send welcome email with credentials
      const resendApiKey = Deno.env.get("RESEND_API_KEY");
      if (resendApiKey) {
        const resend = new Resend(resendApiKey);
        const appUrl = "https://salesos.alephwavex.io";
        const logoUrl = "https://ghgfjnepvxvxrncmskys.supabase.co/storage/v1/object/public/email-assets/salesos-logo.webp";
        
        const customerName = session.customer_details?.name || "there";
        const planName = planDetails.plan.charAt(0).toUpperCase() + planDetails.plan.slice(1);

        const { error: emailError } = await resend.emails.send({
          from: "SalesOS <support@bdotindustries.com>",
          to: [customerEmail],
          subject: `Welcome to SalesOS ${planName} - Your Login Credentials 🔐`,
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
                          <h1 style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #ffffff; margin: 0; font-size: 28px; font-weight: 700;">Welcome to SalesOS ${planName}!</h1>
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
                          
                          <!-- Plan Details Box -->
                          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="#1a1a1a" style="background-color: #1a1a1a; border-radius: 12px; border: 1px solid #2a2a2a; margin-bottom: 20px;">
                            <tr>
                              <td bgcolor="#1a1a1a" style="background-color: #1a1a1a; padding: 20px;">
                                <h3 style="color: #9b6dff; margin: 0 0 12px 0; font-size: 16px; font-weight: 600;">📊 Your ${planName} Plan Includes:</h3>
                                <p style="color: #ffffff; margin: 0; font-size: 15px;">
                                  • <strong>${planDetails.credits.toLocaleString()}</strong> search credits/month<br>
                                  • Up to <strong>${planDetails.dailyLimit}</strong> searches/day<br>
                                  • Lead Intelligence Engine<br>
                                  • AI-powered enrichment & scoring
                                </p>
                              </td>
                            </tr>
                          </table>
                          
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
          logStep("Error sending welcome email", { error: emailError });
        } else {
          logStep("Welcome email sent successfully", { email: customerEmail });
        }
      }

      return new Response(JSON.stringify({ 
        received: true, 
        message: "Account created successfully",
        userId: userData.user?.id,
        plan: planDetails.plan
      }), { 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      });

    } catch (error: any) {
      logStep("Error in account creation", { error: error.message });
      return new Response(JSON.stringify({ error: error.message }), { 
        headers: { ...corsHeaders, "Content-Type": "application/json" }, 
        status: 500 
      });
    }
  }

  // Handle subscription updates (plan changes, renewals)
  if (event.type === "customer.subscription.updated") {
    const subscription = event.data.object as Stripe.Subscription;
    const customerId = subscription.customer as string;
    const priceId = subscription.items.data[0]?.price?.id || '';
    
    logStep("Subscription updated", { subscriptionId: subscription.id, priceId, status: subscription.status });
    
    // Get customer email to find user
    try {
      const customer = await stripe.customers.retrieve(customerId) as Stripe.Customer;
      const customerEmail = customer.email;
      
      if (customerEmail) {
        // Find user by email
        const { data: profile } = await supabaseAdmin
          .from('profiles')
          .select('id')
          .eq('email', customerEmail)
          .single();
        
        if (profile) {
          const planDetails = PRICE_TO_PLAN[priceId] || PRICE_TO_PLAN['price_1SmM2hFTerosS6hiiDXBDIxl'];
          
          const { error: updateError } = await supabaseAdmin
            .from('subscriptions')
            .update({
              plan: planDetails.plan,
              status: subscription.status === 'active' ? 'active' : 'inactive',
              account_status: subscription.status === 'active' ? 'active' : subscription.status,
              stripe_subscription_id: subscription.id,
              search_credits_base: planDetails.credits,
              leads_limit: planDetails.leadsLimit,
              current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
              current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq('user_id', profile.id);
          
          if (updateError) {
            logStep("Error updating subscription on renewal", { error: updateError });
          } else {
            logStep("Subscription updated successfully", { userId: profile.id, plan: planDetails.plan });
          }
        }
      }
    } catch (err) {
      logStep("Error processing subscription update", { error: err });
    }
  }

  // Handle invoice paid (credits reset/add on billing cycle)
  if (event.type === "invoice.paid") {
    const invoice = event.data.object as Stripe.Invoice;
    const customerId = invoice.customer as string;
    const subscriptionId = invoice.subscription as string;
    
    logStep("Invoice paid", { invoiceId: invoice.id, customerId, subscriptionId });
    
    if (subscriptionId) {
      try {
        const subscription = await stripe.subscriptions.retrieve(subscriptionId);
        const priceId = subscription.items.data[0]?.price?.id || '';
        const customer = await stripe.customers.retrieve(customerId) as Stripe.Customer;
        const customerEmail = customer.email;
        
        if (customerEmail) {
          const { data: profile } = await supabaseAdmin
            .from('profiles')
            .select('id')
            .eq('email', customerEmail)
            .single();
          
          if (profile) {
            const planDetails = PRICE_TO_PLAN[priceId] || PRICE_TO_PLAN['price_1SmM2hFTerosS6hiiDXBDIxl'];
            
            // Get current credits for rollover calculation
            const { data: currentSub } = await supabaseAdmin
              .from('subscriptions')
              .select('search_credits_remaining')
              .eq('user_id', profile.id)
              .single();
            
            // Credits logic:
            // - Yearly plans: full annual pool granted upfront, reset to full pool on renewal
            // - Monthly Starter: reset to 400 each month (no rollover)
            // - Monthly Growth/Pro: rollover - ADD new credits to existing balance
            let newCredits = planDetails.credits;
            
            if (!planDetails.isYearly && (planDetails.plan === 'growth' || planDetails.plan === 'pro')) {
              // Monthly Growth/Pro: rollover - add credits to existing balance
              const existingCredits = currentSub?.search_credits_remaining || 0;
              newCredits = existingCredits + planDetails.credits;
              logStep("Monthly rollover: adding credits", { existing: existingCredits, adding: planDetails.credits, total: newCredits });
            } else {
              // Yearly (all plans): full pool upfront / reset on renewal
              // Monthly Starter: reset to base
              logStep("Setting credits", { isYearly: planDetails.isYearly, plan: planDetails.plan, credits: newCredits });
            }
            
            const { error: updateError } = await supabaseAdmin
              .from('subscriptions')
              .update({
                search_credits_remaining: newCredits,
                daily_searches_used: 0,
                credits_reset_at: new Date(subscription.current_period_end * 1000).toISOString(),
                current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
                current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
                updated_at: new Date().toISOString(),
              })
              .eq('user_id', profile.id);
            
            if (updateError) {
              logStep("Error resetting credits", { error: updateError });
            } else {
              logStep("Credits reset on new billing cycle", { userId: profile.id, credits: planDetails.credits });
            }
          }
        }
      } catch (err) {
        logStep("Error processing invoice paid", { error: err });
      }
    }
  }

  // Handle subscription cancellation
  if (event.type === "customer.subscription.deleted") {
    const subscription = event.data.object as Stripe.Subscription;
    const customerId = subscription.customer as string;
    
    logStep("Subscription cancelled", { subscriptionId: subscription.id });
    
    try {
      const customer = await stripe.customers.retrieve(customerId) as Stripe.Customer;
      const customerEmail = customer.email;
      
      if (customerEmail) {
        const { data: profile } = await supabaseAdmin
          .from('profiles')
          .select('id')
          .eq('email', customerEmail)
          .single();
        
        if (profile) {
          const { error: updateError } = await supabaseAdmin
            .from('subscriptions')
            .update({
              status: 'cancelled',
              account_status: 'cancelled',
              updated_at: new Date().toISOString(),
            })
            .eq('user_id', profile.id);
          
          if (updateError) {
            logStep("Error updating cancelled subscription", { error: updateError });
          } else {
            logStep("Subscription marked as cancelled", { userId: profile.id });
          }
        }
      }
    } catch (err) {
      logStep("Error processing subscription cancellation", { error: err });
    }
  }

  return new Response(JSON.stringify({ received: true }), { 
    headers: { ...corsHeaders, "Content-Type": "application/json" } 
  });
});

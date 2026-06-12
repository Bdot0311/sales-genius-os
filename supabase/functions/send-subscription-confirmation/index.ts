import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!token || !serviceKey || token !== serviceKey) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 401,
    });
  }

  try {
    const { email, name, plan, amount } = await req.json();
    
    if (!email || typeof email !== 'string' || !email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
      return new Response(
        JSON.stringify({ error: "Valid email address required" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    console.log("Sending subscription confirmation to:", email);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    const displayName = name || "there";
    const planName = plan || "Growth";
    const planAmount = amount || "$29";
    const appUrl = "https://salesos.alephwavex.io";
    const logoUrl = "https://ghgfjnepvxvxrncmskys.supabase.co/storage/v1/object/public/email-assets/salesos-logo.webp";

    const planFeatures: Record<string, string[]> = {
      starter: ["1,000 prospect credits per month", "Basic lead enrichment", "AI email generator", "Email support"],
      growth: ["2,500 prospect credits per month", "Standard lead enrichment", "Pipeline management", "Credits roll over monthly", "Email support"],
      pro: ["5,000 prospect credits per month", "Premium lead enrichment", "AI Sales Coach", "Workflow automations", "API access & integrations", "Team collaboration", "Priority support"],
      agency: ["15,000 prospect credits per month", "White-label client portal", "Branded PDF reports", "Priority API access", "Dedicated account support"]
    };

    const features = planFeatures[planName.toLowerCase()] || planFeatures.starter;
    const messageId = crypto.randomUUID();

    const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Subscription Confirmed</title></head>
<body style="margin: 0; padding: 0; background-color: #0a0a0a;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="#0a0a0a" style="background-color: #0a0a0a;">
    <tr><td align="center" bgcolor="#0a0a0a" style="background-color: #0a0a0a; padding: 40px 20px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="540" bgcolor="#141414" style="max-width: 540px; background-color: #141414; border-radius: 16px; border: 1px solid #2a2a2a;">
        <tr><td bgcolor="#9b6dff" align="center" style="background: linear-gradient(135deg, #9b6dff 0%, #7c3aed 100%); padding: 32px 40px; border-radius: 16px 16px 0 0;">
          <img src="${logoUrl}" alt="OutReign" width="56" height="56" style="display: block; border-radius: 12px; margin-bottom: 16px;" />
          <h1 style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #ffffff; margin: 0; font-size: 28px; font-weight: 700;">Subscription Confirmed!</h1>
        </td></tr>
        <tr><td bgcolor="#141414" style="background-color: #141414; padding: 40px 36px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
          <h2 style="color: #ffffff; margin: 0 0 16px 0; font-size: 22px; font-weight: 600;">Hey ${displayName}! 🎉</h2>
          <p style="color: #a1a1aa; line-height: 1.7; margin: 0 0 28px 0; font-size: 16px;">Thank you for subscribing to OutReign! Your <strong style="color: #9b6dff;">${planName} Plan</strong> is now active.</p>
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="#1a1a1a" style="background-color: #1a1a1a; border-radius: 12px; border: 1px solid #2a2a2a; margin-bottom: 24px;">
            <tr><td bgcolor="#1a1a1a" style="background-color: #1a1a1a; padding: 24px;">
              <h3 style="color: #ffffff; margin: 0 0 16px 0; font-size: 16px; font-weight: 600;">Your Plan Details</h3>
              <p style="color: #71717a; margin: 0; font-size: 14px;">Plan: <strong style="color: #ffffff;">${planName}</strong> | Amount: <strong style="color: #ffffff;">${planAmount}/month</strong></p>
            </td></tr>
          </table>
          <p style="color: #ffffff; margin: 0 0 16px 0; font-size: 15px; font-weight: 600;">What's included:</p>
          ${features.map(f => `<p style="color: #a1a1aa; margin: 0 0 4px 0; font-size: 14px;">✓ ${f}</p>`).join('')}
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="#141414" style="margin-top: 28px;">
            <tr><td bgcolor="#141414" align="center" style="background-color: #141414; padding: 8px 0 32px 0;">
              <a href="${appUrl}/dashboard" style="display: inline-block; background: linear-gradient(135deg, #9b6dff 0%, #7c3aed 100%); color: #ffffff; padding: 16px 40px; border-radius: 10px; text-decoration: none; font-weight: 600; font-size: 16px;">Start Using OutReign →</a>
            </td></tr>
          </table>
          <p style="color: #71717a; font-size: 14px; line-height: 1.6; margin: 0;">You can manage your subscription anytime from your account settings.</p>
        </td></tr>
        <tr><td bgcolor="#0f0f0f" align="center" style="background-color: #0f0f0f; padding: 24px 36px; border-top: 1px solid #2a2a2a; border-radius: 0 0 16px 16px;">
          <p style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #52525b; font-size: 12px; margin: 0;">© ${new Date().getFullYear()} BDØT Industries LLC. All rights reserved.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

    const { error: enqueueError } = await supabase.rpc('enqueue_email', {
      queue_name: 'transactional_emails',
      payload: {
        message_id: messageId,
        to: email,
        from: `OutReign <noreply@notify.bdotindustries.com>`,
        sender_domain: 'notify.bdotindustries.com',
        subject: `You're now on the ${planName} Plan! 🎉`,
        html,
        text: `Hey ${displayName}! Your ${planName} Plan is now active. Start using OutReign at ${appUrl}/dashboard`,
        purpose: 'transactional',
        label: 'subscription-confirmation',
        idempotency_key: `sub-confirm-${email}-${Date.now()}`,
        queued_at: new Date().toISOString(),
      },
    });

    if (enqueueError) throw new Error("Failed to enqueue email");

    await supabase.from('email_send_log').insert({
      message_id: messageId,
      template_name: 'subscription-confirmation',
      recipient_email: email,
      status: 'pending',
    });

    console.log("Subscription confirmation email enqueued successfully");
    return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 });
  } catch (error: any) {
    console.error("Subscription confirmation email error:", error);
    return new Response(JSON.stringify({ error: error.message }), { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 });
  }
});

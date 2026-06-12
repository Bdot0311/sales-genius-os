import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[RATE-LIMIT-ALERT] ${step}${detailsStr}`);
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
    logStep("Function started");

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    const { apiKeyId, userId, keyName, usage, limit, limitType } = await req.json();

    if (!apiKeyId || !userId || !keyName || usage === undefined || !limit || !limitType) {
      throw new Error("Missing required fields");
    }

    logStep("Received alert request", { apiKeyId, userId, keyName, limitType });

    const { data: profile } = await supabaseClient
      .from("profiles")
      .select("email, full_name")
      .eq("id", userId)
      .single();

    if (!profile) throw new Error("User profile not found");

    const percentage = Math.round((usage / limit) * 100);
    const isExceeded = usage >= limit;
    const subject = isExceeded 
      ? `⚠️ API Rate Limit Exceeded - ${keyName}`
      : `⚡ API Rate Limit Warning - ${keyName}`;

    const emailHtml = `<!DOCTYPE html><html><head><style>
      body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
      .container { max-width: 600px; margin: 0 auto; padding: 20px; }
      .header { background: ${isExceeded ? '#EF4444' : '#F59E0B'}; color: white; padding: 20px; border-radius: 8px 8px 0 0; }
      .content { background: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px; }
      .alert-box { background: white; padding: 20px; border-left: 4px solid ${isExceeded ? '#EF4444' : '#F59E0B'}; margin: 20px 0; }
      .stat-value { font-size: 24px; font-weight: bold; color: ${isExceeded ? '#EF4444' : '#F59E0B'}; }
    </style></head><body>
      <div class="container">
        <div class="header"><h1>${isExceeded ? '⚠️ Rate Limit Exceeded' : '⚡ Rate Limit Warning'}</h1></div>
        <div class="content">
          <p>Hello ${profile.full_name || 'there'},</p>
          <div class="alert-box">
            <h2>API Key: ${keyName}</h2>
            <p>${isExceeded ? `Your API key has exceeded its ${limitType} rate limit.` : `Your API key is at ${percentage}% of its ${limitType} rate limit.`}</p>
          </div>
          <p>Usage: <strong>${usage.toLocaleString()}</strong> / ${limit.toLocaleString()} (${percentage}%)</p>
          <p style="margin-top: 30px; font-size: 12px; color: #6b7280;">Automated alert from OutReign API monitoring.</p>
        </div>
      </div>
    </body></html>`;

    const messageId = crypto.randomUUID();

    const { error: enqueueError } = await supabaseClient.rpc('enqueue_email', {
      queue_name: 'transactional_emails',
      payload: {
        message_id: messageId,
        to: profile.email,
        from: `OutReign <noreply@notify.bdotindustries.com>`,
        sender_domain: 'notify.bdotindustries.com',
        subject,
        html: emailHtml,
        text: `Rate limit ${isExceeded ? 'exceeded' : 'warning'} for API key ${keyName}: ${usage}/${limit} (${percentage}%)`,
        purpose: 'transactional',
        label: 'rate-limit-alert',
        idempotency_key: `rate-limit-${apiKeyId}-${Date.now()}`,
        queued_at: new Date().toISOString(),
      },
    });

    if (enqueueError) throw enqueueError;

    await supabaseClient.from('email_send_log').insert({
      message_id: messageId,
      template_name: 'rate-limit-alert',
      recipient_email: profile.email,
      status: 'pending',
    });

    logStep("Email enqueued successfully");

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("ERROR", { message: errorMessage });
    return new Response(JSON.stringify({ error: errorMessage }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});

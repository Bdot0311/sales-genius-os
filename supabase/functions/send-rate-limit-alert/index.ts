import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { Resend } from "https://esm.sh/resend@2.0.0";

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

  try {
    logStep("Function started");

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

    const { apiKeyId, userId, keyName, usage, limit, limitType } = await req.json();

    if (!apiKeyId || !userId || !keyName || usage === undefined || !limit || !limitType) {
      throw new Error("Missing required fields");
    }

    logStep("Received alert request", { apiKeyId, userId, keyName, limitType });

    // Get user email
    const { data: profile } = await supabaseClient
      .from("profiles")
      .select("email, full_name")
      .eq("id", userId)
      .single();

    if (!profile) {
      throw new Error("User profile not found");
    }

    const percentage = Math.round((usage / limit) * 100);
    const isExceeded = usage >= limit;
    const subject = isExceeded 
      ? `⚠️ API Rate Limit Exceeded - ${keyName}`
      : `⚡ API Rate Limit Warning - ${keyName}`;

    const emailHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: ${isExceeded ? '#EF4444' : '#F59E0B'}; color: white; padding: 20px; border-radius: 8px 8px 0 0; }
            .content { background: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px; }
            .alert-box { background: white; padding: 20px; border-left: 4px solid ${isExceeded ? '#EF4444' : '#F59E0B'}; margin: 20px 0; }
            .stats { display: flex; justify-content: space-between; margin: 20px 0; }
            .stat { text-align: center; }
            .stat-value { font-size: 24px; font-weight: bold; color: ${isExceeded ? '#EF4444' : '#F59E0B'}; }
            .stat-label { font-size: 12px; color: #6b7280; text-transform: uppercase; }
            .button { background: #8B5CF6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; margin-top: 20px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>${isExceeded ? '⚠️ Rate Limit Exceeded' : '⚡ Rate Limit Warning'}</h1>
            </div>
            <div class="content">
              <p>Hello ${profile.full_name || 'there'},</p>
              
              <div class="alert-box">
                <h2>API Key: ${keyName}</h2>
                <p>${isExceeded 
                  ? `Your API key has exceeded its ${limitType} rate limit. Requests are now being rejected.`
                  : `Your API key is approaching its ${limitType} rate limit at ${percentage}% usage.`
                }</p>
              </div>

              <div class="stats">
                <div class="stat">
                  <div class="stat-value">${usage.toLocaleString()}</div>
                  <div class="stat-label">Current Usage</div>
                </div>
                <div class="stat">
                  <div class="stat-value">${limit.toLocaleString()}</div>
                  <div class="stat-label">Limit</div>
                </div>
                <div class="stat">
                  <div class="stat-value">${percentage}%</div>
                  <div class="stat-label">Percentage</div>
                </div>
              </div>

              <h3>Recommended Actions:</h3>
              <ul>
                ${isExceeded 
                  ? `
                    <li>Review your API usage patterns</li>
                    <li>Consider upgrading your rate limits in settings</li>
                    <li>Implement request caching to reduce API calls</li>
                    <li>Contact support if you need immediate assistance</li>
                  `
                  : `
                    <li>Monitor your API usage closely</li>
                    <li>Optimize your integration to reduce unnecessary calls</li>
                    <li>Consider upgrading your rate limits if needed</li>
                  `
                }
              </ul>

              <a href="${Deno.env.get("SUPABASE_URL")?.replace('https://', 'https://app.')}/settings" class="button">
                View API Settings
              </a>

              <p style="margin-top: 30px; font-size: 12px; color: #6b7280;">
                This is an automated alert from your SalesOS API monitoring system.
              </p>
            </div>
          </div>
        </body>
      </html>
    `;

    const emailResponse = await resend.emails.send({
      from: "SalesOS <onboarding@resend.dev>",
      to: [profile.email],
      subject: subject,
      html: emailHtml,
    });

    logStep("Email sent successfully", { emailId: emailResponse.id });

    return new Response(
      JSON.stringify({ success: true, emailId: emailResponse.id }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("ERROR", { message: errorMessage });
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.76.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Find scheduled emails that are due
    const { data: scheduledEmails, error: fetchError } = await supabase
      .from("sent_emails")
      .select("*")
      .eq("status", "scheduled")
      .not("scheduled_at", "is", null)
      .lte("scheduled_at", new Date().toISOString())
      .limit(20);

    if (fetchError) {
      console.error("Error fetching scheduled emails:", fetchError);
      throw fetchError;
    }

    if (!scheduledEmails || scheduledEmails.length === 0) {
      return new Response(
        JSON.stringify({ success: true, processed: 0, message: "No scheduled emails due" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Processing ${scheduledEmails.length} scheduled emails`);

    let processed = 0;
    let failed = 0;

    for (const email of scheduledEmails) {
      try {
        // Get user's integration for sending
        const { data: integration } = await supabase
          .from("integrations")
          .select("id, config")
          .eq("user_id", email.user_id)
          .eq("integration_id", "google")
          .eq("is_active", true)
          .limit(1)
          .single();

        if (!integration) {
          console.error(`No active integration for user ${email.user_id}`);
          await supabase
            .from("sent_emails")
            .update({ status: "failed" })
            .eq("id", email.id);
          failed++;
          continue;
        }

        const config = integration.config as any;
        let accessToken = config.accessToken || config.provider_token;

        // Refresh token if expired
        if (config.expiresAt && Date.now() >= config.expiresAt && config.refreshToken) {
          const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              client_id: config.clientId,
              client_secret: config.clientSecret,
              refresh_token: config.refreshToken,
              grant_type: "refresh_token",
            }),
          });

          if (tokenResponse.ok) {
            const tokens = await tokenResponse.json();
            accessToken = tokens.access_token;
            await supabase
              .from("integrations")
              .update({
                config: {
                  ...config,
                  accessToken: tokens.access_token,
                  expiresAt: Date.now() + tokens.expires_in * 1000,
                },
              })
              .eq("id", integration.id);
          } else {
            console.error(`Failed to refresh token for user ${email.user_id}`);
            await supabase
              .from("sent_emails")
              .update({ status: "failed" })
              .eq("id", email.id);
            failed++;
            continue;
          }
        }

        if (!accessToken) {
          await supabase
            .from("sent_emails")
            .update({ status: "failed" })
            .eq("id", email.id);
          failed++;
          continue;
        }

        // Build and send the email
        const body = email.body_html || email.body_text || "";
        const emailContent = [
          `To: ${email.to_email}`,
          `Subject: ${email.subject}`,
          "MIME-Version: 1.0",
          "Content-Type: text/html; charset=utf-8",
          "",
          body,
        ].join("\r\n");

        const encodedEmail = btoa(emailContent)
          .replace(/\+/g, "-")
          .replace(/\//g, "_")
          .replace(/=+$/, "");

        const gmailResponse = await fetch(
          "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ raw: encodedEmail }),
          }
        );

        if (gmailResponse.ok) {
          const gmailResult = await gmailResponse.json();
          await supabase
            .from("sent_emails")
            .update({
              status: "sent",
              sent_at: new Date().toISOString(),
              gmail_message_id: gmailResult.id,
              gmail_thread_id: gmailResult.threadId,
            })
            .eq("id", email.id);

          // Update lead's last_contacted_at
          if (email.lead_id) {
            await supabase
              .from("leads")
              .update({ last_contacted_at: new Date().toISOString() })
              .eq("id", email.lead_id)
              .eq("user_id", email.user_id);
          }

          processed++;
          console.log(`Sent scheduled email ${email.id} to ${email.to_email}`);
        } else {
          const errorText = await gmailResponse.text();
          console.error(`Gmail error for email ${email.id}:`, errorText);
          await supabase
            .from("sent_emails")
            .update({ status: "failed" })
            .eq("id", email.id);
          failed++;
        }
      } catch (err) {
        console.error(`Error processing email ${email.id}:`, err);
        await supabase
          .from("sent_emails")
          .update({ status: "failed" })
          .eq("id", email.id);
        failed++;
      }
    }

    return new Response(
      JSON.stringify({ success: true, processed, failed }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error in process-scheduled-emails:", error.message);
    return new Response(
      JSON.stringify({ error: "Failed to process scheduled emails" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

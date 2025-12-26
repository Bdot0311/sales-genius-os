import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[TRIGGER-WEBHOOK] ${step}${detailsStr}`);
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

    // Authenticate the request
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      logStep("ERROR", { message: "No authorization header" });
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 401 }
      );
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabaseClient.auth.getUser(token);
    
    if (userError || !userData.user) {
      logStep("ERROR", { message: "Invalid user token" });
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 401 }
      );
    }

    // Derive userId from authenticated session - do not trust request body
    const userId = userData.user.id;
    
    const { event, data } = await req.json();
    if (!event || !data) {
      throw new Error("Missing required fields: event, data");
    }

    logStep("Payload received", { event, userId });

    // Get active webhooks for this user and event
    const { data: webhooks, error: webhooksError } = await supabaseClient
      .from("webhooks")
      .select("*")
      .eq("user_id", userId)
      .eq("is_active", true)
      .contains("events", [event]);

    if (webhooksError) throw webhooksError;
    if (!webhooks || webhooks.length === 0) {
      logStep("No active webhooks found for event", { event });
      return new Response(JSON.stringify({ message: "No webhooks to trigger" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    logStep("Found webhooks to trigger", { count: webhooks.length });

    // Trigger all webhooks with retry logic
    const results = await Promise.allSettled(
      webhooks.map(async (webhook) => {
        const timestamp = Date.now();
        const payload = {
          event,
          data,
          timestamp,
        };

        // Create HMAC signature using Web Crypto API
        const encoder = new TextEncoder();
        const keyData = encoder.encode(webhook.secret);
        const messageData = encoder.encode(JSON.stringify(payload));
        
        const key = await crypto.subtle.importKey(
          "raw",
          keyData,
          { name: "HMAC", hash: "SHA-256" },
          false,
          ["sign"]
        );
        
        const signatureBuffer = await crypto.subtle.sign("HMAC", key, messageData);
        const signatureArray = Array.from(new Uint8Array(signatureBuffer));
        const signature = signatureArray.map(b => b.toString(16).padStart(2, '0')).join('');

        // Create webhook delivery record
        const { data: delivery, error: deliveryError } = await supabaseClient
          .from("webhook_deliveries")
          .insert({
            webhook_id: webhook.id,
            event,
            payload,
            status: "pending",
          })
          .select()
          .single();

        if (deliveryError) {
          logStep("Failed to create delivery record", { error: deliveryError });
          return {
            webhookId: webhook.id,
            success: false,
            error: deliveryError.message,
          };
        }

        // Attempt delivery with exponential backoff
        let attemptCount = 0;
        let lastError = null;
        const maxAttempts = 5;

        while (attemptCount < maxAttempts) {
          try {
            attemptCount++;
            logStep("Attempting webhook delivery", { webhookId: webhook.id, attempt: attemptCount });

            const response = await fetch(webhook.url, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "X-Webhook-Signature": signature,
                "X-Webhook-Event": event,
              },
              body: JSON.stringify(payload),
            });

            const responseBody = await response.text();

            // Update delivery record
            await supabaseClient
              .from("webhook_deliveries")
              .update({
                status: response.ok ? "success" : "failed",
                response_status: response.status,
                response_body: responseBody.substring(0, 1000), // Limit response body size
                attempt_count: attemptCount,
                last_attempt_at: new Date().toISOString(),
                completed_at: response.ok ? new Date().toISOString() : null,
              })
              .eq("id", delivery.id);

            if (response.ok) {
              // Update webhook stats
              await supabaseClient
                .from("webhooks")
                .update({
                  last_triggered_at: new Date().toISOString(),
                  total_triggers: webhook.total_triggers + 1,
                })
                .eq("id", webhook.id);

              return {
                webhookId: webhook.id,
                success: true,
                status: response.status,
                attempts: attemptCount,
              };
            }

            lastError = `HTTP ${response.status}: ${responseBody}`;

            // If not successful and not the last attempt, wait with exponential backoff
            if (attemptCount < maxAttempts) {
              const backoffMs = Math.min(1000 * Math.pow(2, attemptCount - 1), 30000); // Max 30 seconds
              logStep("Retrying after backoff", { webhookId: webhook.id, backoffMs });
              await new Promise(resolve => setTimeout(resolve, backoffMs));
            }

          } catch (error) {
            lastError = error instanceof Error ? error.message : String(error);
            logStep("Webhook delivery attempt failed", { 
              webhookId: webhook.id, 
              attempt: attemptCount, 
              error: lastError 
            });

            // Update delivery record with error
            await supabaseClient
              .from("webhook_deliveries")
              .update({
                status: "failed",
                attempt_count: attemptCount,
                last_attempt_at: new Date().toISOString(),
                response_body: lastError,
              })
              .eq("id", delivery.id);

            // If not the last attempt, wait with exponential backoff
            if (attemptCount < maxAttempts) {
              const backoffMs = Math.min(1000 * Math.pow(2, attemptCount - 1), 30000);
              await new Promise(resolve => setTimeout(resolve, backoffMs));
            }
          }
        }

        // All attempts failed, schedule retry
        const nextRetryAt = new Date(Date.now() + 60000); // Retry in 1 minute
        await supabaseClient
          .from("webhook_deliveries")
          .update({
            status: "failed",
            next_retry_at: nextRetryAt.toISOString(),
          })
          .eq("id", delivery.id);

        return {
          webhookId: webhook.id,
          success: false,
          error: lastError || "Unknown error",
          attempts: attemptCount,
        };
      })
    );

    logStep("Webhooks triggered", { results });

    return new Response(
      JSON.stringify({ message: "Webhooks triggered", results }),
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

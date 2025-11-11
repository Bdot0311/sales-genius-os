import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[RETRY-WEBHOOKS] ${step}${detailsStr}`);
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

    // Get failed deliveries ready for retry
    const { data: failedDeliveries, error: deliveriesError } = await supabaseClient
      .from("webhook_deliveries")
      .select(`
        *,
        webhooks (
          id,
          url,
          secret,
          is_active
        )
      `)
      .eq("status", "failed")
      .lt("attempt_count", 5)
      .lte("next_retry_at", new Date().toISOString())
      .limit(100);

    if (deliveriesError) throw deliveriesError;

    if (!failedDeliveries || failedDeliveries.length === 0) {
      logStep("No failed deliveries to retry");
      return new Response(
        JSON.stringify({ message: "No failed deliveries to retry" }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        }
      );
    }

    logStep("Found failed deliveries to retry", { count: failedDeliveries.length });

    const results = await Promise.allSettled(
      failedDeliveries.map(async (delivery: any) => {
        const webhook = delivery.webhooks;
        
        if (!webhook || !webhook.is_active) {
          logStep("Webhook inactive or not found", { deliveryId: delivery.id });
          return { deliveryId: delivery.id, success: false, reason: "Webhook inactive" };
        }

        try {
          // Create HMAC signature
          const encoder = new TextEncoder();
          const keyData = encoder.encode(webhook.secret);
          const messageData = encoder.encode(JSON.stringify(delivery.payload));
          
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

          // Attempt delivery
          const response = await fetch(webhook.url, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Webhook-Signature": signature,
              "X-Webhook-Event": delivery.event,
            },
            body: JSON.stringify(delivery.payload),
          });

          const responseBody = await response.text();
          const newAttemptCount = delivery.attempt_count + 1;

          if (response.ok) {
            // Success - mark as completed
            await supabaseClient
              .from("webhook_deliveries")
              .update({
                status: "success",
                response_status: response.status,
                response_body: responseBody.substring(0, 1000),
                attempt_count: newAttemptCount,
                last_attempt_at: new Date().toISOString(),
                completed_at: new Date().toISOString(),
                next_retry_at: null,
              })
              .eq("id", delivery.id);

            logStep("Delivery successful", { deliveryId: delivery.id, attempts: newAttemptCount });

            return { deliveryId: delivery.id, success: true, attempts: newAttemptCount };
          } else {
            // Failed - schedule next retry or mark as permanently failed
            const nextRetryAt = newAttemptCount < 5
              ? new Date(Date.now() + Math.min(60000 * Math.pow(2, newAttemptCount), 3600000)) // Max 1 hour
              : null;

            await supabaseClient
              .from("webhook_deliveries")
              .update({
                status: newAttemptCount >= 5 ? "permanently_failed" : "failed",
                response_status: response.status,
                response_body: responseBody.substring(0, 1000),
                attempt_count: newAttemptCount,
                last_attempt_at: new Date().toISOString(),
                next_retry_at: nextRetryAt?.toISOString() || null,
              })
              .eq("id", delivery.id);

            logStep("Delivery failed", { 
              deliveryId: delivery.id, 
              attempts: newAttemptCount,
              nextRetry: nextRetryAt 
            });

            return { 
              deliveryId: delivery.id, 
              success: false, 
              attempts: newAttemptCount,
              nextRetry: nextRetryAt 
            };
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          const newAttemptCount = delivery.attempt_count + 1;
          
          const nextRetryAt = newAttemptCount < 5
            ? new Date(Date.now() + Math.min(60000 * Math.pow(2, newAttemptCount), 3600000))
            : null;

          await supabaseClient
            .from("webhook_deliveries")
            .update({
              status: newAttemptCount >= 5 ? "permanently_failed" : "failed",
              attempt_count: newAttemptCount,
              last_attempt_at: new Date().toISOString(),
              response_body: errorMessage,
              next_retry_at: nextRetryAt?.toISOString() || null,
            })
            .eq("id", delivery.id);

          logStep("Delivery error", { deliveryId: delivery.id, error: errorMessage });

          return { 
            deliveryId: delivery.id, 
            success: false, 
            error: errorMessage,
            attempts: newAttemptCount 
          };
        }
      })
    );

    logStep("Retry process completed", { results });

    return new Response(
      JSON.stringify({ message: "Retry process completed", results }),
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

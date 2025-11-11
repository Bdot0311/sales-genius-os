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

    const { event, data, userId } = await req.json();
    if (!event || !data || !userId) {
      throw new Error("Missing required fields: event, data, userId");
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

    // Trigger all webhooks
    const results = await Promise.allSettled(
      webhooks.map(async (webhook) => {
        try {
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

          // Send webhook
          const response = await fetch(webhook.url, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Webhook-Signature": signature,
              "X-Webhook-Event": event,
            },
            body: JSON.stringify(payload),
          });

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
            success: response.ok,
            status: response.status,
          };
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          logStep("Webhook trigger failed", { webhookId: webhook.id, error: errorMessage });
          return {
            webhookId: webhook.id,
            success: false,
            error: errorMessage,
          };
        }
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

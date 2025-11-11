import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[TEST-WEBHOOK] ${step}${detailsStr}`);
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    logStep("Function started");

    const { url, payload, secret } = await req.json();

    if (!url || !payload) {
      throw new Error("Missing required fields: url and payload");
    }

    logStep("Testing webhook", { url });

    // Create HMAC signature if secret is provided
    let signature = null;
    if (secret) {
      const encoder = new TextEncoder();
      const keyData = encoder.encode(secret);
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
      signature = signatureArray.map(b => b.toString(16).padStart(2, '0')).join('');
    }

    const startTime = Date.now();
    
    // Send test webhook
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "X-Webhook-Test": "true",
    };

    if (signature) {
      headers["X-Webhook-Signature"] = signature;
    }

    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });

    const responseTime = Date.now() - startTime;
    const responseBody = await response.text();

    logStep("Webhook test completed", { 
      status: response.status,
      responseTime 
    });

    return new Response(
      JSON.stringify({
        success: response.ok,
        status: response.status,
        statusText: response.statusText,
        responseTime,
        responseBody: responseBody.substring(0, 1000), // Limit response body
        headers: Object.fromEntries(response.headers.entries()),
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("ERROR", { message: errorMessage });
    return new Response(
      JSON.stringify({ 
        success: false,
        error: errorMessage 
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});

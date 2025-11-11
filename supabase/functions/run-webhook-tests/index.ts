import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[RUN-WEBHOOK-TESTS] ${step}${detailsStr}`);
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

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header");

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabaseClient.auth.getUser(token);
    if (userError) throw userError;
    
    const user = userData.user;
    if (!user) throw new Error("User not authenticated");

    const { webhookId, testIds } = await req.json();

    if (!webhookId) {
      throw new Error("Webhook ID is required");
    }

    // Get webhook
    const { data: webhook, error: webhookError } = await supabaseClient
      .from("webhooks")
      .select("*")
      .eq("id", webhookId)
      .eq("user_id", user.id)
      .single();

    if (webhookError) throw webhookError;
    if (!webhook) throw new Error("Webhook not found");

    // Get tests to run
    let query = supabaseClient
      .from("webhook_tests")
      .select("*")
      .eq("webhook_id", webhookId);

    if (testIds && testIds.length > 0) {
      query = query.in("id", testIds);
    }

    const { data: tests, error: testsError } = await query;
    if (testsError) throw testsError;

    if (!tests || tests.length === 0) {
      throw new Error("No tests found");
    }

    logStep("Running tests", { count: tests.length });

    // Run all tests
    const results = await Promise.all(
      tests.map(async (test) => {
        try {
          const startTime = Date.now();

          // Create HMAC signature if required
          let signature = null;
          if (test.validate_signature && webhook.secret) {
            const encoder = new TextEncoder();
            const keyData = encoder.encode(webhook.secret);
            const messageData = encoder.encode(JSON.stringify(test.test_payload));
            
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

          // Send test request
          const headers: Record<string, string> = {
            "Content-Type": "application/json",
            "X-Webhook-Test": "true",
          };

          if (signature) {
            headers["X-Webhook-Signature"] = signature;
          }

          const response = await fetch(webhook.url, {
            method: "POST",
            headers,
            body: JSON.stringify(test.test_payload),
          });

          const responseTime = Date.now() - startTime;
          const responseBody = await response.text();

          // Validate test expectations
          let passed = true;
          const validationErrors = [];

          if (test.expected_status_code && response.status !== test.expected_status_code) {
            passed = false;
            validationErrors.push(`Expected status ${test.expected_status_code}, got ${response.status}`);
          }

          if (test.expected_response_contains && !responseBody.includes(test.expected_response_contains)) {
            passed = false;
            validationErrors.push(`Response does not contain expected text: "${test.expected_response_contains}"`);
          }

          const testResult = {
            status: response.status,
            statusText: response.statusText,
            responseTime,
            responseBody: responseBody.substring(0, 500),
            validationErrors,
            passed,
            timestamp: new Date().toISOString(),
          };

          // Update test result
          await supabaseClient
            .from("webhook_tests")
            .update({
              test_result: testResult,
              passed,
              last_run_at: new Date().toISOString(),
            })
            .eq("id", test.id);

          logStep("Test completed", { testId: test.id, passed });

          return {
            testId: test.id,
            testName: test.test_name,
            passed,
            result: testResult,
          };
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          logStep("Test failed", { testId: test.id, error: errorMessage });

          const testResult = {
            error: errorMessage,
            passed: false,
            timestamp: new Date().toISOString(),
          };

          await supabaseClient
            .from("webhook_tests")
            .update({
              test_result: testResult,
              passed: false,
              last_run_at: new Date().toISOString(),
            })
            .eq("id", test.id);

          return {
            testId: test.id,
            testName: test.test_name,
            passed: false,
            result: testResult,
          };
        }
      })
    );

    const passedCount = results.filter(r => r.passed).length;
    const failedCount = results.length - passedCount;

    logStep("All tests completed", { total: results.length, passed: passedCount, failed: failedCount });

    return new Response(
      JSON.stringify({
        success: true,
        totalTests: results.length,
        passed: passedCount,
        failed: failedCount,
        results,
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
      JSON.stringify({ error: errorMessage }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});

// Temporary diagnostic: lists Bedrock models available to our account.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const region = Deno.env.get("AWS_REGION") || "us-east-1";
  const token = Deno.env.get("AWS_BEARER_TOKEN_BEDROCK") || "";
  const res = await fetch(`https://bedrock.${region}.amazonaws.com/foundation-models`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const text = await res.text();
  let out = text;
  try {
    const j = JSON.parse(text) as { modelSummaries?: Array<Record<string, unknown>> };
    out = JSON.stringify(
      (j.modelSummaries ?? [])
        .filter((m) => String(m.modelId).includes("anthropic") || String(m.modelId).includes("nova"))
        .map((m) => ({ id: m.modelId, status: m.modelLifecycle, inf: m.inferenceTypesSupported })),
    );
  } catch { /* raw */ }
  return new Response(JSON.stringify({ status: res.status, body: out.slice(0, 6000) }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});

// Temporary diagnostic: exercises the shared AI layer (plain, tool-calling, streaming).
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { aiFetch, routeFor } from "../_shared/ai-provider.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const out: Record<string, unknown> = {
    routeFlash: routeFor("google/gemini-2.5-flash"),
    routePro: routeFor("google/gemini-2.5-pro"),
    routeGpt5: routeFor("openai/gpt-5"),
  };

  // pro-tier completion
  try {
    const r = await aiFetch("probe", {
      method: "POST",
      body: JSON.stringify({
        model: "google/gemini-2.5-pro",
        messages: [{ role: "user", content: "Reply with the single word: pro" }],
      }),
    }, { fn: "bedrock-probe" });
    const j = await r.json();
    out.pro = { status: r.status, model: j?.model, text: j?.choices?.[0]?.message?.content };
  } catch (e) { out.pro = { error: String(e) }; }

  // 1. plain completion
  try {
    const r = await aiFetch("probe", {
      method: "POST",
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [{ role: "user", content: "Reply with the single word: ok" }],
      }),
    }, { fn: "bedrock-probe" });
    const j = await r.json();
    out.plain = { status: r.status, text: j?.choices?.[0]?.message?.content, usage: j?.usage };
  } catch (e) { out.plain = { error: String(e) }; }

  // 2. tool calling
  try {
    const r = await aiFetch("probe", {
      method: "POST",
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [{ role: "user", content: "Look up the weather in Paris using the tool." }],
        tools: [{
          type: "function",
          function: {
            name: "get_weather",
            description: "Get weather for a city",
            parameters: { type: "object", properties: { city: { type: "string" } }, required: ["city"] },
          },
        }],
      }),
    }, { fn: "bedrock-probe" });
    const j = await r.json();
    out.tools = { status: r.status, tool_calls: j?.choices?.[0]?.message?.tool_calls };
  } catch (e) { out.tools = { error: String(e) }; }

  // 3. streaming
  try {
    const r = await aiFetch("probe", {
      method: "POST",
      body: JSON.stringify({
        model: "google/gemini-2.5-pro",
        stream: true,
        messages: [{ role: "user", content: "Count to three." }],
      }),
    }, { fn: "bedrock-probe" });
    const text = await r.text();
    out.stream = { status: r.status, chunks: text.split("\n\n").length, head: text.slice(0, 200) };
  } catch (e) { out.stream = { error: String(e) }; }

  return new Response(JSON.stringify(out, null, 2), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});

// Single entry point for every model call in the product.
//
// Why this exists: every AI feature used to hit the Lovable AI Gateway, which
// bills the workspace's Lovable credits. That made customer-facing features
// depend on one shared balance that only the operator can top up — when it hit
// zero, ICP analysis, email generation and the SDR broke for real paying users.
//
// This layer routes calls to a DIRECT provider account first (Google AI Studio
// or OpenAI, billed on our own provider invoice, which scales with revenue) and
// only falls back to the Lovable gateway when no direct key is configured. Every
// call is metered: token usage is priced and recorded in `ai_usage_events`, and
// the equivalent in-app credits are deducted from the user's balance so AI cost
// tracks the customer who caused it.
//
// Call sites keep the exact `fetch` shape they had before — the response body is
// the OpenAI chat-completions shape on all three routes, including streaming.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import {
  bedrockChat,
  bedrockChatAsStream,
  bedrockChatStream,
  bedrockConfigured,
  bedrockDefaultModel,
  bedrockPrice,
  bedrockProModel,
} from "./bedrock.ts";

import { DEFAULT_FALLBACK_ENDPOINT } from "./ai-gateway.ts";

const GATEWAY_URL = DEFAULT_FALLBACK_ENDPOINT;

export type AiProvider = "bedrock" | "lovable";


/** USD per 1M tokens. Unknown models fall back to a mid-range Flash estimate. */
const PRICING: Record<string, { in: number; out: number }> = {
  "gemini-2.5-flash": { in: 0.3, out: 2.5 },
  "gemini-2.5-flash-lite": { in: 0.1, out: 0.4 },
  "gemini-2.5-pro": { in: 1.25, out: 10 },
  "gemini-2.0-flash": { in: 0.1, out: 0.4 },
  "gpt-5-mini": { in: 0.25, out: 2 },
  "gpt-5-nano": { in: 0.05, out: 0.4 },
  "gpt-5": { in: 1.25, out: 10 },
};
const DEFAULT_PRICE = { in: 0.3, out: 2.5 };

/**
 * Which account will serve a given gateway model id.
 * Amazon Bedrock is the only connected AI provider; the Lovable gateway is the
 * fallback used only when Bedrock is not configured.
 */
export function routeFor(model: string): { provider: AiProvider; url: string; model: string; key: string } {
  const gatewayId = model || "google/gemini-2.5-flash";
  const [, ...rest] = gatewayId.split("/");
  const bare = rest.join("/") || gatewayId;

  // Amazon Bedrock, billed on our own AWS account. Bedrock serves none of the
  // gateway model ids, so requested ids collapse onto two tiers: "pro"-class
  // requests get the stronger model, everything else the cheap workhorse.
  if (bedrockConfigured()) {
    const wantsPro = /pro|gpt-5(?![-.])|gpt-5\.\d|sonnet|opus/i.test(bare) &&
      // Word-boundary exclusions: "gemini-..." contains "mini" as a substring and
      // must not be treated as a small model.
      !/(?:^|[-_.\s])(mini|nano|lite)/i.test(bare);
    return {
      provider: "bedrock",
      url: "",
      model: wantsPro ? bedrockProModel() : bedrockDefaultModel(),
      key: "bedrock",
    };
  }
  // Bedrock unavailable — fall back to the platform gateway.
  return {
    provider: "lovable",
    url: GATEWAY_URL,
    model: gatewayId,
    key: Deno.env.get("LOVABLE_API_KEY") || "",
  };
}


function priceOf(model: string, promptTokens: number, completionTokens: number): number {
  const p = bedrockPrice(model) ?? PRICING[model] ?? DEFAULT_PRICE;
  return (promptTokens / 1_000_000) * p.in + (completionTokens / 1_000_000) * p.out;
}

/**
 * Meter one completed call. Never throws and never blocks the caller — the
 * generation already happened, so a metering failure must not fail the feature.
 */
async function meter(opts: {
  fn: string;
  provider: AiProvider;
  model: string;
  userId?: string | null;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}) {
  try {
    const url = Deno.env.get("SUPABASE_URL");
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !key) return;
    const promptTokens = Number(opts.usage?.prompt_tokens ?? 0) || 0;
    const completionTokens = Number(opts.usage?.completion_tokens ?? 0) || 0;
    if (!promptTokens && !completionTokens) return;
    const admin = createClient(url, key, { auth: { persistSession: false } });
    await admin.rpc("record_ai_usage", {
      p_fn: opts.fn,
      p_provider: opts.provider,
      p_model: opts.model,
      p_prompt_tokens: promptTokens,
      p_completion_tokens: completionTokens,
      p_cost_usd: priceOf(opts.model, promptTokens, completionTokens),
      p_user_id: opts.userId ?? null,
    });
  } catch (err) {
    console.error("[ai-provider] metering failed", err instanceof Error ? err.message : err);
  }
}

export interface AiCallContext {
  /** Edge function name, used for cost attribution. */
  fn?: string;
  /** The customer whose action triggered the call, when known. */
  userId?: string | null;
}

/**
 * Drop-in replacement for `fetch("https://ai.gateway.lovable.dev/v1/chat/completions", init)`.
 *
 * The first argument is ignored (kept so call sites read naturally); routing is
 * decided from the `model` in the request body plus the configured provider keys.
 * Timeout of 120 seconds is applied to prevent hanging functions.
 */
export async function aiFetch(
  _endpoint: string,
  init: RequestInit,
  ctx: AiCallContext = {},
): Promise<Response> {
  let body: Record<string, unknown> = {};
  try {
    body = typeof init.body === "string" ? JSON.parse(init.body) : {};
  } catch {
    body = {};
  }

  const route = routeFor(String(body.model ?? ""));
  if (!route.key) {
    return new Response(JSON.stringify({ error: { message: "No AI provider key configured" } }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
  body.model = route.model;
  const fnName = ctx.fn ?? _endpoint ?? "unknown";

  // Apply 120-second timeout to prevent hanging functions
  const timeoutMs = 120_000;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    // Merge with existing signal if present
    const signal = init.signal ? 
      AbortSignal.any([init.signal, controller.signal]) : 
      controller.signal;

    if (route.provider === "bedrock") {
      const wantsStream = body.stream === true;
      if (wantsStream) {
        // Real token-by-token streaming: usage arrives in the stream's metadata
        // event and is metered from there, so nothing has to be buffered.
        const streamed = await Promise.race([
          bedrockChatStream(route.model, body, (usage) => {
            void meter({
              fn: fnName,
              provider: "bedrock",
              model: route.model,
              userId: ctx.userId,
              usage,
            });
          }),
          new Promise<Response>((_, reject) => 
            setTimeout(() => reject(new Error("Timeout")), timeoutMs)
          ),
        ]);
        if (streamed.ok) return streamed;
        // Streaming unavailable (e.g. model without ConverseStream support): fall
        // back to a buffered completion re-emitted as SSE so the feature still works.
        console.error(`[ai-provider] ${fnName} bedrock stream unavailable -> buffered fallback`);
      }
      const res = await Promise.race([
        bedrockChat(route.model, body),
        new Promise<Response>((_, reject) => 
          setTimeout(() => reject(new Error("Timeout")), timeoutMs)
        ),
      ]);
      if (!res.ok) return res;
      const completion = await res.json() as {
        usage?: { prompt_tokens?: number; completion_tokens?: number };
      };
      await meter({
        fn: fnName,
        provider: "bedrock",
        model: route.model,
        userId: ctx.userId,
        usage: completion.usage,
      });
      if (!wantsStream) {
        return new Response(JSON.stringify(completion), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return bedrockChatAsStream(route.model, body, completion as Record<string, unknown>);

    }

    // Lovable gateway fallback.
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${route.key}`,
      "X-Lovable-AIG-SDK": "fetch",
    };

    const res = await Promise.race([
      fetch(route.url, {
        ...init,
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal,
      }),
      new Promise<Response>((_, reject) => 
        setTimeout(() => reject(new Error("Timeout")), timeoutMs)
      ),
    ]);

    clearTimeout(timeoutId);

    // Streaming responses are passed through untouched; usage arrives in-stream and
    // is not worth buffering the whole answer for.
    if (body.stream === true || !res.ok) {
      if (!res.ok) {
        console.error(
          `[ai-provider] ${fnName} ${route.provider}/${route.model} -> ${res.status}`,
        );
      }
      return res;
    }

    // Non-streaming: read the JSON once, meter it, and hand the caller an
    // identical response it can still `.json()`.
    const text = await res.text();
    try {
      const parsed = JSON.parse(text) as { usage?: { prompt_tokens?: number; completion_tokens?: number } };
      await meter({
        fn: fnName,
        provider: route.provider,
        model: route.model,
        userId: ctx.userId,
        usage: parsed.usage,
      });
    } catch {
      // Non-JSON body — nothing to meter.
    }

    return new Response(text, {
      status: res.status,
      statusText: res.statusText,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.message === "Timeout") {
      console.error(`[ai-provider] ${fnName} request timed out after ${timeoutMs}ms`);
      return new Response(
        JSON.stringify({ error: { message: "AI request timed out. Please try again." } }),
        { status: 504, headers: { "Content-Type": "application/json" } }
      );
    }
    throw error;
  }
}

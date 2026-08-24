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

const GOOGLE_URL = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";
const OPENAI_URL = "https://api.openai.com/v1/chat/completions";
const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

export type AiProvider = "google" | "openai" | "lovable";

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
 * Direct Google AI Studio does not serve every id the gateway exposes (preview
 * ids in particular). Map those onto the closest generally-available model so a
 * direct key never dead-ends a feature.
 */
const GOOGLE_MODEL_MAP: Record<string, string> = {
  "gemini-3-flash-preview": "gemini-2.5-flash",
  "gemini-3.1-flash-lite": "gemini-2.5-flash-lite",
  "gemini-3.5-flash": "gemini-2.5-flash",
  "gemini-3.6-flash": "gemini-2.5-flash",
  "gemini-3.7-flash": "gemini-2.5-flash",
  "gemini-3.1-pro-preview": "gemini-2.5-pro",
};

function googleKey() {
  return Deno.env.get("GOOGLE_AI_API_KEY") || Deno.env.get("GEMINI_API_KEY") || "";
}
function openaiKey() {
  return Deno.env.get("OPENAI_API_KEY") || "";
}

/** Which account will serve a given gateway model id, given the configured keys. */
export function routeFor(model: string): { provider: AiProvider; url: string; model: string; key: string } {
  const gatewayId = model || "google/gemini-2.5-flash";
  const [vendor, ...rest] = gatewayId.split("/");
  const bare = rest.join("/") || gatewayId;

  if (vendor === "google" && googleKey()) {
    return {
      provider: "google",
      url: GOOGLE_URL,
      model: GOOGLE_MODEL_MAP[bare] ?? bare,
      key: googleKey(),
    };
  }
  if (vendor === "openai" && openaiKey()) {
    return { provider: "openai", url: OPENAI_URL, model: bare, key: openaiKey() };
  }
  // No direct key for this vendor — fall back to the platform gateway.
  return {
    provider: "lovable",
    url: GATEWAY_URL,
    model: gatewayId,
    key: Deno.env.get("LOVABLE_API_KEY") || "",
  };
}

/** True when at least one direct provider account is configured. */
export function hasDirectProvider(): boolean {
  return Boolean(googleKey() || openaiKey());
}

function priceOf(model: string, promptTokens: number, completionTokens: number): number {
  const p = PRICING[model] ?? DEFAULT_PRICE;
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
 * No timeout is applied — model calls routinely take minutes.
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

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (route.provider === "lovable") {
    headers["Authorization"] = `Bearer ${route.key}`;
    headers["X-Lovable-AIG-SDK"] = "fetch";
  } else {
    headers["Authorization"] = `Bearer ${route.key}`;
  }

  const res = await fetch(route.url, {
    ...init,
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  // Streaming responses are passed through untouched; usage arrives in-stream and
  // is not worth buffering the whole answer for.
  if (body.stream === true || !res.ok) {
    if (!res.ok) {
      console.error(
        `[ai-provider] ${ctx.fn ?? "unknown"} ${route.provider}/${route.model} -> ${res.status}`,
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
      fn: ctx.fn ?? "unknown",
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
}

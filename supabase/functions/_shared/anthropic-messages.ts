/**
 * Claude over the Anthropic Messages API, from whichever host serves it.
 *
 * Two hosts, one body. Microsoft Foundry and Anthropic's own API both speak
 * the Messages API, both authenticate with `x-api-key` and `anthropic-version`,
 * and both take the same model ids (`claude-opus-5-5`, `claude-haiku-4-5`).
 * So the translation below is written once and the host is a configuration
 * detail rather than a second implementation.
 *
 * Foundry wins when both are configured, because an organisation that has set
 * up a Foundry resource meant to bill through Azure.
 *
 * ── Why the direct host is here ──────────────────────────────────────────
 *
 * Both clouds gate the model behind an entitlement the account has to be
 * granted: AWS never granted Opus 5.5, and Foundry will not create a
 * deployment while the subscription's quota for the model is zero, which is
 * the default on anything that is not pay-as-you-go. Neither is a thing code
 * can fix. Anthropic's own API has no marketplace or quota gate in front of
 * it, so it is the route that works today, and it costs almost nothing to
 * support because it is the same API.
 *
 * ── Shape ────────────────────────────────────────────────────────────────
 *
 * Neither host is OpenAI-compatible. Both take:
 *
 *   POST <host>/v1/messages          (Foundry: /anthropic/v1/messages)
 *   x-api-key: <key>
 *   anthropic-version: 2023-06-01
 *
 * So this translates the same internal body bedrock.ts translates, to a
 * different target. On Foundry the `model` field is the DEPLOYMENT name,
 * which defaults to the model id but does not have to equal it, which is why
 * both tiers are configurable.
 *
 * No SigV4: the key is a header, so none of Bedrock's signing applies here.
 */

import { repairToolSequence } from "./tool-sequence.ts";

/** The internal message shape every call site sends, as bedrock.ts types it. */
type OpenAiMessage = {
  role: string;
  content?: unknown;
  name?: string;
  tool_call_id?: string;
  tool_calls?: Array<{ id?: string; function?: { name?: string; arguments?: string } }>;
};

const trimSlash = (value: string) => value.replace(/\/+$/, "");

/**
 * The Messages endpoint, built from whatever form of the resource URL was
 * pasted.
 *
 * On Foundry the Claude endpoint is always `<resource host>/anthropic/v1/
 * messages`, so the host is the only part worth keeping. The portal is
 * happier to show you other things: the project endpoint,
 * `https://<resource>.services.ai.azure.com/api/projects/<project>`, is the
 * one on the overview page, and pasting it built
 * `.../api/projects/<project>/anthropic/v1/messages`, which 404s with nothing
 * to suggest the URL was the problem.
 *
 * So the path is dropped rather than pattern-matched, and dropping one is
 * logged, because silently rewriting what somebody configured is its own way
 * to waste an afternoon.
 */
export function azureClaudeEndpoint(): string {
  const raw = (Deno.env.get("AZURE_CLAUDE_ENDPOINT") || "").trim();
  if (!raw) return "";
  if (!/^https:\/\//i.test(raw)) {
    console.warn("[anthropic-messages] AZURE_CLAUDE_ENDPOINT is not an https URL; ignoring it");
    return "";
  }
  let origin: string;
  try {
    const parsed = new URL(raw);
    origin = parsed.origin;
    const path = trimSlash(parsed.pathname);
    if (path && path !== "/anthropic/v1/messages") {
      console.warn(`[anthropic-messages] ignoring the path on AZURE_CLAUDE_ENDPOINT ("${path}"); Claude is served at /anthropic/v1/messages on the resource host`);
    }
  } catch {
    console.warn("[anthropic-messages] AZURE_CLAUDE_ENDPOINT is not a parseable URL; ignoring it");
    return "";
  }
  return `${origin}/anthropic/v1/messages`;
}

export function azureClaudeKey(): string {
  return (Deno.env.get("AZURE_CLAUDE_API_KEY") || "").trim();
}

/** Anthropic's own API: a key and nothing else to configure. */
export const ANTHROPIC_DIRECT_URL = "https://api.anthropic.com/v1/messages";

export function anthropicDirectKey(): string {
  return (Deno.env.get("ANTHROPIC_API_KEY") || "").trim();
}

export type MessagesHost = "azure" | "anthropic";

/**
 * Which host serves this call, if any.
 *
 * Foundry first: an organisation that stood one up meant to bill through
 * Azure. Direct second, because it is the one with no entitlement in front of
 * it. Null when neither is configured, which leaves Bedrock exactly as it was.
 */
export function messagesRoute(): { host: MessagesHost; url: string; key: string } | null {
  const azureUrl = azureClaudeEndpoint();
  const azureKey = azureClaudeKey();
  if (azureUrl && azureKey) return { host: "azure", url: azureUrl, key: azureKey };
  const direct = anthropicDirectKey();
  if (direct) return { host: "anthropic", url: ANTHROPIC_DIRECT_URL, key: direct };
  return null;
}

export function azureClaudeConfigured(): boolean {
  return messagesRoute() !== null;
}

/**
 * Defaults, matching what Foundry lists as hosted on Azure and GA.
 *
 * Sonnet 4.6 is deliberately not a default: Foundry lists it only as hosted on
 * Anthropic infrastructure, and the reason the Bedrock Pro tier sat on it was
 * the absence of Opus, which does not apply here.
 */
export const AZURE_CLAUDE_FAST = "claude-haiku-4-5";
export const AZURE_CLAUDE_PRO = "claude-opus-5-5";

/*
 * The same ids serve both hosts: Foundry's deployment names default to the
 * model id, and Anthropic's API takes the undated alias as written. Either
 * variable overrides its own tier on whichever host is in use, which is what
 * a differently-named Foundry deployment needs.
 */
export function azureClaudeFastModel(): string {
  return (Deno.env.get("AZURE_CLAUDE_MODEL_ID") || "").trim() || AZURE_CLAUDE_FAST;
}
export function azureClaudeProModel(): string {
  return (Deno.env.get("AZURE_CLAUDE_MODEL_ID_PRO") || "").trim() || AZURE_CLAUDE_PRO;
}

/** Adaptive thinking is on for the Opus 5 family, as it is on Bedrock. */
const adaptiveThinking = (model: string) => /claude-opus-5/i.test(model);

/*
 * Per-million-token rates.
 *
 * Azure meters Claude in Consumption Units, and its billing page says the CCU
 * conversion uses "Anthropic's published per-model token rates" and that CCU
 * "is a change in billing format, not in price". So the model's own published
 * rate is the right number for cost attribution here, and it is the same
 * number the Bedrock path already bills. The marketplace price per CCU is not
 * on the docs pages, so this is attribution for in-app credit, not an invoice
 * reconciliation.
 */
export const AZURE_CLAUDE_PRICING: Record<string, { in: number; out: number }> = {
  "claude-opus-5-5": { in: 4, out: 20 },
  "claude-opus-5-5-fast": { in: 4, out: 20 },
  "claude-opus-5": { in: 4, out: 20 },
  "claude-opus-4-8": { in: 5, out: 25 },
  "claude-sonnet-5-5": { in: 3, out: 15 },
  "claude-sonnet-5": { in: 3, out: 15 },
  "claude-haiku-5-5": { in: 1, out: 5 },
  "claude-haiku-4-5": { in: 1, out: 5 },
};

export function azureClaudePrice(model: string): { in: number; out: number } | null {
  const id = String(model || "").toLowerCase();
  if (AZURE_CLAUDE_PRICING[id]) return AZURE_CLAUDE_PRICING[id];
  // A deployment may be named anything; fall back to the family in the name so
  // a renamed deployment is still priced rather than silently free.
  const match = Object.keys(AZURE_CLAUDE_PRICING).find((known) => id.includes(known));
  return match ? AZURE_CLAUDE_PRICING[match] : null;
}

export function usdForAzureClaude(model: string, promptTokens: number, completionTokens: number): number {
  const price = azureClaudePrice(model);
  if (!price) return 0;
  return (promptTokens / 1_000_000) * price.in + (completionTokens / 1_000_000) * price.out;
}

function textOf(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => (part && typeof part === "object" && "text" in (part as Record<string, unknown>)
        ? String((part as Record<string, unknown>).text ?? "")
        : typeof part === "string" ? part : ""))
      .join("");
  }
  return "";
}

function safeParse(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object") return value as Record<string, unknown>;
  try {
    const parsed = JSON.parse(String(value ?? "{}"));
    return parsed && typeof parsed === "object" ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

/** The internal body -> an Anthropic Messages request. */
export function toMessagesBody(body: Record<string, unknown>): Record<string, unknown> {
  const messages = repairToolSequence(Array.isArray(body.messages) ? (body.messages as OpenAiMessage[]) : []);
  const system: string[] = [];
  const out: Array<{ role: "user" | "assistant"; content: unknown[] }> = [];

  const push = (role: "user" | "assistant", block: unknown) => {
    const last = out[out.length - 1];
    if (last && last.role === role) last.content.push(block);
    else out.push({ role, content: [block] });
  };

  for (const msg of messages) {
    if (msg.role === "system" || msg.role === "developer") {
      const text = textOf(msg.content);
      if (text) system.push(text);
      continue;
    }
    if (msg.role === "tool") {
      push("user", {
        type: "tool_result",
        tool_use_id: msg.tool_call_id ?? "tool",
        content: textOf(msg.content) || "(no output)",
      });
      continue;
    }
    if (msg.role === "assistant") {
      // Thinking blocks are signed and have to come back exactly as they were
      // sent, before the text they preceded, or the next turn is rejected.
      const carried = (msg as { azure_thinking?: unknown }).azure_thinking;
      if (Array.isArray(carried)) {
        for (const block of carried) {
          if (block && typeof block === "object") push("assistant", block);
        }
      }
      const text = textOf(msg.content);
      if (text) push("assistant", { type: "text", text });
      for (const call of msg.tool_calls ?? []) {
        push("assistant", {
          type: "tool_use",
          id: call.id ?? crypto.randomUUID(),
          name: call.function?.name ?? "tool",
          input: safeParse(call.function?.arguments),
        });
      }
      continue;
    }
    push("user", { type: "text", text: textOf(msg.content) || "(empty)" });
  }

  // Messages requires the conversation to open on a user turn.
  if (out.length === 0 || out[0].role !== "user") {
    out.unshift({ role: "user", content: [{ type: "text", text: "Continue." }] });
  }

  const model = String(body.model ?? "");
  // max_tokens is required by this API, unlike Converse where it is optional.
  const asked = body.max_completion_tokens ?? body.max_tokens;
  const request: Record<string, unknown> = {
    messages: out,
    max_tokens: typeof asked === "number" && asked > 0 ? asked : 4096,
  };
  if (system.length) request.system = system.join("\n\n");

  if (adaptiveThinking(model)) {
    // Adaptive thinking sets its own sampling; a manual temperature fights it,
    // which is the same reason the Bedrock path omits it for this family.
    request.thinking = { type: "adaptive" };
  } else {
    if (typeof body.temperature === "number") request.temperature = body.temperature;
    if (typeof body.top_p === "number") request.top_p = body.top_p;
  }

  const tools = Array.isArray(body.tools) ? body.tools : [];
  if (tools.length) {
    const specs = tools
      .map((t) => {
        const fn = (t as Record<string, unknown>)?.function as Record<string, unknown> | undefined;
        if (!fn?.name) return null;
        return {
          name: String(fn.name),
          ...(typeof fn.description === "string" ? { description: fn.description } : {}),
          input_schema: fn.parameters ?? { type: "object", properties: {} },
        };
      })
      .filter(Boolean);
    if (specs.length) {
      request.tools = specs;
      if (!adaptiveThinking(model)) {
        const choice = body.tool_choice;
        if (choice === "required" || choice === "any") request.tool_choice = { type: "any" };
        else if (choice && typeof choice === "object") {
          const name = ((choice as Record<string, unknown>).function as Record<string, unknown> | undefined)?.name;
          if (name) request.tool_choice = { type: "tool", name: String(name) };
        }
      }
    }
  }

  return request;
}

const FINISH: Record<string, string> = {
  end_turn: "stop",
  stop_sequence: "stop",
  max_tokens: "length",
  tool_use: "tool_calls",
};

/** An Anthropic Messages response -> the chat-completions shape call sites expect. */
export function fromMessagesBody(model: string, data: Record<string, unknown>): Record<string, unknown> {
  const blocks = Array.isArray(data.content) ? data.content as Record<string, unknown>[] : [];
  const text = blocks.filter((b) => b?.type === "text").map((b) => String(b.text ?? "")).join("");
  const thinking = blocks.filter((b) => b?.type === "thinking" || b?.type === "redacted_thinking");
  const toolCalls = blocks
    .filter((b) => b?.type === "tool_use")
    .map((b) => ({
      id: String(b.id ?? crypto.randomUUID()),
      type: "function" as const,
      function: { name: String(b.name ?? "tool"), arguments: JSON.stringify(b.input ?? {}) },
    }));

  const usage = (data.usage ?? {}) as Record<string, unknown>;
  const message: Record<string, unknown> = { role: "assistant", content: text };
  if (toolCalls.length) message.tool_calls = toolCalls;
  // Carried back so the next turn can replay them signed and in order.
  if (thinking.length) message.azure_thinking = thinking;

  return {
    id: String(data.id ?? `azure-${crypto.randomUUID()}`),
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [{
      index: 0,
      message,
      finish_reason: FINISH[String(data.stop_reason ?? "end_turn")] ?? "stop",
    }],
    usage: {
      prompt_tokens: Number(usage.input_tokens ?? 0) || 0,
      completion_tokens: Number(usage.output_tokens ?? 0) || 0,
      total_tokens: (Number(usage.input_tokens ?? 0) || 0) + (Number(usage.output_tokens ?? 0) || 0),
    },
  };
}

export async function azureClaudeChat(
  model: string,
  body: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<Response> {
  const route = messagesRoute();
  if (!route) {
    return new Response(
      JSON.stringify({ error: { message: "No Anthropic Messages host configured", type: "not_configured" } }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
  const payload = JSON.stringify({ ...toMessagesBody({ ...body, model }), model });
  const res = await fetch(route.url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": route.key,
      "anthropic-version": "2023-06-01",
    },
    body: payload,
    signal,
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    console.error(`[anthropic-messages] ${model} -> ${res.status} ${detail.slice(0, 400)}`);
    return new Response(
      JSON.stringify({ error: { message: detail || `Azure returned ${res.status}`, type: "azure_claude_error" } }),
      { status: res.status, headers: { "Content-Type": "application/json" } },
    );
  }
  const data = await res.json() as Record<string, unknown>;
  return new Response(JSON.stringify(fromMessagesBody(model, data)), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

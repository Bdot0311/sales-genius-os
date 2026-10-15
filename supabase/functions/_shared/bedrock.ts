// Amazon Bedrock route for the shared AI layer.
//
// Why this file exists: Bedrock is billed on our own AWS account, so customer
// features no longer depend on the platform's shared AI credit balance. Bedrock
// speaks the Converse API rather than OpenAI chat-completions, so everything
// here is translation plus AWS SigV4 request signing (no AWS SDK — Deno's Web
// Crypto is enough and keeps the function cold start small).

import { bedrockSendUrl as resolveSendUrl } from "./ai-gateway.ts";

// ─── Config ────────────────────────────────────────────────────────────────
export function bedrockRegion(): string {
  return Deno.env.get("AWS_REGION") || Deno.env.get("BEDROCK_REGION") || "us-east-1";
}
function accessKeyId(): string {
  return Deno.env.get("AWS_ACCESS_KEY_ID") || "";
}
function secretAccessKey(): string {
  return Deno.env.get("AWS_SECRET_ACCESS_KEY") || "";
}
function sessionToken(): string {
  return Deno.env.get("AWS_SESSION_TOKEN") || "";
}
/**
 * Bedrock API key (bearer token). AWS's newer "Bedrock API keys" are sent as a
 * plain `Authorization: Bearer ...` header — no SigV4 signing, no IAM keys.
 */
function bearerToken(): string {
  return (
    Deno.env.get("AWS_BEARER_TOKEN_BEDROCK") ||
    Deno.env.get("BEDROCK_API_KEY") ||
    ""
  );
}

export function bedrockConfigured(): boolean {
  return Boolean(bearerToken() || (accessKeyId() && secretAccessKey()));
}


/** Fast/cheap workhorse model, and a stronger one for "pro"-class requests. */
export function bedrockDefaultModel(): string {
  return Deno.env.get("BEDROCK_MODEL_ID") || "us.anthropic.claude-haiku-4-5-20251001-v1:0";
}
export function bedrockProModel(): string {
  return Deno.env.get("BEDROCK_MODEL_ID_PRO") || "us.anthropic.claude-sonnet-4-5-20250929-v1:0";
}

/** USD per 1M tokens for the Bedrock ids we route to. */
export const BEDROCK_PRICING: Record<string, { in: number; out: number }> = {
  "anthropic.claude-3-5-haiku": { in: 0.8, out: 4 },
  "anthropic.claude-3-5-sonnet": { in: 3, out: 15 },
  "anthropic.claude-3-7-sonnet": { in: 3, out: 15 },
  "anthropic.claude-sonnet-4": { in: 3, out: 15 },
  "anthropic.claude-haiku-4": { in: 1, out: 5 },
  "amazon.nova-micro": { in: 0.035, out: 0.14 },
  "amazon.nova-lite": { in: 0.06, out: 0.24 },
  "amazon.nova-pro": { in: 0.8, out: 3.2 },
  "meta.llama3": { in: 0.3, out: 0.6 },
};

/** Price a Bedrock model id by longest matching family prefix. */
export function bedrockPrice(modelId: string): { in: number; out: number } | null {
  const id = modelId.replace(/^(us|eu|apac)\./, "");
  let best: { in: number; out: number } | null = null;
  let bestLen = 0;
  for (const [prefix, price] of Object.entries(BEDROCK_PRICING)) {
    if (id.startsWith(prefix) && prefix.length > bestLen) {
      best = price;
      bestLen = prefix.length;
    }
  }
  return best;
}

// ─── SigV4 ─────────────────────────────────────────────────────────────────
const enc = new TextEncoder();

async function sha256Hex(data: string | Uint8Array): Promise<string> {
  const bytes = typeof data === "string" ? enc.encode(data) : data;
  const digest = await crypto.subtle.digest("SHA-256", bytes as unknown as BufferSource);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function hmac(key: Uint8Array, data: string): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    key as unknown as BufferSource,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, enc.encode(data));
  return new Uint8Array(sig);
}

/** Signs a Bedrock POST and returns the headers to send with it. */
async function signRequest(
  url: URL,
  payload: string,
): Promise<Record<string, string>> {
  const region = bedrockRegion();
  const service = "bedrock";
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dateStamp = amzDate.slice(0, 8);
  const payloadHash = await sha256Hex(payload);

  const headers: Record<string, string> = {
    "content-type": "application/json",
    host: url.host,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amzDate,
  };
  if (sessionToken()) headers["x-amz-security-token"] = sessionToken();

  const signedNames = Object.keys(headers).sort();
  const canonicalHeaders = signedNames.map((n) => `${n}:${headers[n].trim()}\n`).join("");
  const signedHeaders = signedNames.join(";");
  const canonicalRequest = [
    "POST",
    url.pathname.split("/").map((s, i) => (i === 0 ? s : encodeURIComponent(decodeURIComponent(s)))).join("/"),
    url.searchParams.toString(),
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");

  const scope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    scope,
    await sha256Hex(canonicalRequest),
  ].join("\n");

  let signingKey = await hmac(enc.encode(`AWS4${secretAccessKey()}`), dateStamp);
  signingKey = await hmac(signingKey, region);
  signingKey = await hmac(signingKey, service);
  signingKey = await hmac(signingKey, "aws4_request");
  const sigBytes = await hmac(signingKey, stringToSign);
  const signature = [...sigBytes].map((b) => b.toString(16).padStart(2, "0")).join("");

  return {
    ...headers,
    Authorization:
      `AWS4-HMAC-SHA256 Credential=${accessKeyId()}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
  };
}

// ─── OpenAI chat-completions -> Bedrock Converse ───────────────────────────
type OpenAiMessage = {
  role: string;
  content?: unknown;
  name?: string;
  tool_call_id?: string;
  tool_calls?: Array<{ id?: string; function?: { name?: string; arguments?: string } }>;
};

function textOf(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => (part && typeof part === "object" && "text" in (part as Record<string, unknown>)
        ? String((part as Record<string, unknown>).text ?? "")
        : ""))
      .join("\n")
      .trim();
  }
  return "";
}

function safeParse(json?: string): Record<string, unknown> {
  if (!json) return {};
  try {
    const parsed = JSON.parse(json);
    return parsed && typeof parsed === "object" ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

export function toConverseBody(body: Record<string, unknown>): Record<string, unknown> {
  const messages = Array.isArray(body.messages) ? (body.messages as OpenAiMessage[]) : [];
  const system: Array<{ text: string }> = [];
  const converse: Array<{ role: "user" | "assistant"; content: unknown[] }> = [];

  const push = (role: "user" | "assistant", block: unknown) => {
    const last = converse[converse.length - 1];
    if (last && last.role === role) last.content.push(block);
    else converse.push({ role, content: [block] });
  };

  for (const msg of messages) {
    if (msg.role === "system" || msg.role === "developer") {
      const text = textOf(msg.content);
      if (text) system.push({ text });
      continue;
    }
    if (msg.role === "tool") {
      push("user", {
        toolResult: {
          toolUseId: msg.tool_call_id ?? "tool",
          content: [{ text: textOf(msg.content) || "(no output)" }],
        },
      });
      continue;
    }
    if (msg.role === "assistant") {
      const text = textOf(msg.content);
      if (text) push("assistant", { text });
      for (const call of msg.tool_calls ?? []) {
        push("assistant", {
          toolUse: {
            toolUseId: call.id ?? crypto.randomUUID(),
            name: call.function?.name ?? "tool",
            input: safeParse(call.function?.arguments),
          },
        });
      }
      continue;
    }
    push("user", { text: textOf(msg.content) || "(empty)" });
  }

  // Converse requires the conversation to start with a user turn.
  if (converse.length === 0 || converse[0].role !== "user") {
    converse.unshift({ role: "user", content: [{ text: "Continue." }] });
  }

  const inferenceConfig: Record<string, unknown> = {};
  if (typeof body.temperature === "number") inferenceConfig.temperature = body.temperature;
  if (typeof body.top_p === "number") inferenceConfig.topP = body.top_p;
  const maxTokens = body.max_completion_tokens ?? body.max_tokens;
  if (typeof maxTokens === "number") inferenceConfig.maxTokens = maxTokens;

  const out: Record<string, unknown> = { messages: converse };
  if (system.length) out.system = system;
  if (Object.keys(inferenceConfig).length) out.inferenceConfig = inferenceConfig;

  // Tool calling: OpenAI `tools` -> Converse `toolConfig`.
  const tools = Array.isArray(body.tools) ? body.tools : [];
  if (tools.length) {
    const specs = tools
      .map((t) => {
        const fn = (t as Record<string, unknown>)?.function as Record<string, unknown> | undefined;
        if (!fn?.name) return null;
        return {
          toolSpec: {
            name: String(fn.name),
            description: typeof fn.description === "string" ? fn.description : undefined,
            inputSchema: { json: fn.parameters ?? { type: "object", properties: {} } },
          },
        };
      })
      .filter(Boolean);
    if (specs.length) {
      const toolConfig: Record<string, unknown> = { tools: specs };
      const choice = body.tool_choice;
      if (choice === "required" || choice === "any") toolConfig.toolChoice = { any: {} };
      else if (choice && typeof choice === "object") {
        const name = ((choice as Record<string, unknown>).function as Record<string, unknown> | undefined)?.name;
        if (name) toolConfig.toolChoice = { tool: { name: String(name) } };
      }
      out.toolConfig = toolConfig;
    }
  }

  // Structured output has no Converse equivalent; the prompts already ask for
  // JSON and every call site tolerates fenced/prose-wrapped JSON.
  return out;
}

/** Converse response -> the OpenAI chat-completions shape call sites expect. */
export function fromConverseBody(model: string, data: Record<string, unknown>): Record<string, unknown> {
  const output = (data.output as Record<string, unknown> | undefined)?.message as
    | Record<string, unknown>
    | undefined;
  const blocks = Array.isArray(output?.content) ? (output!.content as Record<string, unknown>[]) : [];

  let text = "";
  const toolCalls: Array<Record<string, unknown>> = [];
  for (const block of blocks) {
    if (typeof block.text === "string") text += block.text;
    const use = block.toolUse as Record<string, unknown> | undefined;
    if (use) {
      toolCalls.push({
        id: String(use.toolUseId ?? crypto.randomUUID()),
        type: "function",
        function: { name: String(use.name ?? "tool"), arguments: JSON.stringify(use.input ?? {}) },
      });
    }
  }

  const usage = (data.usage as Record<string, unknown> | undefined) ?? {};
  const stopReason = String(data.stopReason ?? "end_turn");

  return {
    id: `bedrock-${crypto.randomUUID()}`,
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [
      {
        index: 0,
        message: {
          role: "assistant",
          content: text || null,
          ...(toolCalls.length ? { tool_calls: toolCalls } : {}),
        },
        finish_reason: toolCalls.length ? "tool_calls" : stopReason === "max_tokens" ? "length" : "stop",
      },
    ],
    usage: {
      prompt_tokens: Number(usage.inputTokens ?? 0) || 0,
      completion_tokens: Number(usage.outputTokens ?? 0) || 0,
      total_tokens: Number(usage.totalTokens ?? 0) || 0,
    },
  };
}

/**
 * Calls Bedrock Converse with an OpenAI-shaped body and returns an
 * OpenAI-shaped response. No timeout: model calls routinely take minutes.
 */
export async function bedrockChat(
  modelId: string,
  body: Record<string, unknown>,
): Promise<Response> {
  const url = new URL(
    `https://bedrock-runtime.${bedrockRegion()}.amazonaws.com/model/${encodeURIComponent(modelId)}/converse`,
  );
  const payload = JSON.stringify(toConverseBody(body));
  // API key (bearer) takes precedence: it needs no signing at all.
  const headers = bearerToken()
    ? {
      "content-type": "application/json",
      Authorization: `Bearer ${bearerToken()}`,
    }
    : await signRequest(url, payload);


  const res = await fetch(resolveSendUrl(url, bedrockRegion(), Deno.env.get("CF_AI_GATEWAY_BEDROCK")), { method: "POST", headers, body: payload });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    console.error(`[bedrock] ${modelId} -> ${res.status} ${detail.slice(0, 400)}`);
    return new Response(
      JSON.stringify({ error: { message: detail || `Bedrock returned ${res.status}`, type: "bedrock_error" } }),
      { status: res.status, headers: { "Content-Type": "application/json" } },
    );
  }

  const data = await res.json();
  return new Response(JSON.stringify(fromConverseBody(modelId, data)), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * Real token-by-token streaming through Bedrock's ConverseStream API.
 *
 * Bedrock frames its stream as AWS event-stream binary messages, not SSE, so we
 * parse the framing here and re-emit OpenAI `chat.completion.chunk` SSE events —
 * that keeps every call site (which speaks the OpenAI streaming shape) unchanged
 * while the user sees the answer appear as it is generated.
 */
export async function bedrockChatStream(
  modelId: string,
  body: Record<string, unknown>,
  onUsage?: (usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number }) => void,
): Promise<Response> {
  const url = new URL(
    `https://bedrock-runtime.${bedrockRegion()}.amazonaws.com/model/${
      encodeURIComponent(modelId)
    }/converse-stream`,
  );
  const payload = JSON.stringify(toConverseBody(body));
  const headers = bearerToken()
    ? { "content-type": "application/json", Authorization: `Bearer ${bearerToken()}` }
    : await signRequest(url, payload);

  const res = await fetch(resolveSendUrl(url, bedrockRegion(), Deno.env.get("CF_AI_GATEWAY_BEDROCK")), { method: "POST", headers, body: payload });
  if (!res.ok || !res.body) {
    const detail = await res.text().catch(() => "");
    console.error(`[bedrock] stream ${modelId} -> ${res.status} ${detail.slice(0, 400)}`);
    return new Response(
      JSON.stringify({ error: { message: detail || `Bedrock returned ${res.status}`, type: "bedrock_error" } }),
      { status: res.ok ? 502 : res.status, headers: { "Content-Type": "application/json" } },
    );
  }

  const id = `bedrock-${crypto.randomUUID()}`;
  const created = Math.floor(Date.now() / 1000);
  const enc = new TextEncoder();
  const sse = (delta: Record<string, unknown>, finish: string | null) =>
    enc.encode(
      `data: ${
        JSON.stringify({
          id,
          object: "chat.completion.chunk",
          created,
          model: modelId,
          choices: [{ index: 0, delta, finish_reason: finish }],
        })
      }\n\n`,
    );

  const upstream = res.body;
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const reader = upstream.getReader();
      let buf = new Uint8Array(0);
      // Bedrock content-block index -> emitted tool_call index.
      const toolIndex = new Map<number, number>();
      let nextToolIndex = 0;
      let finish: string | null = null;
      controller.enqueue(sse({ role: "assistant" }, null));
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (value && value.length) {
            const merged = new Uint8Array(buf.length + value.length);
            merged.set(buf);
            merged.set(value, buf.length);
            buf = merged;
          }
          // Drain every complete event-stream frame currently buffered.
          while (buf.length >= 12) {
            const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
            const total = view.getUint32(0);
            if (!total || total > 16 * 1024 * 1024) {
              // Unrecognisable framing — stop rather than loop forever.
              buf = new Uint8Array(0);
              break;
            }
            if (buf.length < total) break;
            const headersLen = view.getUint32(4);
            const frame = buf.subarray(0, total);
            buf = buf.subarray(total);

            // Headers: [1B name len][name][1B value type][value]; type 7 = string.
            let off = 12;
            const headerEnd = 12 + headersLen;
            let eventType = "";
            while (off < headerEnd) {
              const nameLen = frame[off];
              off += 1;
              const name = new TextDecoder().decode(frame.subarray(off, off + nameLen));
              off += nameLen;
              const type = frame[off];
              off += 1;
              let val = "";
              if (type === 7) {
                const vLen = (frame[off] << 8) | frame[off + 1];
                off += 2;
                val = new TextDecoder().decode(frame.subarray(off, off + vLen));
                off += vLen;
              } else if (type === 6) {
                const vLen = (frame[off] << 8) | frame[off + 1];
                off += 2 + vLen;
              } else if (type === 0 || type === 1) {
                // boolean: no value bytes
              } else if (type === 2) off += 1;
              else if (type === 3) off += 2;
              else if (type === 4) off += 4;
              else if (type === 5 || type === 8) off += 8;
              else if (type === 9) off += 16;
              if (name === ":event-type") eventType = val;
            }

            const payloadBytes = frame.subarray(headerEnd, total - 4);
            let event: Record<string, unknown> = {};
            try {
              event = JSON.parse(new TextDecoder().decode(payloadBytes));
            } catch {
              continue;
            }

            if (eventType === "contentBlockStart") {
              const start = (event.start as Record<string, unknown> | undefined)?.toolUse as
                | Record<string, unknown>
                | undefined;
              if (start) {
                const blockIdx = Number(event.contentBlockIndex ?? 0);
                const idx = nextToolIndex++;
                toolIndex.set(blockIdx, idx);
                controller.enqueue(sse({
                  tool_calls: [{
                    index: idx,
                    id: String(start.toolUseId ?? crypto.randomUUID()),
                    type: "function",
                    function: { name: String(start.name ?? "tool"), arguments: "" },
                  }],
                }, null));
              }
            } else if (eventType === "contentBlockDelta") {
              const delta = (event.delta as Record<string, unknown> | undefined) ?? {};
              if (typeof delta.text === "string" && delta.text) {
                controller.enqueue(sse({ content: delta.text }, null));
              }
              const use = delta.toolUse as Record<string, unknown> | undefined;
              if (use && typeof use.input === "string") {
                const blockIdx = Number(event.contentBlockIndex ?? 0);
                const idx = toolIndex.get(blockIdx) ?? 0;
                controller.enqueue(sse({
                  tool_calls: [{ index: idx, function: { arguments: use.input } }],
                }, null));
              }
            } else if (eventType === "messageStop") {
              const stop = String(event.stopReason ?? "end_turn");
              finish = stop === "tool_use"
                ? "tool_calls"
                : stop === "max_tokens"
                ? "length"
                : "stop";
            } else if (eventType === "metadata") {
              const u = (event.usage as Record<string, unknown> | undefined) ?? {};
              const usage = {
                prompt_tokens: Number(u.inputTokens ?? 0) || 0,
                completion_tokens: Number(u.outputTokens ?? 0) || 0,
                total_tokens: Number(u.totalTokens ?? 0) || 0,
              };
              controller.enqueue(enc.encode(`data: ${JSON.stringify({ usage })}\n\n`));
              try {
                onUsage?.(usage);
              } catch { /* metering must never break the stream */ }
            } else if (
              eventType === "internalServerException" ||
              eventType === "modelStreamErrorException" ||
              eventType === "throttlingException" ||
              eventType === "validationException" ||
              eventType === "serviceUnavailableException"
            ) {
              console.error(`[bedrock] stream ${eventType}: ${JSON.stringify(event).slice(0, 300)}`);
              finish = finish ?? "stop";
            }
          }
          if (done) break;
        }
        controller.enqueue(sse({}, finish ?? "stop"));
        controller.enqueue(enc.encode("data: [DONE]\n\n"));
      } catch (err) {
        console.error("[bedrock] stream failed", err instanceof Error ? err.message : err);
      } finally {
        controller.close();
        try {
          reader.releaseLock();
        } catch { /* already released */ }
      }
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

/**
 * Fallback for streaming call sites when the real stream is unavailable: one
 * synthetic SSE stream built from a completed Converse response.
 */

export async function bedrockChatAsStream(
  modelId: string,
  body: Record<string, unknown>,
  prefetched?: Record<string, unknown>,
): Promise<Response> {
  let completion = prefetched;
  if (!completion) {
    const res = await bedrockChat(modelId, body);
    if (!res.ok) return res;
    completion = await res.json() as Record<string, unknown>;
  }
  const choice = (completion.choices as Record<string, unknown>[])[0];
  const message = choice.message as Record<string, unknown>;

  const chunk = (delta: Record<string, unknown>, finish: string | null) =>
    `data: ${JSON.stringify({
      id: completion.id,
      object: "chat.completion.chunk",
      created: completion.created,
      model: completion.model,
      choices: [{ index: 0, delta, finish_reason: finish }],
    })}\n\n`;

  const body_ = [
    chunk({ role: "assistant" }, null),
    ...(message.content ? [chunk({ content: message.content }, null)] : []),
    ...(message.tool_calls
      ? [chunk({ tool_calls: (message.tool_calls as unknown[]).map((c, i) => ({ index: i, ...(c as object) })) }, null)]
      : []),
    chunk({}, String(choice.finish_reason ?? "stop")),
    `data: ${JSON.stringify({ usage: completion.usage })}\n\n`,
    "data: [DONE]\n\n",
  ].join("");

  return new Response(body_, {
    status: 200,
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" },
  });
}

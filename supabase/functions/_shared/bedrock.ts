// Amazon Bedrock route for the shared AI layer.
//
// Why this file exists: Bedrock is billed on our own AWS account, so customer
// features no longer depend on the platform's shared AI credit balance. Bedrock
// speaks the Converse API rather than OpenAI chat-completions, so everything
// here is translation plus AWS SigV4 request signing (no AWS SDK — Deno's Web
// Crypto is enough and keeps the function cold start small).

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

export function bedrockConfigured(): boolean {
  return Boolean(accessKeyId() && secretAccessKey());
}

/** Fast/cheap workhorse model, and a stronger one for "pro"-class requests. */
export function bedrockDefaultModel(): string {
  return Deno.env.get("BEDROCK_MODEL_ID") || "us.anthropic.claude-3-5-haiku-20241022-v1:0";
}
export function bedrockProModel(): string {
  return Deno.env.get("BEDROCK_MODEL_ID_PRO") || "us.anthropic.claude-sonnet-4-20250514-v1:0";
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
  const headers = await signRequest(url, payload);

  const res = await fetch(url.toString(), { method: "POST", headers, body: payload });
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
 * Streaming call sites get one synthetic SSE stream built from the completed
 * Converse response. Bedrock's own stream is AWS event-stream framed, not SSE,
 * so translating it would be a second parser for no user-visible gain here.
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

import { describe, expect, it } from "vitest";
import {
  AUDIT_TOOL_CHOICE,
  BEDROCK_OPUS_55_US_ID,
  BEDROCK_PRO_MODEL_ID,
  BEDROCK_STANDARD_MODEL_ID,
  bedrockDefaultModel,
  bedrockPrice,
  bedrockProModel,
  bedrockTierForRequest,
  copyAuditDispatch,
  usdForBedrockModel,
  fromConverseBody,
  opusPriceBlock,
  sendIfPriced,
  serverAuditPrelude,
  toConverseBody,
} from "../../supabase/functions/_shared/bedrock";
import { pruneTurnContext } from "../../supabase/functions/_shared/turn-context";

const SIGNATURE = "sig-opus-55-do-not-rewrite";

describe("Pro is the priced US Opus profile and Standard stays Haiku", () => {
  it("allowlists the server Pro ids and refuses a caller-supplied Opus id", () => {
    expect(bedrockTierForRequest("google/gemini-2.5-pro")).toBe("pro");
    expect(bedrockTierForRequest("openai/gpt-5.6-sol")).toBe("pro");
    expect(bedrockTierForRequest("google/gemini-2.5-flash")).toBe("fast");
    expect(bedrockTierForRequest("anthropic.claude-opus-5-5")).toBe("fast");
    expect(bedrockTierForRequest("us.anthropic.claude-opus-5-5")).toBe("fast");
    expect(bedrockTierForRequest("please use opus")).toBe("fast");
    expect(BEDROCK_PRO_MODEL_ID).toBe("us.anthropic.claude-sonnet-4-6");
    expect(BEDROCK_OPUS_55_US_ID).toBe("us.anthropic.claude-opus-5-5");
    expect(BEDROCK_STANDARD_MODEL_ID).toContain("haiku-4-5");
  });

  it("lets each environment variable replace only its own tier", () => {
    const previous = globalThis.Deno;
    const sonnet = "us.anthropic.claude-sonnet-4-5-20250929-v1:0";
    globalThis.Deno = { env: { get: () => "" } } as typeof Deno;
    try {
      expect(bedrockProModel()).toBe(BEDROCK_PRO_MODEL_ID);
      expect(bedrockDefaultModel()).toBe(BEDROCK_STANDARD_MODEL_ID);
    } finally {
      globalThis.Deno = previous;
    }
    globalThis.Deno = {
      env: { get: (name: string) => (name === "BEDROCK_MODEL_ID_PRO" ? sonnet : "") },
    } as typeof Deno;
    try {
      expect(bedrockProModel()).toBe(sonnet);
      expect(bedrockDefaultModel()).toBe(BEDROCK_STANDARD_MODEL_ID);
    } finally {
      globalThis.Deno = previous;
    }
  });
});

describe("Opus thinking blocks round-trip and old histories do not grow one", () => {
  const reasoning = {
    reasoningContent: {
      reasoningText: { text: "checked the tool id", signature: SIGNATURE },
    },
  };

  it("keeps the signed block beside the text and the tool call", () => {
    const completion = fromConverseBody("us.anthropic.claude-opus-5-5", {
      output: {
        message: {
          role: "assistant",
          content: [
            reasoning,
            { text: "Sending the note." },
            { toolUse: { toolUseId: "tooluse_1", name: "send_email", input: { leadId: "l1" } } },
          ],
        },
      },
      stopReason: "tool_use",
      usage: { inputTokens: 3, outputTokens: 4, totalTokens: 7 },
    });
    const message = (completion.choices as Array<{ message: Record<string, unknown> }>)[0].message;
    expect(message.content).toBe("Sending the note.");
    expect(message.bedrock_reasoning).toEqual([reasoning]);
    expect(JSON.stringify(message.bedrock_reasoning)).toContain(SIGNATURE);

    const next = toConverseBody({
      model: BEDROCK_OPUS_55_US_ID,
      temperature: 0.2,
      max_tokens: 200,
      messages: [
        { role: "user", content: "Send it." },
        message,
        { role: "tool", tool_call_id: "tooluse_1", content: "queued" },
      ],
    });
    const assistant = (next.messages as Array<{ role: string; content: Array<Record<string, unknown>> }>)
      .find((turn) => turn.role === "assistant");
    expect(assistant?.content[0]).toEqual(reasoning);
    expect(JSON.stringify(assistant?.content[0])).toContain(SIGNATURE);
    expect(assistant?.content.some((block) => (block.toolUse as { toolUseId?: string })?.toolUseId === "tooluse_1")).toBe(true);
    expect((next.inferenceConfig as Record<string, unknown>).temperature).toBeUndefined();
    expect((next.inferenceConfig as Record<string, unknown>).maxTokens).toBe(200);
  });

  it("does not invent a signature for an older text-only turn, and Haiku still takes temperature", () => {
    const next = toConverseBody({
      model: BEDROCK_STANDARD_MODEL_ID,
      temperature: 0.2,
      messages: [
        { role: "user", content: "Hi." },
        { role: "assistant", content: "Hello." },
      ],
    });
    const assistant = (next.messages as Array<{ role: string; content: unknown[] }>).find((turn) => turn.role === "assistant");
    expect(JSON.stringify(assistant?.content)).not.toContain("reasoningContent");
    expect(JSON.stringify(assistant?.content)).not.toContain("signature");
    expect((next.inferenceConfig as Record<string, unknown>).temperature).toBe(0.2);
  });
});

describe("Opus prices stay on the profile that was priced", () => {
  it("bills the US geo default at 4.40/22, Global at 4/20, and does not call out for an unpriced profile", async () => {
    expect(bedrockPrice(BEDROCK_OPUS_55_US_ID)).toEqual({ in: 4.4, out: 22 });
    expect(usdForBedrockModel(BEDROCK_OPUS_55_US_ID, 1_000_000, 1_000_000)).toBeCloseTo(26.4, 10);
    expect(opusPriceBlock(BEDROCK_OPUS_55_US_ID)).toBeNull();
    expect(bedrockPrice("global.anthropic.claude-opus-5-5")).toEqual({ in: 4, out: 20 });
    expect(usdForBedrockModel("global.anthropic.claude-opus-5-5", 1_000_000, 1_000_000)).toBe(24);
    expect(bedrockPrice("eu.anthropic.claude-opus-5-5")).toBeNull();
    expect(opusPriceBlock("eu.anthropic.claude-opus-5-5")).toMatch(/not sent/);
    expect(() => usdForBedrockModel("eu.anthropic.claude-opus-5-5", 1_000_000, 0)).toThrow(/not confirmed/);
    expect(bedrockPrice(BEDROCK_STANDARD_MODEL_ID)).toEqual({ in: 1, out: 5 });
    expect(usdForBedrockModel(BEDROCK_STANDARD_MODEL_ID, 1_000_000, 1_000_000)).toBe(6);
    expect(bedrockPrice("us.anthropic.claude-sonnet-4-5-20250929-v1:0")).toEqual({ in: 3, out: 15 });

    let calls = 0;
    const send = async () => {
      calls += 1;
      return new Response("sent", { status: 200 });
    };
    const allowed = await sendIfPriced(BEDROCK_OPUS_55_US_ID, send);
    expect(allowed.status).toBe(200);
    expect(calls).toBe(1);
    const blocked = await sendIfPriced("eu.anthropic.claude-opus-5-5", send);
    expect(blocked.status).toBe(422);
    expect(calls).toBe(1);
  });
});

describe("copy audit stays mandatory without a forced Opus tool choice", () => {
  it("keeps a named tool_choice for Haiku and runs the audit before an Opus call", () => {
    expect(copyAuditDispatch(BEDROCK_STANDARD_MODEL_ID)).toBe("tool_choice");
    expect(copyAuditDispatch("us.anthropic.claude-sonnet-4-5-20250929-v1:0")).toBe("tool_choice");
    expect(copyAuditDispatch(BEDROCK_OPUS_55_US_ID)).toBe("server");
    const forced = toConverseBody({
      model: BEDROCK_STANDARD_MODEL_ID,
      messages: [{ role: "user", content: "Review this." }],
      tools: [{ type: "function", function: { name: "audit_email", parameters: { type: "object" } } }],
      tool_choice: AUDIT_TOOL_CHOICE,
    });
    expect((forced.toolConfig as { toolChoice?: { tool?: { name?: string } } }).toolChoice?.tool?.name).toBe("audit_email");

    const prelude = serverAuditPrelude(JSON.stringify({ findings: [{ rule: "no_ask" }], blockers: 1 }));
    const opus = toConverseBody({
      model: BEDROCK_OPUS_55_US_ID,
      messages: [{ role: "user", content: "Review this: Hi Sam, note." }, ...prelude],
      tools: [{ type: "function", function: { name: "audit_email", parameters: { type: "object" } } }],
      tool_choice: AUDIT_TOOL_CHOICE,
    });
    expect((opus.toolConfig as { toolChoice?: unknown }).toolChoice).toBeUndefined();
    const encoded = JSON.stringify(opus.messages);
    expect(encoded).toContain("audit-email-required");
    expect(encoded).toContain("no_ask");
    expect(encoded).not.toContain("toolChoice");
  });
});

describe("pruning does not replay a signature against a rewritten tool result", () => {
  it("drops only the signature whose prefix changed", () => {
    const earlier = { reasoningContent: { reasoningText: { text: "first", signature: "sig-keep" } } };
    const later = { reasoningContent: { reasoningText: { text: "second", signature: "sig-drop" } } };
    const messages = [
      { role: "user", content: "List them." },
      {
        role: "assistant",
        content: "",
        bedrock_reasoning: [earlier],
        tool_calls: [{ id: "call-1", function: { name: "list_leads" } }],
      },
      { role: "tool", tool_call_id: "call-1", content: "x".repeat(2_000) },
      {
        role: "assistant",
        content: "",
        bedrock_reasoning: [later],
        tool_calls: [{ id: "call-2", function: { name: "draft" } }],
      },
    ];
    const outcome = pruneTurnContext(messages, { budget: 10, minChars: 100 });
    expect(outcome.prunedCount).toBe(1);
    expect(messages[1].bedrock_reasoning).toEqual([earlier]);
    expect(messages[3].bedrock_reasoning).toBeUndefined();
    expect(messages[2].tool_call_id).toBe("call-1");
    const converse = toConverseBody({ model: BEDROCK_PRO_MODEL_ID, messages });
    const encoded = JSON.stringify(converse.messages);
    expect(encoded).toContain("sig-keep");
    expect(encoded).not.toContain("sig-drop");
    expect(encoded).toContain("call-1");
  });
});

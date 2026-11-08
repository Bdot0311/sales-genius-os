import { describe, expect, it } from "vitest";
import {
  BEDROCK_PRO_MODEL_ID,
  BEDROCK_STANDARD_MODEL_ID,
  bedrockDefaultModel,
  bedrockProModel,
  bedrockTierForRequest,
  fromConverseBody,
  toConverseBody,
} from "../../supabase/functions/_shared/bedrock";

const SIGNATURE = "sig-opus-55-do-not-rewrite";

describe("Pro is Opus 5.5 and Standard stays Haiku", () => {
  it("allowlists the server Pro ids and refuses a caller-supplied Opus id", () => {
    expect(bedrockTierForRequest("google/gemini-2.5-pro")).toBe("pro");
    expect(bedrockTierForRequest("openai/gpt-5.6-sol")).toBe("pro");
    expect(bedrockTierForRequest("google/gemini-2.5-flash")).toBe("fast");
    expect(bedrockTierForRequest("anthropic.claude-opus-5-5")).toBe("fast");
    expect(bedrockTierForRequest("us.anthropic.claude-opus-5-5")).toBe("fast");
    expect(bedrockTierForRequest("please use opus")).toBe("fast");
    expect(BEDROCK_PRO_MODEL_ID).toBe("us.anthropic.claude-opus-5-5");
    expect(BEDROCK_STANDARD_MODEL_ID).toContain("haiku-4-5");
  });

  it("lets each environment variable replace only its own tier", () => {
    const previous = globalThis.Deno;
    globalThis.Deno = {
      env: {
        get: (name: string) => {
          if (name === "BEDROCK_MODEL_ID_PRO") return "us.anthropic.claude-sonnet-4-5-20250929-v1:0";
          return undefined;
        },
      },
    } as typeof Deno;
    try {
      expect(bedrockProModel()).toBe("us.anthropic.claude-sonnet-4-5-20250929-v1:0");
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
      model: BEDROCK_PRO_MODEL_ID,
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

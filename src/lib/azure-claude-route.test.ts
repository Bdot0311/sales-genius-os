import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  AZURE_CLAUDE_FAST,
  AZURE_CLAUDE_PRO,
  azureClaudeConfigured,
  azureClaudeEndpoint,
  azureClaudeFastModel,
  azureClaudePrice,
  azureClaudeProModel,
  fromMessagesBody,
  toMessagesBody,
} from "../../supabase/functions/_shared/azure-claude";

/**
 * Claude on Microsoft Foundry, as a third provider.
 *
 * The Pro tier has been pinned to Sonnet 4.6 with a comment saying "temporary
 * until the account is granted Opus 5.5 access": naming a Bedrock model id
 * does not entitle the AWS account to it. Foundry lists `claude-opus-5-5` as
 * generally available and hosted on Azure, so the model the drafting stack was
 * written for is reachable without waiting on AWS.
 *
 * Foundry serves Claude through the Anthropic Messages API, not an
 * OpenAI-compatible endpoint, so the request and response translations are the
 * part that can be wrong in ways nothing else would catch. They are pure
 * functions, so they are tested here properly rather than at a live endpoint.
 */

/*
 * The module reads Deno.env, which vitest does not have. The existing provider
 * tests stand one up the same way; this one keeps a per-test map so a case can
 * set a variable without touching the real environment.
 */
const previous = globalThis.Deno;
let vars: Record<string, string> = {};
const env = (next: Record<string, string | undefined>) => {
  for (const [k, v] of Object.entries(next)) {
    if (v === undefined) delete vars[k];
    else vars[k] = v;
  }
  globalThis.Deno = { env: { get: (name: string) => vars[name] } } as unknown as typeof Deno;
};

beforeEach(() => {
  vars = {};
  globalThis.Deno = { env: { get: (name: string) => vars[name] } } as unknown as typeof Deno;
});
afterEach(() => {
  globalThis.Deno = previous;
});

describe("off unless both halves are set", () => {
  it("is off with nothing set, which is how every existing install stays on Bedrock", () => {
    expect(azureClaudeConfigured()).toBe(false);
  });

  it("is off with only one half, because half a credential is not a route", () => {
    env({ AZURE_CLAUDE_ENDPOINT: "https://r.services.ai.azure.com" });
    expect(azureClaudeConfigured()).toBe(false);
    env({ AZURE_CLAUDE_ENDPOINT: undefined, AZURE_CLAUDE_API_KEY: "k" });
    expect(azureClaudeConfigured()).toBe(false);
  });

  it("refuses a value that is not an https URL rather than posting prompts at it", () => {
    env({ AZURE_CLAUDE_ENDPOINT: "r.services.ai.azure.com", AZURE_CLAUDE_API_KEY: "k" });
    expect(azureClaudeEndpoint()).toBe("");
    expect(azureClaudeConfigured()).toBe(false);
  });
});

describe("the endpoint is built, not pasted", () => {
  it("appends the Messages path to a bare resource base", () => {
    env({ AZURE_CLAUDE_ENDPOINT: "https://r.services.ai.azure.com" });
    expect(azureClaudeEndpoint()).toBe("https://r.services.ai.azure.com/anthropic/v1/messages");
  });

  it("takes the host from whichever endpoint the portal handed over", () => {
    /*
     * The project endpoint is the one on the overview page, and pasting it
     * built ".../api/projects/<project>/anthropic/v1/messages", which 404s
     * with nothing to say the URL was the problem. Claude is always at
     * /anthropic/v1/messages on the resource host, so the path is dropped.
     */
    for (const given of [
      "https://r.services.ai.azure.com",
      "https://r.services.ai.azure.com/",
      "https://r.services.ai.azure.com/anthropic",
      "https://r.services.ai.azure.com/anthropic/v1/messages",
      "https://r.services.ai.azure.com/api/projects/BDOT",
      "https://r.services.ai.azure.com/api/projects/BDOT/",
      "https://r.services.ai.azure.com/openai/deployments/x",
    ]) {
      env({ AZURE_CLAUDE_ENDPOINT: given });
      expect(azureClaudeEndpoint(), given).toBe("https://r.services.ai.azure.com/anthropic/v1/messages");
    }
  });

  it("keeps the port and refuses a URL it cannot parse", () => {
    env({ AZURE_CLAUDE_ENDPOINT: "https://r.services.ai.azure.com:8443/api/projects/BDOT" });
    expect(azureClaudeEndpoint()).toBe("https://r.services.ai.azure.com:8443/anthropic/v1/messages");
    env({ AZURE_CLAUDE_ENDPOINT: "https://" });
    expect(azureClaudeEndpoint()).toBe("");
  });
});

describe("the two tiers", () => {
  it("defaults to the models Foundry lists as hosted on Azure and GA", () => {
    expect(azureClaudeFastModel()).toBe(AZURE_CLAUDE_FAST);
    expect(azureClaudeProModel()).toBe(AZURE_CLAUDE_PRO);
    expect(AZURE_CLAUDE_PRO).toBe("claude-opus-5-5");
  });

  it("lets each variable replace only its own tier", () => {
    env({ AZURE_CLAUDE_MODEL_ID: "my-haiku-deployment" });
    expect(azureClaudeFastModel()).toBe("my-haiku-deployment");
    expect(azureClaudeProModel()).toBe(AZURE_CLAUDE_PRO);
    env({ AZURE_CLAUDE_MODEL_ID: undefined, AZURE_CLAUDE_MODEL_ID_PRO: "my-opus-deployment" });
    expect(azureClaudeProModel()).toBe("my-opus-deployment");
    expect(azureClaudeFastModel()).toBe(AZURE_CLAUDE_FAST);
  });

  it("prices a renamed deployment by its family rather than billing it as free", () => {
    expect(azureClaudePrice("claude-opus-5-5")).toEqual({ in: 4, out: 20 });
    expect(azureClaudePrice("prod-claude-opus-5-5-eastus")).toEqual({ in: 4, out: 20 });
    expect(azureClaudePrice("something-unknown")).toBeNull();
  });
});

describe("the request becomes an Anthropic Messages request", () => {
  it("lifts system out of the message list, because this API takes it at the top", () => {
    const out = toMessagesBody({
      model: "claude-haiku-4-5",
      messages: [
        { role: "system", content: "You are terse." },
        { role: "user", content: "Hello" },
      ],
    });
    expect(out.system).toBe("You are terse.");
    expect(out.messages).toEqual([{ role: "user", content: [{ type: "text", text: "Hello" }] }]);
  });

  it("always sends max_tokens, which this API requires and Converse did not", () => {
    const out = toMessagesBody({ model: "claude-haiku-4-5", messages: [{ role: "user", content: "Hi" }] });
    expect(typeof out.max_tokens).toBe("number");
    expect(out.max_tokens as number).toBeGreaterThan(0);
    const asked = toMessagesBody({ model: "claude-haiku-4-5", max_tokens: 256, messages: [{ role: "user", content: "Hi" }] });
    expect(asked.max_tokens).toBe(256);
  });

  it("opens on a user turn even when the history does not", () => {
    const out = toMessagesBody({
      model: "claude-haiku-4-5",
      messages: [{ role: "assistant", content: "Picking up where we left off." }],
    });
    expect((out.messages as Array<{ role: string }>)[0].role).toBe("user");
  });

  it("turns a tool call and its result into the blocks this API names differently", () => {
    const out = toMessagesBody({
      model: "claude-haiku-4-5",
      messages: [
        { role: "user", content: "Draft one" },
        { role: "assistant", content: "", tool_calls: [{ id: "call_1", function: { name: "draft_outreach", arguments: '{"lead_id":"abc"}' } }] },
        { role: "tool", tool_call_id: "call_1", content: "ok" },
      ],
    });
    const msgs = out.messages as Array<{ role: string; content: Record<string, unknown>[] }>;
    const use = msgs.flatMap((m) => m.content).find((b) => b.type === "tool_use");
    expect(use).toMatchObject({ id: "call_1", name: "draft_outreach", input: { lead_id: "abc" } });
    const result = msgs.flatMap((m) => m.content).find((b) => b.type === "tool_result");
    expect(result).toMatchObject({ tool_use_id: "call_1", content: "ok" });
  });

  it("renames the tool schema field, which is input_schema here and parameters there", () => {
    const out = toMessagesBody({
      model: "claude-haiku-4-5",
      messages: [{ role: "user", content: "Hi" }],
      tools: [{ type: "function", function: { name: "list_leads", description: "d", parameters: { type: "object" } } }],
    });
    expect(out.tools).toEqual([{ name: "list_leads", description: "d", input_schema: { type: "object" } }]);
  });

  it("leaves adaptive thinking alone on Opus 5 and keeps temperature off it", () => {
    // A manual temperature is not a thinking budget; sending both fights the
    // mode, which is why the Bedrock path omits it for this family too.
    const opus = toMessagesBody({ model: "claude-opus-5-5", temperature: 0.4, messages: [{ role: "user", content: "Hi" }] });
    expect(opus.thinking).toEqual({ type: "adaptive" });
    expect(opus.temperature).toBeUndefined();
    const haiku = toMessagesBody({ model: "claude-haiku-4-5", temperature: 0.4, messages: [{ role: "user", content: "Hi" }] });
    expect(haiku.thinking).toBeUndefined();
    expect(haiku.temperature).toBe(0.4);
  });

  it("replays a signed thinking block before the text it preceded", () => {
    const thought = { type: "thinking", thinking: "...", signature: "sig" };
    const out = toMessagesBody({
      model: "claude-opus-5-5",
      messages: [
        { role: "user", content: "Hi" },
        { role: "assistant", content: "Answer", azure_thinking: [thought] },
      ],
    });
    const assistant = (out.messages as Array<{ role: string; content: Record<string, unknown>[] }>)
      .find((m) => m.role === "assistant")!;
    expect(assistant.content[0]).toEqual(thought);
    expect(assistant.content[1]).toEqual({ type: "text", text: "Answer" });
  });
});

describe("the response becomes the shape every call site already reads", () => {
  it("flattens text blocks and maps the stop reason", () => {
    const out = fromMessagesBody("claude-opus-5-5", {
      id: "msg_1",
      content: [{ type: "text", text: "Hello " }, { type: "text", text: "there" }],
      stop_reason: "end_turn",
      usage: { input_tokens: 10, output_tokens: 4 },
    }) as any;
    expect(out.choices[0].message.content).toBe("Hello there");
    expect(out.choices[0].finish_reason).toBe("stop");
    expect(out.usage).toEqual({ prompt_tokens: 10, completion_tokens: 4, total_tokens: 14 });
    expect(out.object).toBe("chat.completion");
  });

  it("turns a tool_use block back into a tool call with stringified arguments", () => {
    const out = fromMessagesBody("claude-opus-5-5", {
      content: [{ type: "tool_use", id: "tu_1", name: "list_leads", input: { label: "new" } }],
      stop_reason: "tool_use",
      usage: { input_tokens: 1, output_tokens: 1 },
    }) as any;
    expect(out.choices[0].finish_reason).toBe("tool_calls");
    expect(out.choices[0].message.tool_calls[0]).toEqual({
      id: "tu_1",
      type: "function",
      function: { name: "list_leads", arguments: '{"label":"new"}' },
    });
  });

  it("carries thinking blocks back so the next turn can replay them", () => {
    const out = fromMessagesBody("claude-opus-5-5", {
      content: [{ type: "thinking", thinking: "...", signature: "sig" }, { type: "text", text: "Done" }],
      stop_reason: "end_turn",
      usage: {},
    }) as any;
    expect(out.choices[0].message.azure_thinking).toEqual([{ type: "thinking", thinking: "...", signature: "sig" }]);
  });

  it("maps a truncated answer to length rather than calling it a clean stop", () => {
    const out = fromMessagesBody("claude-opus-5-5", { content: [], stop_reason: "max_tokens", usage: {} }) as any;
    expect(out.choices[0].finish_reason).toBe("length");
  });
});

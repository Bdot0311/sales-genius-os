import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { ALL_AGENT_TOOLS, CORE_TOOLS, TOOL_CATALOG } from "../../supabase/functions/_shared/agent-tool-scope.ts";
import { OUTBOUND_TOOL_NAMES } from "../../supabase/functions/_shared/agent-outbound-tools.ts";
import { ALL_AGENT_TOOL_NAMES } from "@/components/agent/AgentRoles";

// Any tool the agent can run must be grantable to a custom build. A new tool
// that skips the scope or the builder UI fails here instead of in a user's chat.
const chatSrc = readFileSync("supabase/functions/agent-chat/index.ts", "utf8");
const toolsBlock = chatSrc.slice(chatSrc.indexOf("const TOOLS = ["), chatSrc.indexOf("\n];", chatSrc.indexOf("const TOOLS = [")));
const chatTools = [...toolsBlock.matchAll(/name: "([a-z_]+)"/g)].map((m) => m[1]);
const defined = [...new Set([...chatTools, ...OUTBOUND_TOOL_NAMES])].filter((t) => t !== "get_lead_intelligence");

describe("agent tool coverage", () => {
  it("every agent tool is grantable by role or custom build", () => {
    for (const t of defined) expect(ALL_AGENT_TOOLS, t).toContain(t);
  });
  it("every non-core tool appears in the custom build picker", () => {
    for (const t of ALL_AGENT_TOOLS.filter((x) => !CORE_TOOLS.includes(x))) expect(ALL_AGENT_TOOL_NAMES, t).toContain(t);
  });
  it("every tool is described for prompt-built agents", () => {
    for (const t of ALL_AGENT_TOOLS) expect(TOOL_CATALOG[t], t).toBeTruthy();
  });
});

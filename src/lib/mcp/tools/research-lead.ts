import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { callAppAction } from "../app-actions";
export default defineTool({
  name: "research_lead", title: "Research a saved lead",
  description: "Research your saved lead with the app's existing combined web sources and return a sourced brief. Stores research on the lead, reuses fresh results unless force=true, and never sends outreach.",
  inputSchema: { lead_id: z.string().uuid(), force: z.boolean().optional() },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  handler: ({ lead_id, force }, ctx) => callAppAction(ctx, "research_lead", "research-lead", { leadId: lead_id, force: force ?? false }),
});
import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { callAppAction } from "../app-actions";
export default defineTool({
  name: "generate_email", title: "Generate an email draft",
  description: "Generate and save an email draft for your saved lead, grounded in your own company context. The draft appears in Outreach Studio and Unified Inbox; no message is sent.",
  inputSchema: { lead_id: z.string().uuid(), tone: z.enum(["professional", "friendly", "casual", "formal"]), goal: z.enum(["introduction", "follow-up", "meeting", "demo", "proposal"]), senderName: z.string().max(100), businessDescription: z.string().max(500).optional(), customInstruction: z.string().max(8000).optional() },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  handler: ({ lead_id, ...input }, ctx) => callAppAction(ctx, "generate_email", "generate-email", { ...input, lead: { id: lead_id }, saveDraft: true }),
});
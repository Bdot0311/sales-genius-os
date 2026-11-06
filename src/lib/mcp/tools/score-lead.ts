import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { callAppAction } from "../app-actions";
export default defineTool({
  name: "score_lead", title: "Score a saved lead",
  description: "Score your saved lead against your saved ICP using the same app scorer, and store the resulting scores. Does not search or send.",
  inputSchema: { lead_id: z.string().uuid() },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  handler: ({ lead_id }, ctx) => callAppAction(ctx, "score_lead", "score-lead", { leadId: lead_id }),
});
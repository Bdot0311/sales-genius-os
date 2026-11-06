import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { callAppAction } from "../app-actions";
export default defineTool({
  name: "enrich_lead", title: "Enrich a saved lead",
  description: "Enrich your saved lead through the app's one-credit reveal, ownership checks and refund rules. Writes enrichment and verification results to that lead.",
  inputSchema: { lead_id: z.string().uuid() },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  handler: ({ lead_id }, ctx) => callAppAction(ctx, "enrich_lead", "enrich-lead", { leadId: lead_id }),
});
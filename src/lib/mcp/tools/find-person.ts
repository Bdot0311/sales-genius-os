import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { callAppAction } from "../app-actions";
export default defineTool({
  name: "find_person", title: "Look up a person",
  description: "Look up a known person by LinkedIn profile, work email or full name plus company. Uses the app's one-credit lookup and no-match refund; does not save. Use create_lead to save an approved result.",
  inputSchema: { full_name: z.string().max(500).optional(), company: z.string().max(500).optional(), company_domain: z.string().max(500).optional(), email: z.string().email().optional(), linkedin_url: z.string().url().max(500).optional() },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  handler: (input, ctx) => callAppAction(ctx, "find_person", "find-person", { ...input, action: "lookup" }),
});
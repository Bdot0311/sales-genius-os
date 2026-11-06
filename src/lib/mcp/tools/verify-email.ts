import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { callAppAction } from "../app-actions";
export default defineTool({
  name: "verify_email", title: "Check email deliverability",
  description: "Check one email through the same verifier used in search and enrichment. Returns valid, invalid, catch_all, role or unknown; only verified=true confirms a mailbox. No email is sent, no lead saved and no reveal credit charged. Account request limits apply.",
  inputSchema: { email: z.string().trim().min(1).max(320) },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  handler: (input, ctx) => callAppAction(ctx, "verify_email", "check-lead-email", input),
});
import { defineTool } from "@lovable.dev/mcp-js";
import { prospectSearchSchema } from "../action-schemas";
import { callAppAction } from "../app-actions";
import { validateAppAction } from "../../../../supabase/functions/_shared/api-action-contract";
import { err } from "./_supabase";
export default defineTool({
  name: "search_prospects", title: "Find new prospects",
  description: "Search the real B2B lead network using the app's ICP filters, result caps and daily search meter. Returns candidates without saving or sending; pass next_cursor to continue. Paid searching costs no reveal credits; enrichment does.",
  inputSchema: prospectSearchSchema,
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  handler: (input, ctx) => {
    const invalid = validateAppAction("prospects/search", input);
    return invalid ? err(invalid) : callAppAction(ctx, "search_prospects", "fetch-external-leads", input);
  },
});
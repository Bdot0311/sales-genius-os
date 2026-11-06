import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { callAppAction } from "../app-actions";
export default defineTool({
  name: "search_companies", title: "Find companies",
  description: "Search company names/domains using the app's free autocomplete, up to eight matches. Returns accounts, not people; nothing is saved or enriched.",
  inputSchema: { query: z.string().trim().min(2).max(500) },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
  handler: (input, ctx) => callAppAction(ctx, "search_companies", "search-companies", input),
});
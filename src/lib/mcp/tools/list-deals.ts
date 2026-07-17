import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, notAuthed, err, ok } from "./_supabase";

export default defineTool({
  name: "list_deals",
  title: "List pipeline deals",
  description: "List the signed-in user's pipeline deals, optionally filtered by stage.",
  inputSchema: {
    limit: z.number().int().min(1).max(100).optional(),
    stage: z.string().trim().optional().describe("Pipeline stage to filter by."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ limit, stage }, ctx) => {
    if (!ctx.isAuthenticated()) return notAuthed();
    const supabase = supabaseForUser(ctx);
    let q = supabase
      .from("deals")
      .select("id, title, company_name, contact_name, value, stage, probability, expected_close_date, lead_id, updated_at")
      .eq("user_id", ctx.getUserId())
      .order("updated_at", { ascending: false })
      .limit(Math.min(limit ?? 25, 100));
    if (stage) q = q.eq("stage", stage);
    const { data, error } = await q;
    if (error) return err(error.message);
    return ok(data ?? [], "deals");
  },
});

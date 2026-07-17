import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, notAuthed, err, ok } from "./_supabase";

export default defineTool({
  name: "update_deal",
  title: "Update deal",
  description: "Update fields on an existing pipeline deal owned by the signed-in user.",
  inputSchema: {
    id: z.string().uuid(),
    title: z.string().trim().optional(),
    company_name: z.string().trim().optional(),
    contact_name: z.string().trim().optional(),
    value: z.number().optional(),
    stage: z.string().trim().optional(),
    probability: z.number().int().min(0).max(100).optional(),
    expected_close_date: z.string().trim().optional().describe("YYYY-MM-DD"),
    notes: z.string().trim().optional(),
  },
  annotations: { readOnlyHint: false, idempotentHint: true, openWorldHint: false },
  handler: async ({ id, ...patch }, ctx) => {
    if (!ctx.isAuthenticated()) return notAuthed();
    const clean = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined));
    if (Object.keys(clean).length === 0) return err("No fields to update.");
    const supabase = supabaseForUser(ctx);
    const { data, error } = await supabase
      .from("deals")
      .update(clean)
      .eq("id", id)
      .eq("user_id", ctx.getUserId())
      .select("id, title, stage, value, probability, updated_at")
      .single();
    if (error) return err(error.message);
    return ok(data, "deal");
  },
});

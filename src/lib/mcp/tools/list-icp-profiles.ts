import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, notAuthed, err, ok } from "./_supabase";

export default defineTool({
  name: "list_icp_profiles",
  title: "List ICP profiles",
  description: "List the signed-in user's Ideal Customer Profile definitions with their targeting fields.",
  inputSchema: {
    limit: z.number().int().min(1).max(50).optional(),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ limit }, ctx) => {
    if (!ctx.isAuthenticated()) return notAuthed();
    const supabase = supabaseForUser(ctx);
    const { data, error } = await supabase
      .from("icp_profiles")
      .select(
        "id, name, industries, target_titles, departments, seniority_levels, geographies, company_size_min, company_size_max, revenue_range, tech_stack, buying_signals, intent_keywords, pain_points, value_proposition, disqualifiers, notes, updated_at"
      )
      .eq("user_id", ctx.getUserId())
      .order("updated_at", { ascending: false })
      .limit(Math.min(limit ?? 20, 50));
    if (error) return err(error.message);
    return ok(data ?? [], "icp_profiles");
  },
});

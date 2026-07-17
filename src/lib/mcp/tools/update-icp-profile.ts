import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, notAuthed, err, ok } from "./_supabase";

export default defineTool({
  name: "update_icp_profile",
  title: "Update ICP profile",
  description:
    "Update fields on an existing Ideal Customer Profile owned by the signed-in user. Array fields (industries, target_titles, tech_stack, etc.) replace the previous value entirely when provided.",
  inputSchema: {
    id: z.string().uuid(),
    name: z.string().trim().optional(),
    industries: z.array(z.string()).optional(),
    target_titles: z.array(z.string()).optional(),
    departments: z.array(z.string()).optional(),
    seniority_levels: z.array(z.string()).optional(),
    geographies: z.array(z.string()).optional(),
    tech_stack: z.array(z.string()).optional(),
    buying_signals: z.array(z.string()).optional(),
    intent_keywords: z.array(z.string()).optional(),
    pain_points: z.array(z.string()).optional(),
    company_size_min: z.number().int().optional(),
    company_size_max: z.number().int().optional(),
    revenue_range: z.string().trim().optional(),
    value_proposition: z.string().trim().optional(),
    disqualifiers: z.string().trim().optional(),
    notes: z.string().trim().optional(),
  },
  annotations: { readOnlyHint: false, idempotentHint: true, openWorldHint: false },
  handler: async ({ id, ...patch }, ctx) => {
    if (!ctx.isAuthenticated()) return notAuthed();
    const clean = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined));
    if (Object.keys(clean).length === 0) return err("No fields to update.");
    const supabase = supabaseForUser(ctx);
    const { data, error } = await supabase
      .from("icp_profiles")
      .update(clean)
      .eq("id", id)
      .eq("user_id", ctx.getUserId())
      .select("id, name, updated_at")
      .single();
    if (error) return err(error.message);
    return ok(data, "icp_profile");
  },
});

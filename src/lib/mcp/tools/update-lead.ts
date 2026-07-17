import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, notAuthed, err, ok } from "./_supabase";

export default defineTool({
  name: "update_lead",
  title: "Update lead",
  description:
    "Update fields on an existing lead owned by the signed-in user. Pass the lead id and any subset of fields to change. Fields that are omitted are left unchanged.",
  inputSchema: {
    id: z.string().uuid(),
    company_name: z.string().trim().optional(),
    contact_name: z.string().trim().optional(),
    contact_email: z.string().trim().email().optional(),
    job_title: z.string().trim().optional(),
    company_website: z.string().trim().optional(),
    industry: z.string().trim().optional(),
    linkedin_url: z.string().trim().optional(),
    notes: z.string().trim().optional(),
    lead_status: z.string().trim().optional(),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  handler: async ({ id, ...patch }, ctx) => {
    if (!ctx.isAuthenticated()) return notAuthed();
    const clean = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined));
    if (Object.keys(clean).length === 0) return err("No fields to update.");
    const supabase = supabaseForUser(ctx);
    const { data, error } = await supabase
      .from("leads")
      .update(clean)
      .eq("id", id)
      .eq("user_id", ctx.getUserId())
      .select("id, company_name, contact_name, contact_email, lead_status, updated_at")
      .single();
    if (error) return err(error.message);
    return ok(data, "lead");
  },
});

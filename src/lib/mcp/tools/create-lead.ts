import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, notAuthed, err, ok } from "./_supabase";

export default defineTool({
  name: "create_lead",
  title: "Create lead",
  description:
    "Create a new lead in OutReign for the signed-in user. At minimum a company_name is required; contact_email is strongly recommended so the lead is reachable by sequences.",
  inputSchema: {
    company_name: z.string().trim().min(1),
    contact_name: z.string().trim().optional(),
    contact_email: z.string().trim().email().optional(),
    job_title: z.string().trim().optional(),
    company_website: z.string().trim().optional(),
    industry: z.string().trim().optional(),
    linkedin_url: z.string().trim().optional(),
    notes: z.string().trim().optional(),
    pipeline_stage: z.enum(["new", "contacted", "no_response", "replied", "bounced", "meeting_booked", "qualified", "not_interested", "won", "lost"]).optional(),
    source: z.string().trim().optional().describe("Where the lead came from, e.g. 'mcp'"),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  handler: async (input, ctx) => {
    if (!ctx.isAuthenticated()) return notAuthed();
    const supabase = supabaseForUser(ctx);
    const { data, error } = await supabase
      .from("leads")
      .insert({
        user_id: ctx.getUserId(),
        source: input.source ?? "mcp",
        lead_status: "active",
        pipeline_stage: input.pipeline_stage ?? "new",
        company_name: input.company_name,
        contact_name: input.contact_name,
        contact_email: input.contact_email,
        job_title: input.job_title,
        company_website: input.company_website,
        industry: input.industry,
        linkedin_url: input.linkedin_url,
        notes: input.notes,
      })
      .select("id, company_name, contact_name, contact_email, lead_status, pipeline_stage, created_at")
      .single();
    if (error) return err(error.message);
    return ok(data, "lead");
  },
});

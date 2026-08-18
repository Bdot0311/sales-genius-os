import { createClient } from "@supabase/supabase-js";
import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";

function supabaseForUser(ctx: ToolContext) {
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_ANON_KEY!,
    {
      global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    }
  );
}

export default defineTool({
  name: "list_leads",
  title: "List leads",
  description:
    "List the signed-in user's saved leads in OutReign, most recently created first. Optionally filter by the visible pipeline stage and cap the result count.",
  inputSchema: {
    limit: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .describe("Max number of leads to return (default 25, max 100)."),
    status: z
      .enum(["new", "contacted", "no_response", "replied", "bounced", "meeting_booked", "qualified", "not_interested", "won", "lost"])
      .optional()
      .describe("Optional pipeline stage filter."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ limit, status }, ctx) => {
    if (!ctx.isAuthenticated())
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };

    const supabase = supabaseForUser(ctx);
    let q = supabase
      .from("leads")
      .select(
        "id, contact_name, contact_email, job_title, company_name, company_website, industry, lead_status, pipeline_stage, icp_score, created_at"
      )
      .eq("user_id", ctx.getUserId())
      .order("created_at", { ascending: false })
      .limit(Math.min(limit ?? 25, 100));

    if (status) q = q.eq("pipeline_stage", status);

    const { data, error } = await q;
    if (error)
      return { content: [{ type: "text", text: error.message }], isError: true };

    return {
      content: [{ type: "text", text: JSON.stringify(data ?? [], null, 2) }],
      structuredContent: { leads: data ?? [] },
    };
  },
});

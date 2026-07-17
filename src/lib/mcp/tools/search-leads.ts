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
  name: "search_leads",
  title: "Search leads",
  description:
    "Full-text search across the signed-in user's OutReign leads by contact name, company, email, or job title.",
  inputSchema: {
    query: z.string().trim().min(1).describe("Search text to match against name, company, email, or title."),
    limit: z.number().int().min(1).max(50).optional().describe("Max results (default 20, max 50)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ query, limit }, ctx) => {
    if (!ctx.isAuthenticated())
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };

    const supabase = supabaseForUser(ctx);
    const like = `%${query.replace(/[%,]/g, " ")}%`;
    const { data, error } = await supabase
      .from("leads")
      .select(
        "id, contact_name, contact_email, job_title, company_name, industry, lead_status, icp_score, created_at"
      )
      .eq("user_id", ctx.getUserId())
      .or(
        `contact_name.ilike.${like},contact_email.ilike.${like},company_name.ilike.${like},job_title.ilike.${like}`
      )
      .order("created_at", { ascending: false })
      .limit(Math.min(limit ?? 20, 50));

    if (error)
      return { content: [{ type: "text", text: error.message }], isError: true };

    return {
      content: [{ type: "text", text: JSON.stringify(data ?? [], null, 2) }],
      structuredContent: { leads: data ?? [] },
    };
  },
});

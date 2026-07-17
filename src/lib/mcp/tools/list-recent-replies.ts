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
  name: "list_recent_replies",
  title: "List recent replies",
  description:
    "List the most recent inbound replies (inbox threads) captured for the signed-in user, including sender, subject, and classification.",
  inputSchema: {
    limit: z.number().int().min(1).max(50).optional().describe("Max results (default 20)."),
    unread_only: z.boolean().optional().describe("Only return threads that have not been marked read."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ limit, unread_only }, ctx) => {
    if (!ctx.isAuthenticated())
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };

    const supabase = supabaseForUser(ctx);
    let q = supabase
      .from("reply_threads")
      .select("id, sender_email, subject, classification, read, replied_at, created_at, lead_id")
      .eq("user_id", ctx.getUserId())
      .order("created_at", { ascending: false })
      .limit(Math.min(limit ?? 20, 50));

    if (unread_only) q = q.eq("read", false);

    const { data, error } = await q;
    if (error)
      return { content: [{ type: "text", text: error.message }], isError: true };

    return {
      content: [{ type: "text", text: JSON.stringify(data ?? [], null, 2) }],
      structuredContent: { replies: data ?? [] },
    };
  },
});

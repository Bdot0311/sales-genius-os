import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, notAuthed, err, ok } from "./_supabase";

export default defineTool({
  name: "get_agent_stats",
  title: "Get AI agent stats",
  description:
    "Return the signed-in user's AI SDR agent configuration and recent activity: whether the agent is enabled, its persona/tone, and counts of agent actions in the last N days broken down by action_type and status.",
  inputSchema: {
    days: z.number().int().min(1).max(90).optional().describe("Look-back window in days (default 7)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ days }, ctx) => {
    if (!ctx.isAuthenticated()) return notAuthed();
    const supabase = supabaseForUser(ctx);
    const window = days ?? 7;
    const since = new Date(Date.now() - window * 24 * 60 * 60 * 1000).toISOString();

    const [configRes, actionsRes] = await Promise.all([
      supabase
        .from("agent_configs")
        .select(
          "enabled, agent_name, persona, tone, can_reply_interested, can_handle_objections, can_book_meetings, max_daily_auto_replies, reply_delay_minutes, updated_at"
        )
        .eq("user_id", ctx.getUserId())
        .order("is_primary", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("agent_actions")
        .select("action_type, status, classification, created_at")
        .eq("user_id", ctx.getUserId())
        .gte("created_at", since)
        .limit(1000),
    ]);

    if (configRes.error) return err(configRes.error.message);
    if (actionsRes.error) return err(actionsRes.error.message);

    const actions = actionsRes.data ?? [];
    const byType: Record<string, number> = {};
    const byStatus: Record<string, number> = {};
    const byClassification: Record<string, number> = {};
    for (const a of actions) {
      byType[a.action_type ?? "unknown"] = (byType[a.action_type ?? "unknown"] ?? 0) + 1;
      if (a.status) byStatus[a.status] = (byStatus[a.status] ?? 0) + 1;
      if (a.classification) byClassification[a.classification] = (byClassification[a.classification] ?? 0) + 1;
    }

    return ok(
      {
        config: configRes.data ?? null,
        window_days: window,
        total_actions: actions.length,
        by_action_type: byType,
        by_status: byStatus,
        by_classification: byClassification,
      },
      "agent_stats"
    );
  },
});

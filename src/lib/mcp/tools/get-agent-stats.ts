import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, notAuthed, err, ok } from "./_supabase";

export default defineTool({
  name: "get_agent_stats",
  title: "Get AI agent stats",
  description:
    "Return every AI SDR agent build the signed-in user owns (name, role, enabled state, persona/tone, limits) plus recent activity: counts of agent actions in the last N days broken down by action_type, status and agent.",
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
          "id, is_primary, role, enabled, agent_name, persona, tone, can_find_leads, can_send_outreach, can_reply_interested, can_handle_objections, can_book_meetings, max_daily_auto_replies, max_daily_new_emails, daily_lead_target, reply_delay_minutes, updated_at"
        )
        .eq("user_id", ctx.getUserId())
        .order("is_primary", { ascending: false })
        .order("updated_at", { ascending: false }),
      supabase
        .from("agent_actions")
        .select("action_type, status, classification, agent_config_id, created_at")
        .eq("user_id", ctx.getUserId())
        .gte("created_at", since)
        .limit(1000),
    ]);

    if (configRes.error) return err(configRes.error.message);
    if (actionsRes.error) return err(actionsRes.error.message);

    const agents = configRes.data ?? [];
    const actions = actionsRes.data ?? [];
    const byType: Record<string, number> = {};
    const byStatus: Record<string, number> = {};
    const byClassification: Record<string, number> = {};
    const byAgent: Record<string, number> = {};
    const nameFor = (id: string | null) =>
      agents.find((a: any) => a.id === id)?.agent_name ?? "unattributed";
    for (const a of actions) {
      byType[a.action_type ?? "unknown"] = (byType[a.action_type ?? "unknown"] ?? 0) + 1;
      if (a.status) byStatus[a.status] = (byStatus[a.status] ?? 0) + 1;
      if (a.classification) byClassification[a.classification] = (byClassification[a.classification] ?? 0) + 1;
      const label = nameFor((a as any).agent_config_id ?? null);
      byAgent[label] = (byAgent[label] ?? 0) + 1;
    }

    return ok(
      {
        agents,
        agent_count: agents.length,
        enabled_agent_count: agents.filter((a: any) => a.enabled).length,
        // Kept for backwards compatibility with older clients.
        config: agents[0] ?? null,
        window_days: window,
        total_actions: actions.length,
        by_action_type: byType,
        by_status: byStatus,
        by_classification: byClassification,
        by_agent: byAgent,
      },
      "agent_stats"
    );
  },
});

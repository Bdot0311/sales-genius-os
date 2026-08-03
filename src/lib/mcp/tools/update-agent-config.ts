import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, notAuthed, err, ok } from "./_supabase";

export default defineTool({
  name: "update_agent_config",
  title: "Update AI agent config",
  description:
    "Update the signed-in user's AI SDR agent configuration — toggle enabled, change persona/tone/signature, adjust reply capabilities and daily limits. Creates the row if it does not yet exist.",
  inputSchema: {
    enabled: z.boolean().optional(),
    agent_name: z.string().trim().optional(),
    persona: z.string().trim().optional(),
    tone: z.string().trim().optional(),
    company_context: z.string().trim().optional(),
    signature: z.string().trim().optional(),
    calendly_url: z.string().trim().optional(),
    can_reply_interested: z.boolean().optional(),
    can_handle_objections: z.boolean().optional(),
    can_book_meetings: z.boolean().optional(),
    max_daily_auto_replies: z.number().int().min(0).max(500).optional(),
    reply_delay_minutes: z.number().int().min(0).max(1440).optional(),
  },
  annotations: { readOnlyHint: false, idempotentHint: true, openWorldHint: false },
  handler: async (patch, ctx) => {
    if (!ctx.isAuthenticated()) return notAuthed();
    const clean = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined));
    if (Object.keys(clean).length === 0) return err("No fields to update.");
    const supabase = supabaseForUser(ctx);

    const userId = ctx.getUserId();
    const { data: existing, error: exErr } = await supabase
      .from("agent_configs")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();
    if (exErr) return err(exErr.message);

    if (existing) {
      const { data, error } = await supabase
        .from("agent_configs")
        .update(clean)
        .eq("id", existing.id)
        .select("enabled, agent_name, persona, tone, updated_at")
        .single();
      if (error) return err(error.message);
      return ok(data, "agent_config");
    }

    const { data, error } = await supabase
      .from("agent_configs")
      .insert({ user_id: userId, ...clean })
      .select("enabled, agent_name, persona, tone, updated_at")
      .single();
    if (error) return err(error.message);
    return ok(data, "agent_config");
  },
});

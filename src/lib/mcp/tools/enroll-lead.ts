import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, notAuthed, err, ok } from "./_supabase";

export default defineTool({
  name: "enroll_lead_in_sequence",
  title: "Enroll lead in sequence",
  description:
    "Enroll one of the signed-in user's leads into one of their email sequences. Creates a sequence_enrollment row with current_step=0 so the outreach worker will send step 1 next.",
  inputSchema: {
    lead_id: z.string().uuid(),
    sequence_id: z.string().uuid(),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  handler: async ({ lead_id, sequence_id }, ctx) => {
    if (!ctx.isAuthenticated()) return notAuthed();
    const supabase = supabaseForUser(ctx);

    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from("sequence_enrollments")
      .insert({
        user_id: ctx.getUserId(),
        lead_id,
        sequence_id,
        current_step: 0,
        status: "active",
        enrolled_at: now,
        next_action_at: now,
      })
      .select("id, sequence_id, lead_id, status, current_step, enrolled_at, next_action_at")
      .single();
    if (error) return err(error.message);
    return ok(data, "enrollment");
  },
});

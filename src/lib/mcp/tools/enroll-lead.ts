import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, notAuthed, err, ok, planGate } from "./_supabase";

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
    { const blocked = await planGate(ctx, "enroll_lead_in_sequence"); if (blocked) return blocked; }
    const supabase = supabaseForUser(ctx);
    const userId = ctx.getUserId();

    // The enrollment insert policy used to check only user_id. A lead or
    // sequence id from another account still satisfied the foreign key, and
    // the dispatcher would then mail that lead. Both rows have to be this
    // account's before a row is written. RLS hides the other account's rows,
    // so a miss here is "not yours" and is reported as not found.
    const [{ data: lead, error: leadErr }, { data: sequence, error: seqErr }] = await Promise.all([
      supabase.from("leads").select("id").eq("id", lead_id).eq("user_id", userId).maybeSingle(),
      supabase.from("email_sequences").select("id").eq("id", sequence_id).eq("user_id", userId).maybeSingle(),
    ]);
    if (leadErr) return err(leadErr.message);
    if (seqErr) return err(seqErr.message);
    if (!lead) return err("Lead not found");
    if (!sequence) return err("Sequence not found");

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

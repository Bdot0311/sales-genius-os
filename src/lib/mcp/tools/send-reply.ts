import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, notAuthed, err, ok } from "./_supabase";

export default defineTool({
  name: "send_reply",
  title: "Queue reply to an inbox thread",
  description:
    "Queue an outbound reply to an existing inbox reply thread. Creates a sent_emails row in status='queued' linked to the original thread's lead so the outreach worker delivers it through the user's connected mailbox. Body is plain text; a simple HTML version is generated automatically.",
  inputSchema: {
    reply_thread_id: z.string().uuid().describe("id from reply_threads that this message is a reply to."),
    body: z.string().trim().min(1).describe("Plain text body of the reply."),
    subject: z.string().trim().optional().describe("Override subject. Defaults to 'Re: <original subject>'."),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  handler: async ({ reply_thread_id, body, subject }, ctx) => {
    if (!ctx.isAuthenticated()) return notAuthed();
    const supabase = supabaseForUser(ctx);

    const { data: thread, error: tErr } = await supabase
      .from("reply_threads")
      .select("id, lead_id, subject, sender_email")
      .eq("id", reply_thread_id)
      .eq("user_id", ctx.getUserId())
      .maybeSingle();
    if (tErr) return err(tErr.message);
    if (!thread) return err("Reply thread not found for this user.");
    if (!thread.sender_email) return err("Reply thread has no sender_email to reply to.");

    const finalSubject =
      subject ??
      (thread.subject
        ? thread.subject.toLowerCase().startsWith("re:")
          ? thread.subject
          : `Re: ${thread.subject}`
        : "Re:");

    const bodyHtml = body
      .split(/\n{2,}/)
      .map((p) => `<p>${p.replace(/\n/g, "<br/>").replace(/</g, "&lt;")}</p>`)
      .join("");

    const { data, error } = await supabase
      .from("sent_emails")
      .insert({
        user_id: ctx.getUserId(),
        lead_id: thread.lead_id,
        to_email: thread.sender_email,
        subject: finalSubject,
        body_text: body,
        body_html: bodyHtml,
        status: "queued",
        scheduled_at: new Date().toISOString(),
      })
      .select("id, to_email, subject, status, scheduled_at, created_at")
      .single();
    if (error) return err(error.message);
    return ok(data, "queued_email");
  },
});

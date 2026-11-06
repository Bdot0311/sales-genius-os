import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { planGate, supabaseForUser, err, notAuthed } from "./_supabase";

// Sends through the same send-email handler the app uses, with the caller's
// own OAuth token: same mailbox, limits, suppression and quality check.
export default defineTool({
  name: "send_email",
  title: "Send an email",
  description:
    "Send an email now from the user's connected Gmail mailbox, exactly as Outreach Studio does. Applies the app's send limits, suppression list and quality check, and logs the email to Unified Inbox. Only call after the user explicitly approves the final recipient, subject and body.",
  inputSchema: {
    to: z.string().email().max(320).describe("Recipient email address."),
    subject: z.string().trim().min(1).max(300),
    body: z.string().trim().min(1).max(50000).describe("Email body (plain text or simple HTML)."),
    lead_id: z.string().uuid().optional().describe("Saved lead this email is for."),
    thread_id: z.string().max(200).optional().describe("Gmail thread id when replying in an existing conversation."),
    mailbox_id: z.string().uuid().optional().describe("Specific connected mailbox to send from; defaults to the most recent."),
    append_signature: z.boolean().optional().describe("Append the user's saved email signature."),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  handler: async ({ to, subject, body, lead_id, thread_id, mailbox_id, append_signature }, ctx) => {
    if (!ctx.isAuthenticated() || !ctx.getToken()) return notAuthed();
    const blocked = await planGate(ctx, "send_email");
    if (blocked) return blocked;
    const { data, error } = await supabaseForUser(ctx).functions.invoke("send-email", {
      body: { to, subject, body, leadId: lead_id, threadId: thread_id, integrationRowId: mailbox_id, appendSignature: append_signature },
    });
    if (error) {
      let message = "The email was not sent. Check your connected mailbox and try again.";
      try {
        const ctxRes = (error as { context?: Response }).context;
        const parsed = ctxRes ? await ctxRes.json() : null;
        if (parsed?.error) message = String(parsed.error);
      } catch { /* keep generic */ }
      return err(message);
    }
    if (data?.error || data?.success === false) return err(data?.error ?? "The email was not sent.");
    return { content: [{ type: "text" as const, text: JSON.stringify(data) }] };
  },
});

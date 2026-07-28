import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { scheduleFollowUps, type Touch } from "../_shared/cold-email-playbook.ts";


const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Missing authorization header" }, 401);

    const admin = createClient(supabaseUrl, serviceKey);
    const {
      data: { user },
      error: authError,
    } = await admin.auth.getUser(authHeader.replace("Bearer ", ""));
    if (authError || !user) return json({ error: "Unauthorized" }, 401);

    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const action = String(body.action ?? "");
    const id = body.id ? String(body.id) : "";

    if (action === "reject") {
      if (!id) return json({ error: "Missing id" }, 400);
      const { error } = await admin
        .from("agent_approvals")
        .update({
          status: "rejected",
          reviewed_at: new Date().toISOString(),
          review_note: body.note ? String(body.note) : null,
        })
        .eq("id", id)
        .eq("user_id", user.id);
      if (error) return json({ error: error.message }, 400);

      await admin.from("agent_actions").insert({
        user_id: user.id,
        action_type: "rejected",
        status: "completed",
        description: "You rejected a drafted message — nothing was sent",
        metadata: { approval_id: id },
      });
      return json({ success: true, status: "rejected" });
    }

    if (action === "approve") {
      if (!id) return json({ error: "Missing id" }, 400);

      const { data: approval, error: loadErr } = await admin
        .from("agent_approvals")
        .select("*")
        .eq("id", id)
        .eq("user_id", user.id)
        .maybeSingle();
      if (loadErr) return json({ error: loadErr.message }, 400);
      if (!approval) return json({ error: "Approval not found" }, 404);
      if (approval.status !== "pending") {
        return json({ error: `Already ${approval.status}` }, 400);
      }

      const subject = (body.subject ? String(body.subject) : approval.subject) ?? "";
      const messageBody = (body.body ? String(body.body) : approval.body) ?? "";
      const to = (approval.prospect_email ?? "").trim();
      if (!to || !subject || !messageBody) {
        return json({ error: "Missing recipient, subject or body" }, 400);
      }

      let integrationRowId: string | null = approval.integration_row_id ?? null;
      if (!integrationRowId) {
        const { data: acct } = await admin
          .from("sending_accounts")
          .select("integration_id")
          .eq("user_id", user.id)
          .eq("status", "active")
          .in("provider", ["google", "gmail"])
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        integrationRowId = acct?.integration_id ?? null;
      }
      if (!integrationRowId) return json({ error: "No connected mailbox available" }, 400);

      const sendRes = await fetch(`${supabaseUrl}/functions/v1/send-email`, {
        method: "POST",
        headers: { Authorization: authHeader, "Content-Type": "application/json" },
        body: JSON.stringify({
          to,
          subject,
          body: messageBody,
          integrationRowId,
          leadId: approval.lead_id ?? undefined,
        }),
      });
      const sendData = await sendRes.json().catch(() => ({} as any));

      if (!sendRes.ok || sendData?.error) {
        const message = sendData?.error ?? `send-email returned ${sendRes.status}`;
        await admin.from("agent_actions").insert({
          user_id: user.id,
          action_type: "error",
          status: "failed",
          prospect_email: to,
          subject,
          error_message: message,
          description: `Approved message to ${to} failed to send: ${message}`,
          metadata: { approval_id: id },
        });
        return json({ error: message }, 200);
      }

      await admin
        .from("agent_approvals")
        .update({
          status: "sent",
          subject,
          body: messageBody,
          reviewed_at: new Date().toISOString(),
        })
        .eq("id", id);

      let followUpsScheduled = false;
      if (approval.kind === "outreach" && approval.lead_id) {
        await admin
          .from("leads")
          .update({ last_contacted_at: new Date().toISOString(), lead_status: "active" })
          .eq("id", approval.lead_id);

        const followUps = (approval.metadata?.follow_up_touches ?? []) as Touch[];
        if (Array.isArray(followUps) && followUps.length > 0) {
          followUpsScheduled = await scheduleFollowUps(
            admin,
            user.id,
            approval.lead_id,
            approval.company_name ?? approval.prospect_name ?? to,
            [{ day: 0, purpose: "signal opener", subject, body: messageBody }, ...followUps],
          );
        }
      }


      if (approval.kind === "reply" && approval.sent_email_id) {
        await admin
          .from("sent_emails")
          .update({
            agent_thread_status:
              approval.classification === "meeting_request" ? "meeting_booked" : "replied",
          })
          .eq("id", approval.sent_email_id);
      }

      await admin.from("agent_actions").insert({
        user_id: user.id,
        sent_email_id: approval.sent_email_id ?? null,
        action_type: approval.kind === "outreach" ? "outreach_sent" : "reply_sent",
        status: "completed",
        prospect_email: to,
        subject,
        classification: approval.classification ?? null,
        reply_content: messageBody,
        description: `You approved and sent a ${
          approval.kind === "outreach" ? "touch 1 of 4 email" : "reply"
        } to ${to}${followUpsScheduled ? " — touches 2-4 scheduled for day 3, 7 and 14" : ""}`,
        metadata: { approval_id: id, approved_by_human: true, follow_ups_scheduled: followUpsScheduled },

      });

      return json({ success: true, status: "sent" });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (err: any) {
    console.error("agent-approvals error:", err?.message);
    return json({ error: err?.message ?? "Unexpected error" }, 500);
  }
});

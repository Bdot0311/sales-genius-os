// Team notice when leads are assigned to a teammate. This is an internal
// account notification, not prospect outreach, so it goes through the app's
// transactional mail rather than send-email's research/quality gates. The
// recipient is resolved server-side from the caller's own active team.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "npm:zod@3";
import { sendAppEmail } from "../_shared/transactional-email-templates/send-app-email.ts";

const Body = z.object({
  memberUserId: z.string().uuid(),
  leadIds: z.array(z.string().uuid()).min(1).max(1000),
});

const json = (data: unknown) =>
  new Response(JSON.stringify(data), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const authHeader = req.headers.get("Authorization") ?? "";
    const userClient = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: "Not authenticated" });

    const parsed = Body.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return json({ error: "Invalid request" });

    const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: member } = await admin
      .from("team_members")
      .select("member_email")
      .eq("team_owner_id", user.id)
      .eq("member_user_id", parsed.data.memberUserId)
      .eq("status", "active")
      .maybeSingle();
    if (!member?.member_email) return json({ error: "Team member not found" });

    const { data: profile } = await admin.from("profiles").select("full_name").eq("id", user.id).maybeSingle();
    const leadIds = [...new Set(parsed.data.leadIds)].sort();
    const result = await sendAppEmail(admin, "lead-assignment", member.member_email, {
      templateData: { count: leadIds.length, assignerName: profile?.full_name ?? undefined },
      idempotencyKey: `lead-assignment:${user.id}:${parsed.data.memberUserId}:${leadIds.join(",")}`.slice(0, 500),
    });
    return json(result.sent ? { sent: true } : { sent: false, reason: result.reason });
  } catch (e) {
    console.error("[notify-lead-assignment]", e instanceof Error ? e.message : "error");
    return json({ error: "Notification failed" });
  }
});

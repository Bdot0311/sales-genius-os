import { createClient } from "npm:@supabase/supabase-js@^2.76.1";
import { corsHeaders, resolveCaller } from "../_shared/internal-auth.ts";
import { getSignatureHtml } from "../_shared/signature.ts";
import { draftOutboxItem, draftQueueSummary, type DraftQueueResult } from "../_shared/saved-draft-outbox.ts";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
Deno.serve(async req => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const caller = await resolveCaller(req);
  if (!caller.ok) return caller.response;
  if (caller.internal || !caller.userId) return json({ error: "Sign in to send your drafts." }, 403);
  const userId = caller.userId;
  try {
    const body = await req.json();
    const ids: string[] = [...new Set<string>((Array.isArray(body.draft_ids) ? body.draft_ids : []).filter((id: unknown): id is string => typeof id === "string"))];
    if (!ids.length || ids.length > 100 || ids.some(id => !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))) return json({ error: "Select between 1 and 100 saved drafts." }, 422);
    if (body.confirmed !== true) return json({ error: "Confirm the selected drafts before sending." }, 422);
    const when = body.send_at ? new Date(body.send_at) : new Date();
    if (!Number.isFinite(when.getTime()) || (body.send_at && when.getTime() <= Date.now())) return json({ error: "Choose a future date and time." }, 422);
    const url = Deno.env.get("SUPABASE_URL");
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !key) throw new Error("Sending is unavailable.");
    const admin = createClient(url, key);
    const { data: drafts, error: draftError } = await admin.from("email_drafts").select("id,subject,body").eq("user_id", userId).in("id", ids);
    if (draftError) throw draftError;
    let mailboxQuery = admin.from("sending_accounts").select("id,email,integration_id").eq("user_id", userId).eq("status", "active").order("id");
    const emails = Array.isArray(body.from_emails) ? body.from_emails.filter((email: unknown): email is string => typeof email === "string") : [];
    if (emails.length) mailboxQuery = mailboxQuery.in("email", emails);
    const { data: accounts, error: mailboxError } = await mailboxQuery;
    if (mailboxError) throw mailboxError;
    if (!accounts?.length) return json({ error: "Connect or resume a mailbox before sending." }, 422);
    const signature = await getSignatureHtml(admin, userId, null) ?? "";
    const stagger = Math.max(0, Math.min(Number(body.stagger_minutes) || 0, 240));
    const items = (drafts ?? []).map((draft, i) => ({ ...draftOutboxItem(draft, accounts[i % accounts.length].id, new Date(when.getTime() + i * stagger * 60000).toISOString(), signature), allow_duplicate: body.allow_duplicate === true }));
    const { data, error } = await admin.rpc("queue_saved_draft_outbox", { p_user_id: userId, p_items: items });
    if (error) throw error;
    return json({ ...draftQueueSummary(ids, (Array.isArray(data) ? data : []) as DraftQueueResult[]), sent: 0 });
  } catch (error) {
    console.error("[queue-saved-drafts]", error instanceof Error ? error.message : "Queue failed");
    return json({ error: "Could not queue your drafts. Refresh before retrying; do not resend emails already listed as queued." });
  }
});
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, requireServiceRole } from "../_shared/internal-auth.ts";
import { sweepSlice } from "../_shared/sweep-window.ts";

/**
 * The scheduled sweep that finds replies.
 *
 * inbox-sync does the real work — it polls each Gmail thread, records the
 * reply in reply_threads, stamps replied_at and pushes a notification. But it
 * only ever ran from a signed-in browser (the Inbox page) or from an agent
 * run. So a prospect could reply and nothing happened: no inbox row, no
 * notification, nothing for the agent to read, until somebody happened to open
 * the inbox. Every link existed except the clock.
 *
 * This is that clock. It asks who has a live mailbox and an outstanding thread,
 * then runs the same sync for each of them.
 */

/** Users per pass. Bounded so one slow mailbox cannot stall the whole sweep. */
const MAX_USERS = 100;
/** Concurrent syncs. Each one talks to Gmail, so keep it gentle. */
const CONCURRENCY = 4;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const denied = requireServiceRole(req);
  if (denied) return denied;

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(supabaseUrl, serviceKey);

  try {
    // One page of connected mailboxes. Counting first, then reading that page,
    // avoids loading every integration row before the user cap.
    const { count: mailboxCount, error: countErr } = await admin
      .from("integrations")
      .select("user_id", { count: "exact", head: true })
      .eq("integration_id", "google")
      .eq("is_active", true);
    if (countErr) throw new Error(`integrations: ${countErr.message}`);
    const mailboxPage = sweepSlice(mailboxCount ?? 0, MAX_USERS, Date.now(), 5 * 60_000);
    const { data: integrations, error: intErr } = mailboxPage.to < mailboxPage.from
      ? { data: [], error: null }
      : await admin
        .from("integrations")
        .select("user_id")
        .eq("integration_id", "google")
        .eq("is_active", true)
        .order("user_id")
        .range(mailboxPage.from, mailboxPage.to);
    if (intErr) throw new Error(`integrations: ${intErr.message}`);

    const candidates = [...new Set((integrations ?? []).map((i: { user_id: string }) => i.user_id))];
    if (!candidates.length) {
      return new Response(JSON.stringify({ success: true, users: 0, newReplies: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: threads, error: thrErr } = await admin
      .from("sent_emails")
      .select("user_id")
      .in("user_id", candidates)
      .not("gmail_thread_id", "is", null)
      .eq("agent_thread_status", "active")
      .gte("sent_at", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());
    if (thrErr) throw new Error(`sent_emails: ${thrErr.message}`);

    const userIds = [...new Set((threads ?? []).map((t: { user_id: string }) => t.user_id))].slice(
      0,
      MAX_USERS,
    );

    let newReplies = 0;
    const errors: string[] = [];

    const runOne = async (userId: string) => {
      try {
        const res = await fetch(`${supabaseUrl}/functions/v1/inbox-sync`, {
          method: "POST",
          headers: { Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({ userId, analyzeReplies: true }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || data?.error) {
          // A disconnected or expired mailbox is the user's to fix, not a
          // failure of the sweep — recorded, never fatal.
          errors.push(`${userId}: ${data?.error ?? res.status}`);
          return;
        }
        newReplies += Number(data?.newReplies ?? 0);
      } catch (e) {
        errors.push(`${userId}: ${(e as Error).message}`);
      }
    };

    for (let i = 0; i < userIds.length; i += CONCURRENCY) {
      await Promise.all(userIds.slice(i, i + CONCURRENCY).map(runOne));
    }

    console.log(
      `[sync-inboxes] users=${userIds.length} newReplies=${newReplies} errors=${errors.length}`,
    );

    return new Response(
      JSON.stringify({ success: true, users: userIds.length, newReplies, errors }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("sync-inboxes error:", (err as Error).message);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

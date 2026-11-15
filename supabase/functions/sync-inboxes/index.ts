import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@^2.76.1";
import { corsHeaders, requireServiceRole } from "../_shared/internal-auth.ts";
import { notifyInboxSyncStalled } from "../_shared/notify-events.ts";

/**
 * The scheduled sweep that finds replies.
 *
 * inbox-sync polls one mailbox. This decides whose turn it is. Nothing else
 * calls it on a clock: the Inbox button syncs the signed-in user, and an
 * agent run syncs whoever started it. Everyone else could reply and the
 * sequence would keep going.
 *
 * One pass syncs a few mailboxes, least recently tried first, and stops on
 * a budget so the platform does not kill it mid-mailbox. The cursor is
 * stamped when a mailbox is started, so a mailbox that hangs goes to the
 * back instead of blocking every later one.
 */

/** Mailboxes considered per pass. The budget, not this number, is the stop. */
const MAX_USERS = 8;
/** Concurrent Gmail syncs. */
const CONCURRENCY = 2;
/** Stop starting new mailboxes after this. The cron interval is five minutes. */
const BUDGET_MS = 100_000;
/** How long a second pass waits if this one has not released the lease. */
const LEASE_SECONDS = 180;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const denied = requireServiceRole(req);
  if (denied) return denied;

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(supabaseUrl, serviceKey);

  const { data: claimed, error: claimErr } = await admin.rpc("claim_inbox_sync_sweep", {
    p_ttl_seconds: LEASE_SECONDS,
  });
  if (claimErr) {
    console.error("[sync-inboxes] could not claim the sweep:", claimErr.message);
    return new Response(JSON.stringify({ error: claimErr.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  if (claimed !== true) {
    return new Response(JSON.stringify({ success: true, skipped: true, reason: "sweep already running" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const { data: due, error: dueErr } = await admin.rpc("next_inbox_sync_users", { p_limit: MAX_USERS });
    if (dueErr) throw new Error(`next_inbox_sync_users: ${dueErr.message}`);

    const userIds = ((due ?? []) as { user_id: string }[]).map((row) => row.user_id).filter(Boolean);
    let newReplies = 0;
    const errors: string[] = [];
    const startedAt = Date.now();
    let deferred = 0;

    const runOne = async (userId: string) => {
      const { error: noteErr } = await admin.rpc("note_inbox_sync_started", { p_user_id: userId });
      if (noteErr) {
        errors.push(`${userId}: ${noteErr.message}`);
        return;
      }
      let failure: string | null = null;
      try {
        const res = await fetch(`${supabaseUrl}/functions/v1/inbox-sync`, {
          method: "POST",
          headers: { Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({ userId, analyzeReplies: true }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || data?.error) {
          failure = String(data?.error ?? res.status);
          errors.push(`${userId}: ${failure}`);
        } else {
          newReplies += Number(data?.newReplies ?? 0);
        }
      } catch (e) {
        failure = (e as Error).message;
        errors.push(`${userId}: ${failure}`);
      }

      const { data: failures, error: recordErr } = await admin.rpc("record_inbox_sync_result", {
        p_user_id: userId,
        p_error: failure,
      });
      if (recordErr) {
        console.error(`[sync-inboxes] result not recorded for ${userId}:`, recordErr.message);
        return;
      }
      const count = Number(failures ?? 0);
      // The third failure is the one worth a buzz. After that, hourly, so a
      // mailbox that stays revoked does not notify on every pass.
      if (failure && (count === 3 || (count > 3 && count % 12 === 0))) {
        await notifyInboxSyncStalled(userId);
      }
    };

    for (let i = 0; i < userIds.length; i += CONCURRENCY) {
      if (Date.now() - startedAt > BUDGET_MS) {
        deferred = userIds.length - i;
        console.log(`[sync-inboxes] budget reached; ${deferred} left for the next pass`);
        break;
      }
      await Promise.all(userIds.slice(i, i + CONCURRENCY).map(runOne));
    }

    if (errors.length) console.error(`[sync-inboxes] failures=${errors.length} ${errors.slice(0, 8).join(" | ")}`);
    console.log(
      `[sync-inboxes] users=${userIds.length - deferred} newReplies=${newReplies} errors=${errors.length} deferred=${deferred}`,
    );

    return new Response(
      JSON.stringify({
        success: true,
        users: userIds.length - deferred,
        newReplies,
        errors: errors.length,
        deferred,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("sync-inboxes error:", (err as Error).message);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } finally {
    const { error: releaseErr } = await admin.rpc("release_inbox_sync_sweep");
    if (releaseErr) console.error("[sync-inboxes] lease not released:", releaseErr.message);
  }
});

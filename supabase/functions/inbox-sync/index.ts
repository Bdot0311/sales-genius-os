import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { notifyRepliesReceived } from "../_shared/notify-events.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function decodeBase64Url(encoded: string): string {
  const base64 = encoded.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  try {
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new TextDecoder("utf-8").decode(bytes);
  } catch {
    return "";
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Gmail charges quota units per call and enforces a per-user-per-minute cost
 * ceiling. A tight loop over hundreds of `format=full` threads blew straight
 * through it: every throttled thread was dropped and the run still reported
 * success, so a real reply could sit in Gmail unseen. Space the calls out and
 * retry a throttled one with backoff instead of losing it.
 */
async function fetchGmailThread(
  threadId: string,
  token: string
): Promise<{ ok: true; thread: any } | { ok: false; notFound?: boolean; rateLimited?: boolean; error?: string }> {
  let delay = 1_000;
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/threads/${threadId}?format=full`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (res.ok) return { ok: true, thread: await res.json() };
    if (res.status === 404) return { ok: false, notFound: true };

    const body = await res.text();
    const throttled =
      res.status === 429 ||
      (res.status === 403 && /rateLimitExceeded|userRateLimitExceeded|Quota exceeded/i.test(body));
    if (!throttled) return { ok: false, error: `Gmail API ${res.status}: ${body}` };

    if (attempt === 3) return { ok: false, rateLimited: true, error: `Gmail API ${res.status}: ${body}` };
    await sleep(delay + Math.floor(Math.random() * 400));
    delay *= 2;
  }
  return { ok: false, rateLimited: true };
}

function extractBody(payload: any): string {
  if (!payload) return "";

  if (payload.mimeType === "text/plain" && payload.body?.data) {
    return decodeBase64Url(payload.body.data);
  }

  if (payload.parts && Array.isArray(payload.parts)) {
    // Prefer text/plain part
    for (const part of payload.parts) {
      if (part.mimeType === "text/plain" && part.body?.data) {
        return decodeBase64Url(part.body.data);
      }
    }
    // Fall back to recursive extraction on first part
    for (const part of payload.parts) {
      const text = extractBody(part);
      if (text) return text;
    }
  }

  if (payload.body?.data) {
    return decodeBase64Url(payload.body.data);
  }

  return "";
}

/**
 * Refresh a single integration's access token. All writes are scoped by the
 * integration row id so sibling Google mailboxes are never touched.
 */
async function refreshAccessToken(
  adminClient: any,
  integration: any
): Promise<string> {
  const config = integration.config as any;
  const clientId = Deno.env.get("GOOGLE_CLIENT_ID")!;
  const clientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET")!;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: config.refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!res.ok) {
    const err = await res.json();
    if (err.error === "invalid_grant") {
      await adminClient
        .from("integrations")
        .update({ is_active: false })
        .eq("id", integration.id);
    }
    throw new Error(`Token refresh failed: ${err.error_description || err.error}`);
  }

  const tokens = await res.json();
  const newExpiresAt = Date.now() + tokens.expires_in * 1000;

  await adminClient
    .from("integrations")
    .update({
      config: {
        ...config,
        accessToken: tokens.access_token,
        expiresAt: newExpiresAt,
        refreshToken: tokens.refresh_token || config.refreshToken,
      },
    })
    .eq("id", integration.id);

  return tokens.access_token;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(supabaseUrl, serviceKey);

    let payload: {
      testEmail?: string;
      includeOwnReplies?: boolean;
      analyzeReplies?: boolean;
      userId?: string;
    } = {};
    try {
      payload = await req.json();
    } catch {
      payload = {};
    }

    const allowedOwnReplyEmail = payload.includeOwnReplies
      ? (payload.testEmail ?? "").trim().toLowerCase()
      : "";

    /**
     * Two callers, one body of logic.
     *
     * Until now this only ran with a signed-in user's token, which meant a
     * reply was only ever discovered while someone had the inbox open. The
     * scheduled sweeper (sync-inboxes) authenticates as the service role or
     * with the vault trigger secret and names the user it is syncing.
     */
    const bearer = authHeader.replace(/^Bearer\s+/i, "").trim();
    const internalSecret = Deno.env.get("INTERNAL_TRIGGER_SECRET") ?? "";
    const isInternal =
      !!bearer && (bearer === serviceKey || (!!internalSecret && bearer === internalSecret));

    let user: { id: string } | null = null;
    if (isInternal) {
      if (!payload.userId) {
        return new Response(JSON.stringify({ error: "userId is required for internal calls" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      user = { id: payload.userId };
    } else {
      const { data: { user: authedUser }, error: authError } = await adminClient.auth.getUser(bearer);
      if (authError || !authedUser) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      user = { id: authedUser.id };
    }
    const analyzeAuthHeader = isInternal ? `Bearer ${serviceKey}` : authHeader;

    // Enumerate ALL active Google mailboxes — users may connect more than one.
    const { data: integrations, error: integrationError } = await adminClient
      .from("integrations")
      .select("id, config")
      .eq("user_id", user.id)
      .eq("integration_id", "google")
      .eq("is_active", true)
      .order("updated_at", { ascending: false });

    const activeIntegrations = (integrations || []).filter((i: any) => i?.config);

    if (integrationError || activeIntegrations.length === 0) {
      return new Response(
        JSON.stringify({ error: "Google integration not connected", needsReconnect: true }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Per-integration access tokens (refreshed independently).
    type Mailbox = { id: string; token: string | null; email: string };
    const mailboxes: Record<string, Mailbox> = {};
    for (const integration of activeIntegrations) {
      const config = integration.config as any;
      let token: string | null = config.accessToken ?? null;
      if (!config.expiresAt || config.expiresAt < Date.now() + 60000) {
        try {
          token = await refreshAccessToken(adminClient, integration);
        } catch (e: any) {
          console.error(`Token refresh failed for integration ${integration.id}:`, e.message);
          token = null;
        }
      }
      mailboxes[integration.id] = {
        id: integration.id,
        token,
        email: config.googleEmail || "",
      };
    }

    if (Object.values(mailboxes).every((m) => !m.token)) {
      return new Response(
        JSON.stringify({ error: "Google authorization expired", needsReconnect: true }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Map sending_account_id -> integration id so each thread is polled with
    // the mailbox it was actually sent from.
    const { data: sendingAccounts } = await adminClient
      .from("sending_accounts")
      .select("id, integration_id")
      .eq("user_id", user.id);
    const accountToIntegration: Record<string, string> = {};
    for (const sa of sendingAccounts || []) {
      if (sa.integration_id) accountToIntegration[sa.id] = sa.integration_id;
    }

    const defaultMailbox =
      Object.values(mailboxes).find((m) => m.token) as Mailbox;

    const { data: activeThreads, error: threadsError } = await adminClient
      .from("sent_emails")
      .select("id, gmail_thread_id, sent_at, to_email, subject, sending_account_id, lead_id")
      .eq("user_id", user.id)
      .not("gmail_thread_id", "is", null)
      .eq("agent_thread_status", "active")
      .gte("sent_at", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
      // Newest first, and enough of them. An unordered limit of 50 against 130
      // live threads silently skipped most of the mailbox, which is how a real
      // reply could sit in Gmail while every sync reported zero.
      .order("sent_at", { ascending: false })
      .limit(300);

    if (threadsError) throw new Error(`Failed to fetch active threads: ${threadsError.message}`);

    const threads = activeThreads || [];
    const replies: any[] = [];

    const existingMessageIds = new Set<string>();
    if (threads.length > 0) {
      const { data: existingReplies } = await adminClient
        .from("reply_analysis")
        .select("id, sent_email_id, detected_signals")
        .in(
          "sent_email_id",
          threads.map((t: any) => t.id)
        );

      for (const r of existingReplies || []) {
        const signals = r.detected_signals as any;
        if (signals?.gmail_message_id) {
          existingMessageIds.add(signals.gmail_message_id);
        }
      }
    }

    // Threads Gmail throttled us out of, so the caller knows this run was
    // partial rather than reading "no replies" as "there are none".
    const throttledThreadIds: string[] = [];
    let processedCount = 0;

    for (const thread of threads) {
      try {
        const integrationId = thread.sending_account_id
          ? accountToIntegration[thread.sending_account_id]
          : undefined;
        const mailbox =
          (integrationId ? mailboxes[integrationId] : undefined) ?? defaultMailbox;
        if (!mailbox?.token) continue;

        // Pace the calls: a burst of full-thread reads is what trips Gmail's
        // per-minute cost ceiling.
        if (processedCount > 0) await sleep(120);
        processedCount++;

        const fetched = await fetchGmailThread(thread.gmail_thread_id, mailbox.token);
        if (!fetched.ok) {
          if (fetched.notFound) continue;
          if (fetched.rateLimited) {
            throttledThreadIds.push(thread.gmail_thread_id);
            console.warn(
              `Gmail rate limit on thread ${thread.gmail_thread_id}; it will be retried next sweep`
            );
            // Give the quota window room to recover before the next thread.
            await sleep(2_000);
            continue;
          }
          throw new Error(fetched.error || "Gmail thread fetch failed");
        }

        const gmailThread = fetched.thread;
        const messages: any[] = gmailThread.messages || [];
        const sentAt = new Date(thread.sent_at).getTime();

        const recipientEmail = (thread.to_email || "").toLowerCase().trim();
        const recipientDomain = recipientEmail.split("@")[1] || "";

        for (const message of messages) {
          const headers: any[] = message.payload?.headers || [];
          const headerValue = (name: string) =>
            headers.find((h: any) => h.name?.toLowerCase() === name)?.value || "";
          const fromHeader = headerValue("from");
          const subjectHeader = headerValue("subject") || thread.subject || "";

          const fromEmail = fromHeader.match(/<(.+?)>/)
            ? fromHeader.match(/<(.+?)>/)![1]
            : fromHeader.trim();

          // Bounce/DSN notifications are not replies — sync-bounces handles them.
          if (/mailer-daemon|postmaster|no-?reply|do-?not-?reply/i.test(fromEmail.toLowerCase()) ||
              /delivery status notification|undelivered mail|undeliverable|delivery incomplete/i.test(subjectHeader)) {
            continue;
          }

          // Auto-responders (out of office, vacation, ticket bots) are not a
          // human responding to the email.
          const isAutoReply =
            !!headerValue("auto-submitted").replace(/^no$/i, "") ||
            !!headerValue("x-autoreply") ||
            !!headerValue("x-autorespond") ||
            /^(vacation|out of office|autoreply|auto_reply)/i.test(headerValue("precedence")) ||
            /(out of (the )?office|automatic reply|auto[- ]?reply|autoresponder|away from my (desk|email)|on (vacation|leave|holiday))/i.test(subjectHeader);
          // Not dropped any more — recorded, and kept out of the reply stats.
          //
          // An out-of-office is not a human reply, so counting it would inflate
          // reply rate. But discarding it lost the whole event: it never
          // reached the inbox, the agent could not mention it, and the user
          // only learned about it by looking in Gmail. It is real information
          // — the address is live and monitored, and the person is back on a
          // date worth following up after.
          //
          // So it flows through like any other message and is excluded from
          // replied_at below instead.

          // Skip messages sent by any of the user's own connected mailboxes
          const ownEmails = Object.values(mailboxes)
            .map((m) => m.email.toLowerCase())
            .filter(Boolean);
          const normalizedFromEmail = fromEmail.toLowerCase();
          if (ownEmails.includes(normalizedFromEmail) && normalizedFromEmail !== allowedOwnReplyEmail) {
            continue;
          }

          // A reply only counts when it comes from the person we emailed (or a
          // colleague on the same domain, e.g. forwarded internally).
          const fromDomain = normalizedFromEmail.split("@")[1] || "";
          const isFromRecipient =
            normalizedFromEmail === recipientEmail ||
            (!!recipientDomain && fromDomain === recipientDomain) ||
            normalizedFromEmail === allowedOwnReplyEmail;
          if (!isFromRecipient) continue;

          const internalDate = parseInt(message.internalDate || "0", 10);
          if (internalDate <= sentAt) continue;

          const gmailMessageId: string = message.id;
          if (existingMessageIds.has(gmailMessageId)) continue;

          const bodyText = extractBody(message.payload);

          replies.push({
            sentEmailId: thread.id,
            gmailMessageId,
            fromEmail,
            subject: subjectHeader,
            bodyText,
            receivedAt: new Date(internalDate).toISOString(),
            gmailThreadId: thread.gmail_thread_id,
            integrationId: mailbox.id,
            isAutoReply,
            leadId: thread.lead_id ?? null,
          });

          existingMessageIds.add(gmailMessageId);
        }

      } catch (threadErr: any) {
        console.error(`Error processing thread ${thread.gmail_thread_id}:`, threadErr.message);
      }
    }

    // Persist reply attribution so reply-rate analytics reflect reality.
    // Earliest reply per sent email wins; never overwrite an existing value.
    // Auto-responders are deliberately excluded: an out-of-office is not the
    // prospect replying, and stamping replied_at for one would report a reply
    // rate the sender never earned.
    const earliestReply: Record<string, string> = {};
    for (const r of replies) {
      if (r.isAutoReply) continue;
      const current = earliestReply[r.sentEmailId];
      if (!current || r.receivedAt < current) earliestReply[r.sentEmailId] = r.receivedAt;
    }

    // Record every message in the inbox's own table.
    //
    // reply_threads is what the unified inbox reads — it owns the read flag,
    // the classification and the delete. Nothing in production ever wrote to
    // it: the only insert in the whole repo is admin-demo-data's seeder, so
    // the inbox's reply tabs could only ever show demo rows while real replies
    // went to reply_analysis, which the inbox does not read. That is why a
    // reply lands in Gmail and shows up nowhere here.
    if (replies.length) {
      const { error: threadErr } = await adminClient.from("reply_threads").insert(
        replies.map((r) => ({
          user_id: user.id,
          lead_id: r.leadId,
          sender_email: r.fromEmail,
          subject: r.subject,
          reply_body: r.bodyText,
          // The AI classification lands separately via analyze-reply; this is
          // the one verdict we can make without a model, and it is the one the
          // user asked to be able to see.
          classification: r.isAutoReply ? "ooo" : null,
          read: false,
          demo_seed: false,
        })),
      );
      if (threadErr) console.error("reply_threads insert failed:", threadErr.message);

      /**
       * Tell them, now.
       *
       * A reply is the one event in this product that decays: answered within
       * the hour it is a conversation, answered tomorrow it is a apology. This
       * was silent, so the only way to find out was to open the app and look.
       *
       * Auto-replies are dropped rather than counted. An out-of-office is not
       * someone waiting on an answer, and being buzzed for one is how a person
       * learns to turn notifications off — which would cost every other event
       * here too. One notification for the whole batch, for the same reason.
       */
      const human = replies.filter((r) => !r.isAutoReply);
      if (human.length) {
        await notifyRepliesReceived(
          user.id,
          human.map((r) => ({ fromEmail: r.fromEmail, subject: r.subject })),
        );
      }
    }
    for (const [sentEmailId, receivedAt] of Object.entries(earliestReply)) {
      const { error: replyErr } = await adminClient
        .from("sent_emails")
        .update({ replied_at: receivedAt })
        .eq("id", sentEmailId)
        .eq("user_id", user.id)
        .is("replied_at", null);
      if (replyErr) console.error(`Failed to mark reply on ${sentEmailId}:`, replyErr.message);
    }

    // Classify new replies so positive-reply analytics are real (opt-in so the
    // agent, which classifies replies itself, doesn't double-analyze).
    if (payload.analyzeReplies) {
      for (const r of replies) {
        try {
          const res = await fetch(`${supabaseUrl}/functions/v1/analyze-reply`, {
            method: "POST",
            headers: { Authorization: analyzeAuthHeader, "Content-Type": "application/json" },
            body: JSON.stringify({
              replyContent: r.bodyText,
              sentEmailId: r.sentEmailId,
              gmailMessageId: r.gmailMessageId,
              leadId: r.leadId,
              // Determined from the mail headers, which the model cannot see.
              isAutoReply: r.isAutoReply,
              userId: isInternal ? user.id : undefined,
            }),
          });
          if (!res.ok) console.error(`analyze-reply ${res.status}: ${await res.text()}`);
        } catch (e: any) {
          console.error("analyze-reply failed:", e.message);
        }
      }
    }


    return new Response(
      JSON.stringify({
        success: true,
        replies,
        threadsChecked: threads.length,
        newReplies: replies.length,
        // A throttled sweep is partial, not empty.
        rateLimitedThreads: throttledThreadIds.length,
        partial: throttledThreadIds.length > 0,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("inbox-sync error:", err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

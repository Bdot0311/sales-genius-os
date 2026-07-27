import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
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

    let payload: { testEmail?: string; includeOwnReplies?: boolean } = {};
    try {
      payload = await req.json();
    } catch {
      payload = {};
    }

    const allowedOwnReplyEmail = payload.includeOwnReplies
      ? (payload.testEmail ?? "").trim().toLowerCase()
      : "";

    const { data: { user }, error: authError } = await adminClient.auth.getUser(
      authHeader.replace("Bearer ", "")
    );
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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
      .select("id, gmail_thread_id, sent_at, to_email, subject, sending_account_id")
      .eq("user_id", user.id)
      .not("gmail_thread_id", "is", null)
      .eq("agent_thread_status", "active")
      .gte("sent_at", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
      .limit(50);

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

    for (const thread of threads) {
      try {
        const integrationId = thread.sending_account_id
          ? accountToIntegration[thread.sending_account_id]
          : undefined;
        const mailbox =
          (integrationId ? mailboxes[integrationId] : undefined) ?? defaultMailbox;
        if (!mailbox?.token) continue;

        const gmailRes = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/threads/${thread.gmail_thread_id}?format=full`,
          { headers: { Authorization: `Bearer ${mailbox.token}` } }
        );

        if (!gmailRes.ok) {
          if (gmailRes.status === 404) continue;
          throw new Error(`Gmail API ${gmailRes.status}: ${await gmailRes.text()}`);
        }

        const gmailThread = await gmailRes.json();
        const messages: any[] = gmailThread.messages || [];
        const sentAt = new Date(thread.sent_at).getTime();

        for (const message of messages) {
          const headers: any[] = message.payload?.headers || [];
          const fromHeader = headers.find((h: any) => h.name.toLowerCase() === "from")?.value || "";
          const subjectHeader =
            headers.find((h: any) => h.name.toLowerCase() === "subject")?.value || thread.subject || "";

          const fromEmail = fromHeader.match(/<(.+?)>/)
            ? fromHeader.match(/<(.+?)>/)![1]
            : fromHeader.trim();

          // Skip messages sent by any of the user's own connected mailboxes
          const ownEmails = Object.values(mailboxes)
            .map((m) => m.email.toLowerCase())
            .filter(Boolean);
          const normalizedFromEmail = fromEmail.toLowerCase();
          if (ownEmails.includes(normalizedFromEmail) && normalizedFromEmail !== allowedOwnReplyEmail) {
            continue;
          }

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
          });

          existingMessageIds.add(gmailMessageId);
        }
      } catch (threadErr: any) {
        console.error(`Error processing thread ${thread.gmail_thread_id}:`, threadErr.message);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        replies,
        threadsChecked: threads.length,
        newReplies: replies.length,
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

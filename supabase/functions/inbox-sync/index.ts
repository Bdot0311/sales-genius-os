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
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new TextDecoder("utf-8").decode(bytes);
  } catch {
    return "";
  }
}

function extractBody(payload: any): string {
  if (!payload) return "";
  if (payload.mimeType === "text/plain" && payload.body?.data) return decodeBase64Url(payload.body.data);
  if (payload.parts && Array.isArray(payload.parts)) {
    for (const part of payload.parts) {
      if (part.mimeType === "text/plain" && part.body?.data) return decodeBase64Url(part.body.data);
    }
    for (const part of payload.parts) {
      const text = extractBody(part);
      if (text) return text;
    }
  }
  if (payload.body?.data) return decodeBase64Url(payload.body.data);
  return "";
}

// Refresh a single integration's Gmail token (scoped by row id, never by
// (user_id, provider) — that would clobber sibling Google accounts).
async function refreshAccessToken(adminClient: any, integration: any): Promise<string> {
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
    const err = await res.json().catch(() => ({}));
    if (err.error === "invalid_grant") {
      // Deactivate only this specific integration row, not every Google row.
      await adminClient.from("integrations").update({ is_active: false }).eq("id", integration.id);
    }
    throw new Error(`Token refresh failed: ${err.error_description || err.error || res.status}`);
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
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

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

    const { data: { user }, error: authError } = await adminClient.auth.getUser(
      authHeader.replace("Bearer ", "")
    );
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Pull ALL active Google integrations. A user can have multiple mailboxes
    // connected (agency ops, personal + work, etc); syncing only one of them
    // silently drops replies for the others.
    const { data: integrations, error: integrationsError } = await adminClient
      .from("integrations")
      .select("id, config, updated_at")
      .eq("user_id", user.id)
      .eq("integration_id", "google")
      .eq("is_active", true)
      .order("updated_at", { ascending: false });

    if (integrationsError || !integrations || integrations.length === 0) {
      return new Response(
        JSON.stringify({ error: "Google integration not connected", needsReconnect: true }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Map each integration.id -> {token, email, sendingAccountId}
    const integById = new Map<
      string,
      { integrationId: string; sendingAccountId: string | null; token: string; email: string }
    >();

    // Look up sending_accounts for these integrations so we can partition
    // threads by mailbox.
    const integrationIds = integrations.map((i: any) => i.id);
    const { data: sendingAccounts } = await adminClient
      .from("sending_accounts")
      .select("id, integration_id")
      .in("integration_id", integrationIds);
    const saByIntegration = new Map<string, string>();
    for (const sa of sendingAccounts || []) saByIntegration.set(sa.integration_id, sa.id);

    for (const integ of integrations) {
      try {
        const cfg = (integ as any).config as any;
        if (!cfg?.refreshToken && !cfg?.accessToken) continue;
        let token: string = cfg.accessToken;
        if (!cfg.expiresAt || cfg.expiresAt < Date.now() + 60_000) {
          token = await refreshAccessToken(adminClient, integ);
        }
        integById.set((integ as any).id, {
          integrationId: (integ as any).id,
          sendingAccountId: saByIntegration.get((integ as any).id) ?? null,
          token,
          email: cfg.googleEmail || "",
        });
      } catch (e) {
        console.error(`inbox-sync: refresh failed for integration ${(integ as any).id}`, e);
      }
    }

    if (integById.size === 0) {
      return new Response(
        JSON.stringify({ error: "No usable Google tokens", needsReconnect: true }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch the user's active threads, including which mailbox they were sent
    // from. Legacy rows with null sending_account_id fall back to the
    // most-recently-updated integration (first entry in the map).
    const { data: activeThreads, error: threadsError } = await adminClient
      .from("sent_emails")
      .select("id, gmail_thread_id, sent_at, to_email, subject, sending_account_id")
      .eq("user_id", user.id)
      .not("gmail_thread_id", "is", null)
      .eq("agent_thread_status", "active")
      .gte("sent_at", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
      .limit(100);

    if (threadsError) throw new Error(`Failed to fetch active threads: ${threadsError.message}`);
    const threads = activeThreads || [];

    // sending_account_id -> integrationId
    const integrationBySendingAccount = new Map<string, string>();
    for (const [, v] of integById) {
      if (v.sendingAccountId) integrationBySendingAccount.set(v.sendingAccountId, v.integrationId);
    }
    const defaultIntegrationId = integById.keys().next().value as string;

    const replies: any[] = [];
    const existingMessageIds = new Set<string>();
    if (threads.length > 0) {
      const { data: existingReplies } = await adminClient
        .from("reply_analysis")
        .select("id, sent_email_id, detected_signals")
        .in("sent_email_id", threads.map((t: any) => t.id));
      for (const r of existingReplies || []) {
        const signals = r.detected_signals as any;
        if (signals?.gmail_message_id) existingMessageIds.add(signals.gmail_message_id);
      }
    }

    for (const thread of threads) {
      // Route each thread to the mailbox that actually sent it.
      const targetIntegrationId =
        (thread.sending_account_id && integrationBySendingAccount.get(thread.sending_account_id)) ||
        defaultIntegrationId;
      const target = integById.get(targetIntegrationId);
      if (!target) continue;

      try {
        const gmailRes = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/threads/${thread.gmail_thread_id}?format=full`,
          { headers: { Authorization: `Bearer ${target.token}` } }
        );
        if (!gmailRes.ok) {
          if (gmailRes.status === 404) continue;
          console.error(`Gmail ${gmailRes.status} on thread ${thread.gmail_thread_id}:`, await gmailRes.text());
          continue;
        }

        const gmailThread = await gmailRes.json();
        const messages: any[] = gmailThread.messages || [];
        const sentAt = new Date(thread.sent_at).getTime();

        for (const message of messages) {
          const headers: any[] = message.payload?.headers || [];
          const fromHeader = headers.find((h: any) => h.name.toLowerCase() === "from")?.value || "";
          const subjectHeader =
            headers.find((h: any) => h.name.toLowerCase() === "subject")?.value || thread.subject || "";
          const fromEmail = fromHeader.match(/<(.+?)>/) ? fromHeader.match(/<(.+?)>/)![1] : fromHeader.trim();

          if (target.email && fromEmail.toLowerCase() === target.email.toLowerCase()) continue;

          const internalDate = parseInt(message.internalDate || "0", 10);
          if (internalDate <= sentAt) continue;

          const gmailMessageId: string = message.id;
          if (existingMessageIds.has(gmailMessageId)) continue;

          replies.push({
            sentEmailId: thread.id,
            gmailMessageId,
            fromEmail,
            subject: subjectHeader,
            bodyText: extractBody(message.payload),
            receivedAt: new Date(internalDate).toISOString(),
            gmailThreadId: thread.gmail_thread_id,
            // Give the caller everything it needs to reply from the SAME mailbox.
            integrationRowId: target.integrationId,
            sendingAccountId: thread.sending_account_id ?? target.sendingAccountId ?? null,
          });

          existingMessageIds.add(gmailMessageId);
        }
      } catch (threadErr: any) {
        console.error(`Error processing thread ${thread.gmail_thread_id}:`, threadErr?.message);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        replies,
        threadsChecked: threads.length,
        newReplies: replies.length,
        mailboxes: integById.size,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("inbox-sync error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

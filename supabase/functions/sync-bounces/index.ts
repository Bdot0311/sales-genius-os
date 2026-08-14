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

/** Flatten every text part of a Gmail payload so DSN bodies are searchable. */
function collectText(payload: any, out: string[] = []): string[] {
  if (!payload) return out;
  if (payload.body?.data) out.push(decodeBase64Url(payload.body.data));
  for (const part of payload.parts || []) collectText(part, out);
  return out;
}

/** Hard = permanent (5.x.x / address not found). Soft = temporary (4.x.x). */
export function classifyBounce(text: string): { type: "hard" | "soft" | "block"; code: string | null } {
  const lower = text.toLowerCase();
  const code = text.match(/\b([45]\.\d{1,3}\.\d{1,3})\b/)?.[1] ?? text.match(/\b(4\d\d|5\d\d)\b/)?.[1] ?? null;
  if (/blocked|spam|policy|reputation|blacklist/.test(lower)) return { type: "block", code };
  if (
    /address not found|does not exist|user unknown|no such user|unknown recipient|invalid recipient|mailbox unavailable|recipient address rejected|550|5\.1\.1|5\.1\.10|5\.2\.1/.test(
      lower,
    )
  ) {
    return { type: "hard", code };
  }
  if (/^4/.test(code ?? "") || /temporar|try again|quota|full/.test(lower)) return { type: "soft", code };
  return { type: "hard", code };
}

/** Pull the failed recipient from DSN headers or the notification body. */
function extractFailedRecipients(headers: any[], text: string): string[] {
  const found = new Set<string>();
  const failedHeader = headers.find((h) => h.name?.toLowerCase() === "x-failed-recipients")?.value;
  if (failedHeader) {
    for (const part of failedHeader.split(",")) {
      const email = part.trim().toLowerCase();
      if (email.includes("@")) found.add(email);
    }
  }
  for (const m of text.matchAll(/[\w.+-]+@[\w-]+\.[\w.-]+/g)) {
    const email = m[0].toLowerCase().replace(/[.,;>)]+$/, "");
    if (/mailer-daemon|postmaster|googlemail\.com|google\.com|noreply/.test(email)) continue;
    found.add(email);
  }
  return [...found];
}

async function refreshAccessToken(adminClient: any, integration: any): Promise<string> {
  const config = integration.config as any;
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: Deno.env.get("GOOGLE_CLIENT_ID")!,
      client_secret: Deno.env.get("GOOGLE_CLIENT_SECRET")!,
      refresh_token: config.refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    if (err.error === "invalid_grant") {
      await adminClient.from("integrations").update({ is_active: false }).eq("id", integration.id);
    }
    throw new Error(`Token refresh failed: ${err.error_description || err.error}`);
  }
  const tokens = await res.json();
  await adminClient
    .from("integrations")
    .update({
      config: {
        ...config,
        accessToken: tokens.access_token,
        expiresAt: Date.now() + tokens.expires_in * 1000,
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
  const adminClient = createClient(supabaseUrl, serviceKey);

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const {
      data: { user },
      error: authError,
    } = await adminClient.auth.getUser(authHeader.replace("Bearer ", ""));
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: integrations } = await adminClient
      .from("integrations")
      .select("id, config")
      .eq("user_id", user.id)
      .eq("integration_id", "google")
      .eq("is_active", true);

    const active = (integrations || []).filter((i: any) => i?.config);
    if (active.length === 0) {
      return new Response(JSON.stringify({ success: true, bounces: 0, reason: "no_google_mailbox" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Recent sends we could still learn a bounce for.
    const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
    const { data: recentSends } = await adminClient
      .from("sent_emails")
      .select("id, to_email, sent_at, sending_account_id, status")
      .eq("user_id", user.id)
      .gte("sent_at", since)
      .in("status", ["sent", "delivered", "opened", "clicked"])
      .order("sent_at", { ascending: false })
      .limit(1000);

    const byRecipient = new Map<string, any[]>();
    for (const s of recentSends || []) {
      const key = (s.to_email || "").toLowerCase();
      if (!key) continue;
      const list = byRecipient.get(key) ?? [];
      list.push(s);
      byRecipient.set(key, list);
    }

    let bounces = 0;
    const detected: any[] = [];

    for (const integration of active) {
      const config = integration.config as any;
      let token: string | null = config.accessToken ?? null;
      if (!config.expiresAt || config.expiresAt < Date.now() + 60_000) {
        try {
          token = await refreshAccessToken(adminClient, integration);
        } catch (e: any) {
          console.error(`Token refresh failed for ${integration.id}:`, e.message);
          token = null;
        }
      }
      if (!token) continue;

      const query = encodeURIComponent(
        'newer_than:14d (from:mailer-daemon OR from:postmaster OR subject:"Delivery Status Notification" OR subject:"Undelivered Mail" OR subject:"Undeliverable")',
      );
      const listRes = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=50&q=${query}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (!listRes.ok) {
        console.error(`Gmail list ${listRes.status}: ${await listRes.text()}`);
        continue;
      }
      const list = await listRes.json();

      for (const stub of list.messages || []) {
        const msgRes = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${stub.id}?format=full`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        if (!msgRes.ok) continue;
        const message = await msgRes.json();
        const headers: any[] = message.payload?.headers || [];
        const text = [message.snippet || "", ...collectText(message.payload)].join("\n");
        const { type, code } = classifyBounce(text);
        const recipients = extractFailedRecipients(headers, text);
        const detectedAt = new Date(parseInt(message.internalDate || `${Date.now()}`, 10)).toISOString();

        for (const recipient of recipients) {
          const matches = byRecipient.get(recipient);
          if (!matches || matches.length === 0) continue;
          const send = matches[0];

          const { error: upErr } = await adminClient
            .from("sent_emails")
            .update({ status: "bounced", agent_thread_status: "closed" })
            .eq("id", send.id)
            .eq("user_id", user.id);
          if (upErr) {
            console.error(`Failed to mark bounce on ${send.id}:`, upErr.message);
            continue;
          }

          await adminClient.from("bounce_events").insert({
            user_id: user.id,
            sending_account_id: send.sending_account_id,
            sent_email_id: send.id,
            to_email: recipient,
            bounce_type: type,
            reason: (message.snippet || "").slice(0, 500),
            smtp_code: code,
            detected_at: detectedAt,
          });

          if (type === "hard") {
            await adminClient
              .from("suppressed_emails")
              .upsert(
                { email: recipient, reason: "bounce", metadata: { smtp_code: code, source: "gmail_dsn" } },
                { onConflict: "email" },
              );
          }

          // Don't re-mark the same send from another DSN copy.
          byRecipient.set(
            recipient,
            matches.filter((m) => m.id !== send.id),
          );
          bounces++;
          detected.push({ to_email: recipient, type, smtp_code: code, sent_email_id: send.id });
        }
      }
    }

    return new Response(JSON.stringify({ success: true, bounces, detected }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("sync-bounces error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

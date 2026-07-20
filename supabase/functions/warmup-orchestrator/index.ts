// warmup-orchestrator — the shared warmup pool worker.
//
// Opted-in mailboxes (warmup_pool.active) send each other short, natural emails
// and reply to a share of what they receive, building sender reputation the way
// Instantly/Smartlead pools do. It also detects placement: if a warmup message
// lands in spam, the recipient moves it to the inbox (recovery) and records it.
//
// Safety + honesty:
//  - Runs as a scheduled internal job (verify_jwt = false) with the service role.
//  - Does NOTHING until at least two eligible mailboxes are in the pool, so a
//    single connected mailbox never generates fake traffic.
//  - Respects each account's status (paused/disabled are skipped) and a
//    conservative per-account daily target.
//  - Real Gmail sends via each account's own OAuth token; no spoofing.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GMAIL_API = "https://gmail.googleapis.com/gmail/v1/users/me";

// Marker embedded in every warmup body so recipients can correlate the message
// back to its warmup_messages row (Gmail full-text search finds it).
const MARKER = "or-wu";

interface PoolAccount {
  account_id: string;
  user_id: string;
  email: string;
  integration_id: string | null;
  daily_target: number;
}

// Short, varied, human warmup snippets — no salesy language, no links.
const SUBJECTS = [
  "Quick note", "Following up", "Re: earlier", "Checking in", "One thing",
  "This week", "Circling back", "A thought", "Heads up", "Small update",
];
const BODIES = [
  "Thanks for the note earlier, that makes sense to me. Let's keep it moving on our end and compare notes next week.",
  "Appreciate you getting back to me. I read through it and I think we're aligned. Happy to keep going from here.",
  "Good catch on that. I'll take a look and follow up once I've had a chance to review properly.",
  "Sounds good to me. No rush on your side, whenever you get to it works. Talk soon.",
  "That all tracks. I'll pull the details together and send them over in the next day or two.",
  "Makes sense. Let's plan to touch base later this week once things settle down a bit.",
];

function toBase64Url(str: string): string {
  return btoa(unescape(encodeURIComponent(str))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function pick<T>(arr: T[], i: number): T {
  return arr[Math.abs(i) % arr.length];
}

async function refreshedToken(supabase: ReturnType<typeof createClient>, integrationId: string): Promise<string | null> {
  const { data: integ } = await supabase.from("integrations").select("id, config").eq("id", integrationId).maybeSingle();
  if (!integ) return null;
  const config = (integ.config ?? {}) as Record<string, unknown>;
  let accessToken = (config.accessToken as string) || (config.provider_token as string) || null;
  const expiresAt = config.expiresAt as number | undefined;
  const refreshToken = config.refreshToken as string | undefined;

  if (expiresAt && Date.now() >= expiresAt && refreshToken) {
    const clientId = Deno.env.get("GOOGLE_CLIENT_ID");
    const clientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET");
    if (!clientId || !clientSecret) return accessToken;
    const res = await fetch(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken, grant_type: "refresh_token" }).toString(),
    });
    if (res.ok) {
      const tok = await res.json();
      accessToken = tok.access_token;
      await supabase.from("integrations").update({
        config: { ...config, accessToken: tok.access_token, expiresAt: Date.now() + tok.expires_in * 1000 },
      }).eq("id", integrationId);
    }
  }
  return accessToken;
}

async function gmailSend(token: string, from: string, to: string, subject: string, body: string, threadId?: string, inReplyTo?: string): Promise<{ id: string; threadId: string } | null> {
  const headers = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    "Content-Type: text/plain; charset=UTF-8",
  ];
  if (inReplyTo) { headers.push(`In-Reply-To: ${inReplyTo}`, `References: ${inReplyTo}`); }
  const mime = `${headers.join("\r\n")}\r\n\r\n${body}`;
  const payload: Record<string, string> = { raw: toBase64Url(mime) };
  if (threadId) payload.threadId = threadId;
  const res = await fetch(`${GMAIL_API}/messages/send`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) { console.error("gmailSend failed:", res.status, await res.text()); return null; }
  const j = await res.json();
  return { id: j.id, threadId: j.threadId };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");
    const today = new Date().toISOString().slice(0, 10);

    // Eligible pool accounts — two-step query (no embedded join) so a relationship
    // hiccup can't silently return an empty pool.
    const { data: poolRows, error: poolErr } = await supabase
      .from("warmup_pool")
      .select("sending_account_id, user_id, email, daily_target")
      .eq("active", true);
    if (poolErr) {
      console.error("[warmup-orchestrator] pool query error:", poolErr);
      return json({ error: "pool query failed", detail: poolErr.message }, 500);
    }
    const rows = poolRows ?? [];
    const ids = rows.map((r: Record<string, unknown>) => r.sending_account_id as string).filter(Boolean);

    const accountsById = new Map<string, Record<string, unknown>>();
    if (ids.length > 0) {
      const { data: accts, error: acctErr } = await supabase
        .from("sending_accounts")
        .select("id, status, warmup_enabled, integration_id")
        .in("id", ids);
      if (acctErr) {
        console.error("[warmup-orchestrator] sending_accounts query error:", acctErr);
        return json({ error: "accounts query failed", detail: acctErr.message }, 500);
      }
      for (const a of accts ?? []) accountsById.set(a.id as string, a);
    }

    const eligible: PoolAccount[] = rows
      .map((r: Record<string, unknown>) => {
        const sa = accountsById.get(r.sending_account_id as string);
        if (!sa || sa.status !== "active" || sa.warmup_enabled !== true || !sa.integration_id) return null;
        return {
          account_id: r.sending_account_id as string,
          user_id: r.user_id as string,
          email: r.email as string,
          integration_id: sa.integration_id as string,
          daily_target: (r.daily_target as number) || 4,
        };
      })
      .filter((x): x is PoolAccount => x !== null);

    // Idle until the pool can actually pair. No fake traffic for a lone mailbox.
    if (eligible.length < 2) {
      return json({
        ok: true, idle: true,
        poolRows: rows.length,
        eligible: eligible.length,
        note: "Warmup needs at least 2 active, warmup-enabled mailboxes in the pool.",
      });
    }

    // Cache access tokens per account.
    const tokens = new Map<string, string>();
    for (const a of eligible) {
      if (!a.integration_id) continue;
      const t = await refreshedToken(supabase, a.integration_id);
      if (t) tokens.set(a.account_id, t);
    }
    const sendable = eligible.filter((a) => tokens.has(a.account_id));
    if (sendable.length < 2) {
      return json({
        ok: true, idle: true,
        poolRows: rows.length, eligible: eligible.length, tokened: sendable.length,
        note: "Not enough mailboxes with a valid Gmail token — reconnect Gmail for the warmup accounts.",
      });
    }

    let sent = 0, replied = 0, recovered = 0;

    // ---- SEND phase ----
    for (let i = 0; i < sendable.length; i++) {
      const sender = sendable[i];

      const { count: sentToday } = await supabase
        .from("warmup_messages")
        .select("id", { count: "exact", head: true })
        .eq("from_account_id", sender.account_id)
        .gte("sent_at", `${today}T00:00:00Z`);

      let remaining = Math.max(0, sender.daily_target - (sentToday ?? 0));
      // Send at most 2 per run so volume ramps gradually across the day's runs.
      remaining = Math.min(remaining, 2);
      if (remaining <= 0) continue;

      // Recipients: other pooled accounts, preferring a different user.
      const others = sendable.filter((a) => a.account_id !== sender.account_id);
      others.sort((a, b) => Number(a.user_id === sender.user_id) - Number(b.user_id === sender.user_id));

      for (let r = 0; r < remaining && r < others.length; r++) {
        const recipient = others[(i + r) % others.length];
        const token = tokens.get(sender.account_id)!;

        // Insert first to get the id we embed as the correlation marker.
        const { data: row, error: insErr } = await supabase.from("warmup_messages").insert({
          from_account_id: sender.account_id,
          to_account_id: recipient.account_id,
          from_user_id: sender.user_id,
          to_user_id: recipient.user_id,
          subject: pick(SUBJECTS, i + r),
        }).select("id").single();
        if (insErr || !row) { console.error("warmup_messages insert failed:", insErr); continue; }

        const subject = pick(SUBJECTS, i + r);
        const body = `${pick(BODIES, i * 3 + r)}\n\n[${MARKER}:${row.id}]`;
        const result = await gmailSend(token, sender.email, recipient.email, subject, body);
        if (result) {
          await supabase.from("warmup_messages").update({ gmail_message_id: result.id, gmail_thread_id: result.threadId, subject }).eq("id", row.id);
          sent++;
        } else {
          // Sending failed — drop the placeholder row so counts stay honest.
          await supabase.from("warmup_messages").delete().eq("id", row.id);
        }
      }
    }

    // ---- RECEIVE phase: placement detection, spam recovery, and replies ----
    for (const acct of sendable) {
      const token = tokens.get(acct.account_id)!;
      // Find recent warmup messages in this mailbox (inbox + spam).
      const listRes = await fetch(`${GMAIL_API}/messages?q=${encodeURIComponent(`"${MARKER}:" newer_than:3d`)}&maxResults=25&includeSpamTrash=true`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!listRes.ok) continue;
      const list = await listRes.json();
      const msgs: { id: string }[] = list.messages ?? [];

      for (let m = 0; m < msgs.length; m++) {
        const getRes = await fetch(`${GMAIL_API}/messages/${msgs[m].id}?format=full`, { headers: { Authorization: `Bearer ${token}` } });
        if (!getRes.ok) continue;
        const msg = await getRes.json();
        const labels: string[] = msg.labelIds ?? [];

        // Pull the correlation id out of the snippet/body.
        const snippet: string = msg.snippet ?? "";
        const match = snippet.match(new RegExp(`${MARKER}:([0-9a-f-]{36})`, "i"));
        const wmId = match?.[1];

        const folder = labels.includes("SPAM") ? "spam" : labels.includes("CATEGORY_PROMOTIONS") ? "promotions" : "inbox";

        if (wmId) {
          await supabase.from("warmup_messages").update({ folder_detected: folder }).eq("id", wmId).eq("to_account_id", acct.account_id);
        }

        // Spam recovery: move it to the inbox and mark it not-spam.
        if (folder === "spam") {
          await fetch(`${GMAIL_API}/messages/${msgs[m].id}/modify`, {
            method: "POST",
            headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
            body: JSON.stringify({ addLabelIds: ["INBOX"], removeLabelIds: ["SPAM"] }),
          });
          recovered++;
        }

        // Reply to roughly half of received warmup messages that haven't been replied to.
        if (wmId && m % 2 === 0) {
          const { data: wm } = await supabase.from("warmup_messages").select("replied_at, from_account_id").eq("id", wmId).maybeSingle();
          if (wm && !wm.replied_at) {
            const headersArr: { name: string; value: string }[] = msg.payload?.headers ?? [];
            const fromHeader = headersArr.find((h) => h.name.toLowerCase() === "from")?.value ?? "";
            const msgIdHeader = headersArr.find((h) => h.name.toLowerCase() === "message-id")?.value;
            const subjHeader = headersArr.find((h) => h.name.toLowerCase() === "subject")?.value ?? "Re:";
            const replyTo = fromHeader.match(/<([^>]+)>/)?.[1] ?? fromHeader;
            if (replyTo) {
              const reply = await gmailSend(
                token, acct.email, replyTo,
                subjHeader.toLowerCase().startsWith("re:") ? subjHeader : `Re: ${subjHeader}`,
                `${pick(BODIES, m + 1)}\n\n[${MARKER}:${wmId}]`,
                msg.threadId, msgIdHeader,
              );
              if (reply) { await supabase.from("warmup_messages").update({ replied_at: new Date().toISOString() }).eq("id", wmId); replied++; }
            }
          }
        }
      }
    }

    console.log(`[warmup-orchestrator] sent=${sent} replied=${replied} recovered=${recovered} pool=${sendable.length}`);
    return json({ ok: true, poolRows: rows.length, eligible: eligible.length, tokened: sendable.length, sent, replied, recovered });
  } catch (err) {
    console.error("[warmup-orchestrator] error:", err);
    return json({ error: "warmup orchestration failed" }, 500);
  }
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

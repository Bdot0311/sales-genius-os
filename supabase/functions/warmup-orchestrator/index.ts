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
import { corsHeaders, requireInternalOrUser } from "../_shared/internal-auth.ts";

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GMAIL_API = "https://gmail.googleapis.com/gmail/v1/users/me";

// Marker embedded in every warmup body so recipients can correlate the message
// back to its warmup_messages row (Gmail full-text search finds it).
const MARKER = "or-wu";

interface PoolAccount {
  account_id: string;
  user_id: string;
  email: string;
  integration_id: string;
  daily_target: number;
  /** When the receive phase last scanned this mailbox; null means never. */
  last_scan_at: string | null;
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

async function refreshedToken(supabase: any, integrationId: string): Promise<string | null> {
  const { data: integ } = await supabase.from("integrations").select("id, config").eq("id", integrationId).maybeSingle();
  if (!integ) return null;
  const config = ((integ as any)?.config ?? {}) as Record<string, unknown>;
  let accessToken = (config.accessToken as string) || (config.provider_token as string) || null;
  const expiresAt = config.expiresAt as number | undefined;
  const refreshToken = config.refreshToken as string | undefined;

  // Refresh proactively: a missing/stale expiry used to skip the refresh
  // entirely and send with a dead token, which Gmail rejects with a 401.
  const needsRefresh = !accessToken || !expiresAt || Date.now() >= expiresAt - 120_000;
  if (needsRefresh && refreshToken) {
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
    } else {
      // Revoked refresh token: skip the account instead of sending with a dead
      // token, and flag it so the user is told to reconnect Gmail.
      const detail = await res.text();
      console.error("[warmup-orchestrator] token refresh failed:", integrationId, res.status, detail.slice(0, 200));
      await supabase
        .from("integrations")
        .update({ config: { ...config, needsReconnect: true, lastRefreshError: detail.slice(0, 200) } })
        .eq("id", integrationId);
      return null;
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

  // Cron/service role, or a signed-in user pressing "run warmup now".
  // Anonymous callers can no longer trigger real Gmail sends.
  const authFail = await requireInternalOrUser(req);
  if (authFail) return authFail;

  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");
    const today = new Date().toISOString().slice(0, 10);

    /*
     * A wall-clock budget, because the receive phase scales with the pool.
     *
     * It was a bare nested loop: every pooled mailbox, up to twenty-five
     * messages each, one Gmail GET apiece plus a modify and sometimes a send.
     * At twenty mailboxes that is several hundred sequential round trips, well
     * past the function's ceiling — so the run was killed part-way through,
     * silently, with its counters never returned and no record of how far it
     * got. Stopping on a budget and rotating which mailboxes go first makes
     * the shortfall orderly instead of invisible.
     */
    const startedAt = Date.now();
    const BUDGET_MS = 100_000;
    const outOfTime = () => Date.now() - startedAt > BUDGET_MS;

    // Eligible pool accounts — two-step query (no embedded join) so a relationship
    // hiccup can't silently return an empty pool.
    const { data: poolRows, error: poolErr } = await supabase
      .from("warmup_pool")
      .select("sending_account_id, user_id, email, daily_target, last_scan_at")
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
          last_scan_at: (r.last_scan_at as string | null) ?? null,
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
    const emailByAccount = new Map(sendable.map((a) => [a.account_id, a.email]));

    // ---- SEND phase ----
    for (let i = 0; i < sendable.length; i++) {
      if (outOfTime()) break;
      const sender = sendable[i];

      /*
       * Recipients in pairing order: a different owner first, so warmup
       * traffic crosses accounts rather than circling inside one. Rotated by
       * the hour so the same sender does not post to the same mailbox on every
       * run of the day — a pool that always pairs the same way builds a
       * pattern rather than a reputation.
       */
      const others = sendable.filter((a) => a.account_id !== sender.account_id);
      const diff = others.filter((a) => a.user_id !== sender.user_id);
      const same = others.filter((a) => a.user_id === sender.user_id);
      const offset = Math.floor(Date.now() / 3_600_000) + i;
      const rotate = <T,>(xs: T[]) => (xs.length ? xs.map((_, k) => xs[(k + offset) % xs.length]) : xs);
      const ordered = [...rotate(diff), ...rotate(same)];

      /*
       * The allowance is claimed, not computed. Counting today's rows and then
       * inserting is not atomic, and the hourly cron overlaps the "run warmup
       * now" button by design — two runs both read the same count and both
       * send, at twice the ramp. claim_warmup_sends does both inside a
       * per-sender advisory lock and hands back rows that are already paired.
       */
      const { data: claims, error: claimErr } = await supabase.rpc("claim_warmup_sends", {
        p_from_account: sender.account_id,
        p_to_accounts: ordered.map((a) => a.account_id),
        p_daily_target: sender.daily_target,
        // Two per run, so the day's volume ramps across its runs rather than
        // arriving in one burst.
        p_per_run: 2,
      });
      if (claimErr) {
        console.error("[warmup-orchestrator] claim failed:", sender.account_id, claimErr.message);
        continue;
      }

      const token = tokens.get(sender.account_id)!;
      const rows = (claims ?? []) as { id: string; to_account_id: string }[];
      for (let r = 0; r < rows.length; r++) {
        if (outOfTime()) {
          // Unsent claims are reaped by the next run rather than left to
          // count against the day's target for ever.
          await supabase.from("warmup_messages").delete().eq("id", rows[r].id);
          continue;
        }
        const row = rows[r];
        const toEmail = emailByAccount.get(row.to_account_id);
        if (!toEmail) { await supabase.from("warmup_messages").delete().eq("id", row.id); continue; }

        const subject = pick(SUBJECTS, i + r);
        // The row id travels in the body so the recipient can correlate the
        // message back to this row.
        const body = `${pick(BODIES, i * 3 + r)}\n\n[${MARKER}:${row.id}]`;
        const result = await gmailSend(token, sender.email, toEmail, subject, body);
        if (result) {
          await supabase.from("warmup_messages").update({ gmail_message_id: result.id, gmail_thread_id: result.threadId, subject }).eq("id", row.id);
          sent++;
        } else {
          // Sending failed — drop the claim so counts stay honest and the
          // allowance is not spent on a message that never left.
          await supabase.from("warmup_messages").delete().eq("id", row.id);
        }
      }
    }

    // ---- RECEIVE phase: placement detection, spam recovery, and replies ----
    /*
     * Least-recently-scanned first. The scan is bounded by a wall-clock
     * budget, and without an order the mailboxes at the front of the pool
     * would be the only ones ever scanned once the pool outgrew one run.
     */
    const scanOrder = [...sendable].sort(
      (a, b) => (a.last_scan_at ? Date.parse(a.last_scan_at) : 0) - (b.last_scan_at ? Date.parse(b.last_scan_at) : 0),
    );
    let scanned = 0;

    for (const acct of scanOrder) {
      if (outOfTime()) break;
      const token = tokens.get(acct.account_id)!;

      /*
       * Messages this mailbox has already handled, by their id in THIS
       * mailbox. A warmup message keeps matching the search for three days, so
       * without this the run re-fetched and re-judged every one of them every
       * hour — and re-judging is what destroyed the placement signal, because
       * a message recovered from spam reads as 'inbox' on the next pass.
       */
      const { data: seenRows } = await supabase
        .from("warmup_messages")
        .select("recipient_message_id")
        .eq("to_account_id", acct.account_id)
        .not("recipient_message_id", "is", null)
        .gte("sent_at", new Date(Date.now() - 5 * 86400_000).toISOString());
      const seen = new Set((seenRows ?? []).map((r: Record<string, unknown>) => r.recipient_message_id as string));

      /*
       * Replies are real sends from this mailbox, and nothing capped them: up
       * to 25 per run, every hour, against a daily target of four. One
       * mailbox's own allowance for replying, counted the same way.
       */
      const { count: repliedToday } = await supabase
        .from("warmup_messages")
        .select("id", { count: "exact", head: true })
        .eq("to_account_id", acct.account_id)
        .not("replied_at", "is", null)
        .gte("replied_at", `${today}T00:00:00Z`);
      let replyAllowance = Math.max(0, Math.min(2, acct.daily_target - (repliedToday ?? 0)));

      // Find warmup mail this mailbox RECEIVED (inbox/spam/promotions). Exclude
      // -in:sent / -in:chats so we never classify or "reply to" our own sent
      // copies — placement is only meaningful for received messages, and this
      // also prevents self-replies. Received mail is detected on the run after
      // it's delivered (delivery lags the same-invocation send).
      const query = `"${MARKER}:" newer_than:3d -in:sent -in:chats`;
      const listRes = await fetch(`${GMAIL_API}/messages?q=${encodeURIComponent(query)}&maxResults=25&includeSpamTrash=true`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!listRes.ok) continue;
      const list = await listRes.json();
      const msgs: { id: string }[] = (list.messages ?? []).filter((m: { id: string }) => !seen.has(m.id));
      scanned++;

      for (let m = 0; m < msgs.length; m++) {
        if (outOfTime()) break;
        const getRes = await fetch(`${GMAIL_API}/messages/${msgs[m].id}?format=full`, { headers: { Authorization: `Bearer ${token}` } });
        if (!getRes.ok) continue;
        const msg = await getRes.json();
        const labels: string[] = msg.labelIds ?? [];

        // Pull the correlation id out of the snippet/body.
        const snippet: string = msg.snippet ?? "";
        const match = snippet.match(new RegExp(`${MARKER}:([0-9a-f-]{36})`, "i"));
        const wmId = match?.[1];

        const folder = labels.includes("SPAM") ? "spam" : labels.includes("CATEGORY_PROMOTIONS") ? "promotions" : "inbox";

        /*
         * Recover first, record second. Marking the message handled before the
         * recovery succeeded would leave it in spam for good, because the next
         * run skips anything already handled.
         */
        if (folder === "spam") {
          const modRes = await fetch(`${GMAIL_API}/messages/${msgs[m].id}/modify`, {
            method: "POST",
            headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
            body: JSON.stringify({ addLabelIds: ["INBOX"], removeLabelIds: ["SPAM"] }),
          });
          if (!modRes.ok) {
            console.error("[warmup-orchestrator] spam recovery failed:", msgs[m].id, modRes.status);
            continue;
          }
          recovered++;
        }

        if (wmId) {
          /*
           * One observation, kept. `folder_detected` is where the recipient's
           * mailbox put the message on arrival, which is a fact about one
           * moment: the `is null` guard means a later pass can never rewrite a
           * recorded 'spam' as 'inbox' after we moved it there ourselves.
           * get_deliverability_live_stats reads this column for warmup_spam,
           * and the reputation score deducts up to 25 points on it.
           */
          await supabase
            .from("warmup_messages")
            .update({ folder_detected: folder, recipient_message_id: msgs[m].id })
            .eq("id", wmId)
            .eq("to_account_id", acct.account_id)
            .is("folder_detected", null);
        }

        /*
         * Reply to roughly half of what arrives, chosen by the row id rather
         * than by position in the list, so the choice is stable per message
         * instead of shifting as the list changes.
         */
        const replyThis = wmId ? parseInt(wmId.slice(0, 8), 16) % 2 === 0 : false;
        if (wmId && replyThis && replyAllowance > 0) {
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
              if (reply) {
                await supabase.from("warmup_messages").update({ replied_at: new Date().toISOString() }).eq("id", wmId);
                replied++;
                replyAllowance--;
              }
            }
          }
        }
      }

      // Record the scan whether or not it found anything, so the rotation
      // moves on instead of re-picking the same mailbox next run.
      await supabase.from("warmup_pool").update({ last_scan_at: new Date().toISOString() }).eq("sending_account_id", acct.account_id);
    }

    const ranOut = outOfTime();
    console.log(`[warmup-orchestrator] sent=${sent} replied=${replied} recovered=${recovered} scanned=${scanned}/${sendable.length} pool=${sendable.length} budgetHit=${ranOut}`);
    return json({
      ok: true, poolRows: rows.length, eligible: eligible.length, tokened: sendable.length,
      sent, replied, recovered,
      // Said out loud rather than inferred from a truncated log: a pool larger
      // than one run can scan finishes the rest on the next run, oldest first.
      scanned, budgetHit: ranOut,
    });
  } catch (err) {
    console.error("[warmup-orchestrator] error:", err);
    return json({ error: "warmup orchestration failed" }, 500);
  }
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

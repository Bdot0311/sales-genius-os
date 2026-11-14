import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@^2.76.1";
import {
  type CacheClient,
  emailVerificationCheckedAt,
  hasPaidVerifier,
  invalidateEmailVerification,
  verifyEmail,
} from "../_shared/email-verify.ts";

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

    /*
     * A wall-clock budget, because re-verification is a network call per
     * address and this function had none.
     */
    const startedAt = Date.now();
    const BUDGET_MS = 50_000;
    const outOfTime = () => Date.now() - startedAt > BUDGET_MS;
    // Belt as well as braces: a hard ceiling on paid checks per run.
    const MAX_VERIFICATIONS = 50;
    let verifications = 0;
    let reverified = 0;
    const pending: {
      bounceId: string;
      leadId: string | null;
      email: string;
      type: string;
      code: string | null;
      detectedAt: string;
    }[] = [];

    /** Addresses this run has already re-checked. See the use below. */
    const checkedThisRun = new Set<string>();

    /*
     * What one bounce teaches us about one address, in one place.
     *
     * The inline path and the catch-up sweep both come through here so the
     * two cannot drift — the thing that has gone wrong repeatedly today is a
     * decision implemented correctly in one place and not the other.
     *
     * Returns whether the bounce is finished with, so the caller counts
     * confirmed work rather than attempts.
     */
    const applyBounceToLead = async (
      bounceId: string,
      leadId: string | null,
      email: string,
      type: string,
      code: string | null,
      detectedAt: string,
    ): Promise<boolean> => {
      /*
       * "hard" is not the same as "proven bad".
       *
       * classifyBounce tests the hard regex before the 4xx test, and that
       * regex contains "mailbox unavailable" — which is exactly the wording
       * of a TEMPORARY 450. So a mailbox that is merely full arrives here
       * classified hard, and marking the lead invalid on it discards a real
       * prospect permanently. Only a 5xx says the address is gone; anything
       * else gets checked rather than assumed.
       */
      const permanentlyBad = type === "hard" && /^5/.test(code ?? "");

      let status: string | null = null;
      if (permanentlyBad) {
        status = "invalid";
      } else {
        const cacheClient = adminClient as unknown as CacheClient;
        /*
         * One question decides everything here: was the stored verdict
         * obtained before this bounce, or after it?
         *
         * Before — which is the ordinary case, since the cache holds for
         * thirty days and the bounce is the newest evidence there is — the
         * entry has to go, or verifyEmail hands back the pre-bounce answer
         * and a fresh date gets stamped on a check that never happened, on
         * the one piece of evidence the bounce has already contradicted.
         *
         * After, the answer this row exists to obtain has already been
         * bought: by another bounce for the same address, this run or an
         * earlier one, or by an earlier attempt on this very row that
         * answered the address and then failed to record that it had.
         * Leaving the entry alone makes the verifyEmail call below a cache
         * read — free, no credit, no budget slot — and the verdict still
         * reaches the lead and the row still leaves the queue.
         */
        const checkedAt = await emailVerificationCheckedAt(cacheClient, email);
        const needsFreshCheck = !checkedAt || checkedAt.getTime() <= Date.parse(detectedAt);

        if (needsFreshCheck && (verifications >= MAX_VERIFICATIONS || outOfTime())) {
          // Out of budget or over the ceiling. Left queued, not dropped.
          return false;
        }
        // Only a real check is charged against the run's budget.
        if (needsFreshCheck) verifications++;

        try {
          /*
           * `checkedThisRun` is a second line, not the first one.
           *
           * The timestamp above already collapses repeats, because the first
           * check of the run rewrites the entry. It only fails to if that
           * write itself failed — cacheSet swallows its errors — and then
           * every later bounce for the address would invalidate and pay
           * again. This set holds that line without depending on the cache
           * having worked.
           */
          if (needsFreshCheck && !checkedThisRun.has(email)) {
            await invalidateEmailVerification(cacheClient, email);
          }
          const verdict = await verifyEmail(cacheClient, email);
          checkedThisRun.add(email);
          /*
           * 'unknown' proves nothing — the provider was down, or the domain
           * accepts everything. Writing it would replace a real earlier
           * answer with an absence, so the previous verdict stands and this
           * bounce stays queued for another run to try again.
           */
          if (verdict.status === "unknown") return false;
          status = verdict.status;
        } catch (verifyErr) {
          console.error(
            `Re-verification failed for ${email}:`,
            verifyErr instanceof Error ? verifyErr.message : verifyErr,
          );
          return false;
        }
      }

      if (leadId && status) {
        /*
         * Matched on the address as well as the lead. A bounce can arrive
         * days after the send, and if the address has been corrected in the
         * meantime this verdict belongs to the old one — writing it would
         * condemn the replacement for the predecessor's failure.
         */
        const { error: leadErr, count } = await adminClient
          .from("leads")
          .update({
            email_verification_status: status,
            email_verified: status === "valid",
            email_verified_at: new Date().toISOString(),
          }, { count: "exact" })
          .eq("id", leadId)
          .eq("user_id", user.id)
          .ilike("contact_email", email);
        if (leadErr) {
          // Counted as unfinished so the sweep retries it.
          console.error(`Lead verdict not written:`, leadErr.message);
          return false;
        }
        if ((count ?? 0) > 0) reverified++;
      }

      /*
       * Only now is the work finished. Reporting completion without checking
       * this write would count the row done while it stayed queued — and the
       * next attempt would clear the cache it just paid to fill.
       */
      const { error: doneErr } = await adminClient
        .from("bounce_events")
        .update({ reverified_at: new Date().toISOString() })
        .eq("id", bounceId);
      if (doneErr) {
        console.error(`Bounce ${bounceId} not marked re-verified:`, doneErr.message);
        return false;
      }
      return true;
    };

    /*
     * Every attempt is stamped, successful or not.
     *
     * An 'unknown' verdict leaves the row queued on purpose, and a queue
     * ordered only by detection date would then hand the same unanswerable
     * addresses the whole budget on every run while everything behind them
     * waited for ever.
     */
    const attemptBounce = async (
      bounceId: string,
      leadId: string | null,
      email: string,
      type: string,
      code: string | null,
      detectedAt: string,
    ): Promise<boolean> => {
      const done = await applyBounceToLead(bounceId, leadId, email, type, code, detectedAt);
      await adminClient
        .from("bounce_events")
        .update({ reverification_attempted_at: new Date().toISOString() })
        .eq("id", bounceId);
      return done;
    };

    // Recent sends we could still learn a bounce for.
    const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
    const { data: recentSends } = await adminClient
      .from("sent_emails")
      // lead_id, because a bounce teaches us something about the lead's
      // address and the verdict has to have somewhere to go.
      .select("id, lead_id, to_email, sent_at, sending_account_id, status")
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

          /*
           * The record of the bounce is written BEFORE the send is marked.
           *
           * Marking first and recording second loses work whenever the
           * recording fails: the send is already 'bounced', the query at the
           * top of this function only looks at sends that are not, and the
           * re-check this bounce was supposed to buy is gone for good with
           * nothing left to say it was owed.
           *
           * Written first, a failure here leaves the send untouched and the
           * next run simply finds the same bounce again.
           */
          const { data: existing } = await adminClient
            .from("bounce_events")
            .select("id")
            .eq("sent_email_id", send.id)
            .maybeSingle();

          let bounceId = existing?.id as string | undefined;
          if (!bounceId) {
            const { data: inserted, error: insErr } = await adminClient
              .from("bounce_events")
              .insert({
                user_id: user.id,
                sending_account_id: send.sending_account_id,
                sent_email_id: send.id,
                to_email: recipient,
                bounce_type: type,
                reason: (message.snippet || "").slice(0, 500),
                smtp_code: code,
                detected_at: detectedAt,
                // Null until the address has been re-checked because of this
                // bounce. The sweep picks up whatever a run cannot reach.
                reverified_at: null,
              })
              .select("id")
              .maybeSingle();
            if (insErr || !inserted?.id) {
              console.error(
                `Bounce not recorded for ${send.id}, leaving the send unmarked so the next run retries:`,
                insErr?.message ?? "no row returned",
              );
              continue;
            }
            bounceId = inserted.id as string;
          }
          pending.push({ bounceId, leadId: send.lead_id, email: recipient, type, code, detectedAt });

          const { error: upErr } = await adminClient
            .from("sent_emails")
            .update({ status: "bounced", agent_thread_status: "closed" })
            .eq("id", send.id)
            .eq("user_id", user.id);
          if (upErr) {
            /*
             * The bounce is recorded, so the re-check is safe; the send just
             * is not marked. The next run finds it again and the lookup above
             * reuses this row rather than writing a second one.
             */
            console.error(`Failed to mark bounce on ${send.id}:`, upErr.message);
            continue;
          }

          /*
           * Give the allowance back.
           *
           * Both caps leave 'bounced' out of the statuses they count, so a
           * bounce has never been meant to spend a paid allowance. Flipping
           * the status alone stopped achieving that once the allowance moved
           * to an append-only ledger: the ledger row outlived the bounce and
           * greatest() kept the higher number, so the account least able to
           * fix the problem burned its day's sends on mail nobody received.
           *
           * Idempotent on the server, so a DSN delivered twice credits once.
           */
          const { error: creditErr } = await adminClient.rpc("credit_bounced_send", {
            _sent_email_id: send.id,
          });
          if (creditErr) {
            console.error(`Failed to credit the allowance for ${send.id}:`, creditErr.message);
          }

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

    /*
     * This run's own bounces first, then the backlog.
     *
     * Order matters: a bounce detected moments ago is the one whose lead is
     * most likely to be mailed again soon, so it gets the budget before older
     * work that has already waited.
     */
    for (const p of pending) {
      if (outOfTime()) break;
      await attemptBounce(p.bounceId, p.leadId, p.email, p.type, p.code, p.detectedAt);
    }

    /*
     * The catch-up sweep: bounces a previous run recorded but could not
     * re-verify. Without this, anything the budget or the ceiling skipped was
     * lost for good — the send is already marked 'bounced', and the query at
     * the top of this function only looks at sends that are not.
     */
    let sweptBacklog = 0;
    if (!outOfTime() && verifications < MAX_VERIFICATIONS) {
      const { data: backlog } = await adminClient
        .from("bounce_events")
        .select("id, to_email, bounce_type, smtp_code, sent_email_id, detected_at")
        .eq("user_id", user.id)
        .is("reverified_at", null)
        .gte("detected_at", since)
        // Never tried first, then least recently tried: an address that
        // cannot be resolved must not starve the ones behind it.
        .order("reverification_attempted_at", { ascending: true, nullsFirst: true })
        .order("detected_at", { ascending: true })
        .limit(MAX_VERIFICATIONS);

      for (const b of backlog ?? []) {
        if (outOfTime() || verifications >= MAX_VERIFICATIONS) break;
        // The lead is on the send this bounce belongs to.
        const { data: src } = await adminClient
          .from("sent_emails")
          .select("lead_id")
          .eq("id", b.sent_email_id)
          .maybeSingle();
        const done = await attemptBounce(
          b.id as string,
          (src?.lead_id as string | null) ?? null,
          b.to_email as string,
          b.bounce_type as string,
          (b.smtp_code as string | null) ?? null,
          b.detected_at as string,
        );
        if (done) sweptBacklog++;
      }
    }

    return new Response(JSON.stringify({
      success: true,
      bounces,
      detected,
      // What the backlog sweep got through, so a growing queue is visible
      // rather than something you learn about from stale lead data.
      swept_backlog: sweptBacklog,
      // Said out loud rather than left to be inferred from the lead rows:
      // how many addresses a bounce taught us something about, and whether
      // the paid handshake was available to teach it.
      reverified,
      verification_available: hasPaidVerifier(),
      budget_hit: outOfTime(),
    }), {
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

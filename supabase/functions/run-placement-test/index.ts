// run-placement-test — inbox-vs-spam placement testing via a seed inbox.
//
// The user's mailbox sends a tagged test email to a Gmail seed inbox we can read;
// we then read that inbox to see where it landed (inbox / spam / promotions).
// Gmail placement is real. Outlook/Yahoo require seed accounts on those providers
// and are reported as 'unsupported' — never a fabricated percentage.
//
// Seed selection (in order):
//   1. The platform seed inbox (DELIVERABILITY_SEED_GMAIL_*) when its refresh
//      token still works.
//   2. Another of the user's own connected Gmail mailboxes. This is what keeps
//      the feature working when the platform seed's refresh token is revoked —
//      previously that failure came back as a silent 502 and the UI span forever.
//
// The seed actually used is stored on the test row (placement_tests.seed_email)
// so the collect step reads the same inbox that received the message.
//
// Two actions (POST body): { action: "start", sendingAccountId } and
// { action: "collect", testId }. The caller is authenticated via bearer token;
// DB writes use the service role (placement_results has no user INSERT policy).

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

import { readFailureEndsTest, seedFailureMessage } from "../_shared/placement-seed.ts";

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GMAIL_API = "https://gmail.googleapis.com/gmail/v1/users/me";

function toBase64Url(str: string): string {
  return btoa(unescape(encodeURIComponent(str))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * Why a token exchange failed, carried on the return value.
 *
 * Google says exactly what is wrong — invalid_grant for a revoked or expired
 * refresh token, unauthorized_client for a mismatched app — and that answer
 * went to a console log the user cannot read, while they were shown a generic
 * sentence telling them to reconnect a mailbox they may not even own.
 *
 * It was then held in a mutable variable at module scope (named for the last
 * token error; not quoted here, because the test guarding this asserts the
 * identifier is gone from the file). Edge functions reuse one isolate across
 * concurrent invocations, so a variable up there is shared by every request in
 * flight: one account's failure could be read out in another account's
 * response, naming a mailbox and an error that had nothing to do with them.
 * Returning the reason keeps each request's own.
 */
interface TokenResult {
  token: string | null;
  error: string | null;
}

async function accessTokenFromRefresh(refreshToken: string): Promise<TokenResult> {
  const clientId = Deno.env.get("GOOGLE_CLIENT_ID");
  const clientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET");
  if (!clientId || !clientSecret) {
    return { token: null, error: "Google OAuth credentials are not configured on the server" };
  }
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken, grant_type: "refresh_token" }).toString(),
  });
  if (!res.ok) {
    const body = await res.text();
    console.error("seed token refresh failed:", res.status, body.slice(0, 300));
    let code = "";
    try { code = String(JSON.parse(body)?.error ?? ""); } catch { code = ""; }
    return {
      token: null,
      error: code
        ? `Google refused the token: ${code}`
        : `Google refused the token (HTTP ${res.status})`,
    };
  }
  const j = await res.json();
  return { token: j.access_token ?? null, error: null };
}

interface MailboxToken {
  token: string;
  email: string;
}

// deno-lint-ignore no-explicit-any
async function tokenForIntegration(admin: any, integrationId: string): Promise<{ mailbox: MailboxToken | null; error: string | null }> {
  const { data: integ } = await admin.from("integrations").select("id, config, connected_email").eq("id", integrationId).maybeSingle();
  if (!integ) return { mailbox: null, error: "That mailbox is no longer connected." };
  const config = (integ.config ?? {}) as Record<string, unknown>;
  let token = (config.accessToken as string) || (config.provider_token as string) || "";
  const email = (integ.connected_email as string) || (config.connected_email as string) || (config.googleEmail as string) || "";
  const expiresAt = config.expiresAt as number | undefined;
  const refreshToken = config.refreshToken as string | undefined;
  let error: string | null = null;
  // Refresh proactively: a missing expiry used to mean "assume valid", which
  // sends/reads with a dead token and Gmail answers 401.
  if ((!token || !expiresAt || Date.now() >= expiresAt - 120_000) && refreshToken) {
    const fresh = await accessTokenFromRefresh(refreshToken);
    error = fresh.error;
    if (fresh.token) {
      token = fresh.token;
      await admin.from("integrations").update({ config: { ...config, accessToken: fresh.token, expiresAt: Date.now() + 3300 * 1000 } }).eq("id", integrationId);
    }
  }
  return token ? { mailbox: { token, email }, error: null } : { mailbox: null, error };
}

/** Read a mailbox we can access: the platform seed, or one of the user's own. */
// deno-lint-ignore no-explicit-any
async function seedReadToken(admin: any, userId: string, seedEmail: string): Promise<TokenResult> {
  const platformAddress = (Deno.env.get("DELIVERABILITY_SEED_GMAIL_ADDRESS") ?? "").toLowerCase();
  const platformRefresh = Deno.env.get("DELIVERABILITY_SEED_GMAIL_REFRESH");
  if (platformRefresh && seedEmail.toLowerCase() === platformAddress) {
    return await accessTokenFromRefresh(platformRefresh);
  }
  const { data: integs } = await admin
    .from("integrations")
    .select("id, connected_email, config")
    .eq("user_id", userId)
    .eq("integration_id", "google")
    .eq("is_active", true);
  for (const i of integs ?? []) {
    const cfg = (i.config ?? {}) as Record<string, unknown>;
    const email = ((i.connected_email as string) || (cfg.connected_email as string) || (cfg.googleEmail as string) || "").toLowerCase();
    if (email === seedEmail.toLowerCase()) {
      const t = await tokenForIntegration(admin, i.id as string);
      return { token: t.mailbox?.token ?? null, error: t.error };
    }
  }
  return { token: null, error: `${seedEmail} is no longer connected to this account.` };
}

/**
 * One of the user's own Gmail mailboxes that a test could measure against.
 *
 * The sending mailbox is excluded on purpose: Gmail does not spam-filter mail a
 * account sends to itself, so measuring there would report "inbox" for every
 * send regardless of reputation — a number worse than no number.
 *
 * Both the seed choice and the failure message need this answer, and the
 * message used to assume it rather than ask.
 */
// deno-lint-ignore no-explicit-any
async function findFallbackSeed(admin: any, userId: string, excludeIntegrationId?: string | null): Promise<string | null> {
  const { data: integs } = await admin
    .from("integrations")
    .select("id, connected_email, config")
    .eq("user_id", userId)
    .eq("integration_id", "google")
    .eq("is_active", true);
  for (const i of integs ?? []) {
    if (excludeIntegrationId && i.id === excludeIntegrationId) continue;
    const cfg = (i.config ?? {}) as Record<string, unknown>;
    const email = (i.connected_email as string) || (cfg.connected_email as string) || (cfg.googleEmail as string) || "";
    if (!email) continue;
    const t = await tokenForIntegration(admin, i.id as string);
    if (t.mailbox?.token) return email;
  }
  return null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    // Authenticate the caller.
    const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    if (!token) return json({ error: "Unauthorized" }, 401);
    const anon = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_ANON_KEY") ?? "");
    const { data: { user }, error: userErr } = await anon.auth.getUser(token);
    if (userErr || !user) return json({ error: "Unauthorized" }, 401);

    // Service-role client for writes (placement_results has no user INSERT policy).
    const admin = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return json({ error: "Missing or invalid request body" }, 400);
    }
    const { action, sendingAccountId, testId } = body as { action?: string; sendingAccountId?: string; testId?: string };

    // ---------- START ----------
    if (action === "start") {
      const { data: acct } = await admin
        .from("sending_accounts")
        .select("id, email, integration_id, status")
        .eq("id", sendingAccountId)
        .eq("user_id", user.id)
        .maybeSingle();
      if (!acct) return json({ error: "Sending account not found" }, 404);
      if (acct.status !== "active") return json({ error: "This mailbox is paused; resume it before testing." }, 409);
      if (!acct.integration_id) return json({ error: "This mailbox has no connected Gmail integration." }, 400);

      const sender = await tokenForIntegration(admin, acct.integration_id);
      if (!sender.mailbox) {
        return json({
          error: sender.error
            ? `Could not get a Gmail token for this mailbox. ${sender.error}`
            : "Could not get a Gmail token for this mailbox. Reconnect Gmail.",
        }, 400);
      }

      // Pick a readable seed inbox.
      let seedEmail = "";
      let platformSeedError: string | null = null;
      const platformAddress = Deno.env.get("DELIVERABILITY_SEED_GMAIL_ADDRESS");
      const platformRefresh = Deno.env.get("DELIVERABILITY_SEED_GMAIL_REFRESH");
      if (platformAddress && platformRefresh) {
        const platform = await accessTokenFromRefresh(platformRefresh);
        if (platform.token) seedEmail = platformAddress;
        else platformSeedError = platform.error;
      }
      if (!seedEmail) {
        // Fall back to one of the user's other connected Gmail mailboxes.
        seedEmail = (await findFallbackSeed(admin, user.id, acct.integration_id)) ?? "";
      }

      if (!seedEmail) {
        // Two different situations wore the same sentence. "No seed is
        // configured" is an operator problem the reader cannot touch; "our
        // shared seed is down and you have no second mailbox" is theirs to
        // solve by connecting one. Saying which is which is the difference
        // between an instruction and a shrug.
        return json({
          error: "seed_not_configured",
          message: platformSeedError
            ? `Our shared seed inbox is not answering right now (${platformSeedError}), and measuring ` +
              `placement needs a second inbox we can read — a mailbox cannot measure its own. Connect ` +
              `another Gmail on the Integrations page and run the test again.`
            : `Placement testing needs a second inbox to measure against. Connect another Gmail ` +
              `mailbox on the Integrations page and run the test again.`,
        }, 400);
      }

      const marker = `orpt-${crypto.randomUUID().replace(/-/g, "")}`;
      // The marker goes in the SUBJECT as well as the body: Gmail's search index
      // is far more reliable on subject terms, and a body-only marker is what
      // made collect return "not found" forever.
      const subject = `OutReign deliverability test ${marker}`;
      const text = `This is an automated OutReign inbox-placement test. No action needed.\n\nref: ${marker}`;

      const { data: test, error: testErr } = await admin.from("placement_tests").insert({
        user_id: user.id,
        sending_account_id: acct.id,
        subject: marker,
        seed_email: seedEmail,
        status: "running",
      }).select("id").single();
      if (testErr || !test) {
        console.error("[run-placement-test] insert failed:", testErr);
        return json({ error: "Could not create test" }, 500);
      }

      const mime = [
        `From: ${sender.mailbox.email || acct.email}`,
        `To: ${seedEmail}`,
        `Subject: ${subject}`,
        "Content-Type: text/plain; charset=UTF-8",
        "", text,
      ].join("\r\n");
      const sendRes = await fetch(`${GMAIL_API}/messages/send`, {
        method: "POST",
        headers: { Authorization: `Bearer ${sender.mailbox.token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ raw: toBase64Url(mime) }),
      });

      if (!sendRes.ok) {
        const detail = await sendRes.text();
        console.error("[run-placement-test] send failed:", sendRes.status, detail.slice(0, 300));
        await admin.from("placement_tests").update({ status: "failed", completed_at: new Date().toISOString() }).eq("id", test.id);
        return json({ error: "Failed to send the test email from your mailbox." }, 502);
      }

      // Seed record: Gmail pending, other providers unsupported (no seed there).
      await admin.from("placement_results").insert([
        { test_id: test.id, provider: "gmail", placement: "pending" },
        { test_id: test.id, provider: "outlook", placement: "unsupported", detail: "No Outlook seed inbox configured" },
        { test_id: test.id, provider: "yahoo", placement: "unsupported", detail: "No Yahoo seed inbox configured" },
      ]);

      // The seed goes back to the caller so the panel can name the inbox it is
      // measuring against. Without it the user watches a test run with no idea
      // what it is measuring, which is what made a seed failure read as the
      // whole feature being broken.
      return json({ testId: test.id, marker, seedEmail, status: "running" });
    }

    // ---------- COLLECT ----------
    if (action === "collect") {
      const { data: test } = await admin
        .from("placement_tests")
        .select("id, subject, status, seed_email, sending_account_id")
        .eq("id", testId)
        .eq("user_id", user.id)
        .maybeSingle();
      if (!test) return json({ error: "Test not found" }, 404);

      const seedEmail = (test.seed_email as string) || Deno.env.get("DELIVERABILITY_SEED_GMAIL_ADDRESS") || "";
      const seed = seedEmail
        ? await seedReadToken(admin, user.id, seedEmail)
        : { token: null, error: null };
      if (!seed.token) {
        // A transient read failure is not a placement verdict and not a dead
        // test: the email is sitting in the seed inbox either way, so the
        // result is still there to be collected — the reasoning the "missing"
        // branch below already applies. A revoked refresh token is the other
        // case: every later check returns the identical error, so leaving the
        // row `running` parks it forever behind a "Check again" that cannot
        // succeed. One such test sat unresolved on the timeline for ten days.
        const terminal = readFailureEndsTest(seed.error);
        if (terminal) {
          await admin.from("placement_tests").update({ status: "failed", completed_at: new Date().toISOString() }).eq("id", test.id);
        }
        const { data: acctRow } = await admin
          .from("sending_accounts")
          .select("integration_id")
          .eq("id", test.sending_account_id)
          .maybeSingle();
        return json({
          error: "seed_unavailable",
          terminal,
          message: seedFailureMessage({
            seedEmail,
            platformAddress: Deno.env.get("DELIVERABILITY_SEED_GMAIL_ADDRESS"),
            reason: seed.error,
            // Asked rather than assumed. The message used to promise a re-run
            // would measure against one of their own mailboxes whether or not
            // they had a second one to measure against.
            fallbackSeed: await findFallbackSeed(admin, user.id, acctRow?.integration_id ?? null),
          }),
        }, 409);
      }

      // Search the seed inbox (including spam) for this test's marker.
      const q = encodeURIComponent(`${test.subject} newer_than:1d`);
      const listRes = await fetch(`${GMAIL_API}/messages?q=${q}&includeSpamTrash=true&maxResults=5`, {
        headers: { Authorization: `Bearer ${seed.token}` },
      });
      if (!listRes.ok) {
        const detail = await listRes.text();
        console.error("[run-placement-test] seed search failed:", listRes.status, detail.slice(0, 300));
        return json({ error: "seed_unavailable", message: "Could not search the seed inbox for the test message." }, 409);
      }
      const list = await listRes.json();
      const msgs: { id: string }[] = list.messages ?? [];

      let placement = "missing";
      if (msgs.length > 0) {
        const getRes = await fetch(`${GMAIL_API}/messages/${msgs[0].id}?format=metadata`, { headers: { Authorization: `Bearer ${seed.token}` } });
        if (getRes.ok) {
          const msg = await getRes.json();
          const labels: string[] = msg.labelIds ?? [];
          placement = labels.includes("SPAM") ? "spam" : labels.includes("CATEGORY_PROMOTIONS") ? "promotions" : "inbox";
        }
      }

      // 'missing' right after sending just means it hasn't arrived yet — keep the
      // test running so a later collect can find it, and only record a definite result.
      if (placement !== "missing") {
        await admin.from("placement_results").update({ placement }).eq("test_id", test.id).eq("provider", "gmail");
        await admin.from("placement_tests").update({ status: "completed", completed_at: new Date().toISOString() }).eq("id", test.id);
      }

      return json({ testId: test.id, gmail: placement, seedEmail });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (err) {
    console.error("[run-placement-test] error:", err);
    return json({ error: "Placement test failed" }, 500);
  }
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

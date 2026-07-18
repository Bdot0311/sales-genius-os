// run-placement-test — inbox-vs-spam placement testing via a seed inbox.
//
// The user's mailbox sends a tagged test email to a Gmail seed inbox we control;
// we then read the seed inbox to see where it landed (inbox / spam / promotions).
// Gmail placement is real. Outlook/Yahoo require seed accounts on those providers
// and are reported as 'unsupported' — never a fabricated percentage.
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

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GMAIL_API = "https://gmail.googleapis.com/gmail/v1/users/me";

function toBase64Url(str: string): string {
  return btoa(unescape(encodeURIComponent(str))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function accessTokenFromRefresh(refreshToken: string): Promise<string | null> {
  const clientId = Deno.env.get("GOOGLE_CLIENT_ID");
  const clientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET");
  if (!clientId || !clientSecret) return null;
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken, grant_type: "refresh_token" }).toString(),
  });
  if (!res.ok) { console.error("seed token refresh failed:", res.status, await res.text()); return null; }
  const j = await res.json();
  return j.access_token ?? null;
}

// deno-lint-ignore no-explicit-any
async function senderAccessToken(admin: any, integrationId: string): Promise<{ token: string; email: string } | null> {
  const { data: integ } = await admin.from("integrations").select("id, config, connected_email").eq("id", integrationId).maybeSingle();
  if (!integ) return null;
  const config = (integ.config ?? {}) as Record<string, unknown>;
  let token = (config.accessToken as string) || (config.provider_token as string) || "";
  const email = (integ.connected_email as string) || (config.connected_email as string) || "";
  const expiresAt = config.expiresAt as number | undefined;
  const refreshToken = config.refreshToken as string | undefined;
  if (expiresAt && Date.now() >= expiresAt && refreshToken) {
    const fresh = await accessTokenFromRefresh(refreshToken);
    if (fresh) {
      token = fresh;
      await admin.from("integrations").update({ config: { ...config, accessToken: fresh, expiresAt: Date.now() + 3300 * 1000 } }).eq("id", integrationId);
    }
  }
  return token ? { token, email } : null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const seedAddress = Deno.env.get("DELIVERABILITY_SEED_GMAIL_ADDRESS");
    const seedRefresh = Deno.env.get("DELIVERABILITY_SEED_GMAIL_REFRESH");
    if (!seedAddress || !seedRefresh) {
      return json({ error: "seed_not_configured", message: "Inbox placement testing needs a Gmail seed inbox. Add DELIVERABILITY_SEED_GMAIL_ADDRESS and DELIVERABILITY_SEED_GMAIL_REFRESH to enable it." }, 400);
    }

    // Authenticate the caller.
    const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    if (!token) return json({ error: "Unauthorized" }, 401);
    const anon = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_ANON_KEY") ?? "");
    const { data: { user }, error: userErr } = await anon.auth.getUser(token);
    if (userErr || !user) return json({ error: "Unauthorized" }, 401);

    // Service-role client for writes (placement_results has no user INSERT policy).
    const admin = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");

    const { action, sendingAccountId, testId } = await req.json();

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

      const sender = await senderAccessToken(admin, acct.integration_id);
      if (!sender?.token) return json({ error: "Could not get a Gmail token for this mailbox. Reconnect Gmail." }, 400);

      const marker = `orpt-${crypto.randomUUID()}`;
      const subject = `Deliverability test ${new Date().toISOString().slice(0, 16).replace("T", " ")}`;
      const body = `This is an automated OutReign inbox-placement test. No action needed.\n\nref: ${marker}`;

      const { data: test, error: testErr } = await admin.from("placement_tests").insert({
        user_id: user.id,
        sending_account_id: acct.id,
        subject: marker,
        status: "running",
      }).select("id").single();
      if (testErr || !test) return json({ error: "Could not create test" }, 500);

      // Send from the user's mailbox to the seed inbox.
      const mime = [
        `From: ${sender.email || acct.email}`,
        `To: ${seedAddress}`,
        `Subject: ${subject}`,
        "Content-Type: text/plain; charset=UTF-8",
        "", body,
      ].join("\r\n");
      const sendRes = await fetch(`${GMAIL_API}/messages/send`, {
        method: "POST",
        headers: { Authorization: `Bearer ${sender.token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ raw: toBase64Url(mime) }),
      });

      if (!sendRes.ok) {
        await admin.from("placement_tests").update({ status: "failed", completed_at: new Date().toISOString() }).eq("id", test.id);
        return json({ error: "Failed to send the test email from your mailbox." }, 502);
      }

      // Seed record: Gmail pending, other providers unsupported (no seed there).
      await admin.from("placement_results").insert([
        { test_id: test.id, provider: "gmail", placement: "pending" },
        { test_id: test.id, provider: "outlook", placement: "unsupported", detail: "No Outlook seed inbox configured" },
        { test_id: test.id, provider: "yahoo", placement: "unsupported", detail: "No Yahoo seed inbox configured" },
      ]);

      return json({ testId: test.id, marker, status: "running" });
    }

    // ---------- COLLECT ----------
    if (action === "collect") {
      const { data: test } = await admin
        .from("placement_tests")
        .select("id, subject, status")
        .eq("id", testId)
        .eq("user_id", user.id)
        .maybeSingle();
      if (!test) return json({ error: "Test not found" }, 404);

      const seedToken = await accessTokenFromRefresh(seedRefresh);
      if (!seedToken) return json({ error: "Could not access the seed inbox." }, 502);

      // Search the seed inbox (including spam) for this test's marker.
      const q = encodeURIComponent(`"${test.subject}" newer_than:1d`);
      const listRes = await fetch(`${GMAIL_API}/messages?q=${q}&includeSpamTrash=true&maxResults=5`, {
        headers: { Authorization: `Bearer ${seedToken}` },
      });
      const list = listRes.ok ? await listRes.json() : { messages: [] };
      const msgs: { id: string }[] = list.messages ?? [];

      let placement = "missing";
      if (msgs.length > 0) {
        const getRes = await fetch(`${GMAIL_API}/messages/${msgs[0].id}?format=metadata`, { headers: { Authorization: `Bearer ${seedToken}` } });
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

      return json({ testId: test.id, gmail: placement });
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

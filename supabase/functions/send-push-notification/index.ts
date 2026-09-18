// Send Web Push notifications via VAPID.
// Auth: requires a logged-in user. Sends to the caller's own subscriptions
// unless an admin passes target_user_id.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import webpush from "https://esm.sh/web-push@3.6.7";
import { checkVapidKeyPair } from "../_shared/vapid-keypair.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
    const VAPID_PUBLIC = "BMAMGlEpD2D7JcjZfJJSGz-6FYFxOa9ZDgubA56oUVl_K00evvZerDCknZoCStVUNAQ6uXXf3kvMFeLoepJCUFU";
    const VAPID_PRIVATE = Deno.env.get("VAPID_PRIVATE_KEY")!;
    const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") || "mailto:support@bdotindustries.com";

    if (!VAPID_PRIVATE) return json(200, { success: false, error: "VAPID_PRIVATE_KEY not configured" });

    /**
     * Prove the signing key pairs with the key the browser registered under,
     * before sending anything.
     *
     * A signature the push service cannot verify comes back 401 or 403 — the
     * same statuses a genuinely refused device gives. So a private key that no
     * longer matches the public one looked identical to every device being
     * rejected, and produced the one piece of advice that cannot possibly work:
     * turn the switch off and on again, which rebuilds the half that was
     * already fine. The public key is a constant in this file and in the
     * client; the private key is a deployment secret. Rotating means changing
     * both, and whichever is missed fails silently and forever.
     */
    const keyCheck = await checkVapidKeyPair(VAPID_PUBLIC, VAPID_PRIVATE);
    if (!keyCheck.ok) {
      console.error(`[send-push-notification] VAPID ${keyCheck.problem}: ${keyCheck.detail}`);
      return json(200, {
        success: true,
        sent: 0,
        failed: 0,
        vapid_problem: keyCheck.problem,
        reason:
          keyCheck.problem === "mismatched"
            ? "Notifications are signed with a key that no longer matches the one your device registered under, so the push service rejects every one. Nothing is wrong with your device; this one is ours to fix."
            : "Sending notifications is not configured correctly on our side. Nothing is wrong with your device; this one is ours to fix.",
      });
    }

    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);

    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace("Bearer ", "");
    if (!token) return json(200, { success: false, error: "Missing auth token" });

    const userClient = createClient(SUPABASE_URL, ANON, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) return json(200, { success: false, error: "Not authenticated" });
    const callerId = userData.user.id;

    const body = await req.json().catch(() => ({}));
    const { title, body: msgBody, url, icon, tag, target_user_id } = body || {};
    if (!title || typeof title !== "string") {
      return json(200, { success: false, error: "title is required" });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    let targetUserId = callerId;
    if (target_user_id && target_user_id !== callerId) {
      const { data: roleData } = await admin
        .from("user_roles")
        .select("role")
        .eq("user_id", callerId)
        .eq("role", "admin")
        .maybeSingle();
      if (!roleData) return json(200, { success: false, error: "Forbidden" });
      targetUserId = target_user_id;
    }

    const { data: subs, error: subErr } = await admin
      .from("push_subscriptions")
      .select("id, endpoint, p256dh_key, auth_key")
      .eq("user_id", targetUserId);
    if (subErr) return json(200, { success: false, error: subErr.message });
    if (!subs || subs.length === 0) {
      // Zero devices and zero deliveries are different failures and need
      // different answers. Settings used to render either one as a green
      // "Test sent to 0 device(s)", which is the single most misleading thing
      // this function could say: it tells someone notifications work at the
      // exact moment they do not.
      return json(200, {
        success: true,
        sent: 0,
        failed: 0,
        reason:
          "No device is registered for notifications on this account. Turn the switch off and on again on the device you want alerts on.",
      });
    }

    const payload = JSON.stringify({
      title,
      body: msgBody || "",
      url: url || "/dashboard",
      icon: icon || "/pwa-192x192.png",
      tag: tag || undefined,
    });

    let sent = 0;
    const stale: string[] = [];
    const statuses: number[] = [];
    await Promise.all(
      subs.map(async (s) => {
        try {
          await webpush.sendNotification(
            { endpoint: s.endpoint, keys: { p256dh: s.p256dh_key, auth: s.auth_key } },
            payload
          );
          sent++;
        } catch (err) {
          const status = (err as { statusCode?: number }).statusCode;
          if (typeof status === "number") statuses.push(status);
          if (status === 404 || status === 410) stale.push(s.id);
          // The provider's own body names the reason (Apple's BadJwtToken, a
          // Google quota rejection). The message alone is usually just the
          // status repeated back.
          const body = (err as { body?: string }).body;
          console.error(
            "push send failed",
            status,
            (err as Error).message,
            body ? String(body).slice(0, 300) : "",
          );
        }
      })
    );

    if (stale.length) {
      await admin.from("push_subscriptions").delete().in("id", stale);
    }

    const failed = subs.length - sent;

    // Only when nothing at all arrived. A partial send is not worth explaining:
    // the notification is on the phone the person is holding.
    let reason: string | undefined;
    if (sent === 0) {
      if (stale.length === subs.length) {
        reason =
          "This device's registration had expired, so it has been removed. Turn the switch off and on again to register it fresh.";
      } else if (statuses.some((st) => st === 401 || st === 403)) {
        // The signing key has already been proven to pair with the registered
        // one above, so a refusal here really is about this device.
        reason =
          "The push service refused this device's registration. Turn the switch off and on again to register it fresh.";
      } else {
        const st = statuses[0];
        reason = st
          ? `The push service could not deliver to this device (HTTP ${st}).`
          : "The push service could not deliver to this device.";
      }
    }

    return json(200, { success: true, sent, failed, removed_stale: stale.length, reason });
  } catch (e) {
    console.error("send-push-notification error", e);
    return json(200, { success: false, error: (e as Error).message });
  }
});

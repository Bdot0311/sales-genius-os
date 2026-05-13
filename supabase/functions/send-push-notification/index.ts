// Send Web Push notifications via VAPID.
// Auth: requires a logged-in user. Sends to the caller's own subscriptions
// unless an admin passes target_user_id.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import webpush from "https://esm.sh/web-push@3.6.7";

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
    const VAPID_PUBLIC = "BLnZWkSds4tox8rY3fVPQ5ZJ5VQGKjBpJS3tsWp_wTASDBIvLmr_zWkkbKKygDz64EFAPT-uY0uoql7v5_KqVb8";
    const VAPID_PRIVATE = Deno.env.get("VAPID_PRIVATE_KEY")!;
    const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") || "mailto:support@bdotindustries.com";

    if (!VAPID_PRIVATE) return json(200, { success: false, error: "VAPID_PRIVATE_KEY not configured" });

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
      return json(200, { success: true, sent: 0, message: "No subscriptions" });
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
          if (status === 404 || status === 410) stale.push(s.id);
          console.error("push send failed", status, (err as Error).message);
        }
      })
    );

    if (stale.length) {
      await admin.from("push_subscriptions").delete().in("id", stale);
    }

    return json(200, { success: true, sent, removed_stale: stale.length });
  } catch (e) {
    console.error("send-push-notification error", e);
    return json(200, { success: false, error: (e as Error).message });
  }
});

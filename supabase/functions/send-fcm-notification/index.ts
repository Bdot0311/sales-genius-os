// Send push notifications through Firebase Cloud Messaging (HTTP v1) via the
// Lovable connector gateway. Auth: requires a signed-in user. Sends to the
// caller's own devices unless an admin passes target_user_id.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const GATEWAY_URL = "https://connector-gateway.lovable.dev/firebase_messaging";

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
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const CONNECTION_KEY = Deno.env.get("FIREBASE_MESSAGING_API_KEY");

    if (!LOVABLE_API_KEY) return json(200, { success: false, error: "LOVABLE_API_KEY is not configured" });
    if (!CONNECTION_KEY) {
      return json(200, { success: false, error: "FIREBASE_MESSAGING_API_KEY is not configured" });
    }

    const token = (req.headers.get("Authorization") || "").replace("Bearer ", "");
    if (!token) return json(200, { success: false, error: "Missing auth token" });

    const userClient = createClient(SUPABASE_URL, ANON, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) return json(200, { success: false, error: "Not authenticated" });
    const callerId = userData.user.id;

    const body = await req.json().catch(() => ({}));
    const { title, body: msgBody, url, icon, tag, target_user_id } = body || {};
    if (!title || typeof title !== "string" || title.length > 200) {
      return json(200, { success: false, error: "title is required (max 200 chars)" });
    }
    if (msgBody != null && (typeof msgBody !== "string" || msgBody.length > 1000)) {
      return json(200, { success: false, error: "body must be a string under 1000 chars" });
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

    const { data: devices, error: devErr } = await admin
      .from("fcm_tokens")
      .select("id, token")
      .eq("user_id", targetUserId);
    if (devErr) return json(200, { success: false, error: devErr.message });
    if (!devices || devices.length === 0) {
      return json(200, { success: true, sent: 0, message: "No registered devices" });
    }

    const headers = {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "X-Connection-Api-Key": CONNECTION_KEY,
      "Content-Type": "application/json",
    };

    // Data-only payload so the service worker controls rendering on every platform.
    const data: Record<string, string> = {
      title,
      body: typeof msgBody === "string" ? msgBody : "",
      url: typeof url === "string" ? url : "/dashboard",
      icon: typeof icon === "string" ? icon : "/pwa-192x192.png",
    };
    if (typeof tag === "string" && tag) data.tag = tag;

    let sent = 0;
    const stale: string[] = [];
    const errors: string[] = [];

    await Promise.all(
      devices.map(async (device) => {
        const res = await fetch(`${GATEWAY_URL}/v1/projects/_/messages:send`, {
          method: "POST",
          headers,
          body: JSON.stringify({
            message: {
              token: device.token,
              data,
              webpush: {
                notification: { title, body: data.body, icon: data.icon },
                fcm_options: { link: data.url },
              },
            },
          }),
        });

        if (res.ok) {
          sent++;
          return;
        }

        const text = await res.text();
        console.error(`FCM send failed [${res.status}]: ${text}`);
        // 404 UNREGISTERED / 400 INVALID_ARGUMENT means the token is dead.
        if (res.status === 404 || res.status === 400) stale.push(device.id);
        else errors.push(`${res.status}: ${text}`);
      })
    );

    if (stale.length) {
      await admin.from("fcm_tokens").delete().in("id", stale);
    }

    return json(200, {
      success: sent > 0 || errors.length === 0,
      sent,
      removed_stale: stale.length,
      errors: errors.length ? errors : undefined,
    });
  } catch (e) {
    console.error("send-fcm-notification error", e);
    return json(200, { success: false, error: (e as Error).message });
  }
});

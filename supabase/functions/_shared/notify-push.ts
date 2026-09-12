// Fire-and-forget Web Push delivery for in-app events (agent activity, new
// replies, pipeline changes). Never throws — notifications must not break the
// work that triggered them.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import webpush from "https://esm.sh/web-push@3.6.7";

const VAPID_PUBLIC =
  "BLnZWkSds4tox8rY3fVPQ5ZJ5VQGKjBpJS3tsWp_wTASDBIvLmr_zWkkbKKygDz64EFAPT-uY0uoql7v5_KqVb8";

export interface PushPayload {
  title: string;
  body?: string;
  url?: string;
  tag?: string;
}

export async function notifyUserPush(userId: string, payload: PushPayload): Promise<number> {
  try {
    const privateKey = Deno.env.get("VAPID_PRIVATE_KEY");
    if (!privateKey || !userId) return 0;
    webpush.setVapidDetails(
      Deno.env.get("VAPID_SUBJECT") || "mailto:support@bdotindustries.com",
      VAPID_PUBLIC,
      privateKey,
    );

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: subs } = await admin
      .from("push_subscriptions")
      .select("id, endpoint, p256dh_key, auth_key")
      .eq("user_id", userId);
    if (!subs || subs.length === 0) return 0;

    const body = JSON.stringify({
      title: payload.title,
      body: payload.body ?? "",
      url: payload.url ?? "/dashboard",
      icon: "/pwa-192x192.png",
      tag: payload.tag,
    });

    let sent = 0;
    const stale: string[] = [];
    await Promise.all(
      subs.map(async (s) => {
        try {
          await webpush.sendNotification(
            { endpoint: s.endpoint, keys: { p256dh: s.p256dh_key, auth: s.auth_key } },
            body,
          );
          sent++;
        } catch (err) {
          const status = (err as { statusCode?: number }).statusCode;
          if (status === 404 || status === 410) stale.push(s.id);
          console.error("notifyUserPush failed", status, (err as Error).message);
        }
      }),
    );
    if (stale.length) await admin.from("push_subscriptions").delete().in("id", stale);
    return sent;
  } catch (e) {
    console.error("notifyUserPush error", (e as Error).message);
    return 0;
  }
}

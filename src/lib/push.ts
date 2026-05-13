// Web Push subscription helpers
import { supabase } from "@/integrations/supabase/client";

export const VAPID_PUBLIC_KEY =
  "BLnZWkSds4tox8rY3fVPQ5ZJ5VQGKjBpJS3tsWp_wTASDBIvLmr_zWkkbKKygDz64EFAPT-uY0uoql7v5_KqVb8";

const SW_PATH = "/push-sw.js";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i);
  return output;
}

function arrayBufferToBase64(buffer: ArrayBuffer | null): string {
  if (!buffer) return "";
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

export function isPushSupported(): boolean {
  if (typeof window === "undefined") return false;
  // Avoid registering inside the Lovable preview iframe.
  let inIframe = false;
  try {
    inIframe = window.self !== window.top;
  } catch {
    inIframe = true;
  }
  const isPreviewHost =
    window.location.hostname.includes("id-preview--") ||
    window.location.hostname.includes("lovableproject.com");
  if (inIframe || isPreviewHost) return false;
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

export async function getPushPermission(): Promise<NotificationPermission> {
  if (!("Notification" in window)) return "denied";
  return Notification.permission;
}

async function registerPushSW(): Promise<ServiceWorkerRegistration> {
  // Use a dedicated scope so it does not collide with the kill-switch /sw.js.
  return navigator.serviceWorker.register(SW_PATH, { scope: "/push-sw/" });
}

export async function getCurrentSubscription(): Promise<PushSubscription | null> {
  if (!isPushSupported()) return null;
  try {
    const reg = await navigator.serviceWorker.getRegistration("/push-sw/");
    if (!reg) return null;
    return await reg.pushManager.getSubscription();
  } catch {
    return null;
  }
}

export async function subscribeToPush(): Promise<PushSubscription> {
  if (!isPushSupported()) {
    throw new Error("Push notifications are not supported in this environment.");
  }

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    throw new Error("Notification permission was not granted.");
  }

  const reg = await registerPushSW();
  await navigator.serviceWorker.ready;

  let subscription = await reg.pushManager.getSubscription();
  if (!subscription) {
    subscription = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });
  }

  const json = subscription.toJSON();
  const p256dh = json.keys?.p256dh ?? arrayBufferToBase64(subscription.getKey("p256dh"));
  const auth = json.keys?.auth ?? arrayBufferToBase64(subscription.getKey("auth"));

  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) throw new Error("You must be signed in to enable notifications.");

  const { error } = await supabase
    .from("push_subscriptions")
    .upsert(
      {
        user_id: userId,
        endpoint: subscription.endpoint,
        p256dh_key: p256dh,
        auth_key: auth,
        user_agent: navigator.userAgent,
      },
      { onConflict: "endpoint" }
    );
  if (error) throw error;

  return subscription;
}

export async function unsubscribeFromPush(): Promise<void> {
  const sub = await getCurrentSubscription();
  if (!sub) return;
  const endpoint = sub.endpoint;
  try {
    await sub.unsubscribe();
  } catch {}
  await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint);
}

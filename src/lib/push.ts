// Web Push subscription helpers
import { supabase } from "@/integrations/supabase/client";

export const VAPID_PUBLIC_KEY =
  "BMAMGlEpD2D7JcjZfJJSGz-6FYFxOa9ZDgubA56oUVl_K00evvZerDCknZoCStVUNAQ6uXXf3kvMFeLoepJCUFU";

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

function arrayBufferToBase64Url(buffer: ArrayBuffer | null): string {
  const b64 = arrayBufferToBase64(buffer);
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
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
  const reg = await navigator.serviceWorker.register(SW_PATH, { scope: "/push-sw/" });
  await waitForActivation(reg);
  return reg;
}

/**
 * navigator.serviceWorker.ready only resolves for a registration whose scope
 * controls the current page. Our push worker lives under /push-sw/, so we must
 * await this specific registration instead or the promise never settles.
 */
async function waitForActivation(reg: ServiceWorkerRegistration): Promise<void> {
  if (reg.active) return;
  const worker = reg.installing ?? reg.waiting;
  if (!worker) return;
  await new Promise<void>((resolve) => {
    const done = () => {
      if (worker.state === "activated" || worker.state === "redundant") {
        worker.removeEventListener("statechange", done);
        resolve();
      }
    };
    worker.addEventListener("statechange", done);
    // Safety net: never hang the UI on a worker that stalls.
    setTimeout(resolve, 8000);
  });
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


  let subscription = await reg.pushManager.getSubscription();

  // A subscription is bound to the key it was created with. Reusing one that
  // was made with a different (older) key means every send is rejected by the
  // push service and the device silently receives nothing — so drop it and
  // subscribe again whenever the key no longer matches.
  if (subscription) {
    const current = arrayBufferToBase64Url(subscription.options?.applicationServerKey ?? null);
    if (current && current !== VAPID_PUBLIC_KEY) {
      try {
        await supabase.from("push_subscriptions").delete().eq("endpoint", subscription.endpoint);
      } catch {}
      try {
        await subscription.unsubscribe();
      } catch {}
      subscription = null;
    }
  }

  if (!subscription) {
    subscription = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as BufferSource,
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

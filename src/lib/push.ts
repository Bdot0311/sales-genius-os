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

  await storeSubscription(subscription);

  return subscription;
}

/**
 * Write a browser subscription to the row the server sends from.
 *
 * Two halves have to agree for a push to arrive: the browser's subscription
 * and a `push_subscriptions` row carrying its endpoint and keys. Only the
 * second one is what the send function reads.
 */
export async function storeSubscription(subscription: PushSubscription): Promise<void> {
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
}

/**
 * Whether this signed-in user has a row for that endpoint.
 *
 * RLS scopes the select to the caller, so a row belonging to another account on
 * the same device reads as absent here — which is correct: the send function
 * looks up by user, and that row would never be sent to.
 */
export async function isRegisteredOnServer(endpoint: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("push_subscriptions")
    .select("id")
    .eq("endpoint", endpoint)
    .maybeSingle();
  if (error) return false;
  return Boolean(data);
}

/**
 * What this device's notification state actually is, repairing it where it can.
 *
 * Settings used to decide this from the browser subscription alone, and the two
 * halves drift apart for ordinary reasons: the send function prunes a row the
 * push service reported gone, a signed-out session takes the row with it, an
 * upsert failed once. The browser keeps its subscription through all of it, so
 * the toggle went on reading "This device is registered for notifications"
 * while every send went to nobody — and a test notification came back "sent to
 * 0 device(s)" with a success tick next to it.
 *
 * When the browser half is intact and only the row is missing, nothing needs
 * asking: the endpoint and keys are right here, so write the row and carry on.
 * That is why this is called on load and not only from the toggle.
 */
export async function getDeviceStatus(): Promise<{
  subscription: PushSubscription | null;
  registered: boolean;
}> {
  const subscription = await getCurrentSubscription();
  if (!subscription) return { subscription: null, registered: false };

  if (await isRegisteredOnServer(subscription.endpoint)) {
    return { subscription, registered: true };
  }

  try {
    await storeSubscription(subscription);
    return { subscription, registered: true };
  } catch {
    // Signed out, or the write was refused. Report it honestly rather than
    // letting the switch claim a registration that does not exist.
    return { subscription, registered: false };
  }
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

/**
 * Silently repair this device's notification setup on app load.
 *
 * Rotating the VAPID key invalidates every subscription created under the old
 * one, and the push service rejects each send — the device just stops getting
 * anything. The recovery used to live only in the Settings toggle, so people who
 * already had notifications on had to go and re-enable them by hand. This runs
 * on app load instead: it never prompts, never enables anything, and only acts
 * when permission is already granted and the stored key no longer matches.
 */
export async function refreshPushSubscription(): Promise<void> {
  if (!isPushSupported()) return;
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
  try {
    const existing = await getCurrentSubscription();
    if (!existing) return;
    const current = arrayBufferToBase64Url(existing.options?.applicationServerKey ?? null);
    if (current && current !== VAPID_PUBLIC_KEY) {
      await subscribeToPush();
      return;
    }
    // The key is fine, so the subscription is fine — but the row the server
    // sends from may have gone anyway (pruned as stale, lost with a session, an
    // upsert that failed once). getDeviceStatus writes it back if so.
    await getDeviceStatus();
  } catch {
    // A failed silent repair must never surface to the user; Settings still works.
  }
}

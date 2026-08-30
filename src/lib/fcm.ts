// Firebase Cloud Messaging registration for the OutReign PWA.
// Credentials come from the Firebase Cloud Messaging connector (public values).
import { supabase } from "@/integrations/supabase/client";

// Public-by-design web config for the "outreign" Firebase project (from the
// Firebase console web-app snippet). Env vars from the Firebase Messaging
// connector override the baked-in values when present; only the web API key
// is required from the environment.
const DEFAULT_APP_ID = "1:1077235865225:web:fdc349bf23a6edfbdf5858";

const appId =
  (import.meta.env.VITE_LOVABLE_CONNECTOR_FIREBASE_MESSAGING_APP_ID as string | undefined) ??
  DEFAULT_APP_ID;
const vapidKey = import.meta.env.VITE_LOVABLE_CONNECTOR_FIREBASE_MESSAGING_VAPID_KEY as string | undefined;

export const firebaseConfig = {
  apiKey: import.meta.env.VITE_LOVABLE_CONNECTOR_FIREBASE_MESSAGING_WEB_API_KEY as string | undefined,
  authDomain: "outreign.firebaseapp.com",
  projectId:
    (import.meta.env.VITE_LOVABLE_CONNECTOR_FIREBASE_MESSAGING_PROJECT_ID as string | undefined) ??
    "outreign",
  storageBucket: "outreign.firebasestorage.app",
  // messagingSenderId has no env var of its own: it is the 2nd segment of the app id.
  messagingSenderId: appId?.split(":")[1] ?? "1077235865225",
  appId,
  measurementId: "G-14JQD6Q2M3",
};

export type FcmStatus =
  | "registered"
  | "not-configured"
  | "unsupported"
  | "open-in-new-tab"
  | "denied";

export type FcmResult =
  | { status: "registered"; token: string }
  | { status: Exclude<FcmStatus, "registered"> };

export function isFcmConfigured(): boolean {
  return Boolean(
    firebaseConfig.apiKey &&
      firebaseConfig.projectId &&
      firebaseConfig.appId &&
      firebaseConfig.messagingSenderId &&
      vapidKey
  );
}

export function isInPreviewFrame(): boolean {
  if (typeof window === "undefined") return true;
  try {
    if (window.self !== window.top) return true;
  } catch {
    return true;
  }
  const host = window.location.hostname;
  return host.includes("id-preview--") || host.includes("lovableproject.com");
}

async function messagingModule() {
  const [{ initializeApp, getApps, getApp }, messaging] = await Promise.all([
    import("firebase/app"),
    import("firebase/messaging"),
  ]);
  const app = getApps().length ? getApp() : initializeApp(firebaseConfig as Record<string, string>);
  return { app, ...messaging };
}

/**
 * Initialize the Firebase web app + Firebase Analytics (the equivalent of the
 * console's bottom-of-body snippet). Requires the web API key; no-ops without
 * it. Safe to call alongside FCM — the app instance is shared via getApps().
 */
export async function initFirebaseWeb(): Promise<void> {
  if (!firebaseConfig.apiKey || isInPreviewFrame()) return;
  try {
    const [{ initializeApp, getApps, getApp }, analytics] = await Promise.all([
      import("firebase/app"),
      import("firebase/analytics"),
    ]);
    const app = getApps().length ? getApp() : initializeApp(firebaseConfig as Record<string, string>);
    if (await analytics.isSupported()) analytics.getAnalytics(app);
  } catch {
    /* analytics is best-effort */
  }
}

async function registerSw(): Promise<ServiceWorkerRegistration> {
  const query = new URLSearchParams({
    apiKey: firebaseConfig.apiKey ?? "",
    projectId: firebaseConfig.projectId ?? "",
    appId: firebaseConfig.appId ?? "",
    messagingSenderId: firebaseConfig.messagingSenderId,
  }).toString();
  return navigator.serviceWorker.register(`/firebase-messaging-sw.js?${query}`, {
    scope: "/firebase-cloud-messaging-push-scope",
  });
}

/** Call from a click handler: browsers ignore permission requests without a gesture. */
export async function enableFcmPush(): Promise<FcmResult> {
  if (!isFcmConfigured()) return { status: "not-configured" };
  if (typeof window === "undefined" || !("Notification" in window)) return { status: "unsupported" };

  const { getMessaging, getToken, isSupported } = await messagingModule();
  if (!(await isSupported())) return { status: "unsupported" };
  if (isInPreviewFrame()) return { status: "open-in-new-tab" };

  const permission =
    Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
  if (permission !== "granted") return { status: "denied" };

  const serviceWorkerRegistration = await registerSw();
  await navigator.serviceWorker.ready;

  const token = await getToken(getMessaging(), { vapidKey: vapidKey!, serviceWorkerRegistration });
  if (!token) return { status: "denied" };

  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) throw new Error("You must be signed in to enable notifications.");

  const { error } = await supabase.from("fcm_tokens").upsert(
    {
      user_id: userId,
      token,
      platform: "web",
      user_agent: navigator.userAgent,
      last_seen_at: new Date().toISOString(),
    },
    { onConflict: "token" }
  );
  if (error) throw error;

  return { status: "registered", token };
}

export async function getExistingFcmToken(): Promise<string | null> {
  if (!isFcmConfigured() || isInPreviewFrame()) return null;
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return null;
  try {
    const { getMessaging, getToken, isSupported } = await messagingModule();
    if (!(await isSupported())) return null;
    const reg = await navigator.serviceWorker.getRegistration("/firebase-cloud-messaging-push-scope");
    if (!reg) return null;
    return await getToken(getMessaging(), { vapidKey: vapidKey!, serviceWorkerRegistration: reg });
  } catch {
    return null;
  }
}

export async function disableFcmPush(): Promise<void> {
  const token = await getExistingFcmToken();
  if (token) {
    try {
      const { getMessaging, deleteToken } = await messagingModule();
      await deleteToken(getMessaging());
    } catch {
      /* token may already be gone */
    }
    await supabase.from("fcm_tokens").delete().eq("token", token);
  }
  try {
    const reg = await navigator.serviceWorker.getRegistration("/firebase-cloud-messaging-push-scope");
    await reg?.unregister();
  } catch {
    /* ignore */
  }
}

/** Show a toast-able payload while the app is in the foreground. */
export async function onForegroundMessage(
  handler: (msg: { title: string; body: string; url?: string }) => void
): Promise<() => void> {
  if (!isFcmConfigured() || isInPreviewFrame()) return () => {};
  try {
    const { getMessaging, onMessage, isSupported } = await messagingModule();
    if (!(await isSupported())) return () => {};
    return onMessage(getMessaging(), (payload) => {
      const data = (payload.data ?? {}) as Record<string, string>;
      handler({
        title: payload.notification?.title || data.title || "OutReign",
        body: payload.notification?.body || data.body || "",
        url: data.url,
      });
    });
  } catch {
    return () => {};
  }
}

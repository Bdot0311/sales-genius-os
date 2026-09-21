/**
 * Real usage tracking for signed-in users.
 *
 * While a tab is open, signed in and visible, we keep one row in
 * `user_activity_sessions` fresh (last_seen_at + current path) and write one
 * `user_page_views` row per route change with how long the previous page was
 * open. That gives admin a truthful "who is using the product right now" view
 * instead of guessing from last-sign-in.
 *
 * Everything here is best-effort: it never throws and never blocks the UI.
 */
import { supabase } from "@/integrations/supabase/client";

const SESSION_KEY = "_or_usage_session";
const HEARTBEAT_MS = 30_000;

const inPreviewIframe = () => {
  try {
    if (typeof window === "undefined") return false;
    if (window.self !== window.top) return true;
    return /lovable\.app$|lovableproject\.com$/.test(window.location.hostname) &&
      window.location.hostname.startsWith("id-preview");
  } catch {
    return true;
  }
};

const newId = () => {
  try {
    return crypto.randomUUID();
  } catch {
    return `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  }
};

const sessionId = (): string => {
  try {
    const existing = sessionStorage.getItem(SESSION_KEY);
    if (existing) return existing;
    const id = newId();
    sessionStorage.setItem(SESSION_KEY, id);
    return id;
  } catch {
    return newId();
  }
};

let started = false;
let timer: ReturnType<typeof setInterval> | null = null;
let userId: string | null = null;
let sid = "";
let currentPath = "";
let pathSince = Date.now();
let views = 0;

const isMobile = () =>
  typeof navigator !== "undefined" && /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);

async function touch(path: string) {
  if (!userId) return;
  try {
    await supabase.from("user_activity_sessions").upsert(
      {
        user_id: userId,
        session_id: sid,
        path,
        last_seen_at: new Date().toISOString(),
        page_views: views,
        user_agent: navigator.userAgent.slice(0, 400),
        is_mobile: isMobile(),
      },
      { onConflict: "user_id,session_id" },
    );
  } catch { /* usage tracking must never break the app */ }
}

async function recordView(path: string, durationSeconds: number | null) {
  if (!userId || !path) return;
  try {
    await supabase.from("user_page_views").insert({
      user_id: userId,
      session_id: sid,
      path: path.slice(0, 300),
      duration_seconds: durationSeconds === null ? null : Math.min(86_400, Math.max(0, Math.round(durationSeconds))),
    });
  } catch { /* noop */ }
}

/** Start tracking for the signed-in user. Safe to call repeatedly. */
export async function startUsageTracking(initialPath: string): Promise<void> {
  if (started || typeof window === "undefined" || inPreviewIframe()) return;

  const { data } = await supabase.auth.getUser();
  if (!data.user) return;

  started = true;
  userId = data.user.id;
  sid = sessionId();
  currentPath = initialPath;
  pathSince = Date.now();
  views = 1;

  void touch(currentPath);
  void recordView(currentPath, null);

  timer = setInterval(() => {
    if (document.visibilityState === "visible") void touch(currentPath);
  }, HEARTBEAT_MS);

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") void touch(currentPath);
  });
}

/** Called on every route change once tracking is running. */
export function trackUsagePath(path: string): void {
  if (!started || !userId || path === currentPath) return;
  const seconds = (Date.now() - pathSince) / 1000;
  void recordView(currentPath, seconds);
  currentPath = path;
  pathSince = Date.now();
  views += 1;
  void touch(path);
}

export function stopUsageTracking(): void {
  if (timer) clearInterval(timer);
  timer = null;
  started = false;
  userId = null;
}

import { supabase } from "@/integrations/supabase/client";

// Mobile browsers (especially iOS PWAs) freeze timers while the app is in the
// background, so the SDK's auto-refresh interval never fires and the access
// token silently expires. When the user comes back, a naive getSession() can
// resolve to null and the app bounces them to the landing page even though the
// refresh token is still perfectly valid.
//
// ensureSession() gives the refresh a real chance (with retries + backoff) and
// only reports "signed out" when the refresh token itself is rejected. The
// keeper pauses/resumes the SDK's refresh loop around visibility changes so a
// resumed app immediately renews its token.

const FATAL_REFRESH = /refresh[_ ]token|invalid|revoked|expired token|not found|already used/i;

export async function ensureSession(attempts = 3) {
  const { data: { session } } = await supabase.auth.getSession();
  if (session) return session;

  for (let i = 0; i < attempts; i++) {
    const { data, error } = await supabase.auth.refreshSession();
    if (data?.session) return data.session;
    // A genuinely dead refresh token means the user really is signed out.
    if (error && FATAL_REFRESH.test(error.message || "") && navigator.onLine) return null;
    // Otherwise it's most likely a transient network/offline failure — wait.
    await new Promise((r) => setTimeout(r, 600 * (i + 1)));
  }
  return null;
}

let started = false;

export function startSessionKeeper() {
  if (started || typeof document === "undefined") return;
  started = true;

  const resume = () => {
    try { supabase.auth.startAutoRefresh(); } catch { /* noop */ }
    void ensureSession();
  };

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") resume();
    else { try { supabase.auth.stopAutoRefresh(); } catch { /* noop */ } }
  });
  window.addEventListener("focus", resume);
  window.addEventListener("pageshow", resume);
  window.addEventListener("online", resume);

  resume();
}

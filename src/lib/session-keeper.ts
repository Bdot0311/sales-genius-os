import { supabase } from "@/integrations/supabase/client";

// Mobile browsers (especially iOS PWAs) freeze timers while the app is in the
// background, so the SDK's auto-refresh interval never fires and the access
// token silently expires. When the user comes back, a naive getSession() can
// resolve to null and the app bounces them to the landing page even though the
// refresh token is still perfectly valid.
//
// ensureSession() gives the refresh a real chance (with retries + backoff) and
// only reports "signed out" when the refresh token itself is rejected. Calls
// are serialised: visibilitychange/focus/pageshow/online fire together on
// resume, and parallel refreshes race a rotating refresh token — the loser
// presents a spent/partial token and is rejected, which used to sign people out.

const FATAL_REFRESH = /refresh[_ ]token|invalid|revoked|expired token|not found|already used/i;

let inFlight: Promise<Awaited<ReturnType<typeof runEnsure>>> | null = null;

async function runEnsure(attempts: number) {
  const { data: { session } } = await supabase.auth.getSession();
  if (session) return session;

  let fatalSeen = false;
  for (let i = 0; i < attempts; i++) {
    const { data, error } = await supabase.auth.refreshSession();
    if (data?.session) return data.session;
    if (error && FATAL_REFRESH.test(error.message || "") && navigator.onLine) {
      // Another refresh (other tab, SDK auto-refresh) may have rotated the
      // token under us. Re-read storage once before believing it.
      const { data: again } = await supabase.auth.getSession();
      if (again.session) return again.session;
      if (fatalSeen) return null;
      fatalSeen = true;
    }
    await new Promise((r) => setTimeout(r, 600 * (i + 1)));
  }
  return null;
}

export function ensureSession(attempts = 3) {
  if (!inFlight) {
    inFlight = runEnsure(attempts).finally(() => { inFlight = null; });
  }
  return inFlight;
}

let started = false;
let resumeTimer: ReturnType<typeof setTimeout> | null = null;

export function startSessionKeeper() {
  if (started || typeof document === "undefined") return;
  started = true;

  const resume = () => {
    // Coalesce the burst of resume events into one refresh.
    if (resumeTimer) clearTimeout(resumeTimer);
    resumeTimer = setTimeout(() => {
      resumeTimer = null;
      try { supabase.auth.startAutoRefresh(); } catch { /* noop */ }
      void ensureSession();
    }, 250);
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

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { selectStatus, type ServiceStatusRow } from "@/lib/service-status";

const DISMISS_KEY = "outreign_status_dismissed";
/** Detection runs on the backend; polling this often is enough to feel live. */
const POLL_MS = 3 * 60 * 1000;

/**
 * The open, platform-wide incident to show a signed-in user, if any.
 *
 * Nothing here is hand-published: the same monitoring that alerts the team
 * drives the banner, so a customer learns about a problem in the same minute
 * we do instead of emailing support to ask whether it's them.
 */
export function useServiceStatus() {
  const [status, setStatus] = useState<ReturnType<typeof selectStatus>>(null);
  const [dismissedKey, setDismissedKey] = useState<string | null>(() => {
    try {
      return localStorage.getItem(DISMISS_KEY);
    } catch {
      return null;
    }
  });

  const load = useCallback(async () => {
    // A failure here must never break the dashboard: no banner is the right
    // answer when we can't tell whether anything is wrong.
    const { data, error } = await supabase.rpc("get_service_status");
    if (error) {
      setStatus(null);
      return;
    }
    setStatus(selectStatus(data as ServiceStatusRow[] | null));
  }, []);

  useEffect(() => {
    let active = true;
    const run = () => {
      if (active) void load();
    };
    run();
    const timer = window.setInterval(run, POLL_MS);
    // Coming back to the tab after a while should show current reality.
    const onVisible = () => {
      if (document.visibilityState === "visible") run();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      active = false;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [load]);

  const dismiss = useCallback(() => {
    if (!status) return;
    try {
      localStorage.setItem(DISMISS_KEY, status.key);
    } catch {
      /* private browsing — the banner simply comes back next load */
    }
    setDismissedKey(status.key);
  }, [status]);

  return {
    status: status && status.key !== dismissedKey ? status : null,
    dismiss,
  };
}

import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

/** Page refresh is immediate; the existing mailbox sweep also scans while away. */
export function useBounceSync(onUpdate: () => void, enabled = true) {
  const update = useRef(onUpdate);
  update.current = onUpdate;
  useEffect(() => {
    if (!enabled) return;
    let running = false;
    let cancelled = false;
    const scan = async () => {
      if (running || document.visibilityState === "hidden") return;
      running = true;
      try {
        const { data, error } = await supabase.functions.invoke("sync-bounces", { body: {} });
        if (!cancelled && !error && !data?.error) update.current();
      } finally { running = false; }
    };
    void scan().catch(() => {});
    const tick = () => { void scan().catch(() => {}); };
    const interval = window.setInterval(tick, 60_000);
    document.addEventListener("visibilitychange", tick);
    return () => { cancelled = true; window.clearInterval(interval); document.removeEventListener("visibilitychange", tick); };
  }, [enabled]);
}
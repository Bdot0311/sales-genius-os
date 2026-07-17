import { useEffect, useRef } from "react";

/**
 * Auto-refresh helper for admin dashboards.
 * - Calls `fn` on the given interval (default 60s).
 * - Also refetches when the tab regains focus / becomes visible.
 * - Skips ticks while the tab is hidden to avoid wasted work.
 */
export function useAutoRefresh(fn: () => void | Promise<void>, intervalMs = 60_000) {
  const fnRef = useRef(fn);
  fnRef.current = fn;

  useEffect(() => {
    let cancelled = false;

    const tick = () => {
      if (cancelled) return;
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      try { void fnRef.current(); } catch (_) { /* swallow */ }
    };

    const id = window.setInterval(tick, intervalMs);

    const onVisible = () => {
      if (document.visibilityState === "visible") tick();
    };
    const onFocus = () => tick();

    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onFocus);

    return () => {
      cancelled = true;
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onFocus);
    };
  }, [intervalMs]);
}

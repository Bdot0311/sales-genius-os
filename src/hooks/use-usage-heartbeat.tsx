import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { startUsageTracking, trackUsagePath } from "@/lib/usage-heartbeat";

/**
 * Keeps the signed-in user's live activity fresh: one heartbeat every 30s
 * while the tab is visible, plus a page-view record on each route change.
 */
export function useUsageHeartbeat() {
  const location = useLocation();

  useEffect(() => {
    void startUsageTracking(location.pathname);
  }, []);

  useEffect(() => {
    trackUsagePath(location.pathname);
  }, [location.pathname]);
}

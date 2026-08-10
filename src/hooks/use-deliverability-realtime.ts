import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/** Query keys that hold deliverability data. */
const KEYS = [
  ["sending-accounts"],
  ["sending-domains"],
  ["deliverability-alerts"],
  ["reputation-snapshots"],
  ["warmup-messages"],
  ["deliverability-live-stats"],
] as const;

const TABLES = [
  "sending_accounts",
  "sending_domains",
  "deliverability_alerts",
  "reputation_snapshots",
  "warmup_messages",
  "blacklist_checks",
  // Live stats are derived from real sends, so a new send must refresh them.
  "sent_emails",
] as const;

export type LiveStatus = "connecting" | "live" | "offline";

/**
 * Keeps the deliverability suite continuously up to date:
 * - Postgres change streams on every deliverability table (RLS-scoped).
 * - A polling fallback so numbers still move if the socket drops.
 * - Refetch on tab focus / visibility.
 *
 * Returns the socket status and the timestamp of the last data update.
 */
export function useDeliverabilityRealtime(pollMs = 30_000) {
  const qc = useQueryClient();
  const [status, setStatus] = useState<LiveStatus>("connecting");
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());
  const invalidate = useRef<() => void>(() => {});

  invalidate.current = () => {
    for (const key of KEYS) qc.invalidateQueries({ queryKey: key as unknown as string[] });
    setLastUpdate(new Date());
  };

  useEffect(() => {
    // Unique channel name per mount — reusing a name collides with an existing
    // subscription and throws on re-render/StrictMode double-mounts.
    const channel = supabase.channel(`deliverability-live-${Math.random().toString(36).slice(2)}`);

    for (const table of TABLES) {
      channel.on("postgres_changes", { event: "*", schema: "public", table }, () => {
        invalidate.current();
      });
    }

    channel.subscribe((s) => {
      if (s === "SUBSCRIBED") setStatus("live");
      else if (s === "CHANNEL_ERROR" || s === "TIMED_OUT" || s === "CLOSED") setStatus("offline");
    });

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Polling fallback + focus refetch.
  useEffect(() => {
    const tick = () => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      invalidate.current();
    };
    const id = window.setInterval(tick, pollMs);
    const onVisible = () => { if (document.visibilityState === "visible") tick(); };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", tick);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", tick);
    };
  }, [pollMs]);

  return { status, lastUpdate };
}

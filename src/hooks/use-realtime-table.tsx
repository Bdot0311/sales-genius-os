import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import type {
  RealtimePostgresChangesPayload,
  RealtimeChannel,
} from "@supabase/supabase-js";

type Event = "INSERT" | "UPDATE" | "DELETE" | "*";

interface Options {
  channel: string;
  table: string;
  event?: Event;
  filter?: string;
  schema?: string;
  enabled?: boolean;
  onChange: (payload: RealtimePostgresChangesPayload<any>) => void;
  /** Log latency (commit_timestamp -> client receive) to console as `[realtime] table 123ms`. */
  debug?: boolean;
}

/**
 * Subscribes to a Postgres-changes channel with built-in latency instrumentation.
 * Logs end-to-end delay from Postgres commit -> client receive in ms when debug=true,
 * and exposes the last measurement via `window.__realtimeLatency` for quick inspection.
 */
export function useRealtimeTable({
  channel,
  table,
  event = "*",
  filter,
  schema = "public",
  enabled = true,
  onChange,
  debug = true,
}: Options) {
  const cbRef = useRef(onChange);
  cbRef.current = onChange;

  useEffect(() => {
    if (!enabled) return;
    const subscribedAt = performance.now();
    const ch: RealtimeChannel = supabase
      .channel(channel)
      .on(
        "postgres_changes" as never,
        { event, schema, table, ...(filter ? { filter } : {}) },
        (payload: RealtimePostgresChangesPayload<any>) => {

          if (debug) {
            const commitTs = (payload as any).commit_timestamp;
            const latency =
              commitTs ? Date.now() - new Date(commitTs).getTime() : null;
            // eslint-disable-next-line no-console
            console.log(
              `[realtime] ${table} ${payload.eventType}` +
                (latency !== null ? ` lag=${latency}ms` : "")
            );
            (window as any).__realtimeLatency = {
              table,
              latency,
              at: new Date().toISOString(),
            };
          }
          cbRef.current(payload);
        }
      )
      .subscribe((status) => {
        if (debug && status === "SUBSCRIBED") {
          // eslint-disable-next-line no-console
          console.log(
            `[realtime] subscribed ${channel} (${table}) in ${Math.round(
              performance.now() - subscribedAt
            )}ms`
          );
        }
      });

    return () => {
      supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel, table, event, filter, schema, enabled]);
}

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * The open drafting work for a conversation, if there is any.
 *
 * A batch outlives the turn that asked for it, so progress cannot live in the
 * turn's response. It is counted from the rows the worker writes, which is the
 * only thing that saw every pass.
 *
 * Every open job in the thread, summed — not the newest one. A run that asked
 * for eighty-two drafts left five jobs behind and the card read "0 of 6",
 * because it took the newest and called that the batch. Jobs are per turn now,
 * so there is usually one, but a second message while the first is still
 * draining makes two and the user is owed the total either way.
 *
 * Polled rather than subscribed: `agent_jobs` is not on the supabase_realtime
 * publication — only the changelog tables are — and the page already polls the
 * thread on a timer for the same reason. A count that moves every few seconds
 * does not need a socket.
 */
export interface AgentJob {
  id: string;
  status: "queued" | "running" | "done" | "cancelled";
  total: number;
  done: number;
  failed: number;
  created_at: string;
  /** Every open job this total covers — cancel stops all of them. */
  ids?: string[];
}

export const useAgentJob = (threadId: string | undefined) => {
  const [job, setJob] = useState<AgentJob | null>(null);

  const load = useCallback(async () => {
    if (!threadId) {
      setJob(null);
      return;
    }
    const { data } = await supabase
      .from("agent_jobs" as any)
      .select("id, status, total, done, failed, created_at")
      .eq("thread_id", threadId)
      .in("status", ["queued", "running"])
      .order("created_at", { ascending: true });
    const rows = (data as unknown as AgentJob[]) ?? [];
    if (rows.length === 0) {
      setJob(null);
      return;
    }
    // Identity and timing come from the oldest open job — it is the one the
    // user started waiting on — and the counts are the whole outstanding batch.
    setJob({
      ...rows[0],
      ids: rows.map((r) => r.id),
      status: rows.some((r) => r.status === "running") ? "running" : rows[0].status,
      total: rows.reduce((n, r) => n + (r.total ?? 0), 0),
      done: rows.reduce((n, r) => n + (r.done ?? 0), 0),
      failed: rows.reduce((n, r) => n + (r.failed ?? 0), 0),
    });
  }, [threadId]);

  useEffect(() => {
    void load();
    // Only while there is something to watch. An idle conversation must not
    // poll forever, and a finished batch stops the timer on its next tick.
    const timer = window.setInterval(() => {
      if (typeof document !== "undefined" && document.hidden) return;
      void load();
    }, 5000);
    return () => window.clearInterval(timer);
  }, [load]);

  const cancel = useCallback(async () => {
    if (!job) return;
    // The only write a client makes to this table, and RLS allows it only into
    // the cancelled state: a browser cannot mark work done.
    await supabase
      .from("agent_jobs" as any)
      .update({ status: "cancelled" })
      .in("id", job.ids ?? [job.id]);
    await load();
  }, [job, load]);

  return { job, cancel, refresh: load };
};

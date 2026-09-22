import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * The open drafting batch for a conversation, if there is one.
 *
 * A batch outlives the turn that asked for it, so progress cannot live in the
 * turn's response. It is counted from the rows the worker writes, which is the
 * only thing that saw every pass.
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
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    setJob((data as unknown as AgentJob) ?? null);
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
    await supabase.from("agent_jobs" as any).update({ status: "cancelled" }).eq("id", job.id);
    await load();
  }, [job, load]);

  return { job, cancel, refresh: load };
};

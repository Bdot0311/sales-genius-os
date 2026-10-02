import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { summariseFailures, type FailureSummary } from "@/lib/draft-failures";

/**
 * Everything this user has running, anywhere in the app.
 *
 * The complaint this exists for: start a search, go to Saved Leads, come back,
 * and the page looks idle. It mostly was not idle. Nothing in the app aborts a
 * request — there is no AbortController and the query client is made once for
 * the whole tree — so the function on the other end finished and wrote what it
 * writes. What was lost was the page's knowledge of it, because progress lived
 * in a useState inside a component that unmounted.
 *
 * So this reads the jobs table rather than remembering anything. Mount it in
 * the shell and navigation stops mattering: the state is reconstructed from
 * rows that outlive every page.
 *
 * useAgentJob stays as it is — it answers a narrower question (this thread's
 * batch, with its own card and cancel) and the chat needs that. This one is
 * account-wide and read-mostly.
 */
export interface BackgroundJob {
  id: string;
  kind: string;
  status: "queued" | "running" | "done" | "cancelled";
  total: number;
  done: number;
  failed: number;
  created_at: string;
  request_text: string | null;
}

/** What each kind is called where a person can see it. */
const KIND_LABEL: Record<string, { one: string; many: string }> = {
  draft: { one: "draft", many: "drafts" },
  enrich: { one: "lead to enrich", many: "leads to enrich" },
  score: { one: "lead to score", many: "leads to score" },
  research: { one: "lead to research", many: "leads to research" },
  search: { one: "search", many: "searches" },
};

export const labelForKind = (kind: string, count: number): string => {
  const label = KIND_LABEL[kind];
  if (!label) return count === 1 ? "item" : "items";
  return count === 1 ? label.one : label.many;
};

/**
 * One line describing everything open, or null when nothing is.
 *
 * Named, never a bare count: three pages away from where it started, "still
 * working" without saying on what is worse than silence.
 */
export const describeWork = (jobs: BackgroundJob[]): string | null => {
  if (jobs.length === 0) return null;
  const byKind = new Map<string, { total: number; done: number }>();
  for (const job of jobs) {
    const acc = byKind.get(job.kind) ?? { total: 0, done: 0 };
    acc.total += job.total ?? 0;
    acc.done += (job.done ?? 0) + (job.failed ?? 0);
    byKind.set(job.kind, acc);
  }
  const parts = [...byKind.entries()].map(([kind, n]) =>
    n.total > 0
      ? `${n.done} of ${n.total} ${labelForKind(kind, n.total)}`
      : `${labelForKind(kind, 1)} starting`,
  );
  return parts.join(", ");
};

export const useBackgroundWork = () => {
  const [jobs, setJobs] = useState<BackgroundJob[]>([]);
  const [failures, setFailures] = useState<FailureSummary[]>([]);

  const load = useCallback(async () => {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) {
      setJobs([]);
      setFailures([]);
      return;
    }
    const { data } = await supabase
      .from("agent_jobs" as any)
      .select("id, kind, status, total, done, failed, created_at, request_text")
      .eq("user_id", auth.user.id)
      .in("status", ["queued", "running"])
      .order("created_at", { ascending: true });
    const rows = (data as unknown as BackgroundJob[]) ?? [];
    setJobs(rows);

    /*
     * Why, not just how many.
     *
     * The worker writes a real sentence onto every failed item and nothing
     * read it, so the bar said "3 failed" and stopped. Most of those are
     * refusals rather than crashes — a draft that invented a figure it could
     * not back is one the product declined to save — and the user cannot act
     * on a refusal they cannot see.
     *
     * Only fetched when something has actually failed. This polls every five
     * seconds, and a second query on every tick to confirm an empty set is a
     * cost with no reader.
     */
    const withFailures = rows.filter((j) => (j.failed ?? 0) > 0).map((j) => j.id);
    if (withFailures.length === 0) {
      setFailures([]);
      return;
    }
    const { data: items } = await supabase
      .from("agent_job_items" as any)
      .select("error")
      .in("job_id", withFailures)
      .eq("status", "failed")
      .limit(500);
    setFailures(
      summariseFailures(
        ((items ?? []) as unknown as { error: string | null }[]).map((i) => i.error),
      ),
    );
  }, []);

  useEffect(() => {
    void load();
    // Polled, like useAgentJob: agent_jobs is not on the supabase_realtime
    // publication, and a count that moves every few seconds does not need a
    // socket. Paused while the tab is hidden so a backgrounded phone is not
    // polling for nothing.
    const timer = window.setInterval(() => {
      if (typeof document !== "undefined" && document.hidden) return;
      void load();
    }, 5000);
    // A tab coming back to the front should not wait out the interval.
    const onVisible = () => {
      if (typeof document !== "undefined" && !document.hidden) void load();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [load]);

  return { jobs, summary: describeWork(jobs), failures, refresh: load };
};

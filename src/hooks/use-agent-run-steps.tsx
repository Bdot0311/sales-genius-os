import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface AgentRunStep {
  id: string;
  toolName: string;
  status: string;
  detail: string | null;
  durationMs: number;
  at: string;
}

/**
 * The steps the agent has actually completed this run.
 *
 * agent-chat writes a row to agent_step_metrics as each tool finishes, so this
 * is a record of work done rather than a guess. The status card used to derive
 * its checklist from a regex on the user's message and advance it on a timer,
 * which meant it described a plausible turn rather than the one running: a
 * ninety-second research pass showed "Wrapping up" at twenty seconds.
 *
 * Polled rather than realtime because a turn is short and bounded, and a
 * subscription that misses its first event has no way to catch up.
 */
export function useAgentRunSteps(threadId: string | null, active: boolean) {
  const [steps, setSteps] = useState<AgentRunStep[]>([]);

  useEffect(() => {
    if (!active || !threadId) {
      setSteps([]);
      return;
    }

    let cancelled = false;
    // Only this run's steps. Two seconds of slack covers the clock difference
    // between the browser and the database.
    const since = new Date(Date.now() - 2000).toISOString();

    const read = async () => {
      const { data, error } = await supabase
        .from("agent_step_metrics")
        .select("id, tool_name, status, detail, duration_ms, created_at")
        .eq("thread_id", threadId)
        .gte("created_at", since)
        .neq("tool_name", "__turn__")
        .order("created_at", { ascending: true })
        .limit(40);
      if (cancelled || error || !data) return;
      setSteps(
        data.map((r) => ({
          id: r.id as string,
          toolName: r.tool_name as string,
          status: r.status as string,
          detail: (r.detail as string | null) ?? null,
          durationMs: (r.duration_ms as number) ?? 0,
          at: r.created_at as string,
        })),
      );
    };

    void read();
    const poll = setInterval(read, 1500);
    return () => {
      cancelled = true;
      clearInterval(poll);
    };
  }, [threadId, active]);

  return steps;
}

/**
 * What each tool is doing, in the user's terms.
 *
 * Derived from the tool that actually ran, so an unmapped name falls back to
 * its own identifier rather than to an invented description.
 */
export const TOOL_LABELS: Record<string, string> = {
  list_leads: "Looking through your leads",
  get_lead: "Opening the lead",
  find_leads: "Finding new leads",
  search_companies: "Searching companies",
  enrich_leads: "Filling in missing contact details",
  score_leads: "Scoring them against your ICP",
  research_leads: "Reading their websites",
  draft_outreach: "Writing the emails",
  draft_sequence: "Building the sequence",
  list_drafts: "Gathering the drafts",
  delete_drafts: "Deleting drafts",
  list_mailboxes: "Checking your connected mailboxes",
  send_drafts: "Sending",
  schedule_drafts: "Scheduling the sends",
  send_outreach: "Sending",
  list_scheduled_emails: "Checking what is queued",
  cancel_scheduled_email: "Cancelling the scheduled send",
  list_recent_replies: "Reading recent replies",
  list_sequences: "Looking up your sequences",
  enroll_lead_in_sequence: "Enrolling the lead",
  update_lead: "Updating the lead",
  delete_leads: "Deleting leads",
  delete_inbox_threads: "Clearing inbox threads",
  get_agent_status: "Checking the agent",
  run_full_agent: "Running the full cycle",
};

export const labelForTool = (toolName: string) =>
  TOOL_LABELS[toolName] ?? toolName.replace(/_/g, " ");

import { useCallback, useEffect, useMemo, useState } from "react";
import { format, formatDistanceToNow } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Loader2,
  RefreshCw,
  ChevronRight,
  ChevronDown,
  History,
  Download,
  CheckCircle2,
  AlertTriangle,
  MinusCircle,
  UserPlus,
  Send,
  Mail,
  Calendar,
  ShieldQuestion,
  XCircle,
  Brain,
  X,
} from "lucide-react";
import { roleLabel } from "@/components/agent/AgentRoles";

interface ActionRow {
  id: string;
  run_id: string | null;
  agent_config_id: string | null;
  action_type: string;
  status: string | null;
  description: string | null;
  prospect_email: string | null;
  subject: string | null;
  classification: string | null;
  error_message: string | null;
  metadata: Record<string, any> | null;
  created_at: string;
}

interface AgentSummary {
  id: string;
  agent_name: string | null;
  role: string | null;
}

interface HistoryTabProps {
  agents: AgentSummary[];
  userId: string | null;
}

const PRODUCED_TYPES = new Set([
  "lead_found",
  "outreach_sent",
  "reply_sent",
  "meeting_booked",
  "awaiting_approval",
  "classify",
  "unsubscribed",
  "closed_thread",
]);

const ACTION_META: Record<string, { icon: React.ReactNode; label: string }> = {
  lead_found: { icon: <UserPlus className="w-3.5 h-3.5 text-cyan-400" />, label: "Lead found" },
  outreach_sent: { icon: <Send className="w-3.5 h-3.5 text-indigo-400" />, label: "Outreach sent" },
  reply_sent: { icon: <Mail className="w-3.5 h-3.5 text-blue-400" />, label: "Reply sent" },
  meeting_booked: { icon: <Calendar className="w-3.5 h-3.5 text-green-400" />, label: "Meeting booked" },
  awaiting_approval: { icon: <ShieldQuestion className="w-3.5 h-3.5 text-amber-400" />, label: "Awaiting approval" },
  rejected: { icon: <XCircle className="w-3.5 h-3.5 text-red-400" />, label: "Rejected" },
  unsubscribed: { icon: <XCircle className="w-3.5 h-3.5 text-red-400" />, label: "Unsubscribed" },
  closed_thread: { icon: <X className="w-3.5 h-3.5 text-muted-foreground" />, label: "Thread closed" },
  classify: { icon: <Brain className="w-3.5 h-3.5 text-indigo-400" />, label: "Reply classified" },
  skipped: { icon: <MinusCircle className="w-3.5 h-3.5 text-yellow-400" />, label: "Skipped" },
  error: { icon: <AlertTriangle className="w-3.5 h-3.5 text-red-500" />, label: "Error" },
  sync: { icon: <RefreshCw className="w-3.5 h-3.5 text-purple-400" />, label: "Run summary" },
};

const REASON_LABELS: Record<string, string> = {
  agent_disabled: "Agent was switched off",
  agent_not_found: "Agent build no longer exists",
  no_agent_configured: "No agent set up yet",
  no_pending_leads: "No new leads waiting for outreach",
  no_active_mailbox: "No active Gmail mailbox",
  invalid_email: "Lead had no usable email address",
  generation_failed: "Email generation failed",
  deliverability_block: "Blocked by the spam check",
  agent_reply_disabled: "Auto-replies are turned off",
  objection_handling_disabled: "Objection handling is turned off",
  meeting_booking_disabled: "Meeting booking is turned off",
};

interface RunGroup {
  key: string;
  runId: string | null;
  agentId: string | null;
  startedAt: string;
  finishedAt: string;
  legacy: boolean;
  rows: ActionRow[];
  summary: ActionRow | null;
  produced: number;
  skipped: number;
  errors: number;
  counts: Record<string, number>;
}

const outcomeOf = (run: RunGroup) => {
  if (run.errors > 0 && run.produced === 0) return "failed" as const;
  if (run.produced > 0) return "produced" as const;
  return "empty" as const;
};

/** Plain-English explanation of why a run produced nothing. */
const reasonFor = (run: RunGroup) => {
  const carriers = run.rows.filter((r) => r.action_type === "skipped" || r.action_type === "error");
  for (const row of carriers) {
    const reason = row.metadata?.reason as string | undefined;
    if (reason && REASON_LABELS[reason]) return REASON_LABELS[reason];
    if (row.error_message) return row.error_message;
    if (row.description) return row.description;
  }
  if (run.summary?.description) return run.summary.description;
  return "No activity was recorded for this run.";
};

export function HistoryTab({ agents, userId }: HistoryTabProps) {
  const [rows, setRows] = useState<ActionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [agentFilter, setAgentFilter] = useState<string>("all");
  const [outcomeFilter, setOutcomeFilter] = useState<string>("all");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("agent_actions")
      .select(
        "id, run_id, agent_config_id, action_type, status, description, prospect_email, subject, classification, error_message, metadata, created_at",
      )
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) console.error("Agent history load error:", error);
    setRows(((data ?? []) as unknown) as ActionRow[]);
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load]);

  const agentName = (id: string | null) => {
    if (!id) return "Unassigned agent";
    const a = agents.find((x) => x.id === id);
    return a?.agent_name || "Untitled agent";
  };
  const agentRole = (id: string | null) => {
    const a = agents.find((x) => x.id === id);
    return a?.role ? roleLabel(a.role) : null;
  };

  /** Group the audit rows into discrete runs. Rows written before run tracking
   * existed are grouped per agent per day so nothing disappears. */
  const runs = useMemo<RunGroup[]>(() => {
    const map = new Map<string, RunGroup>();
    for (const row of rows) {
      const legacy = !row.run_id;
      const key = row.run_id
        ? `run:${row.run_id}`
        : `legacy:${row.agent_config_id ?? "none"}:${row.created_at.slice(0, 10)}`;
      let group = map.get(key);
      if (!group) {
        group = {
          key,
          runId: row.run_id,
          agentId: row.agent_config_id,
          startedAt: row.created_at,
          finishedAt: row.created_at,
          legacy,
          rows: [],
          summary: null,
          produced: 0,
          skipped: 0,
          errors: 0,
          counts: {},
        };
        map.set(key, group);
      }
      group.rows.push(row);
      if (row.created_at < group.startedAt) group.startedAt = row.created_at;
      if (row.created_at > group.finishedAt) group.finishedAt = row.created_at;
      if (row.action_type === "sync") group.summary = row;
      if (PRODUCED_TYPES.has(row.action_type)) group.produced += 1;
      if (row.action_type === "skipped") group.skipped += 1;
      if (row.action_type === "error" || row.status === "failed") group.errors += 1;
      group.counts[row.action_type] = (group.counts[row.action_type] ?? 0) + 1;
    }
    return Array.from(map.values())
      .map((g) => ({ ...g, rows: g.rows.slice().sort((a, b) => a.created_at.localeCompare(b.created_at)) }))
      .sort((a, b) => b.finishedAt.localeCompare(a.finishedAt));
  }, [rows]);

  const visibleRuns = useMemo(
    () =>
      runs.filter((run) => {
        if (agentFilter !== "all" && run.agentId !== agentFilter) return false;
        if (outcomeFilter !== "all" && outcomeOf(run) !== outcomeFilter) return false;
        return true;
      }),
    [runs, agentFilter, outcomeFilter],
  );

  const exportCsv = () => {
    const header = ["run_id", "agent", "started_at", "finished_at", "outcome", "action_type", "status", "detail"];
    const lines = [header.join(",")];
    for (const run of visibleRuns) {
      for (const row of run.rows) {
        const detail = row.error_message || row.description || row.prospect_email || "";
        lines.push(
          [
            run.runId ?? "",
            agentName(run.agentId),
            run.startedAt,
            run.finishedAt,
            outcomeOf(run),
            row.action_type,
            row.status ?? "",
            detail,
          ]
            .map((v) => `"${String(v).replace(/"/g, '""')}"`)
            .join(","),
        );
      }
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `agent-run-history-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <Card className="border-border/60 bg-card/60">
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-base font-semibold">
                <History className="w-4 h-4" />
                Run history
              </CardTitle>
              <CardDescription>
                Every agent run, what it produced, and the reason when it produced nothing.
              </CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Select value={agentFilter} onValueChange={setAgentFilter}>
                <SelectTrigger className="h-9 w-[180px]">
                  <SelectValue placeholder="All agents" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All agents</SelectItem>
                  {agents.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.agent_name || "Untitled agent"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={outcomeFilter} onValueChange={setOutcomeFilter}>
                <SelectTrigger className="h-9 w-[170px]">
                  <SelectValue placeholder="All outcomes" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All outcomes</SelectItem>
                  <SelectItem value="produced">Produced work</SelectItem>
                  <SelectItem value="empty">Nothing produced</SelectItem>
                  <SelectItem value="failed">Failed</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" size="sm" className="gap-1.5" onClick={load} disabled={loading}>
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                Refresh
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={exportCsv}
                disabled={visibleRuns.length === 0}
              >
                <Download className="w-4 h-4" />
                Export
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-10 text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin" />
            </div>
          ) : visibleRuns.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No agent runs recorded yet. Once you run an agent, every run shows up here.
            </p>
          ) : (
            <div className="space-y-2">
              {visibleRuns.map((run) => {
                const outcome = outcomeOf(run);
                const isOpen = !!expanded[run.key];
                return (
                  <div key={run.key} className="rounded-lg border border-border/60 bg-background/40">
                    <button
                      type="button"
                      onClick={() => setExpanded((p) => ({ ...p, [run.key]: !p[run.key] }))}
                      className="flex w-full items-start gap-3 p-3 text-left hover:bg-muted/40 rounded-lg transition-colors"
                    >
                      {isOpen ? (
                        <ChevronDown className="mt-0.5 w-4 h-4 shrink-0 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="mt-0.5 w-4 h-4 shrink-0 text-muted-foreground" />
                      )}
                      <div className="min-w-0 flex-1 space-y-1.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-medium text-foreground">{agentName(run.agentId)}</span>
                          {agentRole(run.agentId) && (
                            <Badge variant="outline" className="text-[10px]">
                              {agentRole(run.agentId)}
                            </Badge>
                          )}
                          {outcome === "produced" && (
                            <Badge
                              variant="outline"
                              className="gap-1 text-[10px] bg-green-500/15 text-green-400 border-green-500/30"
                            >
                              <CheckCircle2 className="w-3 h-3" />
                              Produced {run.produced} action{run.produced === 1 ? "" : "s"}
                            </Badge>
                          )}
                          {outcome === "empty" && (
                            <Badge
                              variant="outline"
                              className="gap-1 text-[10px] bg-muted/40 text-muted-foreground border-border"
                            >
                              <MinusCircle className="w-3 h-3" />
                              Nothing produced
                            </Badge>
                          )}
                          {outcome === "failed" && (
                            <Badge
                              variant="outline"
                              className="gap-1 text-[10px] bg-red-500/15 text-red-400 border-red-500/30"
                            >
                              <AlertTriangle className="w-3 h-3" />
                              Failed
                            </Badge>
                          )}
                          {run.summary?.metadata?.mode === "approval" && (
                            <Badge variant="outline" className="text-[10px] bg-amber-500/15 text-amber-400 border-amber-500/30">
                              Approval mode
                            </Badge>
                          )}
                          {run.summary?.metadata?.trigger && (
                            <Badge variant="outline" className="text-[10px] capitalize">
                              {String(run.summary.metadata.trigger)}
                            </Badge>
                          )}
                          {run.legacy && (
                            <Badge variant="outline" className="text-[10px] text-muted-foreground">
                              Grouped by day
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {formatDistanceToNow(new Date(run.finishedAt), { addSuffix: true })} ·{" "}
                          {format(new Date(run.startedAt), "MMM d, yyyy 'at' p")}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {outcome === "produced"
                            ? run.summary?.description ?? `${run.rows.length} action(s) recorded.`
                            : reasonFor(run)}
                        </p>
                        {run.produced > 0 && (
                          <div className="flex flex-wrap gap-1.5 pt-0.5">
                            {Object.entries(run.counts)
                              .filter(([type]) => PRODUCED_TYPES.has(type))
                              .map(([type, count]) => (
                                <Badge key={type} variant="outline" className="text-[10px] gap-1">
                                  {ACTION_META[type]?.icon}
                                  {ACTION_META[type]?.label ?? type} · {count}
                                </Badge>
                              ))}
                            {run.skipped > 0 && (
                              <Badge variant="outline" className="text-[10px] text-muted-foreground">
                                {run.skipped} skipped
                              </Badge>
                            )}
                            {run.errors > 0 && (
                              <Badge variant="outline" className="text-[10px] text-red-400 border-red-500/30">
                                {run.errors} error{run.errors === 1 ? "" : "s"}
                              </Badge>
                            )}
                          </div>
                        )}
                      </div>
                    </button>

                    {isOpen && (
                      <div className="border-t border-border/60 divide-y divide-border/40">
                        {run.rows.map((row) => {
                          const meta = ACTION_META[row.action_type];
                          const reason = row.metadata?.reason as string | undefined;
                          return (
                            <div key={row.id} className="flex items-start gap-3 px-4 py-2.5">
                              <span className="mt-1 shrink-0">{meta?.icon ?? <History className="w-3.5 h-3.5" />}</span>
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="text-xs font-medium text-foreground">
                                    {meta?.label ?? row.action_type}
                                  </span>
                                  {row.prospect_email && (
                                    <span className="truncate text-xs text-muted-foreground">{row.prospect_email}</span>
                                  )}
                                  {row.classification && (
                                    <Badge variant="outline" className="text-[10px] capitalize">
                                      {row.classification.replace(/_/g, " ")}
                                    </Badge>
                                  )}
                                  {reason && (
                                    <Badge variant="outline" className="text-[10px] text-muted-foreground">
                                      {REASON_LABELS[reason] ?? reason.replace(/_/g, " ")}
                                    </Badge>
                                  )}
                                  {row.metadata?.phase && (
                                    <Badge variant="outline" className="text-[10px] capitalize text-muted-foreground">
                                      {String(row.metadata.phase)}
                                    </Badge>
                                  )}
                                </div>
                                {(row.description || row.error_message || row.subject) && (
                                  <p
                                    className={`mt-0.5 text-xs ${
                                      row.error_message ? "text-red-400" : "text-muted-foreground"
                                    }`}
                                  >
                                    {row.error_message || row.description || row.subject}
                                  </p>
                                )}
                              </div>
                              <span className="shrink-0 text-[11px] text-muted-foreground">
                                {format(new Date(row.created_at), "p")}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

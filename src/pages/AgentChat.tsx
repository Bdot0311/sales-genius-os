import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Bot,
  Plus,
  SendHorizonal,
  Loader2,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  Clock,
  ArrowLeft,
  Square,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";
import { ChatDraftCard, type ChatDraft } from "@/components/agent/ChatDraftCard";
import { roleLabel } from "@/components/agent/AgentRoles";
import { AgentWorkingIndicator } from "@/components/agent/AgentWorkingIndicator";


interface Thread {
  id: string;
  title: string;
  autonomy: "approval" | "autonomous";
  updated_at: string;
  agent_config_id?: string | null;
}

interface AgentOption {
  id: string;
  agent_name: string | null;
  role: string | null;
  enabled: boolean | null;
  is_primary: boolean | null;
}

interface ToolEvent {
  name: string;
  label: string;
  status: "ok" | "error" | "queued";
  detail: string;
  approval_id?: string;
  approval_kind?: string;
  approval_summary?: string;
  drafts?: ChatDraft[];
}


interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  tool_events: ToolEvent[] | null;
  created_at: string;
}

const SUGGESTIONS = [
  "Take my newest leads, enrich and score them, then draft first-touch emails",
  "Which of my leads are worth contacting this week and why?",
  "Draft a 4-touch sequence for my highest ICP score lead",
  "Check my recent replies and tell me who needs a response",
];

const AgentChat = () => {
  const navigate = useNavigate();
  const { threadId } = useParams<{ threadId: string }>();
  const [threads, setThreads] = useState<Thread[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  // What the agent is currently working on, so the status card can describe it.
  const [activeRequest, setActiveRequest] = useState<string | null>(null);
  const [activePass, setActivePass] = useState(0);

  const [stopping, setStopping] = useState(false);
  const [loading, setLoading] = useState(true);
  const [autonomy, setAutonomy] = useState<"approval" | "autonomous">("approval");
  const [agents, setAgents] = useState<AgentOption[]>([]);
  const [agentId, setAgentId] = useState<string | null>(null);
  const [approvalStatus, setApprovalStatus] = useState<Record<string, string>>({});
  const [resolving, setResolving] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);


  const loadThreads = useCallback(async () => {
    const { data } = await supabase
      .from("agent_chat_threads")
      .select("id, title, autonomy, updated_at, agent_config_id")
      .order("updated_at", { ascending: false })
      .limit(50);
    const list = (data ?? []) as Thread[];
    setThreads(list);
    return list;
  }, []);

  // Every agent build the user owns, so a conversation can be pointed at a
  // non-primary build (e.g. a lead-gen only agent).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("agent_configs")
        .select("id, agent_name, role, enabled, is_primary")
        .order("is_primary", { ascending: false })
        .order("updated_at", { ascending: false });
      if (!cancelled) setAgents((data ?? []) as AgentOption[]);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const createThread = useCallback(async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.user) {
      navigate("/auth");
      return null;
    }
    const { data, error } = await supabase
      .from("agent_chat_threads")
      .insert({ user_id: session.user.id })
      .select("id, title, autonomy, updated_at, agent_config_id")
      .single();
    if (error) {
      toast.error("Could not start a conversation");
      return null;
    }
    setThreads((prev) => [data as Thread, ...prev]);
    return data as Thread;
  }, [navigate]);

  // Bootstrap: pick or create the active thread and route to it.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const list = await loadThreads();
      if (cancelled) return;
      if (!threadId) {
        const target = list[0] ?? (await createThread());
        if (target && !cancelled) navigate(`/dashboard/agent/chat/${target.id}`, { replace: true });
        setLoading(false);
        return;
      }
      const { data: thread } = await supabase
        .from("agent_chat_threads")
        .select("id, title, autonomy, updated_at, agent_config_id")
        .eq("id", threadId)
        .maybeSingle();
      if (cancelled) return;
      if (!thread) {
        navigate("/dashboard/agent/chat", { replace: true });
        return;
      }
      setAutonomy((thread as Thread).autonomy);
      setAgentId((thread as Thread).agent_config_id ?? null);
      const { data: msgs } = await supabase
        .from("agent_chat_messages")
        .select("id, role, content, tool_events, created_at")
        .eq("thread_id", threadId)
        .order("created_at", { ascending: true });
      if (cancelled) return;
      setMessages((msgs ?? []) as unknown as ChatMessage[]);
      setLoading(false);
      inputRef.current?.focus();
    })();
    return () => {
      cancelled = true;
    };
  }, [threadId, loadThreads, createThread, navigate]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sending]);

  const handleNewThread = async () => {
    const t = await createThread();
    if (t) navigate(`/dashboard/agent/chat/${t.id}`);
  };

  const handleDeleteThread = async (id: string) => {
    await supabase.from("agent_chat_threads").delete().eq("id", id);
    const remaining = threads.filter((t) => t.id !== id);
    setThreads(remaining);
    if (id === threadId) {
      if (remaining[0]) navigate(`/dashboard/agent/chat/${remaining[0].id}`, { replace: true });
      else navigate("/dashboard/agent/chat", { replace: true });
    }
  };

  const handleAutonomyChange = async (value: "approval" | "autonomous") => {
    setAutonomy(value);
    if (!threadId) return;
    await supabase.from("agent_chat_threads").update({ autonomy: value }).eq("id", threadId);
    toast.success(
      value === "autonomous"
        ? "Full autonomy on — the agent will send and enroll without asking"
        : "Approval mode on — the agent will ask you to approve sends right in the chat",
    );
  };

  const handleAgentChange = async (value: string) => {
    const next = value === "primary" ? null : value;
    setAgentId(next);
    if (!threadId) return;
    await supabase.from("agent_chat_threads").update({ agent_config_id: next }).eq("id", threadId);
  };

  const handleSend = async (text?: string) => {
    const content = (text ?? input).trim();
    if (!content || !threadId || sending) return;
    setInput("");
    setSending(true);
    const optimistic: ChatMessage = {
      id: `local-${Date.now()}`,
      role: "user",
      content,
      tool_events: null,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimistic]);
    try {
      // Long batches hit the edge function's wall clock. When that happens the
      // server flags the turn as truncated and we resume it automatically
      // instead of asking the user to type "continue".
      const MAX_AUTO_CONTINUES = 4;
      let attempt = 0;
      let truncated = true;
      let completedMutationKeys: string[] = [];
      while (truncated && attempt <= MAX_AUTO_CONTINUES) {
        const { data, error } = await supabase.functions.invoke("agent-chat", {
          body: {
            threadId,
            message: content,
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            ...(attempt > 0 ? { autoContinue: true, completedMutationKeys } : {}),
            ...(agentId ? { agentId } : {}),
          },
        });
        if (error) throw error;
        if ((data as any)?.error) throw new Error((data as any).error);
        setMessages((prev) => [...prev, (data as any).message as ChatMessage]);
        completedMutationKeys = Array.isArray((data as any)?.completedMutationKeys)
          ? (data as any).completedMutationKeys.filter((value: unknown): value is string => typeof value === "string")
          : completedMutationKeys;
        truncated = (data as any)?.truncated === true;
        attempt += 1;
      }
      if (truncated) {
        toast.info('Still more to run — reply "continue" to finish the rest.');
      }
      loadThreads();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      toast.error(`Agent error: ${message}`);
      // The turn may have completed real work (enrichments, drafts) before failing.
      // Re-read the thread so nothing the agent saved disappears from the chat.
      const { data: msgs } = await supabase
        .from("agent_chat_messages")
        .select("id, role, content, tool_events, created_at")
        .eq("thread_id", threadId)
        .order("created_at", { ascending: true });
      if (msgs?.length) {
        setMessages(msgs as unknown as ChatMessage[]);
      } else {
        setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
        setInput(content);
      }
    } finally {
      setSending(false);
      setStopping(false);
      inputRef.current?.focus();
    }
  };


  // Interrupt a run in flight. The flag is picked up between the agent's steps,
  // so anything already finished stays saved and nothing new is sent.
  const handleStop = async () => {
    if (!threadId || stopping) return;
    setStopping(true);
    const { error } = await supabase
      .from("agent_chat_threads")
      .update({ cancel_requested_at: new Date().toISOString() })
      .eq("id", threadId);
    if (error) {
      setStopping(false);
      toast.error("Could not stop the run — try again");
      return;
    }
    toast.info("Stopping the agent after the current step…");
  };

  // Keep inline approval cards in sync with the stored decision.
  useEffect(() => {
    const ids = messages
      .flatMap((m) => m.tool_events ?? [])
      .map((e) => e.approval_id)
      .filter((id): id is string => Boolean(id));
    if (!ids.length) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("agent_approvals")
        .select("id, status")
        .in("id", ids);
      if (cancelled || !data) return;
      setApprovalStatus((prev) => {
        const next = { ...prev };
        for (const row of data as { id: string; status: string }[]) next[row.id] = row.status;
        return next;
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [messages]);

  const handleApprovalDecision = async (
    approvalId: string,
    decision: "approve" | "reject",
  ) => {
    if (!threadId || resolving) return;
    setResolving(approvalId);
    try {
      const { data, error } = await supabase.functions.invoke("agent-chat", {
        body: {
          threadId,
          action: "resolve_approval",
          approvalId,
          decision,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          ...(agentId ? { agentId } : {}),
        },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      const status = (data as any)?.approval?.status ?? decision;
      setApprovalStatus((prev) => ({ ...prev, [approvalId]: status }));
      if ((data as any)?.message) {
        setMessages((prev) => [...prev, (data as any).message as ChatMessage]);
      }
      loadThreads();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      toast.error(`Could not ${decision} that: ${message}`);
    } finally {
      setResolving(null);
    }
  };

  const statusIcon = (status: ToolEvent["status"]) =>
    status === "ok" ? (
      <CheckCircle2 className="w-3.5 h-3.5 text-green-400 flex-shrink-0" />
    ) : status === "queued" ? (
      <Clock className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
    ) : (
      <AlertTriangle className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />
    );

  return (
    <DashboardLayout>
      <div className="flex flex-col lg:flex-row gap-4 h-[calc(100dvh-8.5rem)] min-h-0">
        {/* Threads */}
        <Card className="w-full lg:w-64 flex-shrink-0 max-h-[34vh] lg:max-h-none p-3 flex flex-col gap-3 overflow-hidden">

          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate("/dashboard/agent")}
              aria-label="Back to agent"
            >
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <Button className="flex-1 gap-2" size="sm" onClick={handleNewThread}>
              <Plus className="w-4 h-4" />
              New chat
            </Button>
          </div>
          <ScrollArea className="flex-1 -mx-1">
            <div className="px-1 space-y-1">
              {threads.map((t) => (
                <div
                  key={t.id}
                  className={cn(
                    "group flex items-center gap-1 rounded-lg px-2 py-2 text-sm cursor-pointer transition-colors",
                    t.id === threadId ? "bg-primary/15 text-foreground" : "hover:bg-muted/50",
                  )}
                >
                  <button
                    type="button"
                    className="flex-1 min-w-0 text-left"
                    onClick={() => navigate(`/dashboard/agent/chat/${t.id}`)}
                  >
                    <span className="block truncate">{t.title}</span>
                    <span className="block text-[10px] text-muted-foreground">
                      {formatDistanceToNow(new Date(t.updated_at), { addSuffix: true })}
                    </span>
                  </button>
                  <button
                    type="button"
                    aria-label="Delete conversation"
                    className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-red-400"
                    onClick={() => handleDeleteThread(t.id)}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </ScrollArea>
        </Card>

        {/* Chat */}
        <Card className="flex-1 min-h-0 min-w-0 flex flex-col overflow-hidden">
          <div className="flex flex-col gap-2 border-b border-border/60 px-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-3 sm:px-4">
            <div className="flex items-center gap-2 min-w-0">
              <div className="p-1.5 rounded-lg bg-primary/15 flex-shrink-0">
                <Bot className="w-4 h-4 text-primary" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold truncate">Chat with your AI SDR</p>
                <p className="text-xs text-muted-foreground truncate">
                  It can enrich, score, draft, send and run full cycles on your leads
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 sm:flex-nowrap sm:flex-shrink-0">
            {agents.length > 1 && (
              <Select value={agentId ?? "primary"} onValueChange={handleAgentChange}>
                <SelectTrigger className="w-full min-w-0 sm:w-[190px]" aria-label="Agent build">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="primary">Primary agent</SelectItem>
                  {agents.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {(a.agent_name || "Agent") + " · " + roleLabel(a.role)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <Select value={autonomy} onValueChange={(v) => handleAutonomyChange(v as any)}>
              <SelectTrigger className="w-full min-w-0 sm:w-[168px]" aria-label="Autonomy">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="approval">Ask before acting</SelectItem>
                <SelectItem value="autonomous">Full autonomy</SelectItem>
              </SelectContent>
            </Select>
            </div>
          </div>

          <ScrollArea className="flex-1 min-h-0 px-3 sm:px-4">
            <div className="py-4 space-y-5 max-w-3xl mx-auto">

              {loading && (
                <div className="flex justify-center py-10">
                  <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                </div>
              )}

              {!loading && messages.length === 0 && (
                <div className="py-10 text-center space-y-5">
                  <div className="inline-flex p-3 rounded-2xl bg-primary/10">
                    <Bot className="w-7 h-7 text-primary" />
                  </div>
                  <div>
                    <p className="font-semibold">Hand the work over</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      Search leads however you like, then tell the agent to take it from there.
                    </p>
                  </div>
                  <div className="grid sm:grid-cols-2 gap-2 text-left">
                    {SUGGESTIONS.map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => handleSend(s)}
                        className="rounded-xl border border-border/60 bg-card/60 p-3 text-sm hover:border-primary/50 transition-colors"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {messages.map((m) =>
                m.role === "user" ? (
                  <div key={m.id} className="flex justify-end">
                    <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-primary px-4 py-2.5 text-sm text-primary-foreground whitespace-pre-wrap break-words">
                      {m.content}
                    </div>
                  </div>
                ) : (
                  <div key={m.id} className="min-w-0 space-y-2">
                    {!!m.tool_events?.length && (
                      <div className="space-y-1">
                        {m.tool_events
                          .filter((e) => !e.approval_id)
                          .map((e, i) => (
                            <div
                              key={`${m.id}-${i}`}
                              className="flex min-w-0 items-start gap-2 text-xs text-muted-foreground"
                            >
                              <span className="mt-0.5 flex-shrink-0">{statusIcon(e.status)}</span>
                              <span className="min-w-0 break-words">
                                <span className="font-medium text-foreground/80">{e.label}</span>
                                <span> — {e.detail}</span>
                              </span>
                            </div>
                          ))}

                      </div>
                    )}

                    {!!(m.tool_events ?? []).some((e) => e.drafts?.length) && (
                      <div className="space-y-2">
                        {(m.tool_events ?? [])
                          .flatMap((e) => e.drafts ?? [])
                          .map((d) => (
                            <ChatDraftCard key={d.draft_id} draft={d} />
                          ))}
                      </div>
                    )}



                    {(m.tool_events ?? [])
                      .filter((e) => e.approval_id)
                      .map((e) => {
                        const status = approvalStatus[e.approval_id!] ?? "pending";
                        const pending = status === "pending";
                        return (
                          <div
                            key={e.approval_id}
                            className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 space-y-2"
                          >
                            <div className="flex items-center gap-2 text-xs">
                              <Clock className="w-3.5 h-3.5 text-amber-400" />
                              <span className="font-medium text-foreground">
                                {pending ? "Approval needed" : "Approval request"}
                              </span>
                            </div>
                            <p className="text-sm text-foreground/90">{e.detail}</p>
                            {e.approval_summary && (
                              <p className="text-xs text-muted-foreground whitespace-pre-wrap border-l-2 border-border/60 pl-2">
                                {e.approval_summary}
                              </p>
                            )}
                            {pending ? (
                              <div className="flex gap-2 pt-1">
                                <Button
                                  size="sm"
                                  className="gap-1.5"
                                  disabled={resolving === e.approval_id}
                                  onClick={() => handleApprovalDecision(e.approval_id!, "approve")}
                                >
                                  {resolving === e.approval_id ? (
                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                  ) : (
                                    <CheckCircle2 className="w-3.5 h-3.5" />
                                  )}
                                  Approve
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  disabled={resolving === e.approval_id}
                                  onClick={() => handleApprovalDecision(e.approval_id!, "reject")}
                                >
                                  Reject
                                </Button>
                              </div>
                            ) : (
                              <Badge
                                variant="outline"
                                className={cn(
                                  "px-1.5 py-0 text-[10px]",
                                  status === "approved"
                                    ? "bg-green-500/15 text-green-400 border-green-500/30"
                                    : "bg-muted/40 text-muted-foreground border-border",
                                )}
                              >
                                {status === "approved" ? "Approved" : "Rejected"}
                              </Badge>
                            )}
                          </div>
                        );
                      })}

                    <div className="prose prose-sm prose-invert max-w-none break-words text-sm leading-relaxed [&_pre]:overflow-x-auto [&_table]:block [&_table]:overflow-x-auto">
                      <ReactMarkdown>{m.content}</ReactMarkdown>
                    </div>
                  </div>
                ),
              )}

              {sending && (
                <div className="space-y-2">
                  <AgentWorkingIndicator />
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5"
                    onClick={handleStop}
                    disabled={stopping}
                  >
                    {stopping ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Square className="w-3.5 h-3.5" />
                    )}
                    {stopping ? "Stopping…" : "Stop run"}
                  </Button>
                </div>
              )}
              <div ref={bottomRef} />
            </div>
          </ScrollArea>

          <div className="border-t border-border/60 p-3">
            <div className="max-w-3xl mx-auto flex min-w-0 items-end gap-2">
              <Textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                placeholder="e.g. Enrich the 12 leads I just saved, score them, and draft emails for anyone above 70"
                rows={2}
                className="min-w-0 flex-1 resize-none text-base sm:text-sm"
                disabled={sending || loading}
              />
              {sending ? (
                <Button
                  size="icon"
                  variant="destructive"
                  className="flex-shrink-0"
                  onClick={handleStop}
                  disabled={stopping}
                  aria-label="Stop the agent"
                  title="Stop the agent"
                >
                  {stopping ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Square className="w-4 h-4" />
                  )}
                </Button>
              ) : (
                <Button
                  size="icon"
                  className="flex-shrink-0"
                  onClick={() => handleSend()}
                  disabled={loading || !input.trim()}
                  aria-label="Send message"
                >
                  <SendHorizonal className="w-4 h-4" />
                </Button>
              )}
            </div>
            <p className="max-w-3xl mx-auto mt-2 text-[11px] text-muted-foreground">
              {autonomy === "autonomous"
                ? "Full autonomy: sends, enrollments and full runs execute immediately."
                : "Approval mode: the agent asks you to approve sends and runs right here in the chat."}
            </p>
          </div>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default AgentChat;

import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { usePlanFeatures } from "@/hooks/use-plan-features";
import { FeatureGateModal } from "@/components/dashboard/FeatureGateModal";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Inbox as InboxIcon,
  Send,
  Archive,
  Mail,
  Lock,
  RefreshCw,
  Search,
  ArrowLeft,
  MailOpen,
  Eye,
} from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";
import { Classification, CLASSIFICATION_CONFIG } from "@/lib/reply-classifier";
import { toast } from "sonner";

type Folder = "all" | "unread" | "replied" | "awaiting" | "sent";

const FOLDERS: { value: Folder; label: string }[] = [
  { value: "all", label: "All Mail" },
  { value: "unread", label: "Unread" },
  { value: "replied", label: "Replied" },
  { value: "awaiting", label: "Awaiting Reply" },
  { value: "sent", label: "Sent" },
];

interface SentRow {
  id: string;
  to_email: string;
  subject: string | null;
  body_text: string | null;
  body_html: string | null;
  sent_at: string | null;
  created_at: string;
  status: string | null;
  gmail_thread_id: string | null;
  opened_at: string | null;
  replied_at: string | null;
  lead_id: string | null;
  leads?: { contact_name: string | null; company_name: string | null } | null;
  reply_analysis?: {
    id: string;
    reply_content: string | null;
    intent_classification: string | null;
    analyzed_at: string | null;
    created_at: string;
  }[];
}

interface ReplyThreadRow {
  id: string;
  lead_id: string | null;
  subject: string | null;
  reply_body: string | null;
  sender_email: string;
  classification: string | null;
  read: boolean | null;
  created_at: string;
}

interface Message {
  id: string;
  direction: "out" | "in";
  from: string;
  body: string;
  at: string;
  classification?: string | null;
  opened?: boolean;
}

interface Conversation {
  key: string;
  counterpart: string;
  contactName: string | null;
  companyName: string | null;
  subject: string;
  leadId: string | null;
  gmailThreadId: string | null;
  messages: Message[];
  lastAt: string;
  hasReply: boolean;
  unread: boolean;
  classification: string | null;
  replyThreadIds: string[];
}

const normalizeSubject = (s: string | null | undefined) =>
  (s || "").replace(/^((re|fwd)\s*:\s*)+/i, "").trim().toLowerCase();

const Inbox = () => {
  const queryClient = useQueryClient();
  const { hasFeature, gateModalOpen, setGateModalOpen, gatedFeature, currentPlan, triggerGate } =
    usePlanFeatures();
  const inboxGated = !hasFeature("unifiedInbox");
  const [folder, setFolder] = useState<Folder>("all");
  const [search, setSearch] = useState("");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [draftReply, setDraftReply] = useState("");
  const [syncing, setSyncing] = useState(false);

  const { data: sent, isLoading: loadingSent } = useQuery({
    queryKey: ["inbox-sent-emails"],
    queryFn: async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      const since = new Date(Date.now() - 120 * 24 * 60 * 60 * 1000).toISOString();
      const { data, error } = await supabase
        .from("sent_emails")
        .select(
          `id, to_email, subject, body_text, body_html, sent_at, created_at, status,
           gmail_thread_id, opened_at, replied_at, lead_id,
           leads(contact_name, company_name),
           reply_analysis(id, reply_content, intent_classification, analyzed_at, created_at)`
        )
        .eq("user_id", user.id)
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(300);
      if (error) throw error;
      return (data || []) as unknown as SentRow[];
    },
  });

  const { data: replyThreads, isLoading: loadingReplies } = useQuery({
    queryKey: ["inbox-reply-threads"],
    queryFn: async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      const { data, error } = await supabase
        .from("reply_threads")
        .select("id, lead_id, subject, reply_body, sender_email, classification, read, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(300);
      if (error) throw error;
      return (data || []) as ReplyThreadRow[];
    },
  });

  const isLoading = loadingSent || loadingReplies;

  const conversations = useMemo<Conversation[]>(() => {
    const map = new Map<string, Conversation>();

    for (const row of [...(sent || [])].reverse()) {
      const key = row.gmail_thread_id || `sent:${row.id}`;
      const at = row.sent_at || row.created_at;
      const existing = map.get(key);
      const outMessage: Message = {
        id: `out:${row.id}`,
        direction: "out",
        from: "You",
        body: row.body_text || (row.body_html ? row.body_html.replace(/<[^>]+>/g, " ") : ""),
        at,
        opened: !!row.opened_at,
      };
      const inMessages: Message[] = (row.reply_analysis || []).map((ra) => ({
        id: `in:${ra.id}`,
        direction: "in" as const,
        from: row.to_email,
        body: ra.reply_content || "",
        at: ra.analyzed_at || ra.created_at,
        classification: ra.intent_classification,
      }));

      if (existing) {
        existing.messages.push(outMessage, ...inMessages);
        existing.lastAt = at > existing.lastAt ? at : existing.lastAt;
        existing.leadId = existing.leadId || row.lead_id;
      } else {
        map.set(key, {
          key,
          counterpart: row.to_email,
          contactName: row.leads?.contact_name ?? null,
          companyName: row.leads?.company_name ?? null,
          subject: row.subject || "(no subject)",
          leadId: row.lead_id,
          gmailThreadId: row.gmail_thread_id,
          messages: [outMessage, ...inMessages],
          lastAt: at,
          hasReply: inMessages.length > 0,
          unread: false,
          classification: inMessages[inMessages.length - 1]?.classification ?? null,
          replyThreadIds: [],
        });
      }
    }

    const all = Array.from(map.values());

    // Attach legacy / agent reply_threads rows to their conversation
    for (const rt of replyThreads || []) {
      const candidates = all.filter(
        (c) =>
          (rt.lead_id && c.leadId === rt.lead_id) ||
          c.counterpart.toLowerCase() === rt.sender_email.toLowerCase() ||
          normalizeSubject(c.subject) === normalizeSubject(rt.subject)
      );
      const target =
        candidates.sort((a, b) => (a.lastAt < b.lastAt ? 1 : -1))[0] ?? null;
      const message: Message = {
        id: `rt:${rt.id}`,
        direction: "in",
        from: rt.sender_email,
        body: rt.reply_body || "",
        at: rt.created_at,
        classification: rt.classification,
      };
      if (target) {
        target.messages.push(message);
        target.hasReply = true;
        target.replyThreadIds.push(rt.id);
        target.classification = rt.classification ?? target.classification;
        if (!rt.read) target.unread = true;
        if (rt.created_at > target.lastAt) target.lastAt = rt.created_at;
      } else {
        all.push({
          key: `rt:${rt.id}`,
          counterpart: rt.sender_email,
          contactName: null,
          companyName: null,
          subject: rt.subject || "(no subject)",
          leadId: rt.lead_id,
          gmailThreadId: null,
          messages: [message],
          lastAt: rt.created_at,
          hasReply: true,
          unread: !rt.read,
          classification: rt.classification,
          replyThreadIds: [rt.id],
        });
      }
    }

    for (const c of all) {
      c.messages.sort((a, b) => (a.at < b.at ? -1 : 1));
    }

    return all.sort((a, b) => (a.lastAt < b.lastAt ? 1 : -1));
  }, [sent, replyThreads]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return conversations.filter((c) => {
      if (folder === "unread" && !c.unread) return false;
      if (folder === "replied" && !c.hasReply) return false;
      if (folder === "awaiting" && c.hasReply) return false;
      if (folder === "sent" && !c.messages.some((m) => m.direction === "out")) return false;
      if (!q) return true;
      return (
        c.counterpart.toLowerCase().includes(q) ||
        c.subject.toLowerCase().includes(q) ||
        (c.contactName || "").toLowerCase().includes(q) ||
        (c.companyName || "").toLowerCase().includes(q) ||
        c.messages.some((m) => m.body.toLowerCase().includes(q))
      );
    });
  }, [conversations, folder, search]);

  const selected = conversations.find((c) => c.key === selectedKey) || null;

  const markRead = useMutation({
    mutationFn: async (ids: string[]) => {
      if (!ids.length) return;
      await supabase.from("reply_threads").update({ read: true }).in("id", ids);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["inbox-reply-threads"] }),
  });

  const archiveConversation = useMutation({
    mutationFn: async (conv: Conversation) => {
      if (conv.replyThreadIds.length) {
        await supabase.from("reply_threads").delete().in("id", conv.replyThreadIds);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["inbox-reply-threads"] });
      setSelectedKey(null);
      toast.success("Conversation archived");
    },
  });

  const sendReply = useMutation({
    mutationFn: async ({ conv, body }: { conv: Conversation; body: string }) => {
      const subject = /^re:/i.test(conv.subject) ? conv.subject : `Re: ${conv.subject}`;
      const { data, error } = await supabase.functions.invoke("send-email", {
        body: {
          to: conv.counterpart,
          subject,
          body,
          leadId: conv.leadId,
          threadId: conv.gmailThreadId,
        },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      return data;
    },
    onSuccess: () => {
      setDraftReply("");
      queryClient.invalidateQueries({ queryKey: ["inbox-sent-emails"] });
      toast.success("Reply sent");
    },
    onError: (e: any) => toast.error(e?.message || "Failed to send reply"),
  });

  const handleSync = async () => {
    setSyncing(true);
    try {
      const { error } = await supabase.functions.invoke("inbox-sync", { body: {} });
      if (error) throw error;
      await queryClient.invalidateQueries({ queryKey: ["inbox-sent-emails"] });
      await queryClient.invalidateQueries({ queryKey: ["inbox-reply-threads"] });
      toast.success("Inbox synced");
    } catch (e: any) {
      toast.error(e?.message || "Sync failed");
    } finally {
      setSyncing(false);
    }
  };

  const handleSelect = (conv: Conversation) => {
    setSelectedKey(conv.key);
    setDraftReply("");
    if (conv.unread && conv.replyThreadIds.length) markRead.mutate(conv.replyThreadIds);
  };

  const unreadCount = conversations.filter((c) => c.unread).length;

  return (
    <DashboardLayout>
      <div className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Inbox</h1>
            <p className="text-muted-foreground">
              Every outreach conversation from your connected mailboxes
              {unreadCount > 0 ? ` · ${unreadCount} unread` : ""}
            </p>
          </div>
          {!inboxGated && (
            <Button variant="outline" size="sm" onClick={handleSync} disabled={syncing}>
              <RefreshCw className={`w-3.5 h-3.5 mr-2 ${syncing ? "animate-spin" : ""}`} />
              {syncing ? "Syncing…" : "Sync"}
            </Button>
          )}
        </div>

        {inboxGated ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Lock className="w-12 h-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">Unified Inbox</h3>
              <p className="text-muted-foreground text-center mb-4">
                See every sent email and reply in one threaded inbox, and respond without leaving
                OutReign. Available on Growth and above.
              </p>
              <Button onClick={() => triggerGate("unifiedInbox")}>Upgrade to Unlock</Button>
            </CardContent>
          </Card>
        ) : isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-20" />
            ))}
          </div>
        ) : conversations.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-12">
              <InboxIcon className="w-12 h-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No conversations yet</h3>
              <p className="text-muted-foreground text-center">
                Once you send outreach, every thread and reply will show up here.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="flex gap-4 h-[calc(100vh-220px)]">
            {/* Left: conversation list */}
            <div
              className={`w-full md:w-80 flex-shrink-0 flex-col border rounded-lg overflow-hidden ${
                selected ? "hidden md:flex" : "flex"
              }`}
            >
              <div className="p-2 border-b space-y-2">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search mail"
                    className="h-8 pl-8 text-xs"
                  />
                </div>
                <div className="flex gap-1 overflow-x-auto">
                  {FOLDERS.map((f) => (
                    <button
                      key={f.value}
                      onClick={() => setFolder(f.value)}
                      className={`px-2 py-1 text-xs rounded whitespace-nowrap transition-colors ${
                        folder === f.value
                          ? "bg-primary text-primary-foreground"
                          : "hover:bg-muted text-muted-foreground"
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>
              <ScrollArea className="flex-1">
                {filtered.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-8">
                    Nothing in this folder
                  </p>
                ) : (
                  filtered.map((conv) => {
                    const last = conv.messages[conv.messages.length - 1];
                    const config = conv.classification
                      ? CLASSIFICATION_CONFIG[conv.classification as Classification]
                      : null;
                    return (
                      <button
                        key={conv.key}
                        onClick={() => handleSelect(conv)}
                        className={`w-full text-left p-3 border-b transition-colors hover:bg-muted/50 ${
                          selectedKey === conv.key ? "bg-muted" : ""
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <p className={`text-sm truncate ${conv.unread ? "font-semibold" : ""}`}>
                              {conv.contactName || conv.counterpart}
                            </p>
                            {conv.companyName && (
                              <p className="text-xs text-muted-foreground truncate">
                                {conv.companyName}
                              </p>
                            )}
                          </div>
                          <div className="flex items-center gap-1 flex-shrink-0">
                            {conv.messages.length > 1 && (
                              <span className="text-[10px] text-muted-foreground">
                                {conv.messages.length}
                              </span>
                            )}
                            {config && (
                              <Badge variant="outline" className={`text-[10px] ${config.color}`}>
                                {config.emoji}
                              </Badge>
                            )}
                          </div>
                        </div>
                        <p className="text-xs text-muted-foreground truncate mt-1">{conv.subject}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {last?.direction === "out" ? "You: " : ""}
                          {(last?.body || "").slice(0, 80)}
                        </p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-[10px] text-muted-foreground">
                            {formatDistanceToNow(new Date(conv.lastAt), { addSuffix: true })}
                          </span>
                          {!conv.hasReply && (
                            <span className="text-[10px] text-muted-foreground">· awaiting reply</span>
                          )}
                        </div>
                      </button>
                    );
                  })
                )}
              </ScrollArea>
            </div>

            {/* Right: thread view */}
            <div
              className={`flex-1 border rounded-lg overflow-hidden ${
                selected ? "flex" : "hidden md:flex"
              }`}
            >
              {selected ? (
                <div className="flex flex-col h-full w-full">
                  <div className="p-4 border-b space-y-1">
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="md:hidden h-7 w-7"
                        onClick={() => setSelectedKey(null)}
                      >
                        <ArrowLeft className="w-4 h-4" />
                      </Button>
                      <h2 className="font-semibold truncate flex-1">{selected.subject}</h2>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => archiveConversation.mutate(selected)}
                      >
                        <Archive className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {selected.contactName ? `${selected.contactName} · ` : ""}
                      {selected.counterpart}
                      {selected.companyName ? ` · ${selected.companyName}` : ""}
                    </p>
                  </div>

                  <ScrollArea className="flex-1 p-4">
                    <div className="space-y-3">
                      {selected.messages.map((m) => (
                        <div
                          key={m.id}
                          className={`p-3 rounded-lg border max-w-[92%] ${
                            m.direction === "out"
                              ? "ml-auto bg-primary/10 border-primary/20"
                              : "bg-muted/40"
                          }`}
                        >
                          <div className="flex items-center gap-2 mb-1">
                            {m.direction === "out" ? (
                              <Send className="w-3 h-3 text-muted-foreground" />
                            ) : (
                              <Mail className="w-3 h-3 text-muted-foreground" />
                            )}
                            <span className="text-xs font-medium">{m.from}</span>
                            <span className="text-[10px] text-muted-foreground">
                              {format(new Date(m.at), "MMM d, h:mm a")}
                            </span>
                            {m.direction === "out" &&
                              (m.opened ? (
                                <span className="text-[10px] text-muted-foreground inline-flex items-center gap-1">
                                  <Eye className="w-3 h-3" /> opened
                                </span>
                              ) : (
                                <span className="text-[10px] text-muted-foreground inline-flex items-center gap-1">
                                  <MailOpen className="w-3 h-3" /> sent
                                </span>
                              ))}
                            {m.classification &&
                              CLASSIFICATION_CONFIG[m.classification as Classification] && (
                                <Badge
                                  variant="outline"
                                  className={`text-[10px] ${
                                    CLASSIFICATION_CONFIG[m.classification as Classification].color
                                  }`}
                                >
                                  {CLASSIFICATION_CONFIG[m.classification as Classification].emoji}{" "}
                                  {CLASSIFICATION_CONFIG[m.classification as Classification].label}
                                </Badge>
                              )}
                          </div>
                          <p className="text-sm whitespace-pre-wrap">{m.body || "(no content)"}</p>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>

                  <div className="p-4 border-t space-y-2">
                    <Textarea
                      value={draftReply}
                      onChange={(e) => setDraftReply(e.target.value)}
                      placeholder={`Reply to ${selected.counterpart}…`}
                      className="min-h-[90px] text-sm"
                    />
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs text-muted-foreground">
                        Sends in-thread from your connected mailbox.
                      </p>
                      <Button
                        size="sm"
                        disabled={!draftReply.trim() || sendReply.isPending}
                        onClick={() => sendReply.mutate({ conv: selected, body: draftReply })}
                      >
                        <Send className="w-3.5 h-3.5 mr-2" />
                        {sendReply.isPending ? "Sending…" : "Send Reply"}
                      </Button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-center h-full w-full text-muted-foreground">
                  <p className="text-sm">Select a conversation to view</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {gatedFeature && (
        <FeatureGateModal
          open={gateModalOpen}
          onOpenChange={setGateModalOpen}
          feature={gatedFeature}
          currentPlan={currentPlan}
        />
      )}
    </DashboardLayout>
  );
};

export default Inbox;

import { useMemo, useState } from "react";
import { splitQuotedReply, toReadableText } from "@/lib/message-body";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { EmptyState, Panel } from "@/components/dashboard/Panel";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { usePlanFeatures } from "@/hooks/use-plan-features";
import { FeatureGateModal } from "@/components/dashboard/FeatureGateModal";
import { supabase } from "@/integrations/supabase/client";
import { useDemoMode } from "@/hooks/use-demo-mode";
import { maybeMask } from "@/lib/demo-mask";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Send,
  Archive,
  Mail,
  RefreshCw,
  Search,
  ArrowLeft,
  MailOpen,
  Eye,
} from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";
import { Classification, CLASSIFICATION_CONFIG } from "@/lib/reply-classifier";
import { toast } from "sonner";
import { mailState, matchesMailFolder, readAllMail, type InboxFolder } from "@/lib/inbox-mail";

type Folder = InboxFolder;

const FOLDERS: { value: Folder; label: string }[] = [
  { value: "all", label: "All Mail" },
  { value: "unread", label: "Unread" },
  { value: "replied", label: "Replied" },
  { value: "awaiting", label: "Awaiting Reply" },
  { value: "sent", label: "Sent" },
  { value: "drafts", label: "Drafts" },
  { value: "scheduled", label: "Scheduled / Queued" },
  { value: "failed", label: "Failed" },
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
  state?: string;
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

/**
 * One message, with any quoted thread folded away.
 *
 * A reply carries the message it answers, and this view already shows both
 * sides — so the quote is the same text twice, growing with every round. It
 * is kept rather than dropped: "what exactly did they quote back" is
 * occasionally the whole question.
 */
function MessageBody({ body }: { body: string }) {
  const [showQuoted, setShowQuoted] = useState(false);
  const { visible, quoted } = useMemo(() => splitQuotedReply(body), [body]);

  return (
    <>
      {/* Capped where prose stops being comfortable to read. A reply pasted
          from a wide screen otherwise runs the full width of the pane. */}
      <p className="mt-2 max-w-[68ch] whitespace-pre-wrap text-[0.8125rem] leading-relaxed text-foreground/90">
        {visible || "(no content)"}
      </p>
      {quoted ? (
        <>
          <button
            type="button"
            onClick={() => setShowQuoted((v) => !v)}
            className="mt-2 rounded border border-border/50 px-1.5 py-0.5 text-[0.6875rem] text-muted-foreground transition-colors hover:text-foreground"
            aria-expanded={showQuoted}
          >
            {showQuoted ? "Hide quoted text" : "Show quoted text"}
          </button>
          {showQuoted ? (
            <p className="mt-2 max-w-[68ch] whitespace-pre-wrap border-l-2 border-border/60 pl-3 text-[0.8125rem] leading-relaxed text-muted-foreground">
              {quoted}
            </p>
          ) : null}
        </>
      ) : null}
    </>
  );
}

const Inbox = () => {
  const queryClient = useQueryClient();
  const { isDemoMode } = useDemoMode();

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
    enabled: !inboxGated,
    refetchInterval: 15000,
    queryFn: async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      const data = await readAllMail((from, to) => supabase
        .from("sent_emails")
        .select(
          `id, to_email, subject, body_text, body_html, sent_at, created_at, status,
           gmail_thread_id, opened_at, replied_at, lead_id,
           leads(contact_name, company_name),
           reply_analysis(id, reply_content, intent_classification, analyzed_at, created_at)`
        )
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .range(from, to));
      return (data || []) as unknown as SentRow[];
    },
  });

  const { data: drafts, isLoading: loadingDrafts } = useQuery({
    queryKey: ["inbox-email-drafts"],
    enabled: !inboxGated,
    refetchInterval: 15000,
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      return readAllMail((from, to) => supabase.from("email_drafts")
        .select("id, lead_id, subject, body, created_at, updated_at, leads(contact_name, company_name, contact_email)")
        .eq("user_id", user.id).order("created_at", { ascending: false })
        .order("id", { ascending: false }).range(from, to));
    },
  });

  const { data: replyThreads, isLoading: loadingReplies } = useQuery({
    queryKey: ["inbox-reply-threads"],
    enabled: !inboxGated,
    refetchInterval: 15000,
    queryFn: async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      const data = await readAllMail((from, to) => supabase
        .from("reply_threads")
        .select("id, lead_id, subject, reply_body, sender_email, classification, read, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .range(from, to));
      return (data || []) as ReplyThreadRow[];
    },
  });

  const isLoading = loadingSent || loadingReplies || loadingDrafts;

  const conversations = useMemo<Conversation[]>(() => {
    const map = new Map<string, Conversation>();

    const draftRows: SentRow[] = (drafts || []).map(d => ({
      id: `draft:${d.id}`, to_email: d.leads?.contact_email || "No email address",
      subject: d.subject, body_text: d.body, body_html: null,
      sent_at: null, created_at: d.updated_at || d.created_at || new Date(0).toISOString(),
      status: "draft", gmail_thread_id: null, opened_at: null, replied_at: null,
      lead_id: d.lead_id, leads: d.leads,
    }));
    for (const row of [...(sent || []), ...draftRows].reverse()) {
      const key = row.gmail_thread_id || `sent:${row.id}`;
      const at = row.sent_at || row.created_at;
      const existing = map.get(key);
      const outMessage: Message = {
        id: `out:${row.id}`,
        direction: "out",
        from: "You",
        body: toReadableText(row.body_text || row.body_html),
        at,
        opened: !!row.opened_at,
        state: mailState(row.status, row.sent_at),
      };
      const inMessages: Message[] = (row.reply_analysis || []).map((ra) => ({
        id: `in:${ra.id}`,
        direction: "in" as const,
        from: row.to_email,
        body: toReadableText(ra.reply_content),
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
        body: toReadableText(rt.reply_body),
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
  }, [sent, drafts, replyThreads]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return conversations.filter((c) => {
      if (!matchesMailFolder(folder, c)) return false;
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
      if (error) {
        // The body carries the reason; supabase-js only carries the status.
        const { readFunctionError } = await import("@/lib/handle-send-error");
        const { payload } = await readFunctionError(error);
        throw new Error(payload.error ?? "Failed to send reply");
      }
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
      const { error } = await supabase.functions.invoke("inbox-sync", { body: { analyzeReplies: true } });
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

  // The folder strip said "All Mail / Unread / Replied / Awaiting Reply /
  // Sent" and nothing else, so picking one was a guess about whether it held
  // anything. The counts are the whole reason to have folders.
  const counts = useMemo(() => {
    const c = Object.fromEntries(FOLDERS.map(f => [f.value, 0])) as Record<Folder, number>;
    for (const conv of conversations) {
      for (const f of FOLDERS) if (matchesMailFolder(f.value, conv)) c[f.value] += 1;
    }
    return c;
  }, [conversations]);

  const unreadCount = counts.unread;

  return (
    <DashboardLayout>
      <PageHeader
        title="Inbox"
        description="Every outreach conversation from your connected mailboxes."
        actions={
          !inboxGated ? (
            <Button variant="outline" size="sm" onClick={handleSync} disabled={syncing}>
              <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${syncing ? "animate-spin" : ""}`} />
              {syncing ? "Syncing…" : "Sync"}
            </Button>
          ) : undefined
        }
      />
      <div className="space-y-4 pt-4">
        {inboxGated ? (
          <EmptyState
            title="The unified inbox is a Growth feature"
            body="Every sent email and reply in one threaded view, answered without leaving OutReign."
            action={<Button size="sm" onClick={() => triggerGate("unifiedInbox")}>See plans</Button>}
          />
        ) : isLoading ? (
          <Panel>
            <div className="space-y-px p-4">
              {[1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          </Panel>
        ) : conversations.length === 0 ? (
          <EmptyState
            title="No conversations yet"
            body="Once you send outreach, every thread and reply shows up here."
          />
        ) : (
          /* One surface, divided.
             This was two separately bordered boxes with a gap between them, so
             a mail client — the most familiar two-pane layout there is — read
             as two unrelated cards that happened to sit next to each other.
             The list and the thread are one thing split by a rule. */
          <Panel className="flex h-[calc(100dvh-13rem)] min-h-[32rem] flex-col md:grid md:grid-cols-[19rem_minmax(0,1fr)]">
            <div
              className={`flex min-h-0 flex-col md:border-r md:border-border/40 ${
                selected ? "hidden md:flex" : "flex"
              }`}
            >
              <div className="shrink-0 border-b border-border/40 px-3 py-2.5">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search mail"
                    /* 16px on mobile: anything smaller makes iOS Safari zoom
                       the page on focus and never zoom back out. */
                    className="h-9 border-border/50 bg-background pl-8 text-base sm:h-8 sm:text-xs"
                  />
                </div>
                {/* A real tablist, not a row of buttons that looks like one.
                    app CSS already gives [role="tablist"] scrollbar-width:none
                    and hides the webkit scrollbar; without the role this strip
                    missed that rule, and on a platform that always shows
                    scrollbars the native track was drawn straight over an
                    11px-tall row — the labels ended up behind it. The role is
                    also what makes the arrow keys and a screen reader work,
                    which a div of buttons never did. */}
                <div
                  role="tablist"
                  aria-label="Filter conversations"
                  className="-mx-1 mt-2 flex gap-0.5 overflow-x-auto px-1 pb-0.5"
                >
                  {FOLDERS.map((f) => {
                    const active = folder === f.value;
                    return (
                      <button
                        key={f.value}
                        role="tab"
                        aria-selected={active}
                        onClick={() => setFolder(f.value)}
                        /* A filled primary pill for the current folder made the
                           loudest thing on the page a statement of where you
                           already are. The mark is now the smallest one that
                           still reads. */
                        className={`flex shrink-0 items-baseline gap-1.5 whitespace-nowrap rounded-md px-2 py-1.5 text-xs transition-colors ${
                          active
                            ? "bg-muted/60 font-medium text-foreground"
                            : "text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        {f.label}
                        <span className={`tabular-nums ${active ? "text-muted-foreground" : "text-muted-foreground/50"}`}>
                          {counts[f.value]}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto">
                {filtered.length === 0 ? (
                  <p className="px-4 py-10 text-center text-[0.6875rem] text-muted-foreground">
                    Nothing in this folder.
                  </p>
                ) : (
                  filtered.map((conv) => {
                    const last = conv.messages[conv.messages.length - 1];
                    const config = conv.classification
                      ? CLASSIFICATION_CONFIG[conv.classification as Classification]
                      : null;
                    const active = selectedKey === conv.key;
                    return (
                      <button
                        key={conv.key}
                        onClick={() => handleSelect(conv)}
                        className={`relative flex w-full gap-2.5 border-b border-border/30 px-3 py-2.5 text-left transition-colors last:border-b-0 hover:bg-muted/30 ${
                          active ? "bg-muted/50" : ""
                        }`}
                      >
                        {/* A gutter the dot sits in whether or not there is a
                            dot, so names line up down the column instead of
                            stepping in and out as threads are read. */}
                        <span className="mt-[0.4375rem] flex w-1.5 shrink-0 justify-center">
                          {conv.unread ? <span className="h-1.5 w-1.5 rounded-full bg-primary" /> : null}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-baseline justify-between gap-2">
                            <span className={`truncate text-[0.8125rem] ${conv.unread ? "font-semibold text-foreground" : "text-foreground/90"}`}>
                              {maybeMask(isDemoMode, conv.contactName ? "name" : "email", conv.contactName || conv.counterpart)}
                            </span>
                            <span className="shrink-0 text-[0.625rem] tabular-nums text-muted-foreground/70">
                              {formatDistanceToNow(new Date(conv.lastAt), { addSuffix: false })}
                            </span>
                          </span>
                          <span className="mt-0.5 flex items-baseline gap-1.5">
                            <span className="truncate text-[0.6875rem] text-foreground/70">{conv.subject}</span>
                            {conv.messages.length > 1 ? (
                              <span className="shrink-0 text-[0.625rem] tabular-nums text-muted-foreground/60">
                                {conv.messages.length}
                              </span>
                            ) : null}
                          </span>
                          <span className="mt-0.5 block truncate text-[0.6875rem] text-muted-foreground">
                            {last?.direction === "out" ? "You: " : ""}
                            {(last?.body || "").slice(0, 90) || "(no content)"}
                          </span>
                          {(config || !conv.hasReply || conv.companyName) && (
                            <span className="mt-1 flex items-center gap-1.5 text-[0.625rem] text-muted-foreground/70">
                              {config ? (
                                <span className={config.color}>{config.emoji} {config.label}</span>
                              ) : matchesMailFolder("awaiting", conv) ? (
                                <span>Awaiting reply</span>
                              ) : last?.direction === "out" ? (
                                <span className="capitalize">{last.state}</span>
                              ) : null}
                              {conv.companyName ? <span className="truncate">{conv.companyName}</span> : null}
                            </span>
                          )}
                        </span>
                      </button>
                    );
                  })
                )}
              </div>
            </div>

            <div className={`min-h-0 flex-1 flex-col ${selected ? "flex" : "hidden md:flex"}`}>
              {selected ? (
                <>
                  <div className="flex shrink-0 items-start gap-2 border-b border-border/40 px-4 py-2.5">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="-ml-1 h-7 w-7 shrink-0 md:hidden"
                      onClick={() => setSelectedKey(null)}
                    >
                      <ArrowLeft className="h-4 w-4" />
                    </Button>
                    <div className="min-w-0 flex-1">
                      <h2 className="truncate text-[0.8125rem] font-medium text-foreground">{selected.subject}</h2>
                      <p className="mt-0.5 truncate text-[0.6875rem] text-muted-foreground">
                        {selected.contactName ? `${maybeMask(isDemoMode, "name", selected.contactName)} · ` : ""}
                        {maybeMask(isDemoMode, "email", selected.counterpart)}
                        {selected.companyName ? ` · ${selected.companyName}` : ""}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 shrink-0 px-2 text-[0.6875rem] text-muted-foreground hover:text-foreground"
                      onClick={() => archiveConversation.mutate(selected)}
                      disabled={selected.replyThreadIds.length === 0}
                    >
                      <Archive className="mr-1.5 h-3.5 w-3.5" /> Archive
                    </Button>
                  </div>

                  {/* Messages, not chat bubbles.
                      Right-aligned tinted bubbles at 92% width are a messaging
                      app's shape, and this is mail: the threads are long, the
                      paragraphs are real paragraphs, and alternating margins
                      cost the reader a line length that changes every message.
                      Direction is carried by the sender line and a rule. */}
                  <div className="min-h-0 flex-1 overflow-y-auto">
                    {selected.messages.map((m) => (
                      <div
                        key={m.id}
                        className={`border-b border-border/25 px-4 py-3.5 last:border-b-0 ${
                          m.direction === "out" ? "bg-muted/15" : ""
                        }`}
                      >
                        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                          {m.direction === "out" ? (
                            <Send className="h-3 w-3 shrink-0 translate-y-0.5 text-muted-foreground/60" />
                          ) : (
                            <Mail className="h-3 w-3 shrink-0 translate-y-0.5 text-primary/70" />
                          )}
                          <span className="text-[0.75rem] font-medium text-foreground">
                            {m.direction === "out" ? "You" : maybeMask(isDemoMode, "email", m.from)}
                          </span>
                          <span className="text-[0.625rem] tabular-nums text-muted-foreground/70">
                            {format(new Date(m.at), "MMM d, h:mm a")}
                          </span>
                          {m.direction === "out" ? (
                            <span className="inline-flex items-center gap-1 text-[0.625rem] text-muted-foreground/70">
                              {m.opened ? <Eye className="h-3 w-3" /> : <MailOpen className="h-3 w-3" />}
                              {m.state === "sent" ? (m.opened ? "Opened" : "Sent") : <span className="capitalize">{m.state}</span>}
                            </span>
                          ) : null}
                          {m.classification && CLASSIFICATION_CONFIG[m.classification as Classification] ? (
                            <span className={`text-[0.625rem] ${CLASSIFICATION_CONFIG[m.classification as Classification].color}`}>
                              {CLASSIFICATION_CONFIG[m.classification as Classification].emoji}{" "}
                              {CLASSIFICATION_CONFIG[m.classification as Classification].label}
                            </span>
                          ) : null}
                        </div>
                        {/* Capped where prose stops being comfortable to read.
                            A reply pasted from a wide screen otherwise runs the
                            full width of the pane. */}
                        <MessageBody body={m.body} />
                      </div>
                    ))}
                  </div>

                  {selected.messages.some(m => m.direction === "in" || m.state === "sent") ? <div className="shrink-0 border-t border-border/40 bg-muted/10 px-4 py-3">
                    <Textarea
                      value={draftReply}
                      onChange={(e) => setDraftReply(e.target.value)}
                      placeholder={`Reply to ${maybeMask(isDemoMode, "email", selected.counterpart)}…`}
                      /* Short until there is something to say. A 90px box
                         standing empty under every thread took a tenth of the
                         pane to hold nothing. */
                      className={`resize-none border-border/50 bg-background text-base transition-[height] sm:text-[0.8125rem] ${
                        draftReply ? "h-24" : "h-10"
                      }`}
                    />
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <p className="text-[0.625rem] text-muted-foreground">
                        Sends in-thread from your connected mailbox.
                      </p>
                      <Button
                        size="sm"
                        className="h-8"
                        disabled={!draftReply.trim() || sendReply.isPending}
                        onClick={() => sendReply.mutate({ conv: selected, body: draftReply })}
                      >
                        <Send className="mr-1.5 h-3.5 w-3.5" />
                        {sendReply.isPending ? "Sending…" : "Send"}
                      </Button>
                    </div>
                  </div> : selected.messages.some(m => m.state === "draft") ? (
                    <div className="shrink-0 border-t border-border/40 px-4 py-3">
                      <Button asChild size="sm"><a href="/dashboard/outreach">Open Outreach Studio</a></Button>
                    </div>
                  ) : null}
                </>
              ) : (
                <div className="flex h-full w-full items-center justify-center px-6 text-center">
                  <p className="text-[0.6875rem] text-muted-foreground">
                    Select a conversation to read it and reply in thread.
                  </p>
                </div>
              )}
            </div>
          </Panel>
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

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { LiveIndicator } from "@/components/deliverability/LiveIndicator";
import type { LiveStatus } from "@/hooks/use-deliverability-realtime";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  ResponsiveContainer,
  Tooltip as ReTooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  BarChart3,
  Clock,
  Eye,
  Handshake,
  Inbox,
  Mail,
  MessageSquareReply,
  MousePointerClick,
  RefreshCw,
  Server,
  Target,
  Workflow,
} from "lucide-react";

type SentEmail = {
  id: string;
  subject: string | null;
  to_email: string | null;
  status: string | null;
  sent_at: string | null;
  created_at: string;
  opened_at: string | null;
  replied_at: string | null;
  clicked_at: string | null;
  template_id: string | null;
  sequence_id: string | null;
  sequence_step: number | null;
  sending_account_id: string | null;
  lead_id: string | null;
};

type ReplyRow = {
  id: string;
  intent_classification: string | null;
  intent_score: number | null;
  requires_human_action: boolean | null;
  created_at: string;
};

type DealRow = { id: string; stage: string | null; value: number | null; created_at: string };

type GroupRow = {
  key: string;
  name: string;
  sent: number;
  opened: number;
  replied: number;
  clicked: number;
  openRate: number;
  replyRate: number;
  clickRate: number;
};

function dedupeBy<T>(list: T[], keyOf: (item: T) => string): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of list) {
    const k = keyOf(item);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(item);
  }
  return out;
}

const RANGES = [
  { label: "7d", days: 7 },
  { label: "30d", days: 30 },
  { label: "90d", days: 90 },
  { label: "All", days: 3650 },
];

const pct = (num: number, den: number) => (den > 0 ? Math.round((num / den) * 1000) / 10 : 0);
const dayKey = (iso: string) => iso.slice(0, 10);

function rateBadge(rate: number, type: "open" | "reply" | "click") {
  const t = type === "open" ? { good: 40, ok: 20 } : type === "reply" ? { good: 10, ok: 5 } : { good: 5, ok: 2 };
  if (rate >= t.good) return <Badge className="bg-primary text-primary-foreground">Excellent</Badge>;
  if (rate >= t.ok) return <Badge variant="secondary">Average</Badge>;
  return <Badge variant="outline">Needs Work</Badge>;
}

/** A reply counts as positive only for the real stored classification values. */
function isPositiveReply(r: ReplyRow) {
  return r.intent_classification === "high_intent" || (r.intent_score ?? 0) >= 70;
}

export const EmailPerformanceStats = () => {
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(30);
  const [emails, setEmails] = useState<SentEmail[]>([]);
  const [replies, setReplies] = useState<ReplyRow[]>([]);
  const [deals, setDeals] = useState<DealRow[]>([]);
  const [templateNames, setTemplateNames] = useState<Record<string, string>>({});
  const [sequenceNames, setSequenceNames] = useState<Record<string, string>>({});
  const [mailboxes, setMailboxes] = useState<Record<string, { email: string; status: string | null; reputation: number | null }>>({});
  const [liveStatus, setLiveStatus] = useState<LiveStatus>("connecting");
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());

  const load = useCallback(async () => {
    const since = new Date(Date.now() - days * 86_400_000).toISOString();
    try {
      const [e, r, d, t, s, m] = await Promise.all([
        supabase
          .from("sent_emails")
          .select(
            "id, subject, to_email, status, sent_at, created_at, opened_at, replied_at, clicked_at, template_id, sequence_id, sequence_step, sending_account_id, lead_id",
          )
          .gte("created_at", since)
          .order("created_at", { ascending: false })
          .limit(5000),
        supabase
          .from("reply_analysis")
          .select("id, intent_classification, intent_score, requires_human_action, created_at, sent_email_id")
          .gte("created_at", since)
          .limit(2000),
        supabase.from("deals").select("id, stage, value, created_at").gte("created_at", since).limit(2000),
        supabase.from("email_templates").select("id, name"),
        supabase.from("email_sequences").select("id, name"),
        supabase.from("sending_accounts").select("id, email, status, reputation_score"),
      ]);

      // Warmup / seed traffic never counts as outreach performance: any send
      // whose recipient is one of the user's own mailboxes (warmup pool,
      // connected sending accounts, seed inboxes) is excluded from every stat.
      const ownAddresses = new Set(
        ((m.data as { email: string | null }[]) ?? [])
          .map((x) => (x.email ?? "").trim().toLowerCase())
          .filter(Boolean),
      );
      const isWarmupTraffic = (row: SentEmail) => {
        const to = (row.to_email ?? "").trim().toLowerCase();
        if (!to) return false;
        return ownAddresses.has(to) || /(^|[.+_-])(warmup|seed)([.+_-]|@)/.test(to);
      };

      const allEmails = (e.data as SentEmail[]) ?? [];
      const realEmails = allEmails.filter((row) => !isWarmupTraffic(row));
      const warmupEmailIds = new Set(allEmails.filter(isWarmupTraffic).map((row) => row.id));
      setEmails(realEmails);
      // Replies tied to a warmup/seed send are not outreach replies.
      setReplies((((r.data as ReplyRow[]) ?? []) as (ReplyRow & { sent_email_id?: string | null })[]).filter(
        (row) => !row.sent_email_id || !warmupEmailIds.has(row.sent_email_id),
      ));
      setDeals((d.data as DealRow[]) ?? []);
      setTemplateNames(Object.fromEntries(((t.data as { id: string; name: string }[]) ?? []).map((x) => [x.id, x.name])));
      setSequenceNames(Object.fromEntries(((s.data as { id: string; name: string }[]) ?? []).map((x) => [x.id, x.name])));
      setMailboxes(
        Object.fromEntries(
          ((m.data as { id: string; email: string; status: string | null; reputation_score: number | null }[]) ?? []).map((x) => [
            x.id,
            { email: x.email, status: x.status, reputation: x.reputation_score },
          ]),
        ),
      );
      setLastUpdate(new Date());
    } catch (err) {
      console.error("Error loading email analytics:", err);
    } finally {
      setLoading(false);
    }
  }, [days]);

  const reload = useRef(load);
  reload.current = load;

  useEffect(() => {
    void reload.current();
  }, [days]);

  // Realtime: any send / open / reply / click / deal updates the numbers instantly.
  useEffect(() => {
    const channel = supabase.channel(`email-analytics-${Math.random().toString(36).slice(2)}`);
    for (const table of ["sent_emails", "email_drafts", "reply_analysis", "deals", "sending_accounts"]) {
      channel.on("postgres_changes", { event: "*", schema: "public", table }, () => {
        void reload.current();
      });
    }
    channel.subscribe((s) => {
      if (s === "SUBSCRIBED") setLiveStatus("live");
      else if (s === "CHANNEL_ERROR" || s === "TIMED_OUT" || s === "CLOSED") setLiveStatus("offline");
    });
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Polling fallback + refetch on focus/visibility.
  useEffect(() => {
    const tick = () => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      void reload.current();
    };
    const id = window.setInterval(tick, liveStatus === "live" ? 30_000 : 10_000);
    const onVisible = () => {
      if (document.visibilityState === "visible") tick();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", tick);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", tick);
    };
  }, [liveStatus]);

  // Monitor connected inboxes for delivery-failure notices so bounces show up
  // here without waiting for a manual inbox sync.
  useEffect(() => {
    let running = false;
    const scan = async () => {
      if (running) return;
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      running = true;
      try {
        const { data } = await supabase.functions.invoke("sync-bounces", { body: {} });
        if ((data as { bounces?: number } | null)?.bounces) void reload.current();
      } catch {
        // Non-fatal: the tiles still reflect stored data.
      } finally {
        running = false;
      }
    };
    void scan();
    const id = window.setInterval(scan, 60_000);
    return () => window.clearInterval(id);
  }, []);

  // Pull replies straight from the connected inbox so reply metrics reflect the
  // mailbox, not just what happened to be synced earlier.
  useEffect(() => {
    let running = false;
    const pull = async () => {
      if (running) return;
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      running = true;
      try {
        await supabase.functions.invoke("inbox-sync", { body: {} });
        void reload.current();
      } catch {
        // Non-fatal: stored data still renders.
      } finally {
        running = false;
      }
    };
    void pull();
    const id = window.setInterval(pull, 120_000);
    return () => window.clearInterval(id);
  }, []);




  const sent = useMemo(() => emails.filter((e) => e.status === "sent" || !!e.sent_at), [emails]);

  const totals = useMemo(() => {
    const opened = sent.filter((e) => e.opened_at).length;
    const replied = sent.filter((e) => e.replied_at).length;
    const clicked = sent.filter((e) => e.clicked_at).length;
    const bounced = emails.filter((e) => e.status === "bounced").length;
    const failed = emails.filter((e) => e.status === "failed").length + bounced;
    const scheduled = emails.filter((e) => e.status === "scheduled").length;

    const positive = replies.filter((r) => isPositiveReply(r)).length;
    const won = deals.filter((d) => (d.stage || "").toLowerCase() === "won" || (d.stage || "").toLowerCase() === "closed_won");
    return {
      sent: sent.length,
      opened,
      replied,
      clicked,
      failed,
      bounced,
      scheduled,

      uniqueContacts: new Set(sent.map((e) => e.to_email)).size,
      openRate: pct(opened, sent.length),
      replyRate: pct(replied, sent.length),
      clickRate: pct(clicked, sent.length),
      positive,
      positiveRate: pct(positive, replies.length),
      meetings: deals.length,
      won: won.length,
      wonValue: won.reduce((a, b) => a + (b.value ?? 0), 0),
      conversionRate: pct(deals.length, sent.length),
    };
  }, [sent, emails, replies, deals]);

  const trend = useMemo(() => {
    const buckets = new Map<string, { day: string; sent: number; opened: number; replied: number; clicked: number }>();
    const span = Math.min(days, 90);
    for (let i = span - 1; i >= 0; i--) {
      const k = dayKey(new Date(Date.now() - i * 86_400_000).toISOString());
      buckets.set(k, { day: k, sent: 0, opened: 0, replied: 0, clicked: 0 });
    }
    for (const e of sent) {
      const k = dayKey(e.sent_at || e.created_at);
      const b = buckets.get(k);
      if (!b) continue;
      b.sent++;
      if (e.opened_at) b.opened++;
      if (e.replied_at) b.replied++;
      if (e.clicked_at) b.clicked++;
    }
    return [...buckets.values()].map((b) => ({
      ...b,
      label: b.day.slice(5),
      openRate: pct(b.opened, b.sent),
      replyRate: pct(b.replied, b.sent),
    }));
  }, [sent, days]);

  const byHour = useMemo(() => {
    const rows = Array.from({ length: 24 }, (_, h) => ({ hour: h, sent: 0, opened: 0, replied: 0 }));
    for (const e of sent) {
      const h = new Date(e.sent_at || e.created_at).getHours();
      rows[h].sent++;
      if (e.opened_at) rows[h].opened++;
      if (e.replied_at) rows[h].replied++;
    }
    return rows
      .filter((r) => r.sent > 0)
      .map((r) => ({ ...r, openRate: pct(r.opened, r.sent), replyRate: pct(r.replied, r.sent) }))
      .sort((a, b) => b.replyRate - a.replyRate || b.openRate - a.openRate);
  }, [sent]);

  const group = useCallback(
    (keyOf: (e: SentEmail) => string | null, nameOf: (k: string) => string) => {
      const map = new Map<string, { key: string; name: string; sent: number; opened: number; replied: number; clicked: number }>();
      for (const e of sent) {
        const k = keyOf(e);
        if (!k) continue;
        const row = map.get(k) ?? { key: k, name: nameOf(k), sent: 0, opened: 0, replied: 0, clicked: 0 };
        row.sent++;
        if (e.opened_at) row.opened++;
        if (e.replied_at) row.replied++;
        if (e.clicked_at) row.clicked++;
        map.set(k, row);
      }
      return [...map.values()]
        .map((r) => ({ ...r, openRate: pct(r.opened, r.sent), replyRate: pct(r.replied, r.sent), clickRate: pct(r.clicked, r.sent) }))
        .sort((a, b) => b.sent - a.sent);
    },
    [sent],
  );

  const templates = useMemo(
    () => group((e) => e.template_id, (k) => templateNames[k] || "Untitled template"),
    [group, templateNames],
  );
  const sequences = useMemo(
    () => group((e) => e.sequence_id, (k) => sequenceNames[k] || "Untitled sequence"),
    [group, sequenceNames],
  );
  const accounts = useMemo(
    () => group((e) => e.sending_account_id, (k) => mailboxes[k]?.email || "Unknown mailbox"),
    [group, mailboxes],
  );
  const domains = useMemo(
    () => group((e) => (e.to_email || "").split("@")[1] || null, (k) => k),
    [group],
  );
  const steps = useMemo(
    () => group((e) => (e.sequence_step ? String(e.sequence_step) : null), (k) => `Step ${k}`).sort((a, b) => Number(a.key) - Number(b.key)),
    [group],
  );
  const subjects = useMemo(
    () => group((e) => (e.subject || "").trim() || null, (k) => k).slice(0, 15),
    [group],
  );

  const replyBreakdown = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of replies) {
      const k = r.intent_classification || "unclassified";
      map.set(k, (map.get(k) ?? 0) + 1);
    }
    return [...map.entries()].map(([k, v]) => ({ label: k, count: v, share: pct(v, replies.length) })).sort((a, b) => b.count - a.count);
  }, [replies]);

  // ---- Drill-down ----
  const [drill, setDrill] = useState<{
    title: string;
    description?: string;
    emails?: SentEmail[];
    replyRows?: ReplyRow[];
    dealRows?: DealRow[];
    breakdown?: GroupRow[];
  } | null>(null);

  const openEmails = useCallback(
    (title: string, description: string, list: SentEmail[]) => setDrill({ title, description, emails: list }),
    [],
  );

  const mailboxLabel = useCallback((id: string | null) => (id ? mailboxes[id]?.email ?? "Unknown mailbox" : "—"), [mailboxes]);



  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          {RANGES.map((r) => (
            <Button key={r.label} size="sm" variant={days === r.days ? "secondary" : "ghost"} onClick={() => setDays(r.days)}>
              {r.label}
            </Button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <LiveIndicator status={liveStatus} lastUpdate={lastUpdate} />
          <Button size="sm" variant="ghost" onClick={() => void reload.current()} aria-label="Refresh analytics">
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <Kpi
          icon={<Mail className="w-4 h-4" />}
          label="Emails Sent"
          value={String(totals.sent)}
          hint={`${totals.uniqueContacts} contacts`}
          onClick={() => openEmails("Emails sent", `Every email sent in the last ${days} days.`, sent)}
        />
        <Kpi
          icon={<Eye className="w-4 h-4" />}
          label="Open Rate"
          value={`${totals.openRate}%`}
          hint={`${totals.opened} opens`}
          onClick={() => openEmails("Opened emails", "Confirmed recipient opens only — provider pre-fetches, scanners, duplicate renders and warmup traffic are excluded.", sent.filter((e) => e.opened_at))}
        />
        <Kpi
          icon={<MessageSquareReply className="w-4 h-4" />}
          label="Reply Rate"
          value={`${totals.replyRate}%`}
          hint={`${totals.replied} replies`}
          onClick={() => openEmails("Replied emails", "Real human replies from the person you emailed — auto-responders, bounces and your own sends don't count.", sent.filter((e) => e.replied_at))}

        />
        <Kpi
          icon={<MousePointerClick className="w-4 h-4" />}
          label="Click Rate"
          value={`${totals.clickRate}%`}
          hint={`${totals.clicked} clicks`}
          onClick={() => openEmails("Clicked emails", "Sends where a link was clicked.", sent.filter((e) => e.clicked_at))}
        />
        <Kpi
          icon={<Target className="w-4 h-4" />}
          label="Positive Replies"
          value={String(totals.positive)}
          hint={`${totals.positiveRate}% of replies`}
          onClick={() =>
            setDrill({
              title: "Positive replies",
              description: "Replies classified as interested or scored 70+ intent.",
              replyRows: replies.filter((r) => isPositiveReply(r)),
            })
          }
        />
        <Kpi
          icon={<Handshake className="w-4 h-4" />}
          label="Conversions"
          value={String(totals.meetings)}
          hint={`${totals.won} won · ${totals.conversionRate}% of sends`}
          onClick={() => setDrill({ title: "Conversions", description: "Deals created in this window.", dealRows: deals })}
        />
      </div>

      <Tabs defaultValue="overview">
        <TabsList className="flex w-full flex-wrap h-auto justify-start">
          <TabsTrigger value="overview" className="gap-1"><BarChart3 className="w-4 h-4" />Overview</TabsTrigger>
          <TabsTrigger value="engagement" className="gap-1"><Eye className="w-4 h-4" />Engagement</TabsTrigger>
          <TabsTrigger value="templates" className="gap-1"><Mail className="w-4 h-4" />Templates</TabsTrigger>
          <TabsTrigger value="sequences" className="gap-1"><Workflow className="w-4 h-4" />Sequences</TabsTrigger>
          <TabsTrigger value="mailboxes" className="gap-1"><Server className="w-4 h-4" />Mailboxes</TabsTrigger>
          <TabsTrigger value="replies" className="gap-1"><Inbox className="w-4 h-4" />Replies</TabsTrigger>
          <TabsTrigger value="timing" className="gap-1"><Clock className="w-4 h-4" />Timing</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Send &amp; engagement volume</CardTitle>
              <CardDescription>Sends, opens, replies and clicks per day — streaming live.</CardDescription>
            </CardHeader>
            <CardContent className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trend}>
                  <defs>
                    <linearGradient id="gSent" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.45} />
                      <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} interval="preserveStartEnd" />
                  <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} allowDecimals={false} />
                  <ReTooltip
                    contentStyle={{
                      background: "hsl(var(--popover))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                  />
                  <Area type="monotone" dataKey="sent" stroke="hsl(var(--primary))" fill="url(#gSent)" strokeWidth={2} name="Sent" />
                  <Line type="monotone" dataKey="opened" stroke="hsl(var(--chart-2, var(--muted-foreground)))" strokeWidth={2} dot={false} name="Opened" />
                  <Line type="monotone" dataKey="replied" stroke="hsl(var(--destructive))" strokeWidth={2} dot={false} name="Replied" />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Outbound funnel</CardTitle>
                <CardDescription>From send to closed revenue.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <FunnelRow label="Sent" value={totals.sent} base={totals.sent} onClick={() => openEmails("Sent", "All sends in this window.", sent)} />
                <FunnelRow
                  label="Opened"
                  value={totals.opened}
                  base={totals.sent}
                  onClick={() => openEmails("Opened", "Sends with at least one open.", sent.filter((e) => e.opened_at))}
                />
                <FunnelRow
                  label="Clicked"
                  value={totals.clicked}
                  base={totals.sent}
                  onClick={() => openEmails("Clicked", "Sends with a link click.", sent.filter((e) => e.clicked_at))}
                />
                <FunnelRow
                  label="Replied"
                  value={totals.replied}
                  base={totals.sent}
                  onClick={() => openEmails("Replied", "Sends that got a reply.", sent.filter((e) => e.replied_at))}
                />
                <FunnelRow
                  label="Positive replies"
                  value={totals.positive}
                  base={totals.sent}
                  onClick={() =>
                    setDrill({
                      title: "Positive replies",
                      description: "Replies classified interested or scored 70+.",
                      replyRows: replies.filter((r) => isPositiveReply(r)),
                    })
                  }
                />
                <FunnelRow
                  label="Deals created"
                  value={totals.meetings}
                  base={totals.sent}
                  onClick={() => setDrill({ title: "Deals created", description: "Deals created in this window.", dealRows: deals })}
                />
                <FunnelRow
                  label="Won"
                  value={totals.won}
                  base={totals.sent}
                  onClick={() =>
                    setDrill({
                      title: "Won deals",
                      description: "Closed-won deals in this window.",
                      dealRows: deals.filter((d) => ["won", "closed_won"].includes((d.stage || "").toLowerCase())),
                    })
                  }
                />
                <p className="text-xs text-muted-foreground">
                  Closed value in range: <span className="font-medium text-foreground">${totals.wonValue.toLocaleString()}</span>
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Delivery health</CardTitle>
                <CardDescription>Send outcomes in the selected window — click any tile for detail.</CardDescription>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-3">
                <MiniStat label="Delivered" value={totals.sent} onClick={() => openEmails("Delivered emails", "Successfully sent emails.", sent)} />
                <MiniStat
                  label="Failed / bounced"
                  value={totals.failed}
                  tone="danger"
                  onClick={() =>
                    openEmails(
                      "Failed & bounced sends",
                      "Emails that never reached the recipient — send failures (mailbox disconnected, paused, rate limited) plus bounces detected from mailbox delivery notifications.",
                      emails.filter((e) => e.status === "failed" || e.status === "bounced"),
                    )
                  }
                />
                <MiniStat
                  label="Bounced"
                  value={totals.bounced}
                  tone="danger"
                  onClick={() =>
                    openEmails(
                      "Bounced emails",
                      "Delivery notifications found in your connected inboxes — hard bounces are also suppressed from future sends.",
                      emails.filter((e) => e.status === "bounced"),
                    )
                  }
                />

                <MiniStat
                  label="Scheduled"
                  value={totals.scheduled}
                  onClick={() => openEmails("Scheduled sends", "Queued to go out later.", emails.filter((e) => e.status === "scheduled"))}
                />
                <MiniStat
                  label="Unique contacts"
                  value={totals.uniqueContacts}
                  onClick={() => openEmails("Unique contacts", "One email per distinct recipient.", dedupeBy(sent, (e) => e.to_email ?? ""))}
                />
                <MiniStat
                  label="Recipient domains"
                  value={domains.length}
                  onClick={() => setDrill({ title: "Recipient domains", description: "Performance per recipient domain.", breakdown: domains })}
                />
                <MiniStat
                  label="Active mailboxes"
                  value={accounts.length}
                  onClick={() => setDrill({ title: "Active mailboxes", description: "Performance per sending mailbox.", breakdown: accounts })}
                />
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="engagement" className="mt-4 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Open &amp; reply rate over time</CardTitle>
              <CardDescription>Daily rates — watch for deliverability dips.</CardDescription>
            </CardHeader>
            <CardContent className="h-[260px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} interval="preserveStartEnd" />
                  <YAxis unit="%" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                  <ReTooltip
                    contentStyle={{
                      background: "hsl(var(--popover))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                  />
                  <Area type="monotone" dataKey="openRate" stroke="hsl(var(--primary))" fill="hsl(var(--primary))" fillOpacity={0.15} name="Open rate" />
                  <Line type="monotone" dataKey="replyRate" stroke="hsl(var(--destructive))" strokeWidth={2} dot={false} name="Reply rate" />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <RateTable
            title="Top subject lines"
            description="Ranked by volume — click a row for every email using that subject."
            firstCol="Subject"
            rows={subjects}
            onRowClick={(r) =>
              openEmails(`Subject: ${r.name}`, "Every send using this subject line.", sent.filter((e) => (e.subject || "").trim() === r.key))
            }
          />
          <RateTable
            title="Recipient domains"
            description="How different inbox providers treat your mail — click a row for the sends."
            firstCol="Domain"
            rows={domains.slice(0, 15)}
            onRowClick={(r) =>
              openEmails(`Domain: ${r.name}`, "Every send to this recipient domain.", sent.filter((e) => (e.to_email || "").split("@")[1] === r.key))
            }
          />
        </TabsContent>

        <TabsContent value="templates" className="mt-4 space-y-4">
          {templates.length === 0 ? (
            <Empty text="No template performance data yet" hint="Send emails using templates to see metrics here" />
          ) : (
            <div className="space-y-3">
              {templates.map((t) => (
                <Card
                  key={t.key}
                  role="button"
                  tabIndex={0}
                  onClick={() => openEmails(`Template: ${t.name}`, "Every send from this template.", sent.filter((e) => e.template_id === t.key))}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      openEmails(`Template: ${t.name}`, "Every send from this template.", sent.filter((x) => x.template_id === t.key));
                    }
                  }}
                  className="cursor-pointer transition-colors hover:border-primary/50"
                >
                  <CardContent className="pt-6 space-y-3">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div>
                        <h4 className="font-medium">{t.name}</h4>
                        <p className="text-sm text-muted-foreground">{t.sent} emails sent</p>
                      </div>
                      {rateBadge(t.replyRate, "reply")}
                    </div>
                    <div className="grid gap-4 sm:grid-cols-3">
                      <Meter icon={<Eye className="w-3 h-3" />} label="Open Rate" value={t.openRate} scale={1} />
                      <Meter icon={<MessageSquareReply className="w-3 h-3" />} label="Reply Rate" value={t.replyRate} scale={5} />
                      <Meter icon={<MousePointerClick className="w-3 h-3" />} label="Click Rate" value={t.clickRate} scale={5} />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="sequences" className="mt-4 space-y-4">
          <RateTable
            title="Sequence performance"
            description="Which sequences actually generate replies — click a row for the sends."
            firstCol="Sequence"
            rows={sequences}
            empty="No sequence sends in this window"
            onRowClick={(r) =>
              openEmails(`Sequence: ${r.name}`, "Every send from this sequence.", sent.filter((e) => e.sequence_id === r.key))
            }
          />
          <RateTable
            title="Step performance"
            description="Where in the cadence replies come from — click a row for the sends."
            firstCol="Step"
            rows={steps}
            empty="No multi-step sends in this window"
            onRowClick={(r) =>
              openEmails(`${r.name}`, "Every send at this cadence step.", sent.filter((e) => String(e.sequence_step ?? "") === r.key))
            }
          />
        </TabsContent>

        <TabsContent value="mailboxes" className="mt-4 space-y-4">
          {accounts.length === 0 ? (
            <Empty text="No mailbox sends in this window" hint="Connect a mailbox and start sending" />
          ) : (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Mailbox performance</CardTitle>
                <CardDescription>Volume, engagement and reputation per sending account.</CardDescription>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <Table className="min-w-[720px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Mailbox</TableHead>
                      <TableHead className="text-right">Sent</TableHead>
                      <TableHead className="text-right">Open</TableHead>
                      <TableHead className="text-right">Reply</TableHead>
                      <TableHead className="text-right">Reputation</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {accounts.map((a) => (
                      <TableRow
                        key={a.key}
                        className="cursor-pointer"
                        onClick={() =>
                          openEmails(
                            `Mailbox: ${a.name}`,
                            `Reputation ${mailboxes[a.key]?.reputation ?? "—"} · status ${mailboxes[a.key]?.status ?? "unknown"}.`,
                            emails.filter((e) => e.sending_account_id === a.key),
                          )
                        }
                      >
                        <TableCell className="text-sm">{a.name}</TableCell>
                        <TableCell className="text-right">{a.sent}</TableCell>
                        <TableCell className="text-right">{a.openRate}%</TableCell>
                        <TableCell className="text-right">{a.replyRate}%</TableCell>
                        <TableCell className="text-right">{mailboxes[a.key]?.reputation ?? "—"}</TableCell>
                        <TableCell>
                          <Badge variant={mailboxes[a.key]?.status === "active" ? "secondary" : "outline"}>
                            {mailboxes[a.key]?.status ?? "unknown"}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="replies" className="mt-4 space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <MiniStat
              label="Replies analyzed"
              value={replies.length}
              onClick={() => setDrill({ title: "Replies analyzed", description: "Every analyzed reply in this window.", replyRows: replies })}
            />
            <MiniStat
              label="Positive"
              value={totals.positive}
              onClick={() =>
                setDrill({
                  title: "Positive replies",
                  description: "Interested or 70+ intent score.",
                  replyRows: replies.filter((r) => isPositiveReply(r)),
                })
              }
            />
            <MiniStat
              label="Needs your action"
              value={replies.filter((r) => r.requires_human_action).length}
              onClick={() =>
                setDrill({
                  title: "Replies needing your action",
                  description: "Flagged for human follow-up.",
                  replyRows: replies.filter((r) => r.requires_human_action),
                })
              }
            />
            <MiniStat
              label="Avg intent score"
              value={replies.length ? Math.round(replies.reduce((a, b) => a + (b.intent_score ?? 0), 0) / replies.length) : 0}
              onClick={() => setDrill({ title: "Intent scores", description: "All analyzed replies, with their intent scores.", replyRows: replies })}
            />
          </div>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Reply intent breakdown</CardTitle>
              <CardDescription>Classification of every analyzed reply in this window.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {replyBreakdown.length === 0 ? (
                <p className="text-sm text-muted-foreground">No replies analyzed yet.</p>
              ) : (
                replyBreakdown.map((r) => (
                  <div
                    key={r.label}
                    role="button"
                    tabIndex={0}
                    onClick={() =>
                      setDrill({
                        title: `Replies: ${r.label.replace(/_/g, " ")}`,
                        description: `${r.count} replies · ${r.share}% of all analyzed replies.`,
                        replyRows: replies.filter((x) => (x.intent_classification || "unclassified") === r.label),
                      })
                    }
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setDrill({
                          title: `Replies: ${r.label.replace(/_/g, " ")}`,
                          replyRows: replies.filter((x) => (x.intent_classification || "unclassified") === r.label),
                        });
                      }
                    }}
                    className="cursor-pointer rounded-md -mx-2 px-2 py-1 transition-colors hover:bg-muted/50"
                  >
                    <div className="flex items-center justify-between mb-1 text-xs">
                      <span className="capitalize text-muted-foreground">{r.label.replace(/_/g, " ")}</span>
                      <span className="font-medium">
                        {r.count} · {r.share}%
                      </span>
                    </div>
                    <Progress value={r.share} className="h-2" />
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="timing" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Best send times</CardTitle>
              <CardDescription>Hour of day (your local time) ranked by reply rate.</CardDescription>
            </CardHeader>
            <CardContent>
              {byHour.length === 0 ? (
                <p className="text-sm text-muted-foreground">Not enough sends yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table className="min-w-[520px]">
                    <TableHeader>
                      <TableRow>
                        <TableHead>Hour</TableHead>
                        <TableHead className="text-right">Sent</TableHead>
                        <TableHead className="text-right">Open rate</TableHead>
                        <TableHead className="text-right">Reply rate</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {byHour.map((h) => (
                        <TableRow
                          key={h.hour}
                          className="cursor-pointer"
                          onClick={() =>
                            openEmails(
                              `Sends at ${String(h.hour).padStart(2, "0")}:00`,
                              "Every email sent during this hour of the day (your local time).",
                              sent.filter((e) => new Date(e.sent_at || e.created_at).getHours() === h.hour),
                            )
                          }
                        >
                          <TableCell className="font-mono text-xs">{String(h.hour).padStart(2, "0")}:00</TableCell>
                          <TableCell className="text-right">{h.sent}</TableCell>
                          <TableCell className="text-right">{h.openRate}%</TableCell>
                          <TableCell className="text-right">{h.replyRate}%</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <p className="text-xs text-muted-foreground text-center">
        Reply rate is your primary metric — opens are directional only. Click any metric, row or card for the underlying detail.
      </p>

      <Dialog open={!!drill} onOpenChange={(o) => !o && setDrill(null)}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{drill?.title}</DialogTitle>
            {drill?.description && <DialogDescription>{drill.description}</DialogDescription>}
          </DialogHeader>

          {drill?.emails && <EmailDetailTable emails={drill.emails} mailboxLabel={mailboxLabel} />}

          {drill?.breakdown && (
            <div className="overflow-x-auto">
              <Table className="min-w-[520px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead className="text-right">Sent</TableHead>
                    <TableHead className="text-right">Open</TableHead>
                    <TableHead className="text-right">Reply</TableHead>
                    <TableHead className="text-right">Click</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {drill.breakdown.map((r) => (
                    <TableRow key={r.key}>
                      <TableCell className="text-sm max-w-[240px] truncate" title={r.name}>
                        {r.name}
                      </TableCell>
                      <TableCell className="text-right">{r.sent}</TableCell>
                      <TableCell className="text-right">{r.openRate}%</TableCell>
                      <TableCell className="text-right">{r.replyRate}%</TableCell>
                      <TableCell className="text-right">{r.clickRate}%</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {drill?.replyRows && (
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-3">
                <MiniStat label="Replies" value={drill.replyRows.length} />
                <MiniStat label="Needs action" value={drill.replyRows.filter((r) => r.requires_human_action).length} />
                <MiniStat
                  label="Avg intent"
                  value={
                    drill.replyRows.length
                      ? Math.round(drill.replyRows.reduce((a, b) => a + (b.intent_score ?? 0), 0) / drill.replyRows.length)
                      : 0
                  }
                />
              </div>
              {drill.replyRows.length === 0 ? (
                <p className="text-sm text-muted-foreground">No replies match this metric yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table className="min-w-[520px]">
                    <TableHeader>
                      <TableRow>
                        <TableHead>Intent</TableHead>
                        <TableHead className="text-right">Score</TableHead>
                        <TableHead>Needs action</TableHead>
                        <TableHead>Received</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {drill.replyRows.slice(0, 200).map((r) => (
                        <TableRow key={r.id}>
                          <TableCell className="capitalize text-sm">{(r.intent_classification || "unclassified").replace(/_/g, " ")}</TableCell>
                          <TableCell className="text-right">{r.intent_score ?? "—"}</TableCell>
                          <TableCell>{r.requires_human_action ? <Badge variant="destructive">Yes</Badge> : <span className="text-muted-foreground text-xs">No</span>}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{new Date(r.created_at).toLocaleString()}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          )}

          {drill?.dealRows && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <MiniStat label="Deals" value={drill.dealRows.length} />
                <MiniStat label="Total value" value={drill.dealRows.reduce((a, b) => a + (b.value ?? 0), 0)} />
              </div>
              {drill.dealRows.length === 0 ? (
                <p className="text-sm text-muted-foreground">No deals in this window.</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table className="min-w-[420px]">
                    <TableHeader>
                      <TableRow>
                        <TableHead>Stage</TableHead>
                        <TableHead className="text-right">Value</TableHead>
                        <TableHead>Created</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {drill.dealRows.slice(0, 200).map((d) => (
                        <TableRow key={d.id}>
                          <TableCell className="capitalize text-sm">{(d.stage || "unknown").replace(/_/g, " ")}</TableCell>
                          <TableCell className="text-right">${(d.value ?? 0).toLocaleString()}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{new Date(d.created_at).toLocaleDateString()}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

function Kpi({
  icon,
  label,
  value,
  hint,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint?: string;
  onClick?: () => void;
}) {
  return (
    <Card
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={(e) => {
        if (onClick && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          onClick();
        }
      }}
      className={onClick ? "cursor-pointer transition-colors hover:border-primary/50 hover:bg-muted/40" : undefined}
    >
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {icon}
          <span>{label}</span>
        </div>
        <p className="mt-1 text-2xl font-bold">{value}</p>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  );
}

function MiniStat({
  label,
  value,
  tone,
  onClick,
}: {
  label: string;
  value: number;
  tone?: "danger";
  onClick?: () => void;
}) {
  return (
    <div
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={(e) => {
        if (onClick && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          onClick();
        }
      }}
      className={`border rounded-lg p-3 ${onClick ? "cursor-pointer transition-colors hover:border-primary/50 hover:bg-muted/40" : ""}`}
    >
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-xl font-bold ${tone === "danger" ? "text-destructive" : ""}`}>{value}</p>
    </div>
  );
}

function EmailDetailTable({
  emails,
  mailboxLabel,
}: {
  emails: SentEmail[];
  mailboxLabel: (id: string | null) => string;
}) {
  if (emails.length === 0) {
    return <p className="text-sm text-muted-foreground">No emails match this metric in the selected window.</p>;
  }
  const opened = emails.filter((e) => e.opened_at).length;
  const replied = emails.filter((e) => e.replied_at).length;
  const clicked = emails.filter((e) => e.clicked_at).length;
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <MiniStat label="Emails" value={emails.length} />
        <MiniStat label="Opened" value={opened} />
        <MiniStat label="Replied" value={replied} />
        <MiniStat label="Clicked" value={clicked} />
      </div>
      <div className="overflow-x-auto">
        <Table className="min-w-[720px]">
          <TableHeader>
            <TableRow>
              <TableHead>Recipient</TableHead>
              <TableHead>Subject</TableHead>
              <TableHead>Mailbox</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Engagement</TableHead>
              <TableHead>Date</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {emails.slice(0, 200).map((e) => (
              <TableRow key={e.id}>
                <TableCell className="text-sm max-w-[180px] truncate" title={e.to_email ?? ""}>
                  {e.to_email || "—"}
                </TableCell>
                <TableCell className="text-sm max-w-[220px] truncate" title={e.subject ?? ""}>
                  {e.subject || "(no subject)"}
                </TableCell>
                <TableCell className="text-xs max-w-[160px] truncate" title={mailboxLabel(e.sending_account_id)}>
                  {mailboxLabel(e.sending_account_id)}
                </TableCell>
                <TableCell>
                  <Badge variant={e.status === "failed" ? "destructive" : e.status === "scheduled" ? "outline" : "secondary"}>
                    {e.status ?? "unknown"}
                  </Badge>
                </TableCell>
                <TableCell className="text-xs space-x-1">
                  {e.opened_at && <Badge variant="outline">Open</Badge>}
                  {e.clicked_at && <Badge variant="outline">Click</Badge>}
                  {e.replied_at && <Badge variant="outline">Reply</Badge>}
                  {!e.opened_at && !e.clicked_at && !e.replied_at && <span className="text-muted-foreground">—</span>}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                  {new Date(e.sent_at || e.created_at).toLocaleString()}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {emails.length > 200 && <p className="text-xs text-muted-foreground">Showing the 200 most recent of {emails.length}.</p>}
    </div>
  );
}

function FunnelRow({ label, value, base, onClick }: { label: string; value: number; base: number; onClick?: () => void }) {
  const share = pct(value, base);
  return (
    <div
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={(e) => {
        if (onClick && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          onClick();
        }
      }}
      className={onClick ? "cursor-pointer rounded-md -mx-2 px-2 py-1 transition-colors hover:bg-muted/50" : undefined}
    >
      <div className="flex items-center justify-between mb-1 text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium">
          {value} · {share}%
        </span>
      </div>
      <Progress value={share} className="h-2" />
    </div>
  );
}

function Meter({ icon, label, value, scale }: { icon: React.ReactNode; label: string; value: number; scale: number }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-muted-foreground flex items-center gap-1">
          {icon} {label}
        </span>
        <span className="text-xs font-medium">{value}%</span>
      </div>
      <Progress value={Math.min(100, value * scale)} className="h-2" />
    </div>
  );
}

function RateTable({
  title,
  description,
  firstCol,
  rows,
  empty = "No data in this window",
  onRowClick,
}: {
  title: string;
  description: string;
  firstCol: string;
  rows: { key: string; name: string; sent: number; openRate: number; replyRate: number; clickRate: number }[];
  empty?: string;
  onRowClick?: (row: { key: string; name: string }) => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">{empty}</p>
        ) : (
          <div className="overflow-x-auto">
            <Table className="min-w-[600px]">
              <TableHeader>
                <TableRow>
                  <TableHead>{firstCol}</TableHead>
                  <TableHead className="text-right">Sent</TableHead>
                  <TableHead className="text-right">Open</TableHead>
                  <TableHead className="text-right">Reply</TableHead>
                  <TableHead className="text-right">Click</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow
                    key={r.key}
                    onClick={onRowClick ? () => onRowClick(r) : undefined}
                    className={onRowClick ? "cursor-pointer" : undefined}
                  >
                    <TableCell className="text-sm max-w-[280px] truncate" title={r.name}>
                      {r.name}
                    </TableCell>
                    <TableCell className="text-right">{r.sent}</TableCell>
                    <TableCell className="text-right">{r.openRate}%</TableCell>
                    <TableCell className="text-right">{r.replyRate}%</TableCell>
                    <TableCell className="text-right">{r.clickRate}%</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Empty({ text, hint }: { text: string; hint: string }) {
  return (
    <div className="text-center py-10 text-muted-foreground">
      <BarChart3 className="w-12 h-12 mx-auto mb-3 opacity-50" />
      <p>{text}</p>
      <p className="text-sm">{hint}</p>
    </div>
  );
}

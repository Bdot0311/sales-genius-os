import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Bot,
  Loader2,
  Play,
  MessageSquare,
  CalendarCheck,
  Activity,
  Clock,
  AlertCircle,
  Lock,
  Zap,
  Users,
  Send,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useSubscription } from "@/hooks/use-subscription";
import { OverviewTab } from "@/components/agent/OverviewTab";
import { InboxTab } from "@/components/agent/InboxTab";
import { ConfigTab } from "@/components/agent/ConfigTab";
import { SettingsTab } from "@/components/agent/SettingsTab";
import { ApprovalsTab } from "@/components/agent/ApprovalsTab";
import { AgentTestDialog } from "@/components/agent/AgentTestDialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";


export interface AgentConfig {
  id: string;
  user_id: string;
  enabled: boolean;
  agent_name: string | null;
  persona: string | null;
  tone: string | null;
  company_context: string | null;
  value_props: string[] | null;
  objection_responses: Record<string, string> | null;
  can_reply_interested: boolean | null;
  can_handle_objections: boolean | null;
  can_book_meetings: boolean | null;
  can_find_leads: boolean | null;
  can_send_outreach: boolean | null;
  prospecting_job_title: string | null;
  prospecting_industry: string | null;
  prospecting_country: string | null;
  prospecting_company_size: string | null;
  daily_lead_target: number | null;
  max_daily_new_emails: number | null;
  calendly_url: string | null;
  max_daily_auto_replies: number | null;
  reply_delay_minutes: number | null;
  created_at: string;
  updated_at: string;
}

export interface AgentAction {
  id: string;
  action_type: string;
  prospect_email: string | null;
  description: string | null;
  classification: string | null;
  created_at: string;
}

interface AgentStats {
  activeThreads: number;
  leadsToday: number;
  outreachToday: number;
  repliesToday: number;
  meetingsBooked: number;
  lastRun: string | null;
}

const Agent = () => {
  const navigate = useNavigate();
  const { subscription, loading: subLoading } = useSubscription();
  const [config, setConfig] = useState<AgentConfig | null>(null);
  const [actions, setActions] = useState<AgentAction[]>([]);
  const [stats, setStats] = useState<AgentStats>({
    activeThreads: 0,
    leadsToday: 0,
    outreachToday: 0,
    repliesToday: 0,
    meetingsBooked: 0,
    lastRun: null,
  });
  const [loading, setLoading] = useState(true);
  const [actionsLoading, setActionsLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [gmailConnected, setGmailConnected] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [runMode, setRunMode] = useState<"approval" | "autonomous">("approval");
  const [pendingCount, setPendingCount] = useState(0);


  const loadData = useCallback(async () => {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.user) return;
      const uid = session.user.id;
      setUserId(uid);

      // Load agent config
      const { data: configData } = await (supabase as any)
        .from("agent_configs")
        .select("*")
        .eq("user_id", uid)
        .maybeSingle();
      setConfig(configData ?? null);

      // Load Gmail integrations (users may have more than one Google mailbox).
      // Only read client-visible columns; token/config fields are intentionally hidden.
      const { data: integrationRows, error: integrationsError } = await supabase
        .from("integrations")
        .select("id, connected_email")
        .eq("user_id", uid)
        .eq("integration_id", "google")
        .eq("is_active", true)
        .order("updated_at", { ascending: false });
      if (integrationsError) {
        console.error("Agent Gmail connection load error:", integrationsError);
        setGmailConnected(false);
      } else {
        setGmailConnected((integrationRows ?? []).length > 0);
      }


      // Load recent actions
      setActionsLoading(true);
      const { data: actionsData } = await (supabase as any)
        .from("agent_actions")
        .select("*")
        .eq("user_id", uid)
        .order("created_at", { ascending: false })
        .limit(20);
      const fetchedActions: AgentAction[] = actionsData ?? [];
      setActions(fetchedActions);

      // Derive stats from actions
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const leadsToday = fetchedActions.filter(
        (a) =>
          a.action_type === "lead_found" && new Date(a.created_at) >= today
      ).length;
      const outreachToday = fetchedActions.filter(
        (a) =>
          a.action_type === "outreach_sent" && new Date(a.created_at) >= today
      ).length;
      const repliesToday = fetchedActions.filter(
        (a) =>
          a.action_type === "reply_sent" && new Date(a.created_at) >= today
      ).length;
      const meetingsBooked = fetchedActions.filter(
        (a) => a.action_type === "meeting_booked"
      ).length;
      const lastRunAction = fetchedActions[0] ?? null;

      // Count active threads
      const thirtyAgo = new Date();
      thirtyAgo.setDate(thirtyAgo.getDate() - 30);
      const { count: threadCount } = await supabase
        .from("sent_emails")
        .select("id", { count: "exact", head: true })
        .eq("user_id", uid)
        .not("gmail_thread_id", "is", null)
        .gte("sent_at", thirtyAgo.toISOString());

      setStats({
        activeThreads: threadCount ?? 0,
        leadsToday,
        outreachToday,
        repliesToday,
        meetingsBooked,
        lastRun: lastRunAction?.created_at ?? null,
      });
    } catch (err) {
      console.error("Agent load error:", err);
    } finally {
      setLoading(false);
      setActionsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleRunAgent = async () => {
    setRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke("agent-run");
      if (error) throw error;
      const result = data as {
        leadsFound?: number;
        outreachSent?: number;
        repliesSent?: number;
        threadsChecked?: number;
      } | null;
      toast.success(
        `Agent ran: ${result?.leadsFound ?? 0} leads found, ${
          result?.outreachSent ?? 0
        } emails sent, ${result?.repliesSent ?? 0} replies sent`
      );
      await loadData();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      toast.error(`Agent run failed: ${message}`);
    } finally {
      setRunning(false);
    }
  };

  const handleToggle = async () => {
    if (!userId) return;
    setToggling(true);
    const newEnabled = !(config?.enabled ?? false);
    try {
      const upsertPayload: Record<string, unknown> = {
        user_id: userId,
        enabled: newEnabled,
      };
      if (config?.id) upsertPayload.id = config.id;

      const { data: updated, error } = await (supabase as any)
        .from("agent_configs")
        .upsert(upsertPayload, { onConflict: "user_id" })
        .select("*")
        .maybeSingle();
      if (error) throw error;
      setConfig(updated ?? null);
      toast.success(newEnabled ? "Agent enabled" : "Agent disabled");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      toast.error(`Failed to update agent: ${message}`);
    } finally {
      setToggling(false);
    }
  };

  const isEnabled = config?.enabled ?? false;

  const statCards = [
    {
      label: "Leads Found Today",
      value: stats.leadsToday,
      icon: Users,
      color: "text-cyan-400",
      bg: "bg-cyan-500/10",
    },
    {
      label: "Emails Sent Today",
      value: stats.outreachToday,
      icon: Send,
      color: "text-indigo-400",
      bg: "bg-indigo-500/10",
    },
    {
      label: "Active Threads",
      value: stats.activeThreads,
      icon: MessageSquare,
      color: "text-blue-400",
      bg: "bg-blue-500/10",
    },
    {
      label: "Replies Sent Today",
      value: stats.repliesToday,
      icon: Activity,
      color: "text-purple-400",
      bg: "bg-purple-500/10",
    },
    {
      label: "Meetings Booked",
      value: stats.meetingsBooked,
      icon: CalendarCheck,
      color: "text-green-400",
      bg: "bg-green-500/10",
    },
    {
      label: "Last Run",
      value: stats.lastRun
        ? formatDistanceToNow(new Date(stats.lastRun), { addSuffix: true })
        : "Never",
      icon: Clock,
      color: "text-orange-400",
      bg: "bg-orange-500/10",
    },
  ];

  const agentTier = (subscription?.features as any)?.aiAgentTier ?? null;
  const planMaxDailyReplies = (subscription?.features as any)?.agentMaxDailyReplies ?? 0;
  const hasAgent = !!agentTier;

  // Upgrade wall for free / starter
  if (!subLoading && !hasAgent) {
    return (
      <DashboardLayout>
        <PageHeader
          title="AI Sales Agent"
          description="Finds leads, writes and sends first-touch outreach, then handles replies — end to end"
        />
        <div className="mt-12 flex flex-col items-center text-center max-w-lg mx-auto gap-6">
          <div className="p-4 rounded-full bg-primary/10">
            <Lock className="w-8 h-8 text-primary" />
          </div>
          <div>
            <h2 className="text-xl font-bold mb-2">AI SDR requires Growth or higher</h2>
            <p className="text-sm text-muted-foreground">
              The AI Sales Agent is available on <strong>Growth</strong>, <strong>Pro</strong>, and <strong>Agency</strong> plans.
              Upgrade to put a fully autonomous SDR to work — sourcing leads, sending outreach, and handling replies.
            </p>
          </div>
          <div className="w-full grid grid-cols-1 sm:grid-cols-3 gap-3 text-left">
            {[
              { tier: "Growth", desc: "Lead sourcing, first-touch outreach, inbox monitoring, 10 auto-replies/day" },
              { tier: "Pro", desc: "Full cycle: sourcing, sending, objection handling, meeting booking, 50 auto-replies/day" },
              { tier: "Elite", desc: "Full cycle at scale, 200 auto-replies/day, priority processing — Agency plan" },
            ].map((t) => (
              <div key={t.tier} className="p-4 rounded-xl border border-border/60 bg-card/60">
                <p className="text-sm font-semibold mb-1">{t.tier} Agent</p>
                <p className="text-xs text-muted-foreground">{t.desc}</p>
              </div>
            ))}
          </div>
          <Button onClick={() => navigate("/pricing")} className="gap-2">
            <Zap className="w-4 h-4" />
            Upgrade to unlock AI SDR
          </Button>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <PageHeader
        title="AI Sales Agent"
        description="Finds leads, writes and sends first-touch outreach, then handles replies — end to end"
        actions={
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <Switch
                checked={isEnabled}
                onCheckedChange={handleToggle}
                disabled={toggling || loading}
                aria-label="Toggle agent"
              />
              <span className="text-sm text-muted-foreground">
                {toggling ? "Updating…" : isEnabled ? "Enabled" : "Disabled"}
              </span>
            </div>
            <AgentTestDialog disabled={loading} />
            <Button
              onClick={handleRunAgent}
              disabled={running || loading}
              className="gap-2"
            >
              {running ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Play className="w-4 h-4" />
              )}
              {running ? "Running…" : "Run Agent Now"}
            </Button>
          </div>
        }
      />

      <div className="space-y-6 mt-6">
        {/* Status bar */}
        <div className="flex flex-wrap items-center gap-3 px-1">
          <div className="flex items-center gap-2">
            <Bot className="w-5 h-5 text-primary" />
            <span className="text-sm font-medium">
              {config?.agent_name ?? "AI Agent"}
            </span>
          </div>
          <Badge
            variant="outline"
            className={
              isEnabled
                ? "bg-green-500/15 text-green-400 border-green-500/30"
                : "bg-muted/40 text-muted-foreground border-border"
            }
          >
            <span
              className={`mr-1.5 inline-block w-1.5 h-1.5 rounded-full ${
                isEnabled ? "bg-green-400" : "bg-muted-foreground"
              }`}
            />
            {isEnabled ? "Active" : "Inactive"}
          </Badge>
          {stats.lastRun && (
            <span className="text-xs text-muted-foreground">
              Last run:{" "}
              {formatDistanceToNow(new Date(stats.lastRun), {
                addSuffix: true,
              })}
            </span>
          )}
        </div>

        {/* Stats row */}
        {loading ? (
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Card key={i} className="p-5">
                <div className="space-y-2">
                  <div className="h-3 bg-muted animate-pulse rounded w-2/3" />
                  <div className="h-7 bg-muted animate-pulse rounded w-1/2" />
                </div>
              </Card>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
            {statCards.map((card) => (
              <Card key={card.label} className="p-5">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">
                      {card.label}
                    </p>
                    <p className="text-2xl font-bold">{card.value}</p>
                  </div>
                  <div className={`p-2 rounded-lg ${card.bg}`}>
                    <card.icon className={`w-5 h-5 ${card.color}`} />
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}

        {/* No-config prompt */}
        {!loading && config === null && (
          <Card className="p-6 border-dashed border-2 border-primary/20 bg-primary/5">
            <div className="flex items-start gap-4">
              <div className="p-3 rounded-full bg-primary/15 flex-shrink-0">
                <AlertCircle className="w-6 h-6 text-primary" />
              </div>
              <div>
                <p className="font-semibold text-foreground">
                  No agent configuration found
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  Head to the{" "}
                  <strong className="text-foreground">Configuration</strong> tab
                  to set up your agent's persona, tone, and auto-reply settings
                  before enabling it.
                </p>
              </div>
            </div>
          </Card>
        )}

        {/* Tabs */}
        <Tabs defaultValue="overview" className="space-y-4">
          <TabsList className="bg-muted/40 border border-border/60">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="inbox">Inbox</TabsTrigger>
            <TabsTrigger value="configuration">Configuration</TabsTrigger>
            <TabsTrigger value="settings">Settings</TabsTrigger>
          </TabsList>

          <TabsContent value="overview">
            <OverviewTab
              actions={actions}
              loading={actionsLoading}
              config={config}
              gmailConnected={gmailConnected}
            />
          </TabsContent>

          <TabsContent value="inbox">
            <InboxTab />
          </TabsContent>

          <TabsContent value="configuration">
            <ConfigTab
              config={config}
              userId={userId}
              onSaved={setConfig}
            />
          </TabsContent>

          <TabsContent value="settings">
            <SettingsTab
              config={config}
              userId={userId}
              gmailConnected={gmailConnected}
              agentTier={agentTier}
              planMaxDailyReplies={planMaxDailyReplies}
              onSaved={setConfig}
              onDataReset={loadData}
            />
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
};

export default Agent;

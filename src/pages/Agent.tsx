import { useState, useEffect, useCallback } from "react";
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
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { OverviewTab } from "@/components/agent/OverviewTab";
import { InboxTab } from "@/components/agent/InboxTab";
import { ConfigTab } from "@/components/agent/ConfigTab";
import { SettingsTab } from "@/components/agent/SettingsTab";

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
  repliesToday: number;
  meetingsBooked: number;
  lastRun: string | null;
}

const Agent = () => {
  const [config, setConfig] = useState<AgentConfig | null>(null);
  const [actions, setActions] = useState<AgentAction[]>([]);
  const [stats, setStats] = useState<AgentStats>({
    activeThreads: 0,
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

      // Load Gmail integration
      const { data: integrationData } = await supabase
        .from("integrations")
        .select("id, connected_email, is_active")
        .eq("user_id", uid)
        .eq("integration_id", "google")
        .maybeSingle();
      setGmailConnected(
        integrationData?.is_active === true && !!integrationData.connected_email
      );

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
        repliesSent?: number;
        threadsChecked?: number;
      } | null;
      toast.success(
        `Agent ran: ${result?.repliesSent ?? 0} replies sent, ${
          result?.threadsChecked ?? 0
        } threads checked`
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

  return (
    <DashboardLayout>
      <PageHeader
        title="AI Sales Agent"
        description="Autonomous email reply management and prospect engagement"
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
                isEnabled ? "bg-green-400" : "bg-muted-foreground/50"
              }`}
            />
            {isEnabled ? "Active" : "Inactive"}
          </Badge>
          {stats.lastRun && (
            <span className="text-xs text-muted-foreground/60">
              Last run:{" "}
              {formatDistanceToNow(new Date(stats.lastRun), {
                addSuffix: true,
              })}
            </span>
          )}
        </div>

        {/* Stats row */}
        {loading ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Card key={i} className="p-5">
                <div className="space-y-2">
                  <div className="h-3 bg-muted animate-pulse rounded w-2/3" />
                  <div className="h-7 bg-muted animate-pulse rounded w-1/2" />
                </div>
              </Card>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
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

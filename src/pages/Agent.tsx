import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { PageHeader } from "@/components/dashboard/PageHeader";
import {
  MetricStrip,
  Panel,
  PanelBody,
  PanelFooter,
  PanelHeader,
  SectionLabel,
  type Metric,
} from "@/components/dashboard/Panel";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Bot, MessageSquare, Lock } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useSubscription } from "@/hooks/use-subscription";
import { getAgentTier, getNextPlan, PLAN_FEATURES, type PlanType } from "@/lib/plan-features";
import { OverviewTab } from "@/components/agent/OverviewTab";
import { InboxTab } from "@/components/agent/InboxTab";
import { HistoryTab } from "@/components/agent/HistoryTab";
import { PerformanceTab } from "@/components/agent/PerformanceTab";
import { ConfigTab } from "@/components/agent/ConfigTab";
import { SettingsTab } from "@/components/agent/SettingsTab";
import { AgentTestDialog } from "@/components/agent/AgentTestDialog";
import { AgentSwitcher } from "@/components/agent/AgentSwitcher";
import { roleLabel } from "@/components/agent/AgentRoles";


export interface AgentConfig {
  id: string;
  user_id: string;
  enabled: boolean;
  agent_name: string | null;
  role: string | null;
  role_instructions?: string | null;
  allowed_tools?: string[] | null;
  is_primary: boolean | null;
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
  approval_mode: boolean | null;
  prospecting_job_title: string | null;
  prospecting_industry: string | null;
  prospecting_country: string | null;
  prospecting_company_size: string | null;
  icp_profile_id: string | null;
  icp_snapshot: Record<string, any> | null;
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
  const [agents, setAgents] = useState<AgentConfig[]>([]);
  const [activeAgentId, setActiveAgentId] = useState<string | null>(null);
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
  const [toggling, setToggling] = useState(false);
  const [gmailConnected, setGmailConnected] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  // Controlled, so the "not configured yet" panel can send the reader to the
  // tab that fixes it instead of telling them to go and find it.
  const [tab, setTab] = useState("overview");


  const loadData = useCallback(async () => {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.user) return;
      const uid = session.user.id;
      setUserId(uid);

      // Load all agent builds for this user
      const { data: configRows } = await (supabase as any)
        .from("agent_configs")
        .select("*")
        .eq("user_id", uid)
        .order("is_primary", { ascending: false })
        .order("created_at", { ascending: true });
      const agentList: AgentConfig[] = configRows ?? [];
      setAgents(agentList);
      setActiveAgentId((prev) =>
        prev && agentList.some((a) => a.id === prev)
          ? prev
          : agentList[0]?.id ?? null
      );

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



  const config = agents.find((a) => a.id === activeAgentId) ?? null;

  // Merge a saved/updated agent row back into the list (used by child tabs)
  const setConfig = useCallback((updated: AgentConfig | null) => {
    if (!updated) return;
    setAgents((prev) => {
      const exists = prev.some((a) => a.id === updated.id);
      return exists
        ? prev.map((a) => (a.id === updated.id ? updated : a))
        : [...prev, updated];
    });
    setActiveAgentId(updated.id);
  }, []);

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
      if (!config?.id) upsertPayload.is_primary = agents.length === 0;

      const { data: updated, error } = await (supabase as any)
        .from("agent_configs")
        .upsert(upsertPayload, { onConflict: "id" })
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

  const currentPlan = (subscription?.plan ?? "free") as PlanType;
  const tierSpec = getAgentTier(currentPlan);
  const agentTier = tierSpec.id;
  const planMaxDailyReplies =
    (subscription?.features as any)?.agentMaxDailyReplies ?? tierSpec.dailyReplies;
  const nextPlan = getNextPlan(currentPlan);
  const fmt = (n: number) => (n === -1 ? "Unlimited" : n.toLocaleString());

  /**
   * What the agent did today.
   *
   * These were six tiles in a grid, each with its own icon in its own colour —
   * cyan, indigo, blue, purple, green, orange — which turned six unrelated
   * numbers into a legend and made the brightest thing on the page a set of
   * squares that mean nothing. The room the icons took goes to saying what each
   * number is. When the agent last ran is no longer among them: that is its
   * state rather than a count of its work, and the page already said it twice.
   */
  const metrics: Metric[] = [
    { label: "Leads found", value: stats.leadsToday, note: "Sourced today against your ICP" },
    { label: "Emails sent", value: stats.outreachToday, note: "First-touch outreach today" },
    { label: "Active threads", value: stats.activeThreads, note: "Conversations still open" },
    { label: "Replies sent", value: stats.repliesToday, note: "Answered by the agent today" },
    { label: "Meetings booked", value: stats.meetingsBooked, note: "Since this agent was enabled" },
  ];

  return (
    <DashboardLayout>
      <PageHeader
        title="AI Sales Agent"
        description="Finds leads, writes and sends first-touch outreach, then handles replies, end to end."
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate("/dashboard/agent/chat")}
            >
              <MessageSquare className="mr-1.5 h-3.5 w-3.5" />
              Chat with agent
            </Button>
            <AgentTestDialog disabled={loading} agentId={activeAgentId} />
          </>
        }
      />

      <div className="space-y-4 pt-4">
        {/*
          Identity, the switch, what it is allowed to do, and what it is allowed
          to spend — one surface.

          These were three: a bare status line floating with no surface under
          it, a card of plan bullets, and a switch stranded in the page header
          two hundred pixels from the word telling you whether it was on. They
          are one question — is this thing running, and within what limits —
          so they are one panel.
        */}
        <Panel>
          <PanelHeader
            title={
              <span className="flex min-w-0 items-center gap-2">
                <Bot className="h-3.5 w-3.5 shrink-0 text-primary" />
                <span className="truncate">{config?.agent_name ?? "AI Agent"}</span>
                {config ? (
                  <span className="shrink-0 text-[0.6875rem] font-normal text-muted-foreground">
                    {roleLabel(config.role)}
                  </span>
                ) : null}
              </span>
            }
            actions={
              <div className="flex items-center gap-2.5">
                <span
                  className={`inline-flex items-center gap-1.5 text-[0.6875rem] ${
                    isEnabled ? "text-green-400" : "text-muted-foreground"
                  }`}
                >
                  <span
                    className={`inline-block h-1.5 w-1.5 rounded-full ${
                      isEnabled ? "bg-green-400" : "bg-muted-foreground/50"
                    }`}
                  />
                  {toggling ? "Updating…" : isEnabled ? "Running" : "Stopped"}
                </span>
                <Switch
                  checked={isEnabled}
                  onCheckedChange={handleToggle}
                  disabled={toggling || loading}
                  aria-label="Toggle agent"
                />
              </div>
            }
          />

          <PanelBody className="space-y-3">
            <SectionLabel>What it may do on its own, on {PLAN_FEATURES[currentPlan].name}</SectionLabel>
            <ul className="grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
              {tierSpec.can.map((c) => (
                <li key={c} className="flex items-start gap-2 text-[0.8125rem] leading-relaxed text-foreground/85">
                  <span className="mt-[0.4375rem] h-1 w-1 shrink-0 rounded-full bg-primary" />
                  {c}
                </li>
              ))}
            </ul>
          </PanelBody>

          <PanelFooter className="justify-between">
            <span className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <span>
                <span className="text-muted-foreground/60">Builds</span>{" "}
                <span className="tabular-nums text-foreground">{fmt(tierSpec.builds)}</span>
              </span>
              <span>
                <span className="text-muted-foreground/60">Replies / day</span>{" "}
                <span className="tabular-nums text-foreground">{fmt(tierSpec.dailyReplies)}</span>
              </span>
              <span>
                <span className="text-muted-foreground/60">Leads / day</span>{" "}
                <span className="tabular-nums text-foreground">{fmt(tierSpec.dailyLeadSourcing)}</span>
              </span>
              {stats.lastRun ? (
                <span>
                  <span className="text-muted-foreground/60">Last run</span>{" "}
                  <span className="text-foreground">
                    {formatDistanceToNow(new Date(stats.lastRun), { addSuffix: true })}
                  </span>
                </span>
              ) : (
                <span className="text-muted-foreground/60">Has not run yet</span>
              )}
            </span>
            {nextPlan && (
              <button
                onClick={() => navigate("/pricing")}
                className="inline-flex items-center gap-1.5 text-muted-foreground transition-colors hover:text-foreground"
              >
                <Lock className="h-3 w-3" />
                More volume on {PLAN_FEATURES[nextPlan].name}
              </button>
            )}
          </PanelFooter>
        </Panel>

        <AgentSwitcher
          agents={agents}
          activeAgentId={activeAgentId}
          userId={userId}
          maxBuilds={tierSpec.builds}
          loading={loading}
          onSelect={setActiveAgentId}
          onChanged={loadData}
        />

        {loading ? (
          <div className="grid grid-cols-2 overflow-hidden rounded-xl border border-border/30 lg:grid-cols-5">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="space-y-2 px-4 py-4 sm:px-5">
                <div className="h-2.5 w-2/3 animate-pulse rounded bg-muted" />
                <div className="h-6 w-1/2 animate-pulse rounded bg-muted" />
              </div>
            ))}
          </div>
        ) : (
          <MetricStrip metrics={metrics} columns={5} />
        )}

        {/* Not a dashed, tinted slab with a 24px icon in a tinted circle — that
            is decoration standing in for the sentence beside it, and this one
            sentence is the whole message. */}
        {!loading && agents.length > 0 && config === null && (
          <Panel>
            <PanelBody className="flex flex-col gap-3 py-3.5 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="text-[0.8125rem] font-medium text-foreground">This agent is not configured yet</p>
                <p className="mt-1 text-[0.6875rem] leading-relaxed text-muted-foreground">
                  Set its persona, tone and auto-reply rules before turning it on, or it will run with defaults.
                </p>
              </div>
              <Button size="sm" className="shrink-0" onClick={() => setTab("configuration")}>
                Configure agent
              </Button>
            </PanelBody>
          </Panel>
        )}

        <Tabs value={tab} onValueChange={setTab} className="space-y-4">
          {/* Scrollable at narrow widths: six triggers do not fit on a phone,
              and a TabsList that does not scroll simply hides the last two. */}
          <div className="-mx-1 overflow-x-auto px-1">
            <TabsList className="inline-flex w-auto border border-border/50 bg-muted/30">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="inbox">Inbox</TabsTrigger>
              <TabsTrigger value="configuration">Configuration</TabsTrigger>
              <TabsTrigger value="history">History</TabsTrigger>
              <TabsTrigger value="performance">Performance</TabsTrigger>
              <TabsTrigger value="settings">Settings</TabsTrigger>
            </TabsList>
          </div>

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
            <ConfigTab config={config} userId={userId} onSaved={setConfig} />
          </TabsContent>

          <TabsContent value="history">
            <HistoryTab agents={agents} userId={userId} />
          </TabsContent>

          <TabsContent value="performance">
            <PerformanceTab />
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

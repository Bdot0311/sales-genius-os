import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { PageHeader } from "@/components/dashboard/PageHeader";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import {
  BarChart, Bar, LineChart, Line, AreaChart, Area, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import {
  TrendingUp, Users, DollarSign, Target, Loader2, Download, FileText, Sparkles,
  ArrowRight, FileDown, Info, Mail, MessageSquareReply, Eye, Clock, Trophy, Building2, Gauge,
} from "lucide-react";
import { usePlanFeatures } from "@/hooks/use-plan-features";
import { FeatureGateModal } from "@/components/dashboard/FeatureGateModal";
import { FeatureHighlight } from "@/components/dashboard/FeatureHighlight";
import { OUTBOUND_KB } from "@/lib/outbound-kb";
import { LiveIndicator } from "@/components/deliverability/LiveIndicator";
import type { LiveStatus } from "@/hooks/use-deliverability-realtime";

import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

type LeadRow = {
  id: string; created_at: string; company_name: string | null; contact_name: string | null;
  contact_email: string | null; industry: string | null; source: string | null;
  icp_score: number | null; intent_score: number | null; fit_score: number | null; tier: string | null;
  pipeline_stage: string | null; lead_status: string | null; engagement_state: string | null;
  last_contacted_at: string | null; enrichment_status: string | null; country: string | null;
};
type DealRow = {
  id: string; created_at: string; updated_at: string | null; title: string | null; stage: string | null;
  value: number | null; probability: number | null; expected_close_date: string | null; company_name: string | null;
};
type EmailRow = {
  id: string; created_at: string; sent_at: string | null; status: string | null;
  opened_at: string | null; replied_at: string | null; clicked_at: string | null; lead_id: string | null;
};
type ActivityRow = { id: string; created_at: string; type: string | null; completed: boolean | null };

const RANGES = [
  { label: "7d", days: 7 },
  { label: "30d", days: 30 },
  { label: "90d", days: 90 },
  { label: "All", days: 3650 },
];

const STAGES = [
  { key: "new", label: "New" },
  { key: "qualified", label: "Qualified" },
  { key: "proposal", label: "Proposal" },
  { key: "negotiation", label: "Negotiation" },
  { key: "closed-won", label: "Closed Won" },
  { key: "closed-lost", label: "Closed Lost" },
];

const PIPELINE_STAGES = ["new", "contacted", "engaged", "no_response", "meeting_booked", "won", "lost"];

const COLORS = ["hsl(var(--primary))", "#22c55e", "#3b82f6", "#f59e0b", "#ef4444", "#a855f7", "#14b8a6"];

const pctOf = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 1000) / 10 : 0);
const dayKey = (iso: string) => iso.slice(0, 10);
const money = (n: number) => `$${Math.round(n).toLocaleString()}`;
const prettyStage = (s: string) => s.replace(/[_-]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

const StatCard = ({ title, value, sub, icon: Icon, color, bg }: any) => (
  <Card className="p-5">
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="text-sm text-muted-foreground mb-1 truncate">{title}</p>
        <p className="text-2xl md:text-3xl font-bold tabular-nums">{value}</p>
        {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
      </div>
      <div className={`p-2.5 rounded-lg shrink-0 ${bg}`}>
        <Icon className={`w-5 h-5 ${color}`} />
      </div>
    </div>
  </Card>
);

const Analytics = () => {
  const { currentPlan, features, loading: planLoading, gateModalOpen, setGateModalOpen, gatedFeature, triggerGate } = usePlanFeatures();

  const [rangeDays, setRangeDays] = useState(30);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<LiveStatus>("connecting");
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());

  const [leads, setLeads] = useState<LeadRow[]>([]);
  const [deals, setDeals] = useState<DealRow[]>([]);
  const [emails, setEmails] = useState<EmailRow[]>([]);
  const [activities, setActivities] = useState<ActivityRow[]>([]);

  const since = useMemo(() => new Date(Date.now() - rangeDays * 86400_000).toISOString(), [rangeDays]);

  const load = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const [l, d, e, a] = await Promise.all([
        supabase.from("leads").select("id,created_at,company_name,contact_name,contact_email,industry,source,icp_score,intent_score,fit_score,tier,pipeline_stage,lead_status,engagement_state,last_contacted_at,enrichment_status,country").eq("user_id", user.id).gte("created_at", since).order("created_at", { ascending: false }).limit(5000),
        supabase.from("deals").select("id,created_at,updated_at,title,stage,value,probability,expected_close_date,company_name").eq("user_id", user.id).limit(5000),
        supabase.from("sent_emails").select("id,created_at,sent_at,status,opened_at,replied_at,clicked_at,lead_id").eq("user_id", user.id).gte("created_at", since).limit(5000),
        supabase.from("activities").select("id,created_at,type,completed").eq("user_id", user.id).gte("created_at", since).limit(5000),
      ]);
      setLeads((l.data as LeadRow[]) ?? []);
      setDeals((d.data as DealRow[]) ?? []);
      setEmails((e.data as EmailRow[]) ?? []);
      setActivities((a.data as ActivityRow[]) ?? []);
      setLastUpdate(new Date());
    } catch (err) {
      console.error("Analytics load error:", err);
      toast.error("Failed to load analytics data");
    } finally {
      setLoading(false);
    }
  }, [since]);

  const loadRef = useRef(load);
  loadRef.current = load;

  useEffect(() => { void load(); }, [load]);

  // Realtime streams across every table this page derives numbers from.
  useEffect(() => {
    const ch = supabase.channel(`analytics-live-${Math.random().toString(36).slice(2)}`);
    for (const table of ["leads", "deals", "sent_emails", "activities"]) {
      ch.on("postgres_changes", { event: "*", schema: "public", table }, () => void loadRef.current());
    }
    ch.subscribe((s) => {
      if (s === "SUBSCRIBED") setStatus("live");
      else if (s === "CHANNEL_ERROR" || s === "TIMED_OUT" || s === "CLOSED") setStatus("offline");
    });
    return () => { supabase.removeChannel(ch); };
  }, []);

  // Polling fallback + refetch on focus.
  useEffect(() => {
    const tick = () => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      void loadRef.current();
    };
    const id = window.setInterval(tick, 30_000);
    const onVis = () => { if (document.visibilityState === "visible") tick(); };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("focus", tick);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("focus", tick);
    };
  }, []);

  const m = useMemo(() => {
    const openDeals = deals.filter((d) => d.stage !== "closed-won" && d.stage !== "closed-lost");
    const won = deals.filter((d) => d.stage === "closed-won");
    const lost = deals.filter((d) => d.stage === "closed-lost");
    const pipelineValue = openDeals.reduce((s, d) => s + (Number(d.value) || 0), 0);
    const wonValue = won.reduce((s, d) => s + (Number(d.value) || 0), 0);
    const weighted = openDeals.reduce((s, d) => s + (Number(d.value) || 0) * ((d.probability ?? 0) / 100), 0);
    const totalValue = deals.reduce((s, d) => s + (Number(d.value) || 0), 0);

    const sent = emails.filter((e) => e.sent_at || e.status === "sent");
    const opened = sent.filter((e) => e.opened_at).length;
    const replied = sent.filter((e) => e.replied_at).length;
    const clicked = sent.filter((e) => e.clicked_at).length;

    const contactedLeadIds = new Set(sent.map((e) => e.lead_id).filter(Boolean) as string[]);

    // Daily series
    const days: string[] = [];
    const span = Math.min(rangeDays, 90);
    for (let i = span - 1; i >= 0; i--) days.push(new Date(Date.now() - i * 86400_000).toISOString().slice(0, 10));
    const blank = () => Object.fromEntries(days.map((d) => [d, 0])) as Record<string, number>;
    const leadDay = blank(), sentDay = blank(), replyDay = blank(), dealDay = blank();
    leads.forEach((l) => { const k = dayKey(l.created_at); if (k in leadDay) leadDay[k]++; });
    sent.forEach((e) => { const k = dayKey(e.sent_at || e.created_at); if (k in sentDay) sentDay[k]++; if (e.replied_at) { const r = dayKey(e.replied_at); if (r in replyDay) replyDay[r]++; } });
    deals.forEach((d) => { const k = dayKey(d.created_at); if (k in dealDay) dealDay[k]++; });
    const series = days.map((d) => ({
      day: new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
      leads: leadDay[d], emails: sentDay[d], replies: replyDay[d], deals: dealDay[d],
    }));

    const dealsByStage = STAGES.map((s) => ({
      stage: s.label,
      count: deals.filter((d) => d.stage === s.key).length,
      value: deals.filter((d) => d.stage === s.key).reduce((sum, d) => sum + (Number(d.value) || 0), 0),
    }));

    const pipelineDist = PIPELINE_STAGES.map((s) => ({
      stage: prettyStage(s),
      count: leads.filter((l) => (l.pipeline_stage ?? "new") === s).length,
    })).filter((r) => r.count > 0);

    const group = <T,>(rows: T[], key: (r: T) => string | null | undefined) => {
      const map = new Map<string, T[]>();
      rows.forEach((r) => {
        const k = (key(r) || "Unknown").toString();
        map.set(k, [...(map.get(k) ?? []), r]);
      });
      return map;
    };

    const bySource = [...group(leads, (l) => l.source)].map(([source, rows]) => {
      const contacted = rows.filter((r) => contactedLeadIds.has(r.id)).length;
      const avgIcp = rows.length ? Math.round(rows.reduce((s, r) => s + (r.icp_score ?? 0), 0) / rows.length) : 0;
      return { source, leads: rows.length, contacted, contactRate: pctOf(contacted, rows.length), avgIcp };
    }).sort((a, b) => b.leads - a.leads).slice(0, 10);

    const byIndustry = [...group(leads, (l) => l.industry)].map(([industry, rows]) => ({
      industry, leads: rows.length,
      avgIcp: rows.length ? Math.round(rows.reduce((s, r) => s + (r.icp_score ?? 0), 0) / rows.length) : 0,
    })).sort((a, b) => b.leads - a.leads).slice(0, 10);

    const byCountry = [...group(leads, (l) => l.country)].map(([country, rows]) => ({ country, leads: rows.length }))
      .sort((a, b) => b.leads - a.leads).slice(0, 8);

    const tiers = ["A", "B", "C", "D"].map((t) => ({
      tier: t, count: leads.filter((l) => (l.tier || "").toUpperCase() === t).length,
    })).filter((t) => t.count > 0);

    const scoreBuckets = [
      { bucket: "0-24", min: 0, max: 24 }, { bucket: "25-49", min: 25, max: 49 },
      { bucket: "50-74", min: 50, max: 74 }, { bucket: "75-100", min: 75, max: 100 },
    ].map((b) => ({ bucket: b.bucket, count: leads.filter((l) => (l.icp_score ?? 0) >= b.min && (l.icp_score ?? 0) <= b.max).length }));

    const enriched = leads.filter((l) => l.enrichment_status === "enriched" || l.enrichment_status === "completed").length;

    const activityByType = [...group(activities, (a) => a.type)].map(([type, rows]) => ({
      type: prettyStage(type), count: rows.length, done: rows.filter((r) => r.completed).length,
    })).sort((a, b) => b.count - a.count);

    const avgSalesCycleDays = (() => {
      const closed = won.filter((d) => d.updated_at);
      if (!closed.length) return null;
      const total = closed.reduce((s, d) => s + (new Date(d.updated_at!).getTime() - new Date(d.created_at).getTime()), 0);
      return Math.round(total / closed.length / 86400_000);
    })();

    const funnel = [
      { step: "Leads", people: leads.length },
      { step: "Contacted", people: contactedLeadIds.size },
      { step: "Replied", people: new Set(sent.filter((e) => e.replied_at).map((e) => e.lead_id).filter(Boolean)).size },
      { step: "Deals", people: deals.length },
      { step: "Won", people: won.length },
    ];

    return {
      totalLeads: leads.length, totalDeals: deals.length, openDeals: openDeals.length,
      won: won.length, lost: lost.length, pipelineValue, wonValue, weighted, totalValue,
      avgDealSize: deals.length ? totalValue / deals.length : 0,
      winRate: pctOf(won.length, won.length + lost.length),
      sentCount: sent.length, openRate: pctOf(opened, sent.length), replyRate: pctOf(replied, sent.length),
      clickRate: pctOf(clicked, sent.length), replied,
      leadToDeal: pctOf(deals.length, leads.length),
      contacted: contactedLeadIds.size, contactRate: pctOf(contactedLeadIds.size, leads.length),
      enrichRate: pctOf(enriched, leads.length),
      series, dealsByStage, pipelineDist, bySource, byIndustry, byCountry, tiers, scoreBuckets,
      activityByType, avgSalesCycleDays, funnel,
      topDeals: [...deals].sort((a, b) => (Number(b.value) || 0) - (Number(a.value) || 0)).slice(0, 8),
      hotLeads: [...leads].sort((a, b) => (b.intent_score ?? b.icp_score ?? 0) - (a.intent_score ?? a.icp_score ?? 0)).slice(0, 10),
    };
  }, [leads, deals, emails, activities, rangeDays]);

  const handleExport = async () => {
    if (!features.dataExports) { triggerGate("dataExports"); return; }
    const payload = { exportDate: new Date().toISOString(), rangeDays, metrics: m, leads, deals };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `outreign-analytics-${new Date().toISOString().split("T")[0]}.json`; a.click();
    URL.revokeObjectURL(url);
  };

  const csvDownload = (rows: string[][], name: string) => {
    const blob = new Blob([rows.map((r) => r.join(",")).join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = name; a.click();
    URL.revokeObjectURL(url);
  };

  const handleCustomReport = () => {
    if (!features.customReports) { triggerGate("customReports"); return; }
    csvDownload([
      ["Metric", "Value"],
      ["Total Leads", `${m.totalLeads}`], ["Contact Rate", `${m.contactRate}%`],
      ["Emails Sent", `${m.sentCount}`], ["Open Rate", `${m.openRate}%`], ["Reply Rate", `${m.replyRate}%`],
      ["Deals", `${m.totalDeals}`], ["Win Rate", `${m.winRate}%`],
      ["Pipeline Value", money(m.pipelineValue)], ["Won Value", money(m.wonValue)],
      [""], ["Stage", "Deals", "Value"],
      ...m.dealsByStage.map((d) => [d.stage, `${d.count}`, `${Math.round(d.value)}`]),
    ], `outreign-report-${new Date().toISOString().split("T")[0]}.csv`);
  };

  const handleExportPDF = () => {
    csvDownload([
      ["OutReign Agency Report", `Generated: ${new Date().toLocaleDateString()}`], [""],
      ["Metric", "Value"],
      ["Total Leads", `${m.totalLeads}`], ["Deals", `${m.totalDeals}`],
      ["Pipeline Value", money(m.pipelineValue)], ["Won Value", money(m.wonValue)],
      [""], ["Source", "Leads", "Contact Rate"],
      ...m.bySource.map((s) => [s.source, `${s.leads}`, `${s.contactRate}%`]),
    ], `outreign-agency-report-${new Date().toISOString().split("T")[0]}.csv`);
    toast.success("Agency report downloaded");
  };

  if (planLoading || loading) {
    return <DashboardLayout><div className="flex items-center justify-center h-64"><Loader2 className="w-12 h-12 text-muted-foreground animate-spin" /></div></DashboardLayout>;
  }

  return (
    <DashboardLayout>
      <FeatureGateModal open={gateModalOpen} onOpenChange={setGateModalOpen} feature={gatedFeature || "funnelAnalytics"} currentPlan={currentPlan} />

      <PageHeader
        title="Analytics"
        description="Live pipeline, lead and outreach performance"
        actions={
          <>
            <Button variant="outline" onClick={handleExport}>
              <Download className="w-4 h-4 mr-2" />Export
              {!features.dataExports && <Sparkles className="w-3 h-3 ml-2 text-primary" />}
            </Button>
            <Button variant="outline" onClick={handleCustomReport}>
              <FileText className="w-4 h-4 mr-2" />Custom Report
              {!features.customReports && <Sparkles className="w-3 h-3 ml-2 text-primary" />}
            </Button>
            {currentPlan === "agency" && (
              <Button variant="outline" onClick={handleExportPDF} className="gap-2">
                <FileDown className="w-4 h-4" />Agency Report
              </Button>
            )}
          </>
        }
      />

      <div className="px-4 md:px-6 py-6 space-y-6 max-w-[1400px] mx-auto">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1 rounded-lg border border-border/60 bg-card/50 p-1">
            {RANGES.map((r) => (
              <Button key={r.label} size="sm" variant={rangeDays === r.days ? "secondary" : "ghost"}
                className="h-7 px-3 text-xs" onClick={() => setRangeDays(r.days)}>
                {r.label}
              </Button>
            ))}
          </div>
          <LiveIndicator status={status} lastUpdate={lastUpdate} />
        </div>

        <Tabs defaultValue="overview" className="w-full">
          <div className="-mx-4 px-4 md:mx-0 md:px-0 overflow-x-auto">
            <TabsList className="w-max">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="pipeline">Pipeline</TabsTrigger>
              <TabsTrigger value="leads">Leads</TabsTrigger>
              <TabsTrigger value="outreach">Outreach</TabsTrigger>
              <TabsTrigger value="sources">Sources</TabsTrigger>
              <TabsTrigger value="activity">Activity</TabsTrigger>
              <TabsTrigger value="benchmarks">Benchmarks</TabsTrigger>
            </TabsList>
          </div>

          {/* OVERVIEW */}
          <TabsContent value="overview" className="space-y-6 mt-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
              <StatCard title="Leads" value={m.totalLeads.toLocaleString()} sub={`${m.contactRate}% contacted`} icon={Users} color="text-blue-500" bg="bg-blue-500/10" />
              <StatCard title="Open Pipeline" value={money(m.pipelineValue)} sub={`${m.openDeals} open deals`} icon={Target} color="text-purple-500" bg="bg-purple-500/10" />
              <StatCard title="Closed Won" value={money(m.wonValue)} sub={`${m.winRate}% win rate`} icon={DollarSign} color="text-green-500" bg="bg-green-500/10" />
              <StatCard title="Avg Deal Size" value={money(m.avgDealSize)} sub={m.avgSalesCycleDays !== null ? `${m.avgSalesCycleDays}d avg cycle` : "Cycle: n/a"} icon={TrendingUp} color="text-orange-500" bg="bg-orange-500/10" />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
              <StatCard title="Emails Sent" value={m.sentCount.toLocaleString()} sub={`${m.replied} replies`} icon={Mail} color="text-cyan-500" bg="bg-cyan-500/10" />
              <StatCard title="Open Rate" value={`${m.openRate}%`} sub="Tracked opens" icon={Eye} color="text-indigo-500" bg="bg-indigo-500/10" />
              <StatCard title="Reply Rate" value={`${m.replyRate}%`} sub={`${m.clickRate}% click rate`} icon={MessageSquareReply} color="text-emerald-500" bg="bg-emerald-500/10" />
              <StatCard title="Weighted Forecast" value={money(m.weighted)} sub="Value × probability" icon={Gauge} color="text-pink-500" bg="bg-pink-500/10" />
            </div>

            <Card className="p-5">
              <h2 className="text-lg font-semibold mb-4">Revenue funnel</h2>
              <div className="space-y-3">
                {m.funnel.map((step, i) => {
                  const top = Math.max(...m.funnel.map((f) => f.people), 1);
                  const prev = i === 0 ? null : m.funnel[i - 1].people;
                  const conv = prev && prev > 0 ? Math.round((step.people / prev) * 100) : null;
                  return (
                    <div key={step.step} className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-medium">{step.step}</span>
                        <span className="text-muted-foreground tabular-nums">
                          {step.people.toLocaleString()}{conv !== null && ` · ${conv}% of previous`}
                        </span>
                      </div>
                      <div className="h-2 rounded-full bg-muted">
                        <div className="h-2 rounded-full bg-primary" style={{ width: `${Math.max((step.people / top) * 100, 1)}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>

            <Card className="p-5">
              <h2 className="text-lg font-semibold mb-4">Daily activity</h2>
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={m.series}>
                  <defs>
                    <linearGradient id="aLeads" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.7} />
                      <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0.05} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="day" className="text-xs" /><YAxis className="text-xs" allowDecimals={false} />
                  <Tooltip /><Legend />
                  <Area type="monotone" dataKey="leads" name="Leads" stroke="hsl(var(--primary))" fill="url(#aLeads)" />
                  <Line type="monotone" dataKey="emails" name="Emails" stroke="#3b82f6" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="replies" name="Replies" stroke="#22c55e" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="deals" name="Deals" stroke="#f59e0b" strokeWidth={2} dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </Card>
          </TabsContent>

          {/* PIPELINE */}
          <TabsContent value="pipeline" className="space-y-6 mt-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card className="p-5">
                <h2 className="text-lg font-semibold mb-4">Deals by stage</h2>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={m.dealsByStage}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="stage" className="text-xs" /><YAxis className="text-xs" allowDecimals={false} /><Tooltip />
                    <Bar dataKey="count" name="Deals" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </Card>
              <Card className="p-5">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-semibold">Value by stage</h2>
                  {!features.funnelAnalytics && <FeatureHighlight availableOn="pro" onUpgrade={() => triggerGate("funnelAnalytics")} inline />}
                </div>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie data={m.dealsByStage.filter((d) => d.value > 0)} dataKey="value" nameKey="stage" cx="50%" cy="50%" outerRadius={100} label>
                      {m.dealsByStage.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Tooltip formatter={(v: any) => money(Number(v))} /><Legend />
                  </PieChart>
                </ResponsiveContainer>
              </Card>
            </div>

            <Card className="p-5 overflow-x-auto">
              <h2 className="text-lg font-semibold mb-4">Largest open opportunities</h2>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Deal</TableHead><TableHead>Company</TableHead><TableHead>Stage</TableHead>
                    <TableHead className="text-right">Value</TableHead><TableHead className="text-right">Prob.</TableHead>
                    <TableHead>Expected close</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {m.topDeals.map((d) => (
                    <TableRow key={d.id}>
                      <TableCell className="font-medium">{d.title || "Untitled"}</TableCell>
                      <TableCell className="text-muted-foreground">{d.company_name || "—"}</TableCell>
                      <TableCell><Badge variant="secondary">{prettyStage(d.stage || "new")}</Badge></TableCell>
                      <TableCell className="text-right tabular-nums">{money(Number(d.value) || 0)}</TableCell>
                      <TableCell className="text-right tabular-nums">{d.probability ?? 0}%</TableCell>
                      <TableCell className="text-muted-foreground">{d.expected_close_date ? new Date(d.expected_close_date).toLocaleDateString() : "—"}</TableCell>
                    </TableRow>
                  ))}
                  {!m.topDeals.length && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">No deals yet</TableCell></TableRow>}
                </TableBody>
              </Table>
            </Card>
          </TabsContent>

          {/* LEADS */}
          <TabsContent value="leads" className="space-y-6 mt-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
              <StatCard title="New Leads" value={m.totalLeads.toLocaleString()} sub={`in last ${rangeDays > 365 ? "all time" : `${rangeDays}d`}`} icon={Users} color="text-blue-500" bg="bg-blue-500/10" />
              <StatCard title="Contacted" value={m.contacted.toLocaleString()} sub={`${m.contactRate}% of leads`} icon={Mail} color="text-cyan-500" bg="bg-cyan-500/10" />
              <StatCard title="Enriched" value={`${m.enrichRate}%`} sub="Data completeness" icon={Building2} color="text-purple-500" bg="bg-purple-500/10" />
              <StatCard title="Lead → Deal" value={`${m.leadToDeal}%`} sub="Conversion" icon={Trophy} color="text-green-500" bg="bg-green-500/10" />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card className="p-5">
                <h2 className="text-lg font-semibold mb-4">Pipeline stage distribution</h2>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={m.pipelineDist} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis type="number" className="text-xs" allowDecimals={false} />
                    <YAxis type="category" dataKey="stage" width={110} className="text-xs" />
                    <Tooltip />
                    <Bar dataKey="count" name="Leads" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </Card>
              <Card className="p-5">
                <h2 className="text-lg font-semibold mb-4">ICP score distribution</h2>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={m.scoreBuckets}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="bucket" className="text-xs" /><YAxis className="text-xs" allowDecimals={false} /><Tooltip />
                    <Bar dataKey="count" name="Leads" fill="#22c55e" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
                {!!m.tiers.length && (
                  <div className="flex flex-wrap gap-2 mt-4">
                    {m.tiers.map((t) => <Badge key={t.tier} variant="secondary">Tier {t.tier}: {t.count}</Badge>)}
                  </div>
                )}
              </Card>
            </div>

            <Card className="p-5 overflow-x-auto">
              <h2 className="text-lg font-semibold mb-4">Highest intent leads</h2>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Lead</TableHead><TableHead>Company</TableHead><TableHead>Stage</TableHead>
                    <TableHead className="text-right">ICP</TableHead><TableHead className="text-right">Intent</TableHead>
                    <TableHead>Last contacted</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {m.hotLeads.map((l) => (
                    <TableRow key={l.id}>
                      <TableCell className="font-medium">{l.contact_name || l.contact_email || "—"}</TableCell>
                      <TableCell className="text-muted-foreground">{l.company_name || "—"}</TableCell>
                      <TableCell><Badge variant="secondary">{prettyStage(l.pipeline_stage || "new")}</Badge></TableCell>
                      <TableCell className="text-right tabular-nums">{l.icp_score ?? "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">{l.intent_score ?? "—"}</TableCell>
                      <TableCell className="text-muted-foreground">{l.last_contacted_at ? new Date(l.last_contacted_at).toLocaleDateString() : "Never"}</TableCell>
                    </TableRow>
                  ))}
                  {!m.hotLeads.length && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">No leads in this range</TableCell></TableRow>}
                </TableBody>
              </Table>
            </Card>
          </TabsContent>

          {/* OUTREACH */}
          <TabsContent value="outreach" className="space-y-6 mt-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
              <StatCard title="Emails Sent" value={m.sentCount.toLocaleString()} sub={`${rangeDays > 365 ? "all time" : `last ${rangeDays}d`}`} icon={Mail} color="text-cyan-500" bg="bg-cyan-500/10" />
              <StatCard title="Open Rate" value={`${m.openRate}%`} sub="Pixel-tracked" icon={Eye} color="text-indigo-500" bg="bg-indigo-500/10" />
              <StatCard title="Reply Rate" value={`${m.replyRate}%`} sub={`${m.replied} replies`} icon={MessageSquareReply} color="text-emerald-500" bg="bg-emerald-500/10" />
              <StatCard title="Click Rate" value={`${m.clickRate}%`} sub="Tracked links" icon={Target} color="text-orange-500" bg="bg-orange-500/10" />
            </div>
            <Card className="p-5">
              <h2 className="text-lg font-semibold mb-4">Send volume vs. replies</h2>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={m.series}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="day" className="text-xs" /><YAxis className="text-xs" allowDecimals={false} /><Tooltip /><Legend />
                  <Line type="monotone" dataKey="emails" name="Emails sent" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="replies" name="Replies" stroke="#22c55e" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
              <p className="text-xs text-muted-foreground mt-3">
                Deeper email analytics — subject lines, templates, sequences, mailboxes and send timing — live under Outreach → Performance.
              </p>
            </Card>
          </TabsContent>

          {/* SOURCES */}
          <TabsContent value="sources" className="space-y-6 mt-6">
            <Card className="p-5 overflow-x-auto">
              <h2 className="text-lg font-semibold mb-4">Lead sources</h2>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Source</TableHead><TableHead className="text-right">Leads</TableHead>
                    <TableHead className="text-right">Contacted</TableHead><TableHead className="text-right">Contact rate</TableHead>
                    <TableHead className="text-right">Avg ICP</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {m.bySource.map((s) => (
                    <TableRow key={s.source}>
                      <TableCell className="font-medium">{s.source}</TableCell>
                      <TableCell className="text-right tabular-nums">{s.leads}</TableCell>
                      <TableCell className="text-right tabular-nums">{s.contacted}</TableCell>
                      <TableCell className="text-right tabular-nums">{s.contactRate}%</TableCell>
                      <TableCell className="text-right tabular-nums">{s.avgIcp}</TableCell>
                    </TableRow>
                  ))}
                  {!m.bySource.length && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">No lead sources yet</TableCell></TableRow>}
                </TableBody>
              </Table>
            </Card>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card className="p-5">
                <h2 className="text-lg font-semibold mb-4">Top industries</h2>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={m.byIndustry} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis type="number" className="text-xs" allowDecimals={false} />
                    <YAxis type="category" dataKey="industry" width={130} className="text-xs" />
                    <Tooltip />
                    <Bar dataKey="leads" name="Leads" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </Card>
              <Card className="p-5">
                <h2 className="text-lg font-semibold mb-4">Top geographies</h2>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={m.byCountry}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="country" className="text-xs" /><YAxis className="text-xs" allowDecimals={false} /><Tooltip />
                    <Bar dataKey="leads" name="Leads" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </Card>
            </div>
          </TabsContent>

          {/* ACTIVITY */}
          <TabsContent value="activity" className="space-y-6 mt-6">
            <Card className="p-5 overflow-x-auto">
              <h2 className="text-lg font-semibold mb-4">Activity by type</h2>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Type</TableHead><TableHead className="text-right">Logged</TableHead>
                    <TableHead className="text-right">Completed</TableHead><TableHead className="text-right">Completion</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {m.activityByType.map((a) => (
                    <TableRow key={a.type}>
                      <TableCell className="font-medium">{a.type}</TableCell>
                      <TableCell className="text-right tabular-nums">{a.count}</TableCell>
                      <TableCell className="text-right tabular-nums">{a.done}</TableCell>
                      <TableCell className="text-right tabular-nums">{pctOf(a.done, a.count)}%</TableCell>
                    </TableRow>
                  ))}
                  {!m.activityByType.length && <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">No activity logged in this range</TableCell></TableRow>}
                </TableBody>
              </Table>
            </Card>

            {features.repPerformance ? (
              <Card className="p-5">
                <h2 className="text-lg font-semibold mb-4">Rep performance</h2>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  {[
                    { icon: Users, color: "text-primary", label: "Leads managed", value: m.totalLeads.toLocaleString() },
                    { icon: Target, color: "text-green-500", label: "Lead → deal", value: `${m.leadToDeal}%` },
                    { icon: DollarSign, color: "text-yellow-500", label: "Avg deal value", value: money(m.avgDealSize) },
                    { icon: Clock, color: "text-blue-500", label: "Avg sales cycle", value: m.avgSalesCycleDays !== null ? `${m.avgSalesCycleDays}d` : "—" },
                  ].map((s) => (
                    <div key={s.label} className="p-4 rounded-lg bg-muted/50">
                      <div className="flex items-center gap-2 mb-2"><s.icon className={`w-4 h-4 ${s.color}`} /><span className="text-sm font-medium">{s.label}</span></div>
                      <p className="text-2xl font-bold tabular-nums">{s.value}</p>
                    </div>
                  ))}
                </div>
              </Card>
            ) : (
              <Card className="p-6 border-dashed border-2 border-primary/20">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <h2 className="text-lg font-semibold mb-1">Rep performance</h2>
                    <p className="text-muted-foreground text-sm">Track individual rep performance and identify coaching opportunities.</p>
                  </div>
                  <FeatureHighlight availableOn="pro" onUpgrade={() => triggerGate("funnelAnalytics")} />
                </div>
              </Card>
            )}
          </TabsContent>

          {/* BENCHMARKS */}
          <TabsContent value="benchmarks" className="space-y-6 mt-6">
            <OutboundBenchmarksCard userReplyRate={m.sentCount > 0 ? m.replyRate / 100 : null} />
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
};

function OutboundBenchmarksCard({ userReplyRate }: { userReplyRate: number | null }) {
  const kb = OUTBOUND_KB.benchmarks;

  const benchmarkTiers = [
    { label: "Industry Average", rate: kb.industryAvgReplyRate, color: "bg-yellow-500" },
    { label: "Top Quartile", rate: kb.topQuartileReplyRate, color: "bg-blue-500" },
    { label: "Elite (Top 10%)", rate: kb.eliteReplyRate, color: "bg-[#9263E9]" },
  ];

  const getRateStatus = (rate: number) => {
    if (rate >= kb.eliteReplyRate) return { label: "Elite", color: "text-[#9263E9]", bg: "bg-[#9263E9]/10" };
    if (rate >= kb.topQuartileReplyRate) return { label: "Top Quartile", color: "text-blue-500", bg: "bg-blue-500/10" };
    if (rate >= kb.industryAvgReplyRate) return { label: "Average", color: "text-yellow-500", bg: "bg-yellow-500/10" };
    return { label: "Below Average", color: "text-red-500", bg: "bg-red-500/10" };
  };

  const likelyCauses = [
    { issue: "Targeting too broad", fix: "Narrow your ICP — niche segments get 3–5x higher reply rates" },
    { issue: "Generic copy", fix: "Use signal-based templates and unique openers per prospect" },
    { issue: "Deliverability issues", fix: "Check SPF/DKIM/DMARC and warmup status" },
  ];

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold">Your performance vs. industry</h2>
          <p className="text-sm text-muted-foreground mt-0.5">2026 benchmarks — Instantly Benchmark Report (billions of emails)</p>
        </div>
        {userReplyRate !== null && (
          <Badge className={`${getRateStatus(userReplyRate).bg} ${getRateStatus(userReplyRate).color} border-0`}>
            {getRateStatus(userReplyRate).label}
          </Badge>
        )}
      </div>

      <div className="space-y-4">
        {benchmarkTiers.map((tier) => {
          const pct = Math.round(tier.rate * 100 * 10) / 10;
          const barWidth = (tier.rate / kb.eliteReplyRate) * 100;
          return (
            <div key={tier.label} className="space-y-1.5">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{tier.label}</span>
                <span className="font-semibold">{pct}% reply rate</span>
              </div>
              <div className="h-2 rounded-full bg-muted overflow-hidden">
                <div className={`h-full rounded-full ${tier.color}`} style={{ width: `${barWidth}%` }} />
              </div>
            </div>
          );
        })}

        {userReplyRate !== null && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium">Your reply rate</span>
              <span className={`font-semibold ${getRateStatus(userReplyRate).color}`}>
                {Math.round(userReplyRate * 100 * 10) / 10}%
              </span>
            </div>
            <div className="h-2 rounded-full bg-muted overflow-hidden">
              <div className="h-full rounded-full bg-green-500" style={{ width: `${Math.min((userReplyRate / kb.eliteReplyRate) * 100, 100)}%` }} />
            </div>
          </div>
        )}
      </div>

      <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
        <div className="rounded-lg bg-muted/40 p-3">
          <p className="font-medium mb-0.5">{Math.round(kb.personalizedLiftMultiplier)}x lift</p>
          <p className="text-muted-foreground text-xs">Personalized vs. generic emails</p>
        </div>
        <div className="rounded-lg bg-muted/40 p-3">
          <p className="font-medium mb-0.5">{Math.round(kb.followUpReplyShare * 100)}% of replies</p>
          <p className="text-muted-foreground text-xs">Come from follow-ups, not first touch</p>
        </div>
        <div className="rounded-lg bg-muted/40 p-3">
          <p className="font-medium mb-0.5">{Math.round(kb.signalBasedReplyRate * 100)}%+ reply rate</p>
          <p className="text-muted-foreground text-xs">Signal-based campaigns (5x baseline)</p>
        </div>
      </div>

      {(userReplyRate === null || userReplyRate < kb.industryAvgReplyRate) && (
        <div className="mt-5 rounded-lg border border-yellow-500/20 bg-yellow-500/5 p-4">
          <p className="text-sm font-medium text-yellow-600 dark:text-yellow-400 mb-3">
            {userReplyRate === null ? "To reach elite reply rates, focus on:" : "Your reply rate is below average. Most likely causes:"}
          </p>
          <div className="space-y-2">
            {likelyCauses.map((cause) => (
              <div key={cause.issue} className="flex items-start gap-2 text-xs">
                <ArrowRight className="w-3.5 h-3.5 text-yellow-500 shrink-0 mt-0.5" />
                <span>
                  <span className="font-medium">{cause.issue}:</span>{" "}
                  <span className="text-muted-foreground">{cause.fix}</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}

export default Analytics;

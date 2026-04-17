import { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { SampleDataBanner } from "@/components/dashboard/SampleDataBanner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { TrendingUp, Users, DollarSign, Target, Loader2, Download, FileText, Sparkles, ArrowRight, Share2, FileDown } from "lucide-react";
import { usePlanFeatures } from "@/hooks/use-plan-features";
import { FeatureGateModal } from "@/components/dashboard/FeatureGateModal";
import { FeatureHighlight } from "@/components/dashboard/FeatureHighlight";
import { OUTBOUND_KB } from "@/lib/outbound-kb";
import { SAMPLE_STATS, SAMPLE_ANALYTICS } from "@/lib/sample-data";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";

const Analytics = () => {
  const { currentPlan, features, loading: planLoading, hasFeature, gateModalOpen, setGateModalOpen, gatedFeature, triggerGate } = usePlanFeatures();
  const isFreeTier = currentPlan === 'free';

  const [stats, setStats] = useState({ totalLeads: 0, totalDeals: 0, totalValue: 0, avgDealSize: 0 });
  const [dealsByStage, setDealsByStage] = useState<any[]>([]);
  const [leadsOverTime, setLeadsOverTime] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const loadAnalytics = async () => {
    try {
      const { data: leads } = await supabase.from("leads").select("*");
      const { data: deals } = await supabase.from("deals").select("*");
      if (leads && deals) {
        const totalValue = deals.reduce((sum, deal) => sum + (Number(deal.value) || 0), 0);
        setStats({ totalLeads: leads.length, totalDeals: deals.length, totalValue, avgDealSize: deals.length > 0 ? totalValue / deals.length : 0 });
        setDealsByStage([
          { stage: "New", count: deals.filter(d => d.stage === "new").length },
          { stage: "Qualified", count: deals.filter(d => d.stage === "qualified").length },
          { stage: "Proposal", count: deals.filter(d => d.stage === "proposal").length },
          { stage: "Negotiation", count: deals.filter(d => d.stage === "negotiation").length },
          { stage: "Closed", count: deals.filter(d => d.stage === "closed").length },
        ]);
        const monthCounts: Record<string, number> = {};
        leads.forEach(lead => {
          const d = new Date(lead.created_at);
          const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
          monthCounts[key] = (monthCounts[key] || 0) + 1;
        });
        const now = new Date();
        const timeData = [];
        for (let i = 5; i >= 0; i--) {
          const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
          const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
          timeData.push({ month: d.toLocaleString('default', { month: 'short' }), leads: monthCounts[key] || 0 });
        }
        setLeadsOverTime(timeData);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isFreeTier) {
      loadAnalytics();
      const leadsChannel = supabase.channel('analytics-leads').on('postgres_changes', { event: '*', schema: 'public', table: 'leads' }, () => loadAnalytics()).subscribe();
      const dealsChannel = supabase.channel('analytics-deals').on('postgres_changes', { event: '*', schema: 'public', table: 'deals' }, () => loadAnalytics()).subscribe();
      return () => { supabase.removeChannel(leadsChannel); supabase.removeChannel(dealsChannel); };
    } else {
      setLoading(false);
    }
  }, [isFreeTier]);

  if (planLoading || (!isFreeTier && loading)) {
    return <DashboardLayout><div className="flex items-center justify-center h-64"><Loader2 className="w-12 h-12 text-muted-foreground animate-spin" /></div></DashboardLayout>;
  }

  const displayStats = isFreeTier ? SAMPLE_STATS : stats;
  const displayDealsByStage = isFreeTier ? SAMPLE_ANALYTICS.dealsByStage : dealsByStage;
  const displayLeadsOverTime = isFreeTier ? SAMPLE_ANALYTICS.leadsOverTime : leadsOverTime;
  const COLORS = ["hsl(var(--primary))", "hsl(var(--secondary))", "hsl(var(--accent))", "#8884d8", "#82ca9d"];

  const statCards = [
    { title: "Total Leads", value: displayStats.totalLeads, icon: Users, color: "text-blue-500", bgColor: "bg-blue-500/10" },
    { title: "Active Deals", value: displayStats.totalDeals, icon: Target, color: "text-purple-500", bgColor: "bg-purple-500/10" },
    { title: "Pipeline Value", value: `$${displayStats.totalValue.toLocaleString()}`, icon: DollarSign, color: "text-green-500", bgColor: "bg-green-500/10" },
    { title: "Avg Deal Size", value: `$${Math.round(displayStats.avgDealSize).toLocaleString()}`, icon: TrendingUp, color: "text-orange-500", bgColor: "bg-orange-500/10" },
  ];

  const handleExport = async () => {
    if (!features.dataExports) { triggerGate('dataExports'); return; }
    try {
      const { data: leads } = await supabase.from("leads").select("*");
      const { data: deals } = await supabase.from("deals").select("*");
      const exportData = { exportDate: new Date().toISOString(), summary: stats, dealsByStage, leadsOverTime, leads: leads || [], deals: deals || [] };
      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = `salesos-analytics-${new Date().toISOString().split('T')[0]}.json`; a.click(); URL.revokeObjectURL(url);
    } catch (error) { console.error('Export failed:', error); }
  };

  const handleShareClientPortal = () => {
    const url = "https://salesos.alephwavex.io/client-portal/demo-token-123";
    navigator.clipboard.writeText(url).then(() => {
      toast.success("Client portal link copied to clipboard!");
    }).catch(() => {
      toast.error("Failed to copy link. Please try again.");
    });
  };

  const handleCustomReport = () => {
    if (!features.customReports) { triggerGate('customReports'); return; }
    const csvRows = [['Metric', 'Value'], ['Total Leads', stats.totalLeads.toString()], ['Total Deals', stats.totalDeals.toString()], ['Pipeline Value', `$${stats.totalValue.toLocaleString()}`], ['Avg Deal Size', `$${Math.round(stats.avgDealSize).toLocaleString()}`], [''], ['Stage', 'Deal Count'], ...dealsByStage.map(d => [d.stage, d.count.toString()])];
    const blob = new Blob([csvRows.map(row => row.join(',')).join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `salesos-report-${new Date().toISOString().split('T')[0]}.csv`; a.click(); URL.revokeObjectURL(url);
  };

  const handleExportPDF = () => {
    // Generate a simple text-based "PDF" as a blob download for now
    const reportContent = `SalesOS Campaign Report\nGenerated: ${new Date().toLocaleDateString()}\n\nThis is your agency-branded campaign performance report.\nFull PDF export with charts coming soon.`;
    const blob = new Blob([reportContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'salesos-report.txt';
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Report downloaded');
  };

  return (
    <DashboardLayout>
      <FeatureGateModal open={gateModalOpen} onOpenChange={setGateModalOpen} feature={gatedFeature || 'funnelAnalytics'} currentPlan={currentPlan} />

      <PageHeader
        title="Analytics"
        description="Performance metrics and insights"
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
            {currentPlan === 'agency' && (
              <Button variant="outline" onClick={handleShareClientPortal}>
                <Share2 className="w-4 h-4 mr-2" />Share Client Portal
              </Button>
            )}
            {currentPlan === 'agency' && (
              <Button variant="outline" size="sm" onClick={handleExportPDF} className="gap-2">
                <FileDown className="w-4 h-4" />
                Export PDF Report
              </Button>
            )}
          </>
        }
      />
      <div className="px-6 py-6 space-y-6 max-w-[1400px] mx-auto">
        {isFreeTier && <SampleDataBanner />}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {statCards.map((stat) => (
            <Card key={stat.title} className="p-6">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm text-muted-foreground mb-1">{stat.title}</p>
                  <p className="text-3xl font-bold">{stat.value}</p>
                </div>
                <div className={`p-3 rounded-lg ${stat.bgColor}`}>
                  <stat.icon className={`w-6 h-6 ${stat.color}`} />
                </div>
              </div>
            </Card>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="p-6">
            <h2 className="text-xl font-semibold mb-4">Deals by Stage</h2>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={displayDealsByStage}>
                <CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="stage" /><YAxis /><Tooltip />
                <Bar dataKey="count" fill="hsl(var(--primary))" />
              </BarChart>
            </ResponsiveContainer>
          </Card>
          <Card className="p-6">
            <h2 className="text-xl font-semibold mb-4">Leads Over Time</h2>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={displayLeadsOverTime}>
                <CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="month" /><YAxis /><Tooltip />
                <Line type="monotone" dataKey="leads" stroke="hsl(var(--primary))" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </Card>
        </div>

        <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold">Deal Distribution</h2>
            {!features.funnelAnalytics && <FeatureHighlight availableOn="pro" onUpgrade={() => triggerGate('funnelAnalytics')} inline />}
          </div>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie data={displayDealsByStage} dataKey="count" nameKey="stage" cx="50%" cy="50%" outerRadius={100} label>
                {displayDealsByStage.map((_, index) => (<Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />))}
              </Pie>
              <Tooltip /><Legend />
            </PieChart>
          </ResponsiveContainer>
        </Card>

        {/* Outbound Benchmarks */}
        <OutboundBenchmarksCard />

        {/* Rep Performance - Pro+ feature */}
        {features.repPerformance ? (
          <Card className="p-6">
            <h2 className="text-xl font-semibold mb-4">Rep Performance</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-4 rounded-lg bg-muted/50">
                <div className="flex items-center gap-2 mb-2"><Users className="w-5 h-5 text-primary" /><span className="font-medium">Total Leads Managed</span></div>
                <p className="text-3xl font-bold">{displayStats.totalLeads}</p>
              </div>
              <div className="p-4 rounded-lg bg-muted/50">
                <div className="flex items-center gap-2 mb-2"><Target className="w-5 h-5 text-green-500" /><span className="font-medium">Conversion Rate</span></div>
                <p className="text-3xl font-bold">{displayStats.totalLeads > 0 ? Math.round((displayStats.totalDeals / displayStats.totalLeads) * 100) : 0}%</p>
              </div>
              <div className="p-4 rounded-lg bg-muted/50">
                <div className="flex items-center gap-2 mb-2"><DollarSign className="w-5 h-5 text-yellow-500" /><span className="font-medium">Avg Deal Value</span></div>
                <p className="text-3xl font-bold">${Math.round(displayStats.avgDealSize).toLocaleString()}</p>
              </div>
            </div>
          </Card>
        ) : (
          <Card className="p-6 border-dashed border-2 border-primary/20">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-semibold mb-2">Rep Performance</h2>
                <p className="text-muted-foreground">Track individual rep performance and identify coaching opportunities.</p>
              </div>
              <FeatureHighlight availableOn="pro" onUpgrade={() => triggerGate('funnelAnalytics')} />
            </div>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
};

function OutboundBenchmarksCard() {
  const kb = OUTBOUND_KB.benchmarks;

  // Placeholder: in a real integration this would come from sent_emails aggregated reply rate
  const userReplyRate: number | null = null;

  const benchmarkTiers = [
    { label: "Industry Average", rate: kb.industryAvgReplyRate, color: "bg-yellow-500" },
    { label: "Top Quartile",     rate: kb.topQuartileReplyRate, color: "bg-blue-500" },
    { label: "Elite (Top 10%)",  rate: kb.eliteReplyRate,       color: "bg-[#9263E9]" },
  ];

  const getRateStatus = (rate: number) => {
    if (rate >= kb.eliteReplyRate) return { label: "Elite", color: "text-[#9263E9]", bg: "bg-[#9263E9]/10" };
    if (rate >= kb.topQuartileReplyRate) return { label: "Top Quartile", color: "text-blue-500", bg: "bg-blue-500/10" };
    if (rate >= kb.industryAvgReplyRate) return { label: "Average", color: "text-yellow-500", bg: "bg-yellow-500/10" };
    return { label: "Below Average", color: "text-red-500", bg: "bg-red-500/10" };
  };

  const likelyCauses = [
    { issue: "Targeting too broad", fix: "Narrow your ICP — niche segments get 3–5x higher reply rates", link: "/dashboard/icp" },
    { issue: "Generic copy", fix: "Use signal-based templates and unique openers per prospect", link: "/dashboard/outreach" },
    { issue: "Deliverability issues", fix: "Check SPF/DKIM/DMARC and warmup status", link: "/dashboard/deliverability" },
  ];

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-semibold">Your Performance vs. Industry</h2>
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
              <span className="font-medium">Your Reply Rate</span>
              <span className={`font-semibold ${getRateStatus(userReplyRate).color}`}>
                {Math.round(userReplyRate * 100 * 10) / 10}%
              </span>
            </div>
            <div className="h-2 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full bg-green-500"
                style={{ width: `${Math.min((userReplyRate / kb.eliteReplyRate) * 100, 100)}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Insight row */}
      <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
        <div className="rounded-lg bg-muted/40 p-3">
          <p className="font-medium mb-0.5">{Math.round(kb.personalizedLiftMultiplier)}x lift</p>
          <p className="text-muted-foreground text-xs">Personalized vs. generic emails</p>
        </div>
        <div className="rounded-lg bg-muted/40 p-3">
          <p className="font-medium mb-0.5">{Math.round(kb.followUpReplyShare * 100)}% of replies</p>
          <p className="text-muted-foreground text-xs">Come from follow-up emails (not Email 1)</p>
        </div>
        <div className="rounded-lg bg-muted/40 p-3">
          <p className="font-medium mb-0.5">{Math.round(kb.signalBasedReplyRate * 100)}%+ reply rate</p>
          <p className="text-muted-foreground text-xs">Signal-based campaigns (5x baseline)</p>
        </div>
      </div>

      {/* If below average, surface top 3 causes */}
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

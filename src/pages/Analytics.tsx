import { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { TrendingUp, Users, DollarSign, Target, Loader2, Download, FileText, Sparkles } from "lucide-react";
import { usePlanFeatures } from "@/hooks/use-plan-features";
import { FeatureGateModal } from "@/components/dashboard/FeatureGateModal";
import { FeatureHighlight } from "@/components/dashboard/FeatureHighlight";

const Analytics = () => {
  const { 
    currentPlan, 
    features, 
    loading: planLoading,
    hasFeature,
    gateModalOpen,
    setGateModalOpen,
    gatedFeature,
    triggerGate,
  } = usePlanFeatures();
  
  const [stats, setStats] = useState({
    totalLeads: 0,
    totalDeals: 0,
    totalValue: 0,
    avgDealSize: 0,
  });
  const [dealsByStage, setDealsByStage] = useState<any[]>([]);
  const [leadsOverTime, setLeadsOverTime] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const loadAnalytics = async () => {
    try {
      const { data: leads } = await supabase.from("leads").select("*");
      const { data: deals } = await supabase.from("deals").select("*");

      if (leads && deals) {
        const totalValue = deals.reduce((sum, deal) => sum + (Number(deal.value) || 0), 0);
        setStats({
          totalLeads: leads.length,
          totalDeals: deals.length,
          totalValue,
          avgDealSize: deals.length > 0 ? totalValue / deals.length : 0,
        });

        const stageData = [
          { stage: "New", count: deals.filter((d) => d.stage === "new").length },
          { stage: "Qualified", count: deals.filter((d) => d.stage === "qualified").length },
          { stage: "Proposal", count: deals.filter((d) => d.stage === "proposal").length },
          { stage: "Negotiation", count: deals.filter((d) => d.stage === "negotiation").length },
          { stage: "Closed", count: deals.filter((d) => d.stage === "closed").length },
        ];
        setDealsByStage(stageData);

        // Build real leads-over-time from actual created_at dates
        const monthCounts: Record<string, number> = {};
        leads.forEach(lead => {
          const d = new Date(lead.created_at);
          const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
          monthCounts[key] = (monthCounts[key] || 0) + 1;
        });

        // Get last 6 months
        const now = new Date();
        const timeData = [];
        for (let i = 5; i >= 0; i--) {
          const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
          const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
          const monthName = d.toLocaleString('default', { month: 'short' });
          timeData.push({ month: monthName, leads: monthCounts[key] || 0 });
        }
        setLeadsOverTime(timeData);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAnalytics();
  }, []);

  if (planLoading || loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-12 h-12 text-muted-foreground animate-spin" />
        </div>
      </DashboardLayout>
    );
  }

  const COLORS = ["hsl(var(--primary))", "hsl(var(--secondary))", "hsl(var(--accent))", "#8884d8", "#82ca9d"];

  const statCards = [
    {
      title: "Total Leads",
      value: stats.totalLeads,
      icon: Users,
      color: "text-blue-500",
      bgColor: "bg-blue-500/10",
    },
    {
      title: "Active Deals",
      value: stats.totalDeals,
      icon: Target,
      color: "text-purple-500",
      bgColor: "bg-purple-500/10",
    },
    {
      title: "Pipeline Value",
      value: `$${stats.totalValue.toLocaleString()}`,
      icon: DollarSign,
      color: "text-green-500",
      bgColor: "bg-green-500/10",
    },
    {
      title: "Avg Deal Size",
      value: `$${Math.round(stats.avgDealSize).toLocaleString()}`,
      icon: TrendingUp,
      color: "text-orange-500",
      bgColor: "bg-orange-500/10",
    },
  ];

  const handleExport = async () => {
    if (!features.dataExports) {
      triggerGate('dataExports');
      return;
    }
    
    try {
      const { data: leads } = await supabase.from("leads").select("*");
      const { data: deals } = await supabase.from("deals").select("*");
      
      const exportData = {
        exportDate: new Date().toISOString(),
        summary: {
          totalLeads: stats.totalLeads,
          totalDeals: stats.totalDeals,
          totalValue: stats.totalValue,
          avgDealSize: stats.avgDealSize,
        },
        dealsByStage,
        leadsOverTime,
        leads: leads || [],
        deals: deals || [],
      };
      
      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `salesos-analytics-${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Export failed:', error);
    }
  };

  const handleCustomReport = () => {
    if (!features.customReports) {
      triggerGate('customReports');
      return;
    }
    
    // Generate and download CSV report
    const csvRows = [
      ['Metric', 'Value'],
      ['Total Leads', stats.totalLeads.toString()],
      ['Total Deals', stats.totalDeals.toString()],
      ['Pipeline Value', `$${stats.totalValue.toLocaleString()}`],
      ['Avg Deal Size', `$${Math.round(stats.avgDealSize).toLocaleString()}`],
      [''],
      ['Stage', 'Deal Count'],
      ...dealsByStage.map(d => [d.stage, d.count.toString()]),
    ];
    
    const csvContent = csvRows.map(row => row.join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `salesos-report-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <DashboardLayout>
      <FeatureGateModal 
        open={gateModalOpen} 
        onOpenChange={setGateModalOpen}
        feature={gatedFeature || 'funnelAnalytics'}
        currentPlan={currentPlan}
      />
      
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold mb-2">Analytics</h1>
            <p className="text-muted-foreground">Track your sales performance and metrics</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleExport}>
              <Download className="w-4 h-4 mr-2" />
              Export
              {!features.dataExports && <Sparkles className="w-3 h-3 ml-2 text-primary" />}
            </Button>
            <Button variant="outline" onClick={handleCustomReport}>
              <FileText className="w-4 h-4 mr-2" />
              Custom Report
              {!features.customReports && <Sparkles className="w-3 h-3 ml-2 text-primary" />}
            </Button>
          </div>
        </div>

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
              <BarChart data={dealsByStage}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="stage" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="count" fill="hsl(var(--primary))" />
              </BarChart>
            </ResponsiveContainer>
          </Card>

          <Card className="p-6">
            <h2 className="text-xl font-semibold mb-4">Leads Over Time</h2>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={leadsOverTime}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis />
                <Tooltip />
                <Line type="monotone" dataKey="leads" stroke="hsl(var(--primary))" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </Card>
        </div>

        <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold">Deal Distribution</h2>
            {!features.funnelAnalytics && (
              <FeatureHighlight 
                availableOn="pro" 
                onUpgrade={() => triggerGate('funnelAnalytics')}
                inline
              />
            )}
          </div>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={dealsByStage}
                dataKey="count"
                nameKey="stage"
                cx="50%"
                cy="50%"
                outerRadius={100}
                label
              >
                {dealsByStage.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </Card>

        {/* Rep Performance - Pro+ feature */}
        {features.repPerformance ? (
          <Card className="p-6">
            <h2 className="text-xl font-semibold mb-4">Rep Performance</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-4 rounded-lg bg-muted/50">
                <div className="flex items-center gap-2 mb-2">
                  <Users className="w-5 h-5 text-primary" />
                  <span className="font-medium">Total Leads Managed</span>
                </div>
                <p className="text-3xl font-bold">{stats.totalLeads}</p>
                <p className="text-sm text-muted-foreground mt-1">Leads in pipeline</p>
              </div>
              <div className="p-4 rounded-lg bg-muted/50">
                <div className="flex items-center gap-2 mb-2">
                  <Target className="w-5 h-5 text-green-500" />
                  <span className="font-medium">Conversion Rate</span>
                </div>
                <p className="text-3xl font-bold">
                  {stats.totalLeads > 0 ? Math.round((stats.totalDeals / stats.totalLeads) * 100) : 0}%
                </p>
                <p className="text-sm text-muted-foreground mt-1">Leads to deals</p>
              </div>
              <div className="p-4 rounded-lg bg-muted/50">
                <div className="flex items-center gap-2 mb-2">
                  <DollarSign className="w-5 h-5 text-yellow-500" />
                  <span className="font-medium">Avg Deal Value</span>
                </div>
                <p className="text-3xl font-bold">${Math.round(stats.avgDealSize).toLocaleString()}</p>
                <p className="text-sm text-muted-foreground mt-1">Per closed deal</p>
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
              <FeatureHighlight 
                availableOn="pro" 
                onUpgrade={() => triggerGate('funnelAnalytics')}
              />
            </div>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
};

export default Analytics;

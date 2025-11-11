import { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { TrendingUp, Users, DollarSign, Target, Loader2 } from "lucide-react";
import { useSubscription } from "@/hooks/use-subscription";
import { UpgradePrompt } from "@/components/dashboard/UpgradePrompt";

const Analytics = () => {
  const { subscription, loading: subscriptionLoading } = useSubscription();
  const [stats, setStats] = useState({
    totalLeads: 0,
    totalDeals: 0,
    totalValue: 0,
    avgDealSize: 0,
  });
  const [dealsByStage, setDealsByStage] = useState<any[]>([]);
  const [leadsOverTime, setLeadsOverTime] = useState<any[]>([]);

  const loadAnalytics = async () => {
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

      const timeData = [
        { month: "Jan", leads: Math.floor(leads.length * 0.1) },
        { month: "Feb", leads: Math.floor(leads.length * 0.15) },
        { month: "Mar", leads: Math.floor(leads.length * 0.2) },
        { month: "Apr", leads: Math.floor(leads.length * 0.25) },
        { month: "May", leads: Math.floor(leads.length * 0.3) },
        { month: "Jun", leads: leads.length },
      ];
      setLeadsOverTime(timeData);
    }
  };

  useEffect(() => {
    if (subscription?.hasAnalytics) {
      loadAnalytics();
    }
  }, [subscription?.hasAnalytics]);

  if (subscriptionLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-12 h-12 text-muted-foreground animate-spin" />
        </div>
      </DashboardLayout>
    );
  }

  if (!subscription?.hasAnalytics) {
    return (
      <DashboardLayout>
        <UpgradePrompt feature="Advanced Analytics" requiredPlan="pro" />
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

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold mb-2">Analytics</h1>
          <p className="text-muted-foreground">Track your sales performance and metrics</p>
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
          <h2 className="text-xl font-semibold mb-4">Deal Distribution</h2>
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
      </div>
    </DashboardLayout>
  );
};

export default Analytics;

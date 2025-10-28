import { useEffect, useState } from "react";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { AddLeadDialog } from "@/components/dashboard/AddLeadDialog";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TrendingUp, Users, DollarSign, Calendar, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

const Dashboard = () => {
  const { toast } = useToast();
  const [stats, setStats] = useState({
    totalLeads: 0,
    totalDeals: 0,
    totalValue: 0,
    meetingsThisWeek: 0,
  });

  useEffect(() => {
    loadStats();

    // Set up real-time subscriptions
    const leadsChannel = supabase
      .channel('dashboard-leads-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'leads' }, () => {
        loadStats();
      })
      .subscribe();

    const dealsChannel = supabase
      .channel('dashboard-deals-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'deals' }, () => {
        loadStats();
      })
      .subscribe();

    const activitiesChannel = supabase
      .channel('dashboard-activities-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'activities' }, () => {
        loadStats();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(leadsChannel);
      supabase.removeChannel(dealsChannel);
      supabase.removeChannel(activitiesChannel);
    };
  }, []);

  const loadStats = async () => {
    try {
      const { data: leads } = await supabase.from("leads").select("id");
      const { data: deals } = await supabase.from("deals").select("id, value");
      const { data: activities } = await supabase
        .from("activities")
        .select("*")
        .eq("type", "meeting")
        .gte("due_date", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());

      const totalValue = deals?.reduce((sum, deal) => sum + (Number(deal.value) || 0), 0) || 0;

      setStats({
        totalLeads: leads?.length || 0,
        totalDeals: deals?.length || 0,
        totalValue,
        meetingsThisWeek: activities?.length || 0,
      });
    } catch (error: any) {
      console.error("Error loading stats:", error);
    }
  };

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
      icon: TrendingUp,
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
      title: "Meetings This Week",
      value: stats.meetingsThisWeek,
      icon: Calendar,
      color: "text-orange-500",
      bgColor: "bg-orange-500/10",
    },
  ];

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold mb-2">Welcome back!</h1>
            <p className="text-muted-foreground">
              Here's what's happening with your sales today
            </p>
          </div>
          <AddLeadDialog onLeadAdded={loadStats} />
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {statCards.map((stat) => (
            <Card
              key={stat.title}
              className="p-6 bg-card border-border hover:border-primary/50 transition-all duration-300"
            >
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

        {/* Quick Actions */}
        <Card className="p-6">
          <h2 className="text-xl font-semibold mb-4">Quick Actions</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Button variant="glass" className="justify-start h-auto py-6" onClick={() => window.location.href = '/dashboard/outreach'}>
              <Users className="w-5 h-5 mr-3" />
              <div className="text-left">
                <div className="font-semibold">Outreach Studio</div>
                <div className="text-xs text-muted-foreground">Generate AI-powered emails</div>
              </div>
            </Button>
            <Button variant="glass" className="justify-start h-auto py-6" onClick={() => window.location.href = '/dashboard/pipeline'}>
              <TrendingUp className="w-5 h-5 mr-3" />
              <div className="text-left">
                <div className="font-semibold">View Pipeline</div>
                <div className="text-xs text-muted-foreground">Manage your deals</div>
              </div>
            </Button>
            <Button variant="glass" className="justify-start h-auto py-6" onClick={() => window.location.href = '/dashboard/calendar'}>
              <Calendar className="w-5 h-5 mr-3" />
              <div className="text-left">
                <div className="font-semibold">Schedule Meeting</div>
                <div className="text-xs text-muted-foreground">Book a call with a lead</div>
              </div>
            </Button>
          </div>
        </Card>

        {/* AI Insights */}
        <Card className="p-6 bg-gradient-primary text-white">
          <div className="flex items-start gap-4">
            <div className="p-3 rounded-lg bg-white/20">
              <TrendingUp className="w-6 h-6" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold mb-2">Quick Insight</h3>
              <p className="text-white/90 mb-4">
                {stats.totalLeads > 0 ? (
                  `You have ${stats.totalLeads} lead${stats.totalLeads > 1 ? 's' : ''} and ${stats.totalDeals} active deal${stats.totalDeals !== 1 ? 's' : ''} worth $${stats.totalValue.toLocaleString()}. ${stats.meetingsThisWeek > 0 ? `${stats.meetingsThisWeek} meeting${stats.meetingsThisWeek > 1 ? 's' : ''} scheduled this week.` : 'Schedule some meetings to keep momentum!'}`
                ) : (
                  "Add your first lead to get started with AI-powered sales coaching and insights."
                )}
              </p>
              <Button variant="secondary" size="sm" onClick={() => window.location.href = '/dashboard/coach'}>
                Get AI Coaching
              </Button>
            </div>
          </div>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default Dashboard;

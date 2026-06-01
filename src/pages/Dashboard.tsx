import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { AddLeadDialog } from "@/components/dashboard/AddLeadDialog";
import { OnboardingChecklist } from "@/components/dashboard/OnboardingChecklist";
import { DashboardTour } from "@/components/dashboard/DashboardTour";
import { ProspectUsageMeter } from "@/components/dashboard/ProspectUsageMeter";
import QuickStartWizard from "@/components/onboarding/QuickStartWizard";
import { TrendingUp, Users, DollarSign, Calendar, Mail } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { usePlanFeatures } from "@/hooks/use-plan-features";
import { SEOHead } from "@/components/seo/SEOHead";

const Dashboard = () => {
  const { currentPlan, loading: planLoading } = usePlanFeatures();
  const navigate = useNavigate();
  const isFreeTier = currentPlan === 'free';
  const [showChecklist, setShowChecklist] = useState(true);
  const [showTour, setShowTour] = useState(false);
  const [showWizard, setShowWizard] = useState(false);
  const [stats, setStats] = useState({
    totalLeads: 0,
    totalDeals: 0,
    totalValue: 0,
    meetingsThisWeek: 0,
  });

  useEffect(() => {
    if (!localStorage.getItem('salesos_quickstart_done')) {
      setShowWizard(true);
    }
  }, []);

  useEffect(() => {
    loadStats();
    checkFirstVisit();

    const leadsChannel = supabase
      .channel('dashboard-leads-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'leads' }, () => loadStats())
      .subscribe();
    const dealsChannel = supabase
      .channel('dashboard-deals-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'deals' }, () => loadStats())
      .subscribe();
    const activitiesChannel = supabase
      .channel('dashboard-activities-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'activities' }, () => loadStats())
      .subscribe();

    return () => {
      supabase.removeChannel(leadsChannel);
      supabase.removeChannel(dealsChannel);
      supabase.removeChannel(activitiesChannel);
    };
  }, []);

  const checkFirstVisit = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from("onboarding_progress")
        .select("completed_tour")
        .eq("user_id", user.id)
        .single();
      if (!data || !data.completed_tour) setShowTour(true);
    } catch (error) {
      console.error("Error checking first visit:", error);
    }
  };

  const loadStats = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: leads } = await supabase.from("leads").select("id").eq("user_id", user.id);
      const { data: deals } = await supabase.from("deals").select("id, value").eq("user_id", user.id);
      const { data: activities } = await supabase
        .from("activities")
        .select("*")
        .eq("user_id", user.id)
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
    { title: "Total Leads", value: stats.totalLeads, icon: Users, color: "text-blue-400" },
    { title: "Active Deals", value: stats.totalDeals, icon: TrendingUp, color: "text-violet-400" },
    { title: "Pipeline Value", value: `$${stats.totalValue.toLocaleString()}`, icon: DollarSign, color: "text-emerald-400" },
    { title: "Meetings This Week", value: stats.meetingsThisWeek, icon: Calendar, color: "text-amber-400" },
  ];

  return (
    <DashboardLayout>
      <SEOHead
        title="Dashboard"
        description="Track prospects, pipeline activity, and outreach performance from your SalesOS dashboard."
        noIndex
      />
      <div className="px-6 py-6 space-y-6 max-w-[1400px] mx-auto">
        <DashboardTour isOpen={showTour} onClose={() => setShowTour(false)} />
        {showChecklist && (
          <OnboardingChecklist onClose={() => setShowChecklist(false)} onStartTour={() => setShowTour(true)} />
        )}
        {isFreeTier && <SampleDataBanner />}

        {/* Header row */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[11px] text-muted-foreground uppercase tracking-widest mb-1 font-medium">Overview</p>
            <h1 className="text-xl font-semibold">
              {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
            </h1>
          </div>
          <AddLeadDialog onLeadAdded={loadStats} />
        </div>

        {!isFreeTier && <ProspectUsageMeter />}

        {/* Metrics strip */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-px bg-border/60 rounded-lg overflow-hidden border border-border/60">
          {statCards.map((stat) => (
            <div key={stat.title} className="bg-card px-5 py-4 flex flex-col gap-1">
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">{stat.title}</p>
                <stat.icon className={`w-3.5 h-3.5 ${stat.color}`} />
              </div>
              <p className="text-2xl font-semibold tabular-nums">{stat.value}</p>
            </div>
          ))}
        </div>

        {/* Quick actions + insight */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 space-y-2">
            <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-widest">Quick Actions</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {[
                { label: "Outreach Studio", desc: "Generate AI-powered emails", icon: Mail, href: '/dashboard/outreach' },
                { label: "View Pipeline", desc: "Manage your deals", icon: TrendingUp, href: '/dashboard/pipeline' },
                { label: "Schedule Meeting", desc: "Book a call with a lead", icon: Calendar, href: '/dashboard/calendar' },
              ].map((action) => (
                <button
                  key={action.label}
                  onClick={() => navigate(action.href)}
                  className="flex items-start gap-3 p-4 rounded-lg border border-border/60 bg-card hover:bg-accent/50 hover:border-primary/30 transition-all text-left group"
                >
                  <div className="p-1.5 rounded-md bg-primary/10 group-hover:bg-primary/20 transition-colors flex-shrink-0">
                    <action.icon className="w-4 h-4 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">{action.label}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{action.desc}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 flex flex-col justify-between">
            <div className="flex items-center gap-2 mb-3">
              <div className="p-1.5 rounded-md bg-primary/15">
                <TrendingUp className="w-3.5 h-3.5 text-primary" />
              </div>
              <p className="text-[11px] font-semibold text-primary uppercase tracking-wider">AI Insight</p>
            </div>
            <p className="text-sm text-foreground/80 leading-relaxed flex-1">
              {isFreeTier
                ? `${displayStats.totalLeads} sample leads, ${displayStats.totalDeals} demo deals worth $${displayStats.totalValue.toLocaleString()}. Upgrade to track real data.`
                : stats.totalLeads > 0
                  ? `${stats.totalLeads} lead${stats.totalLeads > 1 ? 's' : ''}, ${stats.totalDeals} deal${stats.totalDeals !== 1 ? 's' : ''} worth $${stats.totalValue.toLocaleString()}. ${stats.meetingsThisWeek > 0 ? `${stats.meetingsThisWeek} meeting${stats.meetingsThisWeek > 1 ? 's' : ''} this week.` : 'No meetings this week yet.'}`
                  : 'Add your first lead to get AI-powered insights and coaching.'}
            </p>
            <button
              onClick={() => navigate('/dashboard/coach')}
              className="mt-4 text-xs text-primary hover:text-primary/80 font-medium flex items-center gap-1 transition-colors"
            >
              Open AI Coach →
            </button>
          </div>
        </div>
      </div>

      <QuickStartWizard
        open={showWizard}
        onOpenChange={(open) => {
          if (!open) localStorage.setItem('salesos_quickstart_done', '1');
          setShowWizard(open);
        }}
      />
    </DashboardLayout>
  );
};

export default Dashboard;

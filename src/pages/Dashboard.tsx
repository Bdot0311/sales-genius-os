import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { AddLeadDialog } from "@/components/dashboard/AddLeadDialog";
import { OnboardingChecklist } from "@/components/dashboard/OnboardingChecklist";
import { DashboardTour } from "@/components/dashboard/DashboardTour";
import { DiscoveryPrompt } from "@/components/dashboard/DiscoveryPrompt";
import { ProspectUsageMeter } from "@/components/dashboard/ProspectUsageMeter";
import { Panel, PanelHeader, MetricStrip, type Metric } from "@/components/dashboard/Panel";
import { ArrowRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { usePlanFeatures } from "@/hooks/use-plan-features";
import { SEOHead } from "@/components/seo/SEOHead";

interface Stats {
  totalLeads: number;
  totalDeals: number;
  totalValue: number;
  meetingsThisWeek: number;
  leadsMissingEmail: number;
  leadsNeverContacted: number;
}

const EMPTY: Stats = {
  totalLeads: 0,
  totalDeals: 0,
  totalValue: 0,
  meetingsThisWeek: 0,
  leadsMissingEmail: 0,
  leadsNeverContacted: 0,
};

/**
 * The page you land on.
 *
 * It carried three things that were not doing the work they looked like they
 * were doing.
 *
 * "Quick Actions" was three identical cards — icon chip, heading, line of text
 * — linking to Outreach, Pipeline and Calendar. All three are in the sidebar,
 * two clicks from anywhere including this page, so the row restated the
 * navigation in the most recognisable generated-interface shape there is.
 *
 * Beside it sat a tinted panel, captioned as an AI insight, which read the four
 * numbers directly above it back as a sentence. Announcing that a restatement
 * is an insight is worse than not having one. (The captions are described
 * rather than quoted: the test guarding this asserts those strings are absent
 * from the file.)
 *
 * And the four metrics each carried an icon in a different hue — blue, violet,
 * emerald, amber — which is a rainbow legend for four unrelated numbers, chosen
 * because the tiles looked bare without it.
 *
 * What replaced them: the numbers say what they mean and are clickable through
 * to the thing they count, and the space the nav cards took now holds what
 * actually needs doing, computed from the data. "12 leads have no email
 * address" is a thing to act on. A card whose whole content is the name of a
 * page is a link.
 */
const Dashboard = () => {
  const { currentPlan } = usePlanFeatures();
  const navigate = useNavigate();
  const isFreeTier = currentPlan === "free";
  const [showChecklist, setShowChecklist] = useState(true);
  const [showTour, setShowTour] = useState(false);
  const [stats, setStats] = useState<Stats>(EMPTY);

  useEffect(() => {
    loadStats();
    checkFirstVisit();

    const leadsChannel = supabase
      .channel("dashboard-leads-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "leads" }, () => loadStats())
      .subscribe();
    const dealsChannel = supabase
      .channel("dashboard-deals-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "deals" }, () => loadStats())
      .subscribe();
    const activitiesChannel = supabase
      .channel("dashboard-activities-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "activities" }, () => loadStats())
      .subscribe();

    return () => {
      supabase.removeChannel(leadsChannel);
      supabase.removeChannel(dealsChannel);
      supabase.removeChannel(activitiesChannel);
    };
  }, []);

  // The tour only runs once the signup questionnaire is behind them, so the two
  // never overlap.
  const checkFirstVisit = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from("onboarding_progress")
        .select("completed_tour, onboarding_completed")
        .eq("user_id", user.id)
        .maybeSingle();
      if (data?.onboarding_completed === true && !data.completed_tour) setShowTour(true);
    } catch (error) {
      console.error("Error checking first visit:", error);
    }
  };

  const loadStats = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: leads } = await supabase
        .from("leads")
        .select("id, contact_email, last_contacted_at")
        .eq("user_id", user.id);
      const { data: deals } = await supabase.from("deals").select("id, value").eq("user_id", user.id);
      const { data: activities } = await supabase
        .from("activities")
        .select("id")
        .eq("user_id", user.id)
        .eq("type", "meeting")
        .gte("due_date", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());

      const totalValue = deals?.reduce((sum, deal) => sum + (Number(deal.value) || 0), 0) || 0;
      const rows = leads ?? [];
      setStats({
        totalLeads: rows.length,
        totalDeals: deals?.length || 0,
        totalValue,
        meetingsThisWeek: activities?.length || 0,
        // A lead with no address cannot be sent to. It is the one thing on this
        // page that is both quantifiable and immediately fixable.
        leadsMissingEmail: rows.filter((l) => !l.contact_email).length,
        leadsNeverContacted: rows.filter((l) => l.contact_email && !l.last_contacted_at).length,
      });
    } catch (error) {
      console.error("Error loading stats:", error);
    }
  };

  const money = (n: number) =>
    n >= 1000 ? `$${Math.round(n / 1000).toLocaleString()}k` : `$${n.toLocaleString()}`;

  const metrics: Metric[] = [
    {
      label: "Leads",
      value: stats.totalLeads.toLocaleString(),
      note: stats.leadsMissingEmail > 0 ? `${stats.leadsMissingEmail} with no email` : "all have an address",
      onClick: () => navigate("/dashboard/leads/saved"),
    },
    {
      label: "Deals",
      value: stats.totalDeals.toLocaleString(),
      note: stats.totalDeals > 0 ? "open in the pipeline" : "none open yet",
      onClick: () => navigate("/dashboard/pipeline"),
    },
    {
      label: "Pipeline value",
      value: money(stats.totalValue),
      note: stats.totalDeals > 0 ? `across ${stats.totalDeals} ${stats.totalDeals === 1 ? "deal" : "deals"}` : "nothing to total",
      onClick: () => navigate("/dashboard/pipeline"),
    },
    {
      label: "Meetings",
      value: stats.meetingsThisWeek.toLocaleString(),
      note: "booked in the last 7 days",
      onClick: () => navigate("/dashboard/calendar"),
    },
  ];

  /**
   * Things to do, from the data rather than from the sidebar.
   *
   * Each entry has to be a state the account is actually in — a count of real
   * rows — and a place that acts on it. An item that is always present is a
   * link, and links belong in the navigation.
   *
   * Each href opens the rows the count counted. The first version sent both of
   * these to the lead search, which is the page for finding leads you do not
   * have — not the ones just counted — so the item named a set and then opened
   * something else. A count you cannot click through to is trivia with a number
   * on it.
   */
  const attention = [
    stats.leadsMissingEmail > 0 && {
      key: "missing-email",
      count: stats.leadsMissingEmail,
      title: `${stats.leadsMissingEmail} ${stats.leadsMissingEmail === 1 ? "lead has" : "leads have"} no email address`,
      body: "They cannot be sent to. Opening them filters your saved leads down to exactly these, and person search fills in a contact record from a name and company.",
      action: "Show them",
      href: "/dashboard/leads/saved?show=no-email",
    },
    stats.leadsNeverContacted > 0 && {
      key: "never-contacted",
      count: stats.leadsNeverContacted,
      title: `${stats.leadsNeverContacted} reachable ${stats.leadsNeverContacted === 1 ? "lead has" : "leads have"} never been contacted`,
      body: "They have a verified address and no send against them yet.",
      action: "Show them",
      href: "/dashboard/leads/saved?show=never-contacted",
    },
    stats.totalLeads === 0 && {
      key: "no-leads",
      count: 0,
      title: "No leads yet",
      body: "Describe who you want in plain English and the search returns ranked contacts with verified emails.",
      action: "Run a search",
      href: "/dashboard/leads",
    },
  ].filter(Boolean) as {
    key: string;
    count: number;
    title: string;
    body: string;
    action: string;
    href: string;
  }[];

  return (
    <DashboardLayout>
      <SEOHead
        title="Dashboard"
        description="Track prospects, pipeline activity, and outreach performance from your OutReign dashboard."
        noIndex
      />
      <PageHeader
        title="Overview"
        description={new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
        actions={<AddLeadDialog onLeadAdded={loadStats} triggerVariant="outline" />}
      />
      <div className="mx-auto max-w-[1400px] space-y-4 px-6 py-5">
        <DashboardTour isOpen={showTour} onClose={() => setShowTour(false)} />
        <DiscoveryPrompt />
        {showChecklist && (
          <OnboardingChecklist onClose={() => setShowChecklist(false)} onStartTour={() => setShowTour(true)} />
        )}

        {!isFreeTier && <ProspectUsageMeter />}

        <div data-tour="stats">
          <MetricStrip metrics={metrics} />
        </div>

        {attention.length > 0 && (
          <Panel>
            <PanelHeader
              title="Needs attention"
              meta={`${attention.length} ${attention.length === 1 ? "item" : "items"}`}
            />
            <div data-tour="quick-actions">
              {attention.map((item, i) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => navigate(item.href)}
                  className={`group flex w-full items-start gap-4 px-4 py-3.5 text-left transition-colors hover:bg-primary/5 sm:px-5 ${
                    i > 0 ? "border-t border-border/30" : ""
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-[0.8125rem] font-medium text-foreground">{item.title}</p>
                    <p className="mt-1 text-[0.6875rem] leading-relaxed text-muted-foreground">{item.body}</p>
                  </div>
                  <span className="mt-0.5 flex shrink-0 items-center gap-1.5 text-[0.6875rem] text-muted-foreground transition-colors group-hover:text-foreground">
                    <span className="hidden sm:inline">{item.action}</span>
                    <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                  </span>
                </button>
              ))}
            </div>
          </Panel>
        )}
      </div>
    </DashboardLayout>
  );
};

export default Dashboard;

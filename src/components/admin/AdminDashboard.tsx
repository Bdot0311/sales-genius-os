import { useEffect, useState } from "react";
import { MetricStrip, type Metric } from "@/components/dashboard/Panel";
import { supabase } from "@/integrations/supabase/client";
import { useAutoRefresh } from "@/hooks/use-auto-refresh";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { LastCronRun } from "@/components/admin/LastCronRun";
import { AiGatewayUsageCard } from "@/components/admin/AiGatewayUsageCard";

interface DashboardStats {
  total_users: number;
  active_trials: number;
  locked_accounts: number;
  active_subscriptions: number;
  total_revenue: number;
  monthly_revenue: number;
}

interface StripeRevenue {
  total_revenue: number;
  monthly_revenue: number;
  active_subscriptions: number;
  total_customers: number;
  last_updated: string;
}

export const AdminDashboard = () => {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [stripeData, setStripeData] = useState<StripeRevenue | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingStripe, setLoadingStripe] = useState(false);

  useEffect(() => {
    loadStats();
    loadStripeRevenue();

    // Set up real-time subscription for subscriptions table
    const channel = supabase
      .channel('admin-dashboard-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'subscriptions' },
        () => {
          loadStats();
          loadStripeRevenue();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'profiles' },
        () => {
          loadStats();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  useAutoRefresh(() => { loadStats(); loadStripeRevenue(); }, 60_000);

  const loadStats = async () => {
    try {
      const { data, error } = await supabase.rpc('admin_get_dashboard_stats');
      
      if (error) throw error;
      
      if (data && data.length > 0) {
        setStats(data[0]);
      }
    } catch (error) {
      console.error('Error loading stats:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadStripeRevenue = async () => {
    setLoadingStripe(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        console.error('No session found');
        return;
      }

      const { data, error } = await supabase.functions.invoke('get-stripe-revenue', {
        headers: {
          Authorization: `Bearer ${session.access_token}`
        }
      });

      if (error) throw error;
      
      setStripeData(data);
    } catch (error) {
      console.error('Error loading Stripe revenue:', error);
      // Don't show error toast if it's just that there's no Stripe data yet
    } finally {
      setLoadingStripe(false);
    }
  };

  const handleRefresh = async () => {
    toast.info('Refreshing data...');
    await Promise.all([loadStats(), loadStripeRevenue()]);
    toast.success('Data refreshed');
  };

  if (loading) {
    return (
      <div className="grid grid-cols-2 overflow-hidden rounded-xl border border-border/30 lg:grid-cols-3">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="space-y-2 px-4 py-4 sm:px-5">
            <div className="h-2.5 w-2/3 animate-pulse rounded bg-muted" />
            <div className="h-6 w-1/2 animate-pulse rounded bg-muted" />
          </div>
        ))}
      </div>
    );
  }

  if (!stats) return null;

  // DB is authoritative for subscription counts (populated by webhook on every payment).
  // Only use Stripe values for revenue — and only when Stripe returns non-zero (i.e.
  // the edge function matched at least one subscription). If Stripe returns 0 it means
  // the price-ID filter missed the account's subscriptions, so fall back to DB to avoid
  // showing incorrect zeros.
  const displayActiveSubscriptions = stats.active_subscriptions;
  const stripeRevenueAvailable = stripeData != null && (stripeData.total_revenue > 0 || stripeData.monthly_revenue > 0);
  const displayRevenue = stripeRevenueAvailable ? stripeData!.total_revenue : stats.total_revenue;
  const displayMonthlyRevenue = stripeRevenueAvailable ? stripeData!.monthly_revenue : stats.monthly_revenue;

  /**
   * The six numbers this panel exists to show.
   *
   * They were six cards, each with a four-pixel primary stripe down its left
   * edge and a coloured disc holding an icon — blue, green, orange, red,
   * emerald, purple. The disc's own background never rendered at all: its class
   * was assembled at runtime by rewriting the text colour into a background
   * one, and Tailwind ships only the class names it can find written out in the
   * source, so every one of those six discs has always been transparent. The
   * icons are gone rather than repaired: six unrelated figures under six
   * colours read as a legend.
   */
  const metrics: Metric[] = [
    { label: "Total users", value: stats.total_users, note: "Everyone who has registered" },
    { label: "Subscriptions", value: displayActiveSubscriptions, note: "Paying customers right now" },
    { label: "Active trials", value: stats.active_trials, note: "Not yet converted or expired" },
    { label: "Locked accounts", value: stats.locked_accounts, note: "Suspended, usually an expired trial" },
    {
      label: "Monthly revenue",
      value: `$${displayMonthlyRevenue.toLocaleString()}`,
      note: stripeRevenueAvailable ? "Live from Stripe" : "This month, from our own records",
    },
    {
      label: "Total revenue",
      value: `$${displayRevenue.toLocaleString()}`,
      note: stripeRevenueAvailable ? "Live from Stripe" : "All time, from our own records",
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <LastCronRun
          label="Background jobs:"
          jobs={[
            "send-re-engagement-emails-weekly",
            "detect-suspicious-activity-15min",
            "lock-expired-trials-daily",
            "send-trial-warnings-daily",
            "process-scheduled-emails",
            "retry-stripe-webhooks-every-2min",
            "seo-audit-perf-daily",
          ]}
        />
        <Button 
          variant="outline" 
          size="sm" 
          onClick={handleRefresh}
          disabled={loadingStripe}
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${loadingStripe ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>
      
      <MetricStrip metrics={metrics} columns={3} />

      {stripeData && (
        <p className="text-[0.625rem] text-muted-foreground">
          Revenue read from Stripe at {new Date(stripeData.last_updated).toLocaleTimeString()}.
        </p>
      )}

      <AiGatewayUsageCard />
    </div>
  );
};

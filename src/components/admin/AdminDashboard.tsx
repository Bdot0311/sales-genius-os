import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { Users, UserCheck, Lock, TrendingUp, DollarSign, Clock } from "lucide-react";

interface DashboardStats {
  total_users: number;
  active_trials: number;
  locked_accounts: number;
  active_subscriptions: number;
  total_revenue: number;
  monthly_revenue: number;
}

export const AdminDashboard = () => {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStats();

    // Set up real-time subscription for subscriptions table
    const channel = supabase
      .channel('admin-dashboard-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'subscriptions' },
        () => {
          console.log('Subscription data changed, refreshing stats...');
          loadStats();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'profiles' },
        () => {
          console.log('Profile data changed, refreshing stats...');
          loadStats();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

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

  if (loading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {[...Array(6)].map((_, i) => (
          <Card key={i}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <div className="h-4 w-24 bg-muted animate-pulse rounded" />
            </CardHeader>
            <CardContent>
              <div className="h-8 w-32 bg-muted animate-pulse rounded" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (!stats) return null;

  const statCards = [
    {
      title: "Total Users",
      value: stats.total_users,
      icon: Users,
      description: "All registered users",
      color: "text-blue-500",
    },
    {
      title: "Active Subscriptions",
      value: stats.active_subscriptions,
      icon: UserCheck,
      description: "Paying customers",
      color: "text-green-500",
    },
    {
      title: "Active Trials",
      value: stats.active_trials,
      icon: Clock,
      description: "Users on trial",
      color: "text-orange-500",
    },
    {
      title: "Locked Accounts",
      value: stats.locked_accounts,
      icon: Lock,
      description: "Suspended accounts",
      color: "text-red-500",
    },
    {
      title: "Monthly Revenue",
      value: `$${stats.monthly_revenue.toLocaleString()}`,
      icon: DollarSign,
      description: "Current month MRR",
      color: "text-green-600",
    },
    {
      title: "Total Revenue",
      value: `$${stats.total_revenue.toLocaleString()}`,
      icon: TrendingUp,
      description: "All-time revenue",
      color: "text-purple-500",
    },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {statCards.map((stat, index) => {
        const Icon = stat.icon;
        return (
          <Card 
            key={stat.title} 
            className="hover:shadow-md transition-shadow border-l-4" 
            style={{ 
              borderLeftColor: `hsl(var(--primary))`,
              animationDelay: `${index * 50}ms`
            }}
          >
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {stat.title}
              </CardTitle>
              <div className={`h-10 w-10 rounded-full ${stat.color.replace('text-', 'bg-')}/10 flex items-center justify-center`}>
                <Icon className={`h-5 w-5 ${stat.color}`} />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold tracking-tight">{stat.value}</div>
              <p className="text-xs text-muted-foreground mt-1">
                {stat.description}
              </p>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
};
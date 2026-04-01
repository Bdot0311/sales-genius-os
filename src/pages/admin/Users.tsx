import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  UserPlus, Search, RefreshCw, Shield, Users, Clock,
  Lock, TrendingUp, Crown, AlertTriangle
} from "lucide-react";
import { UserStatsCards } from "@/components/admin/UserStatsCards";
import { UserTable } from "@/components/admin/UserTable";
import { CreateUserDialog } from "@/components/admin/CreateUserDialog";
import { DeleteUserDialog } from "@/components/admin/DeleteUserDialog";
import { TrialDialog } from "@/components/admin/TrialDialog";

export interface UserSubscription {
  user_id: string;
  email: string;
  full_name: string;
  plan: 'free' | 'starter' | 'growth' | 'pro';
  status: string;
  account_status: string;
  leads_limit: number;
  stripe_customer_id: string;
  current_period_end: string;
  trial_end_date: string | null;
}

export interface UserRole {
  user_id: string;
  role: string;
}

const AdminUsers = () => {
  const [subscriptions, setSubscriptions] = useState<UserSubscription[]>([]);
  const [userRoles, setUserRoles] = useState<UserRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [createUserOpen, setCreateUserOpen] = useState(false);
  const [deleteUserOpen, setDeleteUserOpen] = useState(false);
  const [trialDialogOpen, setTrialDialogOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserSubscription | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    loadSubscriptions();
    loadUserRoles();

    const profilesChannel = supabase
      .channel('admin-profiles-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => {
        loadSubscriptions();
        loadUserRoles();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'subscriptions' }, () => {
        loadSubscriptions();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'user_roles' }, () => {
        loadUserRoles();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(profilesChannel);
    };
  }, []);

  const loadSubscriptions = async () => {
    try {
      const { data, error } = await supabase.rpc('admin_get_all_subscriptions');
      if (error) throw error;
      const mapped = (data || []).map((s: any) => ({
        ...s,
        plan: s.plan === 'elite' ? 'pro' : s.plan,
      }));
      setSubscriptions(mapped);
    } catch (error) {
      console.error('Error loading subscriptions:', error);
      toast.error('Failed to load subscriptions');
    } finally {
      setLoading(false);
    }
  };

  const loadUserRoles = async () => {
    try {
      const { data, error } = await supabase
        .from('user_roles')
        .select('user_id, role');
      if (error) throw error;
      setUserRoles(data || []);
    } catch (error) {
      console.error('Error loading user roles:', error);
    }
  };

  const isUserAdmin = (userId: string) => {
    return userRoles.some(r => r.user_id === userId && r.role === 'admin');
  };

  // Analytics
  const stats = useMemo(() => {
    const total = subscriptions.length;
    const admins = subscriptions.filter(s => isUserAdmin(s.user_id) || s.account_status === 'admin').length;
    const trials = subscriptions.filter(s => s.account_status === 'trial').length;
    const locked = subscriptions.filter(s => s.account_status === 'locked').length;
    const paid = subscriptions.filter(s => s.plan !== 'free' && s.stripe_customer_id).length;
    const free = subscriptions.filter(s => s.plan === 'free').length;
    const planBreakdown = {
      free: subscriptions.filter(s => s.plan === 'free').length,
      starter: subscriptions.filter(s => s.plan === 'starter').length,
      growth: subscriptions.filter(s => s.plan === 'growth').length,
      pro: subscriptions.filter(s => s.plan === 'pro').length,
    };
    const conversionRate = total > 0 ? Math.round((paid / total) * 100) : 0;
    return { total, admins, trials, locked, paid, free, planBreakdown, conversionRate };
  }, [subscriptions, userRoles]);

  const filteredSubscriptions = subscriptions.filter(sub =>
    sub.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
    sub.full_name?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const updateSubscription = async (userId: string, plan: 'free' | 'starter' | 'growth' | 'pro') => {
    try {
      const { error } = await supabase.rpc('admin_update_subscription', {
        _user_id: userId,
        _plan: plan,
      });
      if (error) throw error;
      toast.success('Subscription updated');
      loadSubscriptions();
    } catch (error) {
      toast.error('Failed to update subscription');
    }
  };

  const lockUser = async (userId: string, reason?: string) => {
    try {
      const { error } = await supabase.rpc('admin_lock_user', {
        _user_id: userId,
        _reason: reason || 'Payment failed'
      });
      if (error) throw error;
      toast.success('Account locked');
      loadSubscriptions();
    } catch (error) {
      toast.error('Failed to lock user');
    }
  };

  const unlockUser = async (userId: string) => {
    try {
      const { error } = await supabase.rpc('admin_unlock_user', { _user_id: userId });
      if (error) throw error;
      toast.success('Account unlocked');
      loadSubscriptions();
    } catch (error) {
      toast.error('Failed to unlock user');
    }
  };

  const toggleAdminStatus = async (userId: string, currentlyAdmin: boolean) => {
    try {
      if (currentlyAdmin) {
        const { error } = await supabase
          .from('user_roles')
          .delete()
          .eq('user_id', userId)
          .eq('role', 'admin');
        if (error) throw error;
        await supabase
          .from('subscriptions')
          .update({ account_status: 'active' })
          .eq('user_id', userId);
        toast.success('Admin privileges removed');
      } else {
        const { error } = await supabase
          .from('user_roles')
          .insert({ user_id: userId, role: 'admin' });
        if (error) throw error;
        await supabase
          .from('subscriptions')
          .update({ account_status: 'admin' })
          .eq('user_id', userId);
        toast.success('Admin privileges granted');
      }
      loadSubscriptions();
      loadUserRoles();
    } catch (error) {
      toast.error('Failed to update admin status');
    }
  };

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <UserStatsCards stats={stats} />

      {/* Plan Distribution Bar */}
      <Card className="border-border/50 bg-card/80 backdrop-blur-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
            Plan Distribution
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-1 h-3 rounded-full overflow-hidden bg-muted/50">
            {stats.total > 0 && (
              <>
                {stats.planBreakdown.pro > 0 && (
                  <div
                    className="bg-primary rounded-l-full transition-all duration-500"
                    style={{ width: `${(stats.planBreakdown.pro / stats.total) * 100}%` }}
                    title={`Pro: ${stats.planBreakdown.pro}`}
                  />
                )}
                {stats.planBreakdown.growth > 0 && (
                  <div
                    className="bg-emerald-500 transition-all duration-500"
                    style={{ width: `${(stats.planBreakdown.growth / stats.total) * 100}%` }}
                    title={`Growth: ${stats.planBreakdown.growth}`}
                  />
                )}
                {stats.planBreakdown.starter > 0 && (
                  <div
                    className="bg-blue-500 transition-all duration-500"
                    style={{ width: `${(stats.planBreakdown.starter / stats.total) * 100}%` }}
                    title={`Starter: ${stats.planBreakdown.starter}`}
                  />
                )}
                {stats.planBreakdown.free > 0 && (
                  <div
                    className="bg-muted-foreground/40 rounded-r-full transition-all duration-500"
                    style={{ width: `${(stats.planBreakdown.free / stats.total) * 100}%` }}
                    title={`Free: ${stats.planBreakdown.free}`}
                  />
                )}
              </>
            )}
          </div>
          <div className="flex gap-4 mt-3 flex-wrap">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <div className="w-2 h-2 rounded-full bg-primary" /> Pro ({stats.planBreakdown.pro})
            </div>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <div className="w-2 h-2 rounded-full bg-emerald-500" /> Growth ({stats.planBreakdown.growth})
            </div>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <div className="w-2 h-2 rounded-full bg-blue-500" /> Starter ({stats.planBreakdown.starter})
            </div>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <div className="w-2 h-2 rounded-full bg-muted-foreground/40" /> Free ({stats.planBreakdown.free})
            </div>
          </div>
        </CardContent>
      </Card>

      {/* User Table */}
      <Card className="border-border/50 bg-card/80 backdrop-blur-sm overflow-hidden">
        <CardHeader className="border-b border-border/50">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg">All Users</CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                {filteredSubscriptions.length} of {subscriptions.length} users
              </p>
            </div>
            <div className="flex gap-2">
              <Button onClick={loadSubscriptions} variant="outline" size="sm" className="border-border/50">
                <RefreshCw className="h-4 w-4 mr-2" />
                Refresh
              </Button>
              <Button onClick={() => setCreateUserOpen(true)} size="sm">
                <UserPlus className="h-4 w-4 mr-2" />
                Add User
              </Button>
            </div>
          </div>
          <div className="relative mt-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by email or name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 bg-muted/30 border-border/50"
            />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <UserTable
            subscriptions={filteredSubscriptions}
            loading={loading}
            isUserAdmin={isUserAdmin}
            onUpdateSubscription={updateSubscription}
            onLockUser={lockUser}
            onUnlockUser={unlockUser}
            onToggleAdmin={toggleAdminStatus}
            onSetTrial={(user) => { setSelectedUser(user); setTrialDialogOpen(true); }}
            onDeleteUser={(user) => { setSelectedUser(user); setDeleteUserOpen(true); }}
          />
        </CardContent>
      </Card>

      <CreateUserDialog
        open={createUserOpen}
        onOpenChange={setCreateUserOpen}
        onCreated={() => { loadSubscriptions(); loadUserRoles(); }}
      />

      <DeleteUserDialog
        open={deleteUserOpen}
        onOpenChange={setDeleteUserOpen}
        user={selectedUser}
        onDeleted={() => { setSelectedUser(null); loadSubscriptions(); }}
      />

      <TrialDialog
        open={trialDialogOpen}
        onOpenChange={setTrialDialogOpen}
        user={selectedUser}
        onSet={() => { setSelectedUser(null); loadSubscriptions(); }}
      />
    </div>
  );
};

export default AdminUsers;
